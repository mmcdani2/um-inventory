const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  dbGetInfo: () => ipcRenderer.invoke("db:getInfo"),
  dbAddSmoke: (message) => ipcRenderer.invoke("db:addSmoke", message),
});
