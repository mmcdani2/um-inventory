from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import date, timedelta
import math
import csv, io

from db import connect, init_db, seed_data, DIV_HVAC, DIV_SPRAY, VALID_DIVISIONS

app = FastAPI(title="Inventory MVP API", version="0.3.0")

# -----------------------------
# CORS (dev only)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Models
# -----------------------------
class ItemOut(BaseModel):
    id: int
    name: str
    category: str
    division: str
    min_order_qty: int
    case_qty: int
    price_per_unit: float
    last_on_hand: int = 0


class SnapshotItemIn(BaseModel):
    item_id: int
    on_hand: int = Field(ge=0)


class SnapshotCreateIn(BaseModel):
    snapshot_date: Optional[str] = None
    division: str
    items: List[SnapshotItemIn]


class SnapshotCreateOut(BaseModel):
    snapshot_id: int


class OrderRecRow(BaseModel):
    item_id: int
    name: str
    category: str
    division: str
    on_hand: int
    predicted_weekly_usage: int
    recommended_order_qty: int
    min_order_qty: int
    case_qty: int
    price_per_unit: float


# -----------------------------
# Helpers
# -----------------------------
def _normalize_division(div: str) -> str:
    d = (div or "").strip().lower()
    if d == "hvac":
        return DIV_HVAC
    if d in ("spray foam", "sprayfoam", "spray-foam", "spray_foam"):
        return DIV_SPRAY
    raise HTTPException(status_code=400, detail="Invalid division")


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _weighted_avg_weekly_usage(conn, item_id: int, end_date: date, weeks: int = 8) -> int:
    end_week = _week_start(end_date)
    week_starts = [end_week - timedelta(weeks=(weeks - 1 - i)) for i in range(weeks)]
    totals = {ws: 0 for ws in week_starts}

    start_date = week_starts[0].isoformat()
    rows = conn.execute(
        "SELECT date, quantity_used FROM usage_history WHERE item_id=? AND date>=?",
        (item_id, start_date),
    ).fetchall()

    for r in rows:
        d = date.fromisoformat(r["date"])
        ws = _week_start(d)
        if ws in totals:
            totals[ws] += int(r["quantity_used"])

    weights = list(range(1, weeks + 1))
    numer = sum(totals[ws] * weights[i] for i, ws in enumerate(week_starts))
    denom = sum(weights)

    return int(round(numer / denom)) if denom else 0


def _apply_min_and_case(qty: int, min_order_qty: int, case_qty: int) -> int:
    if qty <= 0:
        return 0
    qty = max(qty, min_order_qty)
    if case_qty <= 1:
        return qty
    return int(math.ceil(qty / case_qty) * case_qty)


def _get_previous_snapshot_map(conn, division: str, before_date: str) -> dict[int, int]:
    snap = conn.execute(
        """
        SELECT id
        FROM inventory_snapshots
        WHERE division=? AND snapshot_date < ?
        ORDER BY snapshot_date DESC, id DESC
        LIMIT 1
        """,
        (division, before_date),
    ).fetchone()

    if not snap:
        return {}

    rows = conn.execute(
        "SELECT item_id, on_hand FROM inventory_snapshot_items WHERE snapshot_id=?",
        (snap["id"],),
    ).fetchall()

    return {int(r["item_id"]): int(r["on_hand"]) for r in rows}


# -----------------------------
# Startup
# -----------------------------
@app.on_event("startup")
def startup():
    init_db()
    seed_data()


# -----------------------------
# Routes
# -----------------------------
@app.get("/items", response_model=List[ItemOut])
def get_items(division: str = Query(...)):
    div = _normalize_division(division)
    conn = connect()

    snap = conn.execute(
        """
        SELECT id FROM inventory_snapshots
        WHERE division=?
        ORDER BY snapshot_date DESC, id DESC
        LIMIT 1
        """,
        (div,),
    ).fetchone()

    last_map = {}
    if snap:
        rows = conn.execute(
            "SELECT item_id, on_hand FROM inventory_snapshot_items WHERE snapshot_id=?",
            (snap["id"],),
        ).fetchall()
        last_map = {r["item_id"]: r["on_hand"] for r in rows}

    items = conn.execute(
        """
        SELECT id, name, category, division, min_order_qty, case_qty, price_per_unit
        FROM items
        WHERE division=? AND is_active=1
        ORDER BY sort_order, name
        """,
        (div,),
    ).fetchall()

    conn.close()

    return [
        ItemOut(
            id=r["id"],
            name=r["name"],
            category=r["category"],
            division=r["division"],
            min_order_qty=r["min_order_qty"],
            case_qty=r["case_qty"],
            price_per_unit=r["price_per_unit"],
            last_on_hand=last_map.get(r["id"], 0),
        )
        for r in items
    ]


