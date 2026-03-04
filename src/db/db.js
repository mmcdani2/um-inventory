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

  const v = db
    .prepare("SELECT value FROM app_meta WHERE key=?")
    .get("schema_version")?.value;

  if (!v) {
    const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
    db.exec(schemaSql);
    db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?)").run(
      "schema_version",
      "1",
    );
  }

  // Migration v1 -> v2: enforce unique barcode (allow NULL/blank)
  const cur = Number(
    db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")
      ?.value || 1,
  );
  if (cur < 2) {
    db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_items_barcode
    ON items(barcode)
    WHERE barcode IS NOT NULL AND TRIM(barcode) <> '';
  `);
    db.prepare("UPDATE app_meta SET value=? WHERE key=?").run(
      "2",
      "schema_version",
    );
  }

  // Migration v2 -> v3: add item_barcodes alias table
  const cur2 = Number(
    db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")
      ?.value || 2,
  );

  if (cur2 < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS item_barcodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        barcode TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id ON item_barcodes(item_id);
    `);

    db.prepare("UPDATE app_meta SET value=? WHERE key=?").run(
      "3",
      "schema_version",
    );
  }

  // Migration v3 -> v4: enforce cross-table barcode uniqueness + block blank alias barcodes
  const cur3 = Number(
    db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value || 3,
  );

  if (cur3 < 4) {
    db.exec(`
    -- House barcode (items.barcode) cannot collide with any alias barcode
    CREATE TRIGGER IF NOT EXISTS trg_items_barcode_no_alias_ins
    BEFORE INSERT ON items
    WHEN NEW.barcode IS NOT NULL AND TRIM(NEW.barcode) <> ''
    BEGIN
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM item_barcodes WHERE barcode = NEW.barcode)
        THEN RAISE(ABORT, 'barcode already exists in item_barcodes')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_items_barcode_no_alias_upd
    BEFORE UPDATE OF barcode ON items
    WHEN NEW.barcode IS NOT NULL AND TRIM(NEW.barcode) <> '' AND NEW.barcode <> OLD.barcode
    BEGIN
      SELECT CASE
        WHEN EXISTS (SELECT 1 FROM item_barcodes WHERE barcode = NEW.barcode)
        THEN RAISE(ABORT, 'barcode already exists in item_barcodes')
      END;
    END;

    -- Alias barcode cannot collide with any house barcode (items.barcode)
    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_no_items_ins
    BEFORE INSERT ON item_barcodes
    BEGIN
      SELECT CASE
        WHEN TRIM(NEW.barcode) = ''
        THEN RAISE(ABORT, 'blank barcode not allowed')
      END;

      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM items
          WHERE barcode IS NOT NULL AND TRIM(barcode) <> '' AND barcode = NEW.barcode
        )
        THEN RAISE(ABORT, 'barcode already exists in items.barcode')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_no_items_upd
    BEFORE UPDATE OF barcode ON item_barcodes
    WHEN NEW.barcode <> OLD.barcode
    BEGIN
      SELECT CASE
        WHEN TRIM(NEW.barcode) = ''
        THEN RAISE(ABORT, 'blank barcode not allowed')
      END;

      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM items
          WHERE barcode IS NOT NULL AND TRIM(barcode) <> '' AND barcode = NEW.barcode
        )
        THEN RAISE(ABORT, 'barcode already exists in items.barcode')
      END;
    END;
  `);

    db.prepare("UPDATE app_meta SET value=? WHERE key=?").run("4", "schema_version");
  }

  // Migration v4 -> v5: add item_barcodes.kind + enforce allowed values (and block 'house' in aliases)
  const cur4 = Number(
    db.prepare("SELECT value FROM app_meta WHERE key=?").get("schema_version")?.value || 4,
  );

  if (cur4 < 5) {
    // add column if missing
    const cols = db.prepare("PRAGMA table_info(item_barcodes)").all();
    const hasKind = cols.some((c) => c.name === "kind");
    if (!hasKind) {
      db.exec(`ALTER TABLE item_barcodes ADD COLUMN kind TEXT NOT NULL DEFAULT 'vendor_upc';`);
    }

    // enforce allowed kinds + prevent 'house' kind in alias table
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_kind_ins
    BEFORE INSERT ON item_barcodes
    BEGIN
      SELECT CASE
        WHEN NEW.kind NOT IN ('house','vendor_upc','alt')
        THEN RAISE(ABORT, 'invalid item_barcodes.kind')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_kind_upd
    BEFORE UPDATE OF kind ON item_barcodes
    BEGIN
      SELECT CASE
        WHEN NEW.kind NOT IN ('house','vendor_upc','alt')
        THEN RAISE(ABORT, 'invalid item_barcodes.kind')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_block_house_ins
    BEFORE INSERT ON item_barcodes
    WHEN NEW.kind = 'house'
    BEGIN
      SELECT RAISE(ABORT, 'house barcode must live in items.barcode');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_item_barcodes_block_house_upd
    BEFORE UPDATE OF kind ON item_barcodes
    WHEN NEW.kind = 'house'
    BEGIN
      SELECT RAISE(ABORT, 'house barcode must live in items.barcode');
    END;
  `);

    db.prepare("UPDATE app_meta SET value=? WHERE key=?").run("5", "schema_version");
  }
}

function getMeta(db) {
  const schemaVersion = db
    .prepare("SELECT value FROM app_meta WHERE key=?")
    .get("schema_version")?.value;
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

function findItemByBarcode(db, barcodeRaw) {
  const barcode = String(barcodeRaw || "").trim();
  if (!barcode) return null;

  // 1) Preferred: alias table (many barcodes -> one item)
  const hit = db
    .prepare(
      `
      SELECT i.*
      FROM item_barcodes ib
      JOIN items i ON i.id = ib.item_id
      WHERE ib.barcode = ?
      LIMIT 1
    `,
    )
    .get(barcode);

  if (hit) return hit;

  // 2) Legacy fallback: items.barcode (until we fully migrate)
  return (
    db.prepare(`SELECT * FROM items WHERE barcode = ? LIMIT 1`).get(barcode) ||
    null
  );
}

function attachBarcodeToItem(db, { item_id, barcode, kind, source = "vendor" }) {
  const itemId = Number(item_id);
  const bc = String(barcode || "").trim();
  const src = String(source || "").trim();

  // default kind (future-proof)
  let k = String(kind || "").trim();
  if (!k) {
    // infer from source if caller is old
    k = src === "house" ? "alt" : "vendor_upc";
  }

  if (!Number.isFinite(itemId) || itemId <= 0) throw new Error("Invalid item_id.");
  if (!bc) throw new Error("Barcode is required.");

  try {
    db.prepare(
      `
      INSERT INTO item_barcodes (item_id, barcode, kind, source)
      VALUES (?, ?, ?, ?)
    `,
    ).run(itemId, bc, k, src);

    return { ok: true };
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      throw new Error("Barcode already attached to another item.");
    }
    throw e;
  }
}

function listLocations(db) {
  return db
    .prepare(
      `
    SELECT id, code, name, created_at
    FROM locations
    ORDER BY code
  `,
    )
    .all();
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
      if (msg.includes("items.sku"))
        throw new Error("SKU/Part # already exists.");
      if (msg.includes("uq_items_barcode") || msg.includes("items.barcode"))
        throw new Error("Barcode already exists.");
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

function importLocationsCsv(db, payload) {
  const csvText = String(payload?.csvText || "").trim();
  if (!csvText) throw new Error("CSV is empty.");

  const lines = csvText.split(/\r?\n/).filter((x) => x.trim().length);
  if (lines.length < 2)
    throw new Error("CSV must include a header row and at least 1 data row.");

  // Simple CSV parse (works for your file: no quoted commas)
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idxCode =
    header.indexOf("location_code") !== -1
      ? header.indexOf("location_code")
      : header.indexOf("code");
  const idxName =
    header.indexOf("description") !== -1
      ? header.indexOf("description")
      : header.indexOf("name");

  if (idxCode === -1)
    throw new Error("CSV must include location_code (or code) column.");
  if (idxName === -1)
    throw new Error("CSV must include description (or name) column.");

  const stmt = db.prepare(
    `INSERT OR IGNORE INTO locations (code, name) VALUES (?, ?)`,
  );

  let inserted = 0;
  let skipped = 0;

  const tx = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(",");
      const code = String(row[idxCode] || "")
        .trim()
        .toUpperCase();
      const name = String(row[idxName] || "").trim();

      if (!code) continue;

      const res = stmt.run(code, name);
      if (res.changes === 1) inserted++;
      else skipped++;
    }
  });

  tx();
  return { ok: true, inserted, skipped, total: inserted + skipped };
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

function receiveBatch(db, payload) {
  const user_initials = String(payload.user_initials || "")
    .trim()
    .toUpperCase();
  const vendor = String(payload.vendor || "").trim();
  const po_number = String(payload.po_number || "").trim();
  const notes = String(payload.notes || "").trim();

  const location_id = Number(payload.location_id);
  const lines = Array.isArray(payload.lines) ? payload.lines : [];

  // Header fields are optional (scanner-first workflows).
  if (!Number.isFinite(location_id) || location_id <= 0)
    throw new Error("Location required.");
  if (!lines.length) throw new Error("At least one line is required.");

  // validate lines up front (fail-fast)
  for (const [idx, ln] of lines.entries()) {
    const item_id = Number(ln.item_id);
    const qty = Number(ln.qty);
    const unit_cost = Number(ln.unit_cost || 0);

    if (!Number.isFinite(item_id) || item_id <= 0)
      throw new Error(`Line ${idx + 1}: Item required.`);
    if (!Number.isFinite(qty) || qty <= 0)
      throw new Error(`Line ${idx + 1}: Qty must be > 0.`);
    if (!Number.isFinite(unit_cost))
      throw new Error(`Line ${idx + 1}: Unit cost invalid.`);
  }

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

    const insLine = db.prepare(
      `
        INSERT INTO transaction_lines (transaction_id, item_id, location_id, qty, unit_cost)
        VALUES (?, ?, ?, ?, ?)
      `,
    );

    const upsertBal = db.prepare(
      `
        INSERT INTO inventory_balances (item_id, location_id, on_hand)
        VALUES (?, ?, ?)
        ON CONFLICT(item_id, location_id)
        DO UPDATE SET
          on_hand = on_hand + excluded.on_hand,
          updated_at = datetime('now')
      `,
    );

    for (const ln of lines) {
      const item_id = Number(ln.item_id);
      const qty = Number(ln.qty);
      const unit_cost = Number(ln.unit_cost || 0);

      insLine.run(txId, item_id, location_id, qty, unit_cost);
      upsertBal.run(item_id, location_id, qty);
    }

    return txId;
  });

  const txId = tx();
  return { transaction_id: txId, lines: lines.length };
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
      if (msg.includes("items.sku"))
        throw new Error("SKU/Part # already exists.");
      if (msg.includes("uq_items_barcode") || msg.includes("items.barcode"))
        throw new Error("Barcode already exists.");
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

function deleteLocation(db, locationIdRaw) {
  const id = Number(locationIdRaw);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid location id.");

  // Safety: do NOT allow deleting locations that have history/balances
  const bal = db
    .prepare(`SELECT COUNT(*) AS c FROM inventory_balances WHERE location_id=?`)
    .get(id)?.c;

  if (Number(bal || 0) > 0) {
    throw new Error(
      "Cannot delete: location has on-hand balances. Move/zero stock first.",
    );
  }

  const tx = db
    .prepare(`SELECT COUNT(*) AS c FROM transaction_lines WHERE location_id=?`)
    .get(id)?.c;

  if (Number(tx || 0) > 0) {
    throw new Error("Cannot delete: location has transaction history.");
  }

  const cc = db
    .prepare(`SELECT COUNT(*) AS c FROM cycle_counts WHERE location_id=?`)
    .get(id)?.c;

  if (Number(cc || 0) > 0) {
    throw new Error("Cannot delete: location has cycle count history.");
  }

  const res = db.prepare(`DELETE FROM locations WHERE id=?`).run(id);
  if (res.changes !== 1) throw new Error("Location not found.");
  return { ok: true };
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
  receiveBatch,
  getOnHand,
  checkoutItem,
  countAndAdjust,
  getSuggestedOrders,
  updateItem,
  getHomeStats,
  updateLocation,
  resetDb,
  findItemByBarcode,
  attachBarcodeToItem,
  deleteLocation,
  importLocationsCsv,
};
