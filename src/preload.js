const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  dbGetInfo: () => ipcRenderer.invoke("db:getInfo"),
  itemsList: () => ipcRenderer.invoke("items:list"),
  itemsCreate: (item) => ipcRenderer.invoke("items:create", item),
});


