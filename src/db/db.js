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

  // Migration v1 -> v2: enforce unique barcode (allow NULL/blank)
  const cur = Number(db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value || 1);
  if (cur < 2) {
    db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_items_barcode
    ON items(barcode)
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> '';
  `);
    db.prepare("UPDATE app_meta SET value=? WHERE key=?").run("2", "schema_version");
  }
}

function getMeta(db) {
  const schemaVersion = db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value;
  return { schemaVersion };
}

// READ-ONLY queries 
function listItems(db) {
  return db
    .prepare(
      `
    SELECT
      i.id,
      i.sku,
      i.description,
      i.category,
      i.unit,
      i.vendor,
      i.barcode,
      i.reorder_point,
      i.reorder_qty,
      i.default_cost,
      i.is_active,
      i.created_at,
      i.updated_at,
      COALESCE(SUM(b.on_hand), 0) AS on_hand_total
    FROM items i
    LEFT JOIN inventory_balances b ON b.item_id = i.id
    GROUP BY i.id
    ORDER BY i.category, i.sku
  `,
    )
    .all();
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
      const msg = String(e.message);
      if (msg.includes("items.sku")) throw new Error("SKU/Part # already exists.");
      if (msg.includes("uq_items_barcode") || msg.includes("items.barcode")) throw new Error("Barcode already exists.");
      throw new Error("Duplicate value (SKU or Barcode).");
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

function importItemsCsv(db, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { imported: 0 };

  const tx = db.transaction(() => {
    let imported = 0;
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx] || {};
      const row = Number(it.__row ?? idx + 2);
      try {
        createItem(db, it);
        imported++;
      } catch (e) {
        const sku = String(it.sku || "").trim();
        const skuPart = sku ? ` (${sku})` : "";
        throw new Error(`Row ${row}${skuPart}: ${e.message || "Invalid row."}`);
      }
    }
    return imported;
  });

  return { imported: tx() };
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

function checkoutItem(db, payload) {
  const job_number = String(payload.job_number || "").trim();
  const tech = String(payload.tech || "").trim();
  const notes = String(payload.notes || "").trim();

  const item_id = Number(payload.item_id);
  const location_id = Number(payload.location_id);
  const qty = Number(payload.qty);

  if (!job_number) throw new Error("Job # required.");
  if (!tech) throw new Error("Tech required.");
  if (!Number.isFinite(item_id) || item_id <= 0)
    throw new Error("Item required.");
  if (!Number.isFinite(location_id) || location_id <= 0)
    throw new Error("Location required.");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Qty must be > 0.");

  const tx = db.transaction(() => {
    // Check available
    const bal = db
      .prepare(
        `
      SELECT on_hand FROM inventory_balances
      WHERE item_id=? AND location_id=?
    `,
      )
      .get(item_id, location_id);

    const onHand = Number(bal?.on_hand ?? 0);
    if (onHand < qty)
      throw new Error(`Insufficient on-hand. Available: ${onHand}`);

    const txRes = db
      .prepare(
        `
      INSERT INTO transactions (type, job_number, tech, notes)
      VALUES ('CHECKOUT', ?, ?, ?)
    `,
      )
      .run(job_number, tech, notes);

    const txId = txRes.lastInsertRowid;

    db.prepare(
      `
      INSERT INTO transaction_lines (transaction_id, item_id, location_id, qty, unit_cost)
      VALUES (?, ?, ?, ?, 0)
    `,
    ).run(txId, item_id, location_id, -Math.abs(qty));

    db.prepare(
      `
      UPDATE inventory_balances
      SET on_hand = on_hand - ?, updated_at = datetime('now')
      WHERE item_id=? AND location_id=?
    `,
    ).run(qty, item_id, location_id);

    return txId;
  });

  const txId = tx();
  return { transaction_id: txId };
}

function countAndAdjust(db, payload) {
  const user_initials = String(payload.user_initials || "")
    .trim()
    .toUpperCase();
  const notes = String(payload.notes || "").trim();

  const item_id = Number(payload.item_id);
  const location_id = Number(payload.location_id);
  const actual_qty = Number(payload.actual_qty);

  if (!user_initials) throw new Error("User initials required.");
  if (!Number.isFinite(item_id) || item_id <= 0)
    throw new Error("Item required.");
  if (!Number.isFinite(location_id) || location_id <= 0)
    throw new Error("Location required.");
  if (!Number.isFinite(actual_qty) || actual_qty < 0)
    throw new Error("Actual qty must be >= 0.");

  const tx = db.transaction(() => {
    const bal = db
      .prepare(
        `
      SELECT on_hand FROM inventory_balances
      WHERE item_id=? AND location_id=?
    `,
      )
      .get(item_id, location_id);

    const theoretical_qty = Number(bal?.on_hand ?? 0);
    const variance_qty = actual_qty - theoretical_qty;

    // Create cycle count header
    const ccRes = db
      .prepare(
        `
      INSERT INTO cycle_counts (user_initials, location_id, notes)
      VALUES (?, ?, ?)
    `,
      )
      .run(user_initials, location_id, notes);

    const ccId = ccRes.lastInsertRowid;

    db.prepare(
      `
      INSERT INTO cycle_count_lines (cycle_count_id, item_id, theoretical_qty, actual_qty, variance_qty)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(ccId, item_id, theoretical_qty, actual_qty, variance_qty);

    // Create ADJUST transaction (ledger)
    const txRes = db
      .prepare(
        `
      INSERT INTO transactions (type, user_initials, notes)
      VALUES ('ADJUST', ?, ?)
    `,
      )
      .run(user_initials, `Cycle Count #${ccId}. ${notes}`.trim());

    const txId = txRes.lastInsertRowid;

    // Adjustment line is variance (can be + or -)
    db.prepare(
      `
      INSERT INTO transaction_lines (transaction_id, item_id, location_id, qty, unit_cost)
      VALUES (?, ?, ?, ?, 0)
    `,
    ).run(txId, item_id, location_id, variance_qty);

    // Set balance to actual (authoritative)
    db.prepare(
      `
      INSERT INTO inventory_balances (item_id, location_id, on_hand)
      VALUES (?, ?, ?)
      ON CONFLICT(item_id, location_id)
      DO UPDATE SET
        on_hand = excluded.on_hand,
        updated_at = datetime('now')
    `,
    ).run(item_id, location_id, actual_qty);

    return {
      cycle_count_id: ccId,
      transaction_id: txId,
      theoretical_qty,
      variance_qty,
    };
  });

  return tx();
}

