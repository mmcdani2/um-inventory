-- src/db/schema.sql
PRAGMA foreign_keys = ON;

-- App metadata (versioning/migrations)
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Employees (local auth identity + audit attribution)
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- Catalog master
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,              -- SKU / Part #
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'EA',
  vendor TEXT NOT NULL DEFAULT '',
  barcode TEXT,
  reorder_point REAL NOT NULL DEFAULT 0,
  reorder_qty REAL NOT NULL DEFAULT 0,
  default_cost REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,  -- 1=true
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_vendor ON items(vendor);
CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);

-- Barcode aliases (many barcodes -> one item)
CREATE TABLE IF NOT EXISTS item_barcodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  barcode TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'vendor_upc' CHECK (kind IN ('house','vendor_upc','alt')),
  source TEXT NOT NULL DEFAULT '',        -- free-text provenance: 'remichel', 'upcitemdb', etc.
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_barcodes_item_id ON item_barcodes(item_id);

-- Locations / bins / hierarchy nodes
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,             -- deterministic physical key
  name TEXT NOT NULL DEFAULT '',
  parent_location_id INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  count_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_parent_location_id ON locations(parent_location_id);
CREATE INDEX IF NOT EXISTS idx_locations_sort_order ON locations(sort_order);
CREATE INDEX IF NOT EXISTS idx_locations_count_enabled ON locations(count_enabled);

-- On-hand by item+location (fast reads)
CREATE TABLE IF NOT EXISTS inventory_balances (
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  on_hand REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (item_id, location_id),
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_balances_item ON inventory_balances(item_id);
CREATE INDEX IF NOT EXISTS idx_balances_location ON inventory_balances(location_id);

-- Ledger of all movements (source of truth)
-- type: 'RECEIVE' | 'CHECKOUT' | 'ADJUST'
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
  employee_id INTEGER NOT NULL DEFAULT 0,
  user_initials TEXT NOT NULL DEFAULT '',
  vendor TEXT NOT NULL DEFAULT '',
  po_number TEXT NOT NULL DEFAULT '',
  job_number TEXT NOT NULL DEFAULT '',
  tech TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_tx_occurred_at ON transactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_employee_id ON transactions(employee_id);

-- Line items for each transaction
-- qty_sign convention:
--   RECEIVE: +qty
--   CHECKOUT: -qty
--   ADJUST: (actual - theoretical) applied as +/- to reach actual
CREATE TABLE IF NOT EXISTS transaction_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  location_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_txl_tx ON transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txl_item ON transaction_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_txl_location ON transaction_lines(location_id);

-- Saved cycle count events (for AvsT reporting clarity)
CREATE TABLE IF NOT EXISTS cycle_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  counted_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_initials TEXT NOT NULL DEFAULT '',
  employee_id INTEGER NOT NULL DEFAULT 0,
  location_id INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cc_counted_at ON cycle_counts(counted_at);
CREATE INDEX IF NOT EXISTS idx_cc_location ON cycle_counts(location_id);
CREATE INDEX IF NOT EXISTS idx_cc_employee_id ON cycle_counts(employee_id);

CREATE TABLE IF NOT EXISTS cycle_count_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cycle_count_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  theoretical_qty REAL NOT NULL,
  actual_qty REAL NOT NULL,
  variance_qty REAL NOT NULL,
  FOREIGN KEY (cycle_count_id) REFERENCES cycle_counts(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ccl_cc ON cycle_count_lines(cycle_count_id);
CREATE INDEX IF NOT EXISTS idx_ccl_item ON cycle_count_lines(item_id);

-- Trigger: maintain updated_at on items
CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
AFTER UPDATE ON items
FOR EACH ROW
BEGIN
  UPDATE items
  SET updated_at = datetime('now')
  WHERE id = OLD.id;
END;
