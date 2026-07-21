import { access, constants } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { execa } from "execa";

const API_BASE = "https://api.yotoplay.com";
const FORMAT = "bestaudio[ext=m4a]";
const INGEST_TIMEOUT_MS = 270_000;

class ProcessError extends Error {
  constructor(message: string, readonly stderr: string) {
    super(message);
  }
}

interface UploadUrlResponse {
  upload?: { uploadId?: string; uploadUrl?: string | null };
}

export interface TrackSource {
  url: string;
  title: string;
  duration: number;
  thumbnail?: string;
  fileSize: number;
}

export interface IngestedTrack extends TrackSource {
  sha256: string;
  fileSize: number;
  format: string;
  channels?: string;
}

export type TrackIngestPhase = "opening" | "streaming" | "processing" | "complete";

export interface TrackIngestProgress {
  phase: TrackIngestPhase;
  bytesTransferred?: number;
  totalBytes: number;
  transferPercent?: number;
  processingAttempt?: number;
}

export type TrackIngestProgressHandler = (progress: TrackIngestProgress) => void;

function safeMessage(error: unknown): string {
  if (error instanceof ProcessError) return error.message;
  if (error instanceof Error && error.name === "AbortError") return "The upload was cancelled";
  return error instanceof Error ? error.message : String(error);
}

async function ytDlpBinary(): Promise<string> {
  const configured = process.env.YT_DLP_PATH;
  if (configured) return configured;
  const bundled = path.join(process.cwd(), "vendor", "yt-dlp");
  try {
    await access(bundled, constants.X_OK);
    return bundled;
  } catch {
    return "yt-dlp";
  }
}

export async function probeTrackSource(url: string, signal?: AbortSignal): Promise<TrackSource> {
  try {
    const { stdout } = await execa(
      await ytDlpBinary(),
      ["--dump-json", "--no-playlist", "--no-cache-dir", "-f", FORMAT, url],
      { timeout: 30_000, cancelSignal: signal },
    );
    const data = JSON.parse(stdout) as {
      title?: string;
      duration?: number;
      thumbnail?: string;
      filesize?: number;
      requested_downloads?: { filesize?: number }[];
    };
    const fileSize = data.requested_downloads?.[0]?.filesize ?? data.filesize;
    if (!data.title || !fileSize) {
      throw new Error("This video does not expose the exact M4A size required for direct upload");
    }
    return {
      url,
      title: data.title,
      duration: data.duration ?? 0,
      thumbnail: data.thumbnail,
      fileSize,
    };
  } catch (error) {
    throw new Error(safeMessage(error));
  }
}

async function requestUploadUrl(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE}/media/transcode/audio/uploadUrl`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok) throw new Error("Yoto did not accept the upload request");
  const upload = ((await response.json()) as UploadUrlResponse).upload;
  if (!upload?.uploadId || !upload.uploadUrl) throw new Error("Yoto did not return an upload URL");
  return { uploadId: upload.uploadId, uploadUrl: upload.uploadUrl };
}

async function waitForTranscode(
  accessToken: string,
  uploadId: string,
  totalBytes: number,
  signal?: AbortSignal,
  onProgress?: TrackIngestProgressHandler,
) {
  for (let attempt = 0; attempt < 48; attempt++) {
    onProgress?.({ phase: "processing", totalBytes, processingAttempt: attempt + 1 });
    const response = await fetch(`${API_BASE}/media/upload/${uploadId}/transcoded?loudnorm=false`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });
    if (response.ok) {
      const body = (await response.json()) as {
        transcode?: {
          transcodedSha256?: string;
          transcodedInfo?: { duration?: number; fileSize?: number; format?: string; channels?: string };
        };
      };
      if (body.transcode?.transcodedSha256) return body.transcode;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5_000);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }
  throw new Error("Yoto took too long to process the audio");
}

/** Streams one selected M4A directly from yt-dlp stdout to Yoto's signed PUT. */
export async function ingestTrack(
  accessToken: string,
  source: TrackSource,
  signal?: AbortSignal,
  onProgress?: TrackIngestProgressHandler,
): Promise<IngestedTrack> {
  const deadline = AbortSignal.timeout(INGEST_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  onProgress?.({ phase: "opening", totalBytes: source.fileSize });
  const { uploadId, uploadUrl } = await requestUploadUrl(accessToken, combinedSignal);
  const subprocess = execa(
    await ytDlpBinary(),
    ["--no-cache-dir", "--no-playlist", "-f", FORMAT, "-o", "-", source.url],
    {
      stdout: "pipe",
      stderr: "pipe",
      reject: false,
      cancelSignal: combinedSignal,
    },
  );
  if (!subprocess.stdout) throw new Error("The audio stream could not be opened");

  try {
    let bytesTransferred = 0;
    let lastReportedPercent = -1;
    const countedStream = (Readable.toWeb(subprocess.stdout) as ReadableStream<Uint8Array>)
      .pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytesTransferred += chunk.byteLength;
          const transferPercent = Math.min(100, Math.floor((bytesTransferred / source.fileSize) * 100));
          if (transferPercent !== lastReportedPercent) {
            lastReportedPercent = transferPercent;
            onProgress?.({
              phase: "streaming",
              bytesTransferred,
              totalBytes: source.fileSize,
              transferPercent,
            });
          }
          controller.enqueue(chunk);
        },
      }));
    const uploadRequest = fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mp4", "Content-Length": String(source.fileSize) },
      body: countedStream,
      signal: combinedSignal,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const [uploadResponse, processResult] = await Promise.all([uploadRequest, subprocess]);
    if (processResult.exitCode !== 0) {
      throw new ProcessError("YouTube could not provide this audio stream", processResult.stderr.trim());
    }
    if (!uploadResponse.ok) throw new Error("Yoto rejected the streamed audio");
    const transcode = await waitForTranscode(
      accessToken,
      uploadId,
      source.fileSize,
      combinedSignal,
      onProgress,
    );
    const result = {
      ...source,
      sha256: transcode.transcodedSha256!,
      duration: transcode.transcodedInfo?.duration ?? source.duration,
      fileSize: transcode.transcodedInfo?.fileSize ?? source.fileSize,
      format: transcode.transcodedInfo?.format ?? "aac",
      channels: transcode.transcodedInfo?.channels,
    };
    onProgress?.({
      phase: "complete",
      bytesTransferred: source.fileSize,
      totalBytes: source.fileSize,
      transferPercent: 100,
    });
    return result;
  } catch (error) {
    subprocess.kill("SIGTERM");
    throw new Error(safeMessage(error));
  }
}
