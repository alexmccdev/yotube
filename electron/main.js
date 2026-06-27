const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const { resolveDataDirs } = require("./paths");

const PORT = 4173;
let server;
let win;

// Store app data in the OS-standard per-user app data directory
// (~/Library/Application Support/Yotube on macOS, %APPDATA%\Yotube on Windows,
// ~/.config/Yotube on Linux) instead of next to the app bundle, which is
// read-only once packaged.
const { workDir, cardsDir } = resolveDataDirs(app.getPath("userData"));
process.env.WORK_DIR = workDir;
process.env.CARDS_DIR = cardsDir;

// GUI-launched apps (Finder/Dock) get a minimal PATH that excludes Homebrew,
// so yt-dlp/ffmpeg/ffprobe can't be found even though they work from a
// terminal. Append the common install locations.
if (process.platform !== "win32") {
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin"];
  const existing = (process.env.PATH ?? "").split(path.delimiter);
  process.env.PATH = [...existing, ...extraPaths.filter((p) => !existing.includes(p))].join(
    path.delimiter,
  );
}

const next = require("next");

async function startServer() {
  const nextApp = next({ dev: false, dir: path.join(__dirname, "..") });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  server = http.createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "Yotube",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`http://127.0.0.1:${PORT}/cards`);
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
});

app.on("window-all-closed", () => {
  if (server) server.close();
  app.quit();
});
