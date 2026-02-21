const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const Database = require("better-sqlite3");

let db;

function getDbPath() {
  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "inventory.sqlite3");
}

function initDb() {
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS smoke_test (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_smoke_test_created_at ON smoke_test(created_at);
  `);

  // Seed a flag so we can confirm persistence
  const hasInit = db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .get("initialized");
  if (!hasInit) {
    db.prepare("INSERT INTO app_meta(key, value) VALUES(?, ?)").run(
      "initialized",
      "true",
    );
    db.prepare("INSERT INTO smoke_test(message) VALUES(?)").run(
      "DB initialized.",
    );
  }
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
    const rowCount = db.prepare("SELECT COUNT(*) AS c FROM smoke_test").get().c;
    const last = db
      .prepare("SELECT * FROM smoke_test ORDER BY id DESC LIMIT 1")
      .get();
    return { dbPath, rowCount, last };
  });

  ipcMain.handle("db:addSmoke", (_evt, message) => {
    const stmt = db.prepare("INSERT INTO smoke_test(message) VALUES(?)");
    const res = stmt.run(String(message || "Hello."));
    const row = db
      .prepare("SELECT * FROM smoke_test WHERE id = ?")
      .get(res.lastInsertRowid);
    return row;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
