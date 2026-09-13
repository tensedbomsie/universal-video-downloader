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

ipcMain.handle("fetch-info", (event, url) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [url, "--skip-download", "--no-playlist", "--dump-json"], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => { stdout += c.toString(); });
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        const lastLine = stderr.trim().split(/\r?\n/).pop() || "Could not read that link";
        reject(new Error(lastLine.replace(/^ERROR:\s*/, "")));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title || "Untitled",
          thumbnail: info.thumbnail || "",
          duration: info.duration_string || "",
        });
      } catch {
        reject(new Error("Could not read video info"));
      }
    });
    proc.on("error", (err) => reject(err));
  });
});

ipcMain.handle("start-download", (event, { url, format, quality }) => {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const sender = event.sender;

  const args = [
    url,
    "--ffmpeg-location", FFMPEG,
    "--no-playlist",
    "--restrict-filenames",
    "--newline",
    "--progress",
    "-o", path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s"),
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
  let lastStderrLine = "";
  let stdoutBuf = "";
  let stderrBuf = "";

  // yt-dlp writes its "%(...)s" data (--print) to stdout, but progress/status
  // lines go to stderr - it suppresses the progress display entirely unless
  // stderr looks interactive, which is why --progress is required here too.
  proc.stdout.on("data", (chunk) => {
    stdoutBuf += chunk.toString();
    const lines = stdoutBuf.split(/\r?\n/);
    stdoutBuf = lines.pop();
    for (const line of lines) {
      if (line.startsWith("DONE ")) finalPath = line.slice(5).trim();
    }
  });

  proc.stderr.on("data", (chunk) => {
    stderrBuf += chunk.toString();
    const lines = stderrBuf.split(/\r?\n/);
    stderrBuf = lines.pop();
    for (const line of lines) {
      const pctMatch = line.match(/^\[download\]\s+([\d.]+)%/);
      if (pctMatch) {
        const speedMatch = line.match(/at\s+([\d.]+\s?\w+\/s)/);
        sender.send("progress", { pct: parseFloat(pctMatch[1]), speed: speedMatch ? speedMatch[1] : "" });
        sawProgress = true;
      } else if (line.trim()) {
        lastStderrLine = line.trim();
        if (sawProgress) sender.send("processing");
      }
    }
  });

  proc.on("close", (code) => {
    if (code === 0) {
      const title = finalPath ? path.basename(finalPath, path.extname(finalPath)) : "your video";
      sender.send("done", { title });
    } else {
      sender.send("failed", { message: (lastStderrLine || `yt-dlp exited with code ${code}`).replace(/^ERROR:\s*/, "") });
    }
  });

  proc.on("error", (err) => {
    sender.send("failed", { message: err.message });
  });

  return true;
});
