import sqlite3
import random
from pathlib import Path
from datetime import date, timedelta

DB_PATH = Path(__file__).parent / "inventory.db"

DIV_HVAC = "HVAC"
DIV_SPRAY = "Spray Foam"
VALID_DIVISIONS = (DIV_HVAC, DIV_SPRAY)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def ensure_column(conn: sqlite3.Connection, table: str, column: str, ddl: str) -> None:
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table});")
    cols = [r[1] for r in cur.fetchall()]
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {ddl};")
        conn.commit()


def init_db() -> None:

    conn = connect()
    cur = conn.cursor()

    # NOTE: SQLite doesn't support ALTERing CHECK constraints easily.
    # So we keep the schema stable and enforce division values in the API too.
    cur.executescript(f"""
    CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        division TEXT NOT NULL,
        min_order_qty INTEGER NOT NULL DEFAULT 0,
        case_qty INTEGER NOT NULL DEFAULT 1,
        price_per_unit REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(name, division)
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        division TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_snapshot_items (
        snapshot_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        on_hand REAL NOT NULL,
        PRIMARY KEY (snapshot_id, item_id),
        FOREIGN KEY (snapshot_id) REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usage_history (
        item_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        quantity_used INTEGER NOT NULL,
        PRIMARY KEY (item_id, date),
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_division ON items(division);
    CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);
    CREATE INDEX IF NOT EXISTS idx_snapshots_division_date ON inventory_snapshots(division, snapshot_date);
    CREATE INDEX IF NOT EXISTS idx_usage_item_date ON usage_history(item_id, date);
    """)

    # Migrations for existing DBs
    ensure_column(conn, "items", "price_per_unit", "price_per_unit REAL NOT NULL DEFAULT 0")
    ensure_column(conn, "items", "is_active", "is_active INTEGER NOT NULL DEFAULT 1")
    ensure_column(conn, "items", "sort_order", "sort_order INTEGER NOT NULL DEFAULT 0")

    conn.commit()
    conn.close()


def db_is_seeded() -> bool:
    conn = connect()
    row = conn.execute("SELECT COUNT(*) AS n FROM items").fetchone()
    conn.close()
    return (row["n"] or 0) > 0


def seed_data() -> None:
    """Seed a small dataset: items + 12 weeks usage + one prior snapshot per division."""
    if db_is_seeded():
        return

    conn = connect()
    cur = conn.cursor()

    # name, category, division, min_order_qty, case_qty, price_per_unit
    items = [
        # HVAC
        ('2" Filter (MERV 8)', "Filters", DIV_HVAC, 12, 12, 8.50),
        ('1" Filter (MERV 8)', "Filters", DIV_HVAC, 12, 12, 6.75),
        ("R-410A Refrigerant (lb)", "Refrigerant", DIV_HVAC, 0, 1, 7.25),
        ("R-22 Refrigerant (lb)", "Refrigerant", DIV_HVAC, 0, 1, 18.00),
        ('3/8" Copper Coupling', "Copper Fittings", DIV_HVAC, 10, 10, 1.10),
        ('1/2" Copper Coupling', "Copper Fittings", DIV_HVAC, 10, 10, 1.35),
        ('3/8" Insulation (6ft)', "Insulation", DIV_HVAC, 6, 6, 2.25),
        ('1/2" Insulation (6ft)', "Insulation", DIV_HVAC, 6, 6, 2.60),
        ('PVC 3/4" 90 Elbow', "PVC", DIV_HVAC, 10, 10, 0.85),
        ('PVC 3/4" Coupling', "PVC", DIV_HVAC, 10, 10, 0.65),

        # Spray Foam
        ("A-Side Drum (set)", "Chemicals", DIV_SPRAY, 1, 1, 1400.00),
        ("B-Side Drum (set)", "Chemicals", DIV_SPRAY, 1, 1, 1400.00),
        ("Spray Tips - Fine", "Consumables", DIV_SPRAY, 25, 25, 1.25),
        ("Spray Tips - Fan", "Consumables", DIV_SPRAY, 25, 25, 1.25),
        ("Masking Tape (roll)", "Consumables", DIV_SPRAY, 6, 6, 4.25),
        ("Poly Sheeting 10x100", "Consumables", DIV_SPRAY, 2, 2, 18.00),
        ("Respirator Filters (pair)", "PPE", DIV_SPRAY, 10, 10, 12.50),
        ("Tyvek Suit (each)", "PPE", DIV_SPRAY, 10, 10, 7.00),
        ("Nozzle O-Ring Kit", "Maintenance", DIV_SPRAY, 2, 2, 9.50),
        ("Gun Grease Tube", "Maintenance", DIV_SPRAY, 2, 2, 6.75),
    ]

    cur.executemany(
        """
        INSERT INTO items (name, category, division, min_order_qty, case_qty, price_per_unit, is_active)
        VALUES (?,?,?,?,?,?,1)
        """,
        items
    )
    conn.commit()

    # Seed usage history: 12 weeks of daily usage with a weekly rhythm
    today = date.today()
    start = today - timedelta(weeks=12)
    item_rows = conn.execute("SELECT id, division, category FROM items WHERE is_active=1").fetchall()

    random.seed(42)

    for r in item_rows:
        item_id = r["id"]
        division = r["division"]
        category = r["category"]

        base_rate = 0.2
        if division == DIV_HVAC:
            base_rate = 0.6 if category in ("Filters", "Copper Fittings", "PVC") else 0.3
        else:
            base_rate = 0.8 if category in ("Consumables", "PPE") else 0.25

        d = start
        while d <= today:
            dow = d.weekday()  # Mon=0 ... Sun=6

            # Slightly heavier usage Mon-Thu; light Fri; near-zero weekends
            if dow >= 5:
                day_factor = 0.05
            elif dow == 4:
                day_factor = 0.6
            else:
                day_factor = 1.0

            noise = random.random()
            qty = int(round((base_rate * day_factor * 5) * noise))
            if qty < 0:
                qty = 0

            # Chemicals are sparse "set" usage
            if division == DIV_SPRAY and category == "Chemicals":
                qty = 1 if (dow == 1 and random.random() < 0.15) else 0

            cur.execute(
                "INSERT OR REPLACE INTO usage_history (item_id, date, quantity_used) VALUES (?,?,?)",
                (item_id, d.isoformat(), qty)
            )
            d += timedelta(days=1)

    # Seed one prior snapshot for each division (last week) to power "Last on hand"
    snap_date = (today - timedelta(days=7)).isoformat()

    for div in VALID_DIVISIONS:
        cur.execute(
            "INSERT INTO inventory_snapshots (snapshot_date, division) VALUES (?,?)",
            (snap_date, div)
        )
        snapshot_id = cur.lastrowid

        div_items = conn.execute(
            "SELECT id FROM items WHERE division=? AND is_active=1 ORDER BY id",
            (div,)
        ).fetchall()

        for it in div_items:
            base = 15 if div == DIV_HVAC else 8
            on_hand = base + (it["id"] % 7)
            cur.execute(
                "INSERT INTO inventory_snapshot_items (snapshot_id, item_id, on_hand) VALUES (?,?,?)",
                (snapshot_id, it["id"], on_hand)
            )

    conn.commit()
    conn.close()
