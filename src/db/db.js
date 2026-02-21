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

function receiveItem(db, payload) {
  const user_initials = String(payload.user_initials || "")
    .trim()
    .toUpperCase();
  const vendor = String(payload.vendor || "").trim();
  const po_number = String(payload.po_number || "").trim();
  const notes = String(payload.notes || "").trim();

  const item_id = Number(payload.item_id);
  const location_id = Number(payload.location_id);
  const qty = Number(payload.qty);
  const unit_cost = Number(payload.unit_cost || 0);

  if (!user_initials) throw new Error("User initials required.");
  if (!vendor) throw new Error("Vendor required.");
  if (!Number.isFinite(item_id) || item_id <= 0)
    throw new Error("Item required.");
  if (!Number.isFinite(location_id) || location_id <= 0)
    throw new Error("Location required.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Qty must be > 0.");

  const tx = db.transaction(() => {
    const txRes = db
      .prepare(
        `
      INSERT INTO transactions (type, user_initials, vendor, po_number, notes)
      VALUES ('RECEIVE', ?, ?, ?, ?)
    `,
      )
      .run(user_initials, vendor, po_number, notes);

    const txId = txRes.lastInsertRowid;

    db.prepare(
      `
      INSERT INTO transaction_lines (transaction_id, item_id, location_id, qty, unit_cost)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(txId, item_id, location_id, qty, unit_cost);

    // Upsert balances
    db.prepare(
      `
      INSERT INTO inventory_balances (item_id, location_id, on_hand)
      VALUES (?, ?, ?)
      ON CONFLICT(item_id, location_id)
      DO UPDATE SET
        on_hand = on_hand + excluded.on_hand,
        updated_at = datetime('now')
    `,
    ).run(item_id, location_id, qty);

    return txId;
  });

  const txId = tx();
  return { transaction_id: txId };
}

function getOnHand(db) {
  return db
    .prepare(
      `
    SELECT
      l.code AS location_code,
      l.name AS location_name,
      i.sku,
      i.description,
      i.category,
      i.unit,
      b.on_hand,
      b.updated_at
    FROM inventory_balances b
    JOIN items i ON i.id = b.item_id
    JOIN locations l ON l.id = b.location_id
    ORDER BY l.code, i.category, i.sku
  `,
    )
    .all();
}

module.exports = {
  openDb,
  ensureSchema,
  getMeta,
  listItems,
  listLocations,
  createItem,
  createLocation,
  receiveItem,
  getOnHand,
};

