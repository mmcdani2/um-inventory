const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  dbGetInfo: () => ipcRenderer.invoke("db:getInfo"),
  itemsList: () => ipcRenderer.invoke("items:list"),
  itemsCreate: (item) => ipcRenderer.invoke("items:create", item),
  itemsImportCsv: (payload) => ipcRenderer.invoke("items:importCsv", payload),
  locationsList: () => ipcRenderer.invoke("locations:list"),
  locationsCreate: (loc) => ipcRenderer.invoke("locations:create", loc),
  receiveSubmit: (payload) => ipcRenderer.invoke("receive:submit", payload),
  reportsOnHand: () => ipcRenderer.invoke("reports:onhand"),
  checkoutSubmit: (payload) => ipcRenderer.invoke("checkout:submit", payload),
  countsGetTheoretical: (payload) =>
    ipcRenderer.invoke("counts:getTheoretical", payload),
  countsSubmit: (payload) => ipcRenderer.invoke("counts:submit", payload),
  reportsSuggestedOrders: () => ipcRenderer.invoke("reports:suggestedOrders"),
  itemsUpdate: (item) => ipcRenderer.invoke("items:update", item),
  homeStats: () => ipcRenderer.invoke("home:stats"),
  locationsUpdate: (loc) => ipcRenderer.invoke("locations:update", loc),
  onWinMaximize: (cb) => ipcRenderer.on("win:maximize", cb),
  onWinUnmaximize: (cb) => ipcRenderer.on("win:unmaximize", cb),
});


