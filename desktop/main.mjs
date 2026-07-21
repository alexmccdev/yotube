import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, session, shell } from "electron";
import { probeYoutube, uploadYoutube, ytDlpPath } from "./youtube.mjs";

const LOCAL_HOST = "127.0.0.1";
const LOCAL_PORT = 43110;
const APP_ORIGIN = `http://${LOCAL_HOST}:${LOCAL_PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const operations = new Map();
const EXTERNAL_HOSTS = new Set(["dashboard.yoto.dev", "my.yotoplay.com"]);
let localServer;
let appIsQuitting = false;

async function localSessionSecret() {
  const directory = app.getPath("userData");
  const secretPath = path.join(directory, "local-session-key");
  await mkdir(directory, { recursive: true });
  try {
    const existing = (await readFile(secretPath, "utf8")).trim();
    if (Buffer.byteLength(existing, "utf8") >= 32) return existing;
  } catch {}
  const created = randomBytes(48).toString("base64url");
  await writeFile(secretPath, `${created}\n`, { mode: 0o600 });
  return created;
}

async function startLocalServer() {
  const startupToken = randomBytes(32).toString("base64url");
  const serverRoot = app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : app.getAppPath();
  const serverScript = app.isPackaged
    ? path.join(serverRoot, "server.js")
    : path.join(serverRoot, "node_modules", "next", "dist", "bin", "next");
  const args = app.isPackaged
    ? [serverScript]
    : [serverScript, "dev", "-H", LOCAL_HOST, "-p", String(LOCAL_PORT)];
  let stderr = "";
  localServer = spawn(process.execPath, args, {
    cwd: serverRoot,
    env: {
      ...process.env,
      APP_ORIGIN,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: LOCAL_HOST,
      NODE_ENV: app.isPackaged ? "production" : "development",
      PORT: String(LOCAL_PORT),
      WEB_SESSION_SECRET: await localSessionSecret(),
      YOTUBE_DESKTOP_STARTUP_TOKEN: startupToken,
    },
    stdio: ["ignore", app.isPackaged ? "ignore" : "inherit", "pipe"],
  });
  localServer.stderr.setEncoding("utf8");
  localServer.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-16 * 1024);
    if (!app.isPackaged) process.stderr.write(chunk);
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (localServer.exitCode !== null) {
      throw new Error(stderr.trim() || `The local app server stopped (${localServer.exitCode})`);
    }
    try {
      const response = await fetch(`${APP_ORIGIN}/api/desktop/health`, {
        headers: { "X-Yotube-Startup-Token": startupToken },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.status === 204) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  localServer.kill("SIGTERM");
  throw new Error(stderr.trim() || "The local app server did not start in time");
}

function isAppFrame(frame) {
  try {
    return new URL(frame.url).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

function assertAppSender(event) {
  if (!event.senderFrame || !isAppFrame(event.senderFrame)) throw new Error("Untrusted desktop request");
}

function validOperationId(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function localYoutubeOptions() {
  return {
    binary: ytDlpPath({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    }),
    nodePath: process.execPath,
  };
}

function secureChildWindow(child) {
  child.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  child.webContents.on("will-navigate", (event, target) => {
    try {
      const parsed = new URL(target);
      if (parsed.origin === APP_ORIGIN || parsed.protocol === "https:") return;
    } catch {}
    event.preventDefault();
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 760,
    minHeight: 620,
    backgroundColor: "#18201e",
    title: "Yotube",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank") return { action: "allow" };
    try {
      const parsed = new URL(url);
      if (parsed.origin === APP_ORIGIN) return { action: "allow" };
      if (parsed.protocol === "https:" && EXTERNAL_HOSTS.has(parsed.hostname)) {
        void shell.openExternal(parsed.toString());
      }
    } catch {}
    return { action: "deny" };
  });
  window.webContents.on("did-create-window", secureChildWindow);
  window.webContents.on("will-navigate", (event, target) => {
    try {
      if (new URL(target).origin === APP_ORIGIN) return;
    } catch {}
    event.preventDefault();
  });
  void window.loadURL(APP_ORIGIN);
}

ipcMain.handle("youtube:probe", async (event, input) => {
  assertAppSender(event);
  const controller = new AbortController();
  return probeYoutube({
    ...localYoutubeOptions(),
    url: input?.url,
    browser: input?.browser,
    signal: controller.signal,
  });
});

ipcMain.handle("youtube:upload", async (event, input) => {
  assertAppSender(event);
  if (!validOperationId(input?.operationId) || operations.has(input.operationId)) {
    throw new Error("The desktop upload operation is invalid");
  }
  const controller = new AbortController();
  operations.set(input.operationId, controller);
  try {
    const preparation = await event.sender.session.fetch(`${APP_ORIGIN}/api/yoto/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: APP_ORIGIN },
      body: JSON.stringify({
        action: "desktop-upload",
        url: input.source?.url,
        source: input.source,
      }),
      credentials: "include",
      signal: controller.signal,
    });
    const prepared = await preparation.json().catch(() => ({}));
    if (!preparation.ok || typeof prepared.uploadId !== "string" || typeof prepared.uploadUrl !== "string") {
      throw new Error(typeof prepared.error === "string" ? prepared.error : "Yoto could not prepare the local upload");
    }
    await uploadYoutube({
      ...localYoutubeOptions(),
      source: input.source,
      uploadUrl: prepared.uploadUrl,
      browser: input.browser,
      signal: controller.signal,
      onProgress: (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("youtube:progress", { operationId: input.operationId, ...progress });
        }
      },
    });
    return { uploadId: prepared.uploadId };
  } finally {
    operations.delete(input.operationId);
  }
});

ipcMain.handle("youtube:cancel", (event, operationId) => {
  assertAppSender(event);
  if (!validOperationId(operationId)) return false;
  return operations.get(operationId)?.abort() ?? false;
});

app.whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    await startLocalServer();
    localServer.once("exit", (code) => {
      if (appIsQuitting) return;
      dialog.showErrorBox("Yotube stopped", `The local app server stopped unexpectedly (${code ?? "unknown"}).`);
      app.quit();
    });
    createWindow();
  })
  .catch((error) => {
    dialog.showErrorBox("Yotube could not start", error instanceof Error ? error.message : "The local app server failed");
    app.quit();
  });

app.on("before-quit", () => {
  appIsQuitting = true;
  localServer?.kill("SIGTERM");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