@app.post("/inventory-snapshots", response_model=SnapshotCreateOut)
def create_snapshot(payload: SnapshotCreateIn):
    div = _normalize_division(payload.division)
    snap_date = payload.snapshot_date or date.today().isoformat()

    conn = connect()
    cur = conn.cursor()

    item_ids = [i.item_id for i in payload.items]
    if not item_ids:
        conn.close()
        raise HTTPException(status_code=400, detail="No items provided")

    placeholders = ",".join("?" * len(item_ids))
    rows = conn.execute(
        f"""
        SELECT id FROM items
        WHERE id IN ({placeholders})
          AND division=?
          AND is_active=1
        """,
        (*item_ids, div),
    ).fetchall()

    if {r["id"] for r in rows} != set(item_ids):
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid item IDs")

    prev_map = _get_previous_snapshot_map(conn, div, snap_date)

    cur.execute(
        "INSERT INTO inventory_snapshots (snapshot_date, division) VALUES (?,?)",
        (snap_date, div),
    )
    snapshot_id = cur.lastrowid

    cur.executemany(
        "INSERT INTO inventory_snapshot_items (snapshot_id, item_id, on_hand) VALUES (?,?,?)",
        [(snapshot_id, i.item_id, i.on_hand) for i in payload.items],
    )

    # 🔥 AUTO-CALCULATED USAGE
    for i in payload.items:
        prev = prev_map.get(i.item_id)
        if prev is None:
            continue
        used = max(0, prev - i.on_hand)
        if used > 0:
            cur.execute(
                """
                INSERT OR IGNORE INTO usage_history (item_id, date, quantity_used)
                VALUES (?,?,?)
                """,
                (i.item_id, snap_date, used),
            )

    conn.commit()
    conn.close()
    return SnapshotCreateOut(snapshot_id=snapshot_id)


@app.get("/order-recommendations/{snapshot_id}", response_model=List[OrderRecRow])
def get_order_recommendations(snapshot_id: int):
    conn = connect()

    snap = conn.execute(
        "SELECT snapshot_date FROM inventory_snapshots WHERE id=?",
        (snapshot_id,),
    ).fetchone()
    if not snap:
        conn.close()
        raise HTTPException(status_code=404, detail="Snapshot not found")

    snap_date = date.fromisoformat(snap["snapshot_date"])

    rows = conn.execute(
        """
        SELECT
            i.id AS item_id,
            i.name,
            i.category,
            i.division,
            i.min_order_qty,
            i.case_qty,
            i.price_per_unit,
            ssi.on_hand
        FROM inventory_snapshot_items ssi
        JOIN items i ON i.id = ssi.item_id
        WHERE ssi.snapshot_id=?
        ORDER BY i.category, i.name
        """,
        (snapshot_id,),
    ).fetchall()

    out = []
    for r in rows:
        predicted = _weighted_avg_weekly_usage(conn, r["item_id"], snap_date)
        raw = max(0, predicted - r["on_hand"])
        rec = _apply_min_and_case(raw, r["min_order_qty"], r["case_qty"])

        out.append(OrderRecRow(
            item_id=r["item_id"],
            name=r["name"],
            category=r["category"],
            division=r["division"],
            on_hand=r["on_hand"],
            predicted_weekly_usage=predicted,
            recommended_order_qty=rec,
            min_order_qty=r["min_order_qty"],
            case_qty=r["case_qty"],
            price_per_unit=r["price_per_unit"],
        ))

    conn.close()
    return out

@app.post("/items/upload-csv")
def upload_items_csv(
    division: str = Form(...),
    mode: str = Form("update"),  # "update" or "replace"
    file: UploadFile = File(...),
):
    div = _normalize_division(division)
    if mode not in ("update", "replace"):
        raise HTTPException(status_code=400, detail="mode must be 'update' or 'replace'")

    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not decode CSV as UTF-8")

    reader = csv.DictReader(io.StringIO(text))
    required = {"category", "name", "price_per_unit"}
    headers = set(h.strip() for h in (reader.fieldnames or []))
    if not required.issubset(headers):
        raise HTTPException(
            status_code=400,
            detail="CSV headers must be: category,name,price_per_unit",
        )

    conn = connect()
    cur = conn.cursor()

    if mode == "replace":
        # deactivate everything first (safe, keeps history)
        cur.execute(
            "UPDATE items SET is_active=0 WHERE division=?",
            (div,),
        )

    processed = 0
    sort_order = 0  # 👈 THIS is the key

    for row in reader:
        sort_order += 1  # preserves CSV order

        name = (row.get("name") or "").strip()
        category = (row.get("category") or "").strip()
        ppu_raw = (row.get("price_per_unit") or "").strip()

        if not name or not category:
            continue

        ppu_raw = ppu_raw.replace("$", "").replace(",", "")
        try:
            price_per_unit = float(ppu_raw) if ppu_raw else 0.0
        except ValueError:
            price_per_unit = 0.0

        min_order_qty = 0
        case_qty = 1

        cur.execute(
            """
            INSERT INTO items (
                name,
                category,
                division,
                min_order_qty,
                case_qty,
                price_per_unit,
                is_active,
                sort_order
            )
            VALUES (?,?,?,?,?,?,1,?)
            ON CONFLICT(name, division) DO UPDATE SET
                category=excluded.category,
                price_per_unit=excluded.price_per_unit,
                is_active=1,
                sort_order=excluded.sort_order
            """,
            (
                name,
                category,
                div,
                min_order_qty,
                case_qty,
                price_per_unit,
                sort_order,
            ),
        )

        processed += 1

    conn.commit()
    conn.close()

    return {
        "ok": True,
        "division": div,
        "mode": mode,
        "processed": processed,
    }

