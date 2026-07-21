const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yotubeDesktop", Object.freeze({
  platform: process.platform,
  probeYoutube: (input) => ipcRenderer.invoke("youtube:probe", input),
  uploadYoutube: (input) => ipcRenderer.invoke("youtube:upload", input),
  cancelUpload: (operationId) => ipcRenderer.invoke("youtube:cancel", operationId),
  onUploadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("youtube:progress", listener);
    return () => ipcRenderer.removeListener("youtube:progress", listener);
  },
}));
