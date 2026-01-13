# Inventory MVP (React + Vite + FastAPI + SQLite)

Boring internal tool for weekly inventory counts and immediate order recommendations.

## What you get

- **Weekly Count Page**
  - Division dropdown (HVAC, Spray Foam)
  - Plain table, visually grouped by category
  - Shows **Last On Hand** (from most recent snapshot for that division)
  - Editable **Current On Hand**
  - **Enter moves down** input-to-input (fast keyboard flow)
  - Save creates a snapshot and routes straight to recommendations

- **Order Recommendation Page**
  - Generated immediately after saving
  - Uses **weighted rolling average** of last 8 weeks usage
  - `predicted_weekly_usage` → `order_qty = max(0, predicted - on_hand)`
  - Enforces:
    - minimum order quantity (only if order_qty > 0)
    - round up to nearest case quantity
  - Final order quantities are **editable**
  - Export CSV + Print

No auth. No UI libs. Local-only.

---

## Run locally

### 1) Backend (FastAPI)

From the repo root:

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at:
- http://localhost:8000

API docs:
- http://localhost:8000/docs

SQLite database is created at:
- `backend/inventory.db`

It seeds automatically on first run (items, usage history, and one prior snapshot per division).

---

### 2) Frontend (React + Vite)

From the repo root:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at:
- http://localhost:5173

---

## API (minimum)

- `GET /items?division=HVAC`
  - Returns items for the division with `last_on_hand` computed from the latest snapshot

- `POST /inventory-snapshots`
  - Body:
    ```json
    {
      "division": "HVAC",
      "items": [
        { "item_id": 1, "on_hand": 10 }
      ]
    }
    ```
  - Returns: `{ "snapshot_id": 123 }`

- `GET /order-recommendations/{snapshot_id}`
  - Returns the computed order rows

---

## Notes / intended next steps (optional)

- Add a “Weeks to predict” setting (1–4) and persist it.
- Add a lightweight “Items” maintenance page (edit min/case/category).
- Add a simple “Usage import” CSV tool if you want real data fast.
