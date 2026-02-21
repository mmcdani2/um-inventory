const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
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
    backgroundColor: "#0b0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
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

  ipcMain.handle("locations:list", () => {
    return dbLayer.listLocations(db);
  });

  ipcMain.handle("locations:create", (_evt, loc) => {
    return dbLayer.createLocation(db, loc);
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
