import { spawn } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";

const FORMAT = "bestaudio[ext=m4a]";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const COOKIE_BROWSERS = new Set(["chrome", "firefox", "edge", "brave", "safari"]);

export function normalizeYoutubeUrl(input) {
  const value = typeof input === "string" ? input.trim() : "";
  if (VIDEO_ID.test(value)) return `https://www.youtube.com/watch?v=${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return undefined;
    const id = url.hostname.toLowerCase() === "youtu.be"
      ? url.pathname.split("/").filter(Boolean)[0]
      : url.searchParams.get("v") ?? url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
    return id && VIDEO_ID.test(id) ? `https://www.youtube.com/watch?v=${id}` : undefined;
  } catch {
    return undefined;
  }
}

function cookieArgs(browser) {
  if (browser === undefined || browser === "none") return [];
  if (!COOKIE_BROWSERS.has(browser)) throw new Error("Choose a supported local browser");
  return ["--cookies-from-browser", browser];
}

function safeYoutubeError(error) {
  if (error instanceof Error && error.name === "AbortError") return "The upload was cancelled";
  const stderr = typeof error === "object" && error && "stderr" in error && typeof error.stderr === "string"
    ? error.stderr
    : "";
  if (stderr.includes("Sign in to confirm you’re not a bot")) {
    return "YouTube asked for a local sign-in. Choose the browser where you use YouTube and try again.";
  }
  if (stderr.includes("Could not copy Chrome cookie database") || stderr.includes("failed to decrypt")) {
    return "YouTube cookies could not be read. Close the selected browser and try again.";
  }
  return stderr ? "YouTube could not read this video" : error instanceof Error ? error.message : "YouTube failed";
}

export function ytDlpPath({ isPackaged, resourcesPath, appPath, platform = process.platform }) {
  if (!isPackaged && process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
  const filename = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return isPackaged ? path.join(resourcesPath, filename) : path.join(appPath, "vendor", "desktop", filename);
}

function runtimeArgs(nodePath) {
  return ["--no-playlist", "--no-cache-dir", "--js-runtimes", `node:${nodePath}`];
}

function runYtDlp(binary, args, signal) {
  const child = spawn(binary, args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-64 * 1024);
  });
  const abort = () => child.kill("SIGTERM");
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
      } else {
        resolve({ exitCode: exitCode ?? 1, stderr });
      }
    });
  });
  return { child, completion };
}

/**
 * @param {{ binary: string; nodePath: string; url: string; browser?: string; signal?: AbortSignal }} options
 */
export async function probeYoutube({ binary, nodePath, url, browser = "none", signal = undefined }) {
  const normalizedUrl = normalizeYoutubeUrl(url);
  if (!normalizedUrl) throw new Error("Enter a valid YouTube URL or video ID");
  try {
    const deadline = AbortSignal.timeout(45_000);
    const combinedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const process = runYtDlp(
      binary,
      ["--dump-json", ...runtimeArgs(nodePath), ...cookieArgs(browser), "-f", FORMAT, normalizedUrl],
      combinedSignal,
    );
    let stdout = "";
    process.child.stdout.setEncoding("utf8");
    for await (const chunk of process.child.stdout) stdout += chunk;
    const result = await process.completion;
    if (result.exitCode !== 0) throw Object.assign(new Error("yt-dlp failed"), { stderr: result.stderr });
    const data = JSON.parse(stdout);
    const fileSize = data.requested_downloads?.[0]?.filesize ?? data.filesize;
    if (!data.title || !fileSize) {
      throw new Error("This video does not expose the exact M4A size required for direct upload");
    }
    return {
      url: normalizedUrl,
      title: data.title,
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail,
      fileSize,
    };
  } catch (error) {
    throw new Error(safeYoutubeError(error));
  }
}

/**
 * @param {{
 *   binary: string;
 *   nodePath: string;
 *   source: { url: string; fileSize: number };
 *   uploadUrl: string;
 *   browser?: string;
 *   signal?: AbortSignal;
 *   onProgress?: (progress: { bytesTransferred: number; totalBytes: number; transferPercent: number }) => void;
 * }} options
 */
export async function uploadYoutube({
  binary,
  nodePath,
  source,
  uploadUrl,
  browser = "none",
  signal = undefined,
  onProgress = undefined,
}) {
  const normalizedUrl = normalizeYoutubeUrl(source?.url);
  if (!normalizedUrl || !Number.isSafeInteger(source?.fileSize) || source.fileSize <= 0) {
    throw new Error("The local upload source is invalid");
  }
  const signedUrl = new URL(uploadUrl);
  if (signedUrl.protocol !== "https:") throw new Error("Yoto returned an invalid upload destination");

  const process = runYtDlp(
    binary,
    [...runtimeArgs(nodePath), ...cookieArgs(browser), "-f", FORMAT, "-o", "-", normalizedUrl],
    signal,
  );

  try {
    let bytesTransferred = 0;
    let lastPercent = -1;
    const stream = (Readable.toWeb(process.child.stdout))
      .pipeThrough(new TransformStream({
        transform(chunk, controller) {
          bytesTransferred += chunk.byteLength;
          const transferPercent = Math.min(100, Math.floor((bytesTransferred / source.fileSize) * 100));
          if (transferPercent !== lastPercent) {
            lastPercent = transferPercent;
            onProgress?.({ bytesTransferred, totalBytes: source.fileSize, transferPercent });
          }
          controller.enqueue(chunk);
        },
      }));
    const uploadRequest = fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mp4", "Content-Length": String(source.fileSize) },
      body: stream,
      signal,
      duplex: "half",
    });
    const [response, result] = await Promise.all([uploadRequest, process.completion]);
    if (result.exitCode !== 0) throw Object.assign(new Error("yt-dlp failed"), { stderr: result.stderr });
    if (!response.ok) throw new Error("Yoto rejected the locally streamed audio");
  } catch (error) {
    process.child.kill("SIGTERM");
    throw new Error(safeYoutubeError(error));
  }
}