function getSuggestedOrders(db) {
  return db
    .prepare(
      `
    SELECT
      i.id,
      i.sku,
      i.description,
      i.category,
      i.vendor,
      i.unit,
      i.reorder_point,
      i.reorder_qty,
      COALESCE(SUM(b.on_hand), 0) AS on_hand_total
    FROM items i
    LEFT JOIN inventory_balances b ON b.item_id = i.id
    WHERE i.is_active = 1
    GROUP BY i.id
    HAVING on_hand_total <= i.reorder_point
    ORDER BY i.vendor, i.category, i.sku
  `,
    )
    .all();
}

function updateItem(db, item) {
  const id = Number(item.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid item id.");

  const sku = String(item.sku || "").trim();
  const description = String(item.description || "").trim();
  if (!sku) throw new Error("SKU/Part # is required.");
  if (!description) throw new Error("Description is required.");

  try {
    db.prepare(
      `
      UPDATE items
      SET
        sku=?,
        description=?,
        category=?,
        unit=?,
        vendor=?,
        barcode=?,
        reorder_point=?,
        reorder_qty=?,
        default_cost=?,
        is_active=?
      WHERE id=?
    `,
    ).run(
      sku,
      description,
      String(item.category || "").trim(),
      String(item.unit || "EA").trim(),
      String(item.vendor || "").trim(),
      String(item.barcode || "").trim() || null,
      Number(item.reorder_point || 0),
      Number(item.reorder_qty || 0),
      Number(item.default_cost || 0),
      item.is_active ? 1 : 0,
      id,
    );

    return db.prepare("SELECT * FROM items WHERE id=?").get(id);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      const msg = String(e.message);
      if (msg.includes("items.sku")) throw new Error("SKU/Part # already exists.");
      if (msg.includes("uq_items_barcode") || msg.includes("items.barcode")) throw new Error("Barcode already exists.");
      throw new Error("Duplicate value (SKU or Barcode).");
    }
    throw e;
  }
}

function getHomeStats(db) {
  const totalSkus = db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM items
    WHERE is_active = 1
  `,
    )
    .get().c;

  const totalLocations = db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM locations
  `,
    )
    .get().c;

  const belowReorder = db
    .prepare(
      `
    SELECT COUNT(*) AS c FROM (
      SELECT
        i.id,
        COALESCE(SUM(b.on_hand), 0) AS on_hand_total,
        i.reorder_point
      FROM items i
      LEFT JOIN inventory_balances b ON b.item_id = i.id
      WHERE i.is_active = 1
      GROUP BY i.id
      HAVING on_hand_total <= i.reorder_point
    )
  `,
    )
    .get().c;

  const tx7d = db
    .prepare(
      `
    SELECT COUNT(*) AS c
    FROM transactions
    WHERE occurred_at >= datetime('now','-7 days')
  `,
    )
    .get().c;

  return {
    total_skus: Number(totalSkus || 0),
    total_locations: Number(totalLocations || 0),
    below_reorder: Number(belowReorder || 0),
    tx_7d: Number(tx7d || 0),
  };
}

function updateLocation(db, loc) {
  const id = Number(loc.id);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid location id.");

  const code = String(loc.code || "")
    .trim()
    .toUpperCase();
  const name = String(loc.name || "").trim();

  if (!code) throw new Error("Location code is required.");

  try {
    db.prepare(
      `
      UPDATE locations
      SET code = ?, name = ?
      WHERE id = ?
    `,
    ).run(code, name, id);

    return db.prepare(`SELECT * FROM locations WHERE id=?`).get(id);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      throw new Error("Location code already exists.");
    }
    throw e;
  }
}

function resetDb(db) {
  const tx = db.transaction(() => {
    // order matters due to FKs
    db.prepare("DELETE FROM transaction_lines").run();
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM inventory_balances").run();
    // optional: keep catalog + locations, or wipe them too:
    // db.prepare("DELETE FROM items").run();
    // db.prepare("DELETE FROM locations").run();
  });
  tx();
  return { ok: true };
}

module.exports = {
  openDb,
  ensureSchema,
  getMeta,
  listItems,
  listLocations,
  createItem,
  importItemsCsv,
  createLocation,
  receiveItem,
  getOnHand,
  checkoutItem,
  countAndAdjust,
  getSuggestedOrders,
  updateItem,
  getHomeStats,
  updateLocation,
  resetDb,
};
