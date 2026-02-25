const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Put Chromium cache somewhere writable (prevents 0x5 cache errors on Windows)
app.commandLine.appendSwitch(
  "disk-cache-dir",
  path.join(app.getPath("userData"), "Cache"),
);
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
const fs = require("fs");

const Database = require("better-sqlite3");
const dbLayer = require("./db/db");

let db;

function getDbPath() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "inventory.sqlite3");
}

function initDb() {
  const opened = dbLayer.openDb({ app });
  db = opened.db;

  const schemaPath = path.join(__dirname, "db", "schema.sql");
  dbLayer.ensureSchema(db, schemaPath);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Window state -> renderer
  win.on("maximize", () => win.webContents.send("win:maximize"));
  win.on("unmaximize", () => win.webContents.send("win:unmaximize"));

  win.maximize();

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.on("did-finish-load", () => {
    win.webContents.send(win.isMaximized() ? "win:maximize" : "win:unmaximize");
  });

  // Minimal DevTools toggle (Ctrl+Shift+I)
  win.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toUpperCase();
    if (input.control && input.shift && key === "I") {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  initDb();

  ipcMain.handle("db:getInfo", () => {
    const dbPath = getDbPath();
    const meta = dbLayer.getMeta(db);
    return { dbPath, schemaVersion: meta.schemaVersion };
  });

  ipcMain.handle("items:list", () => {
    return dbLayer.listItems(db);
  });

  ipcMain.handle("items:create", (_evt, item) => {
    return dbLayer.createItem(db, item);
  });

  ipcMain.handle("items:importCsv", (_evt, payload) => {
    return dbLayer.importItemsCsv(db, payload);
  });

  ipcMain.handle("locations:list", () => {
    return dbLayer.listLocations(db);
  });

  ipcMain.handle("locations:create", (_evt, loc) => {
    return dbLayer.createLocation(db, loc);
  });

  ipcMain.handle("receive:submit", (_evt, payload) => {
    return dbLayer.receiveItem(db, payload);
  });

  ipcMain.handle("reports:onhand", () => {
    return dbLayer.getOnHand(db);
  });

  ipcMain.handle("checkout:submit", (_evt, payload) => {
    return dbLayer.checkoutItem(db, payload);
  });

  ipcMain.handle("counts:getTheoretical", (_evt, { item_id, location_id }) => {
    const row = db
      .prepare(
        `
    SELECT on_hand FROM inventory_balances
    WHERE item_id=? AND location_id=?
  `,
      )
      .get(Number(item_id), Number(location_id));
    return { theoretical_qty: Number(row?.on_hand ?? 0) };
  });

  ipcMain.handle("counts:submit", (_evt, payload) => {
    return dbLayer.countAndAdjust(db, payload);
  });

  ipcMain.handle("reports:suggestedOrders", () => {
    return dbLayer.getSuggestedOrders(db);
  });

  ipcMain.handle("items:update", (_evt, item) => {
    return dbLayer.updateItem(db, item);
  });

  ipcMain.handle("home:stats", () => {
    return dbLayer.getHomeStats(db);
  });

  ipcMain.handle("locations:update", (_evt, loc) => {
    return dbLayer.updateLocation(db, loc);
  });

  ipcMain.handle("locations:delete", (_evt, locationId) => {
    return dbLayer.deleteLocation(db, locationId);
  });

  ipcMain.handle("db:reset", async () => {
    try {
      // Close DB so the file isn't locked (WAL mode)
      try {
        db?.close?.();
      } catch {}

      const dbPath = getDbPath();
      const wal = `${dbPath}-wal`;
      const shm = `${dbPath}-shm`;

      // Delete main + WAL files if present
      for (const p of [dbPath, wal, shm]) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }

      // Relaunch clean
      app.relaunch();
      app.exit(0);

      return { ok: true };
    } catch (e) {
      throw new Error(e?.message || "DB reset failed.");
    }
  });

  ipcMain.handle("receive:submitBatch", async (_evt, payload) => {
    return dbLayer.receiveBatch(db, payload);
  });

  ipcMain.handle("items:findByBarcode", (_evt, barcode) => {
    return dbLayer.findItemByBarcode(db, barcode);
  });

  ipcMain.handle("items:attachBarcode", (_evt, payload) => {
    // payload: { item_id, barcode, source? }
    return dbLayer.attachBarcodeToItem(db, payload);
  });

  ipcMain.handle("admin:check", (_evt, password) => {
    const entered = String(password || "");
    const expected = process.env.UM_ADMIN_PASSWORD || "umadmin"; // TODO: set env later
    return { ok: entered === expected };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
