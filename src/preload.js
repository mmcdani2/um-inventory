const { contextBridge, ipcRenderer } = require("electron");

const _barcodeCache = new Map(); // upc -> { title, category, brand }

async function barcodeLookup(upcRaw) {
  const upc = String(upcRaw || "").trim();
  if (!upc) return null;

  // cache first (including cached null miss)
  if (_barcodeCache.has(upc)) return _barcodeCache.get(upc);

  // offline-first: never block Smart Add
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 2000);

  try {
    const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    // Cache NOT_FOUND and fail soft
    if (res.status === 404) {
      _barcodeCache.set(upc, null);
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    const first = Array.isArray(data?.items) ? data.items[0] : null;

    if (!first) {
      _barcodeCache.set(upc, null);
      return null;
    }

    const out = {
      title: String(first.title || "").trim(),
      category: String(first.category || "").trim(),
      brand: String(first.brand || "").trim(),
    };

    // If response is basically empty, treat as not found
    if (!out.title && !out.category && !out.brand) {
      _barcodeCache.set(upc, null);
      return null;
    }

    _barcodeCache.set(upc, out);
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

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
  countsGetTheoretical: (payload) => ipcRenderer.invoke("counts:getTheoretical", payload),
  countsSubmit: (payload) => ipcRenderer.invoke("counts:submit", payload),
  reportsSuggestedOrders: () => ipcRenderer.invoke("reports:suggestedOrders"),
  itemsUpdate: (item) => ipcRenderer.invoke("items:update", item),
  homeStats: () => ipcRenderer.invoke("home:stats"),
  locationsUpdate: (loc) => ipcRenderer.invoke("locations:update", loc),
  onWinMaximize: (cb) => ipcRenderer.on("win:maximize", cb),
  onWinUnmaximize: (cb) => ipcRenderer.on("win:unmaximize", cb),
  dbReset: () => ipcRenderer.invoke("db:reset"),
  receiveSubmitBatch: (payload) => ipcRenderer.invoke("receive:submitBatch", payload),
  barcodeLookup,
  itemsFindByBarcode: (barcode) => ipcRenderer.invoke("items:findByBarcode", barcode),
  itemsAttachBarcode: (itemId, barcode) => ipcRenderer.invoke("items:attachBarcode", itemId, barcode),
});