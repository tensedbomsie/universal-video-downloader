const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  pasteFromClipboard: () => ipcRenderer.invoke("paste-from-clipboard"),
  openDownloadFolder: () => ipcRenderer.invoke("open-download-folder"),
  startDownload: (url, format, quality) => ipcRenderer.invoke("start-download", { url, format, quality }),
  onProgress: (cb) => ipcRenderer.on("progress", (_e, data) => cb(data)),
  onProcessing: (cb) => ipcRenderer.on("processing", () => cb()),
  onDone: (cb) => ipcRenderer.on("done", (_e, data) => cb(data)),
  onFailed: (cb) => ipcRenderer.on("failed", (_e, data) => cb(data)),
});
