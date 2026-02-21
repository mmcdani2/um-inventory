const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function openDb({ app, baseDir }) {
  const dir = baseDir || path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, "inventory.sqlite3");

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return { db, dbPath };
}

function ensureSchema(db, schemaFilePath) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const v = db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value;
  if (!v) {
    const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
    db.exec(schemaSql);
    db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?)").run("schema_version", "1");
  }
}

function getMeta(db) {
  const schemaVersion = db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value;
  return { schemaVersion };
}

// READ-ONLY queries (Step 7)
function listItems(db) {
  return db.prepare(`
    SELECT id, sku, description, category, unit, vendor, barcode,
           reorder_point, reorder_qty, default_cost, is_active, created_at, updated_at
    FROM items
    ORDER BY category, sku
  `).all();
}

function listLocations(db) {
  return db.prepare(`
    SELECT id, code, name, created_at
    FROM locations
    ORDER BY code
  `).all();
}

function createItem(db, item) {
  const sku = String(item.sku || "").trim();
  const description = String(item.description || "").trim();
  if (!sku) throw new Error("SKU/Part # is required.");
  if (!description) throw new Error("Description is required.");

  const stmt = db.prepare(`
    INSERT INTO items
      (sku, description, category, unit, vendor, barcode, reorder_point, reorder_qty, default_cost)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const res = stmt.run(
      sku,
      description,
      String(item.category || "").trim(),
      String(item.unit || "EA").trim(),
      String(item.vendor || "").trim(),
      String(item.barcode || "").trim() || null,
      Number(item.reorder_point || 0),
      Number(item.reorder_qty || 0),
      Number(item.default_cost || 0),
    );

    return db
      .prepare("SELECT * FROM items WHERE id = ?")
      .get(res.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      throw new Error("SKU/Part # already exists.");
    }
    throw e;
  }
}

function createLocation(db, loc) {
  const code = String(loc.code || "")
    .trim()
    .toUpperCase();
  const name = String(loc.name || "").trim();
  if (!code) throw new Error("Location code is required.");

  try {
    const res = db
      .prepare(
        `
      INSERT INTO locations (code, name)
      VALUES (?, ?)
    `,
      )
      .run(code, name);

    return db
      .prepare("SELECT * FROM locations WHERE id=?")
      .get(res.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      throw new Error("Location code already exists.");
    }
    throw e;
  }
}

module.exports = {
  openDb,
  ensureSchema,
  getMeta,
  listItems,
  listLocations,
  createItem,
  createLocation,
};

