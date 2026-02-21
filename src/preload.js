const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  dbGetInfo: () => ipcRenderer.invoke("db:getInfo"),
  itemsList: () => ipcRenderer.invoke("items:list"),
  itemsCreate: (item) => ipcRenderer.invoke("items:create", item),
  locationsList: () => ipcRenderer.invoke("locations:list"),
  locationsCreate: (loc) => ipcRenderer.invoke("locations:create", loc),
  receiveSubmit: (payload) => ipcRenderer.invoke("receive:submit", payload),
  reportsOnHand: () => ipcRenderer.invoke("reports:onhand"),
  checkoutSubmit: (payload) => ipcRenderer.invoke("checkout:submit", payload),
  countsGetTheoretical: (payload) =>
    ipcRenderer.invoke("counts:getTheoretical", payload),
  countsSubmit: (payload) => ipcRenderer.invoke("counts:submit", payload),
});


