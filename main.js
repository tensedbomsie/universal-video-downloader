const { app, BrowserWindow, ipcMain, shell, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");

const DOWNLOAD_DIR = path.join(os.homedir(), "Downloads", "UniversalVideoDownloader");

function binPath(name) {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(base, "bin", name);
}

const YTDLP = binPath("yt-dlp.exe");
const FFMPEG = binPath("ffmpeg.exe");

function createWindow() {
  const win = new BrowserWindow({
    width: 560,
    height: 580,
    resizable: false,
    backgroundColor: "#08090c",
    title: "Universal Video Downloader",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile("ui.html");
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("paste-from-clipboard", () => clipboard.readText());

ipcMain.handle("open-download-folder", () => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  shell.openPath(DOWNLOAD_DIR);
});

function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || Number.isNaN(bytesPerSec)) return "";
  return (bytesPerSec / 1024 / 1024).toFixed(1) + " MB/s";
}

ipcMain.handle("start-download", (event, { url, format, quality }) => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const sender = event.sender;

  const args = [
    url,
    "--ffmpeg-location", FFMPEG,
    "--no-playlist",
    "--restrict-filenames",
    "--newline",
    "-o", path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s"),
    "--progress-template", "download:PROG %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s %(progress.speed)s",
    "--print", "after_move:DONE %(filepath)s",
  ];

  if (format === "mp3") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", String(quality));
  } else {
    const selector = quality === "best"
      ? "bestvideo+bestaudio/best"
      : `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`;
    args.push("-f", selector, "--merge-output-format", "mp4");
  }

  const proc = spawn(YTDLP, args, { windowsHide: true });
  let finalPath = "";
  let sawProgress = false;
  let stderrTail = "";
  let stdoutBuf = "";

  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop(); // keep the last (possibly partial) line for next chunk

    for (const line of lines) {
      if (line.startsWith("PROG ")) {
        const [, downloaded, total, speed] = line.split(" ");
        const d = parseFloat(downloaded);
        const t = parseFloat(total);
        const pct = t > 0 ? (d / t) * 100 : 0;
        sender.send("progress", { pct: Number.isNaN(pct) ? 0 : pct, speed: formatSpeed(parseFloat(speed)) });
        sawProgress = true;
      } else if (line.startsWith("DONE ")) {
        finalPath = line.slice(5).trim();
      } else if (line.trim() && sawProgress) {
        sender.send("processing");
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    stderrTail = chunk.toString();
  });

  proc.on("close", (code) => {
    if (code === 0) {
      const title = finalPath ? path.basename(finalPath, path.extname(finalPath)) : "your video";
      sender.send("done", { title });
    } else {
      const lastLine = stderrTail.trim().split(/\r?\n/).pop() || `yt-dlp exited with code ${code}`;
      sender.send("failed", { message: lastLine.replace(/^ERROR:\s*/, "") });
    }
  });

  proc.on("error", (err) => {
    sender.send("failed", { message: err.message });
  });

  return true;
});
