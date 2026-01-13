import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Division, Item } from '../types'
import { fetchItems, createSnapshot, uploadItemsCsv, type CsvImportMode } from '../api'

type Row = Item & { current_on_hand: number }

const DIVISIONS: Array<{ label: string; value: Division }> = [
  { label: 'HVAC', value: 'HVAC' },
  { label: 'Spray Foam', value: 'Spray Foam' },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function WeeklyCountPage() {
  const [division, setDivision] = useState<Division>('HVAC')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [snapshotDate, setSnapshotDate] = useState<string>(todayISO())

  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const navigate = useNavigate()

  // CSV import
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importMode, setImportMode] = useState<CsvImportMode>('update')
  const [importMsg, setImportMsg] = useState<string>('')

  async function loadItems(div: Division) {
    setLoading(true)
    setError(null)
    try {
      const items = await fetchItems(div)
      const mapped: Row[] = items.map((it) => ({
        ...it,
        current_on_hand: it.last_on_hand ?? 0,
      }))
      setRows(mapped)
      setTimeout(() => inputRefs.current[0]?.focus(), 0)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load items')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        if (!cancelled) await loadItems(division)
      })()
    return () => {
      cancelled = true
    }
  }, [division])

  const flatRows = useMemo(() => rows, [rows])

  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, [])
      map.get(r.category)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  function handleEnterMoveDown(idx: number) {
    inputRefs.current[idx + 1]?.focus()
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        division,
        snapshot_date: snapshotDate,
        items: rows.map((r) => ({
          item_id: r.id,
          on_hand: Number.isFinite(r.current_on_hand) ? r.current_on_hand : 0,
        })),
      }
      const res = await createSnapshot(payload)
      navigate(`/order/${res.snapshot_id}`)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function doImport() {
    if (!csvFile) return
    setImportMsg('Importing…')
    setError(null)
    try {
      const result = await uploadItemsCsv(division, importMode, csvFile)
      setImportMsg(`Imported ${result.processed}. Refreshing…`)
      setCsvFile(null)
      await loadItems(division)
      setImportMsg('Done.')
      setTimeout(() => inputRefs.current[0]?.focus(), 0)
    } catch (e: any) {
      setImportMsg('')
      setError(e?.message ?? 'Import failed')
    }
  }

  return (
    <div className="layout">
      {/* ===== Sidebar ===== */}
      <div className="sidebar no-print">
        <h2>UM/USF Inventory Controls</h2>

        <div className="section">
          <label>Division</label>
          <select
            value={division}
            onChange={(e) => setDivision(e.target.value as Division)}
            disabled={loading || saving}
          >
            {DIVISIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div className="section">
          <label>Import Items CSV</label>

          <select
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as CsvImportMode)}
            disabled={loading || saving}
          >
            <option value="update">Update / Add Only</option>
            <option value="replace">Replace All (Safe)</option>
          </select>

          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setImportMsg('')
              setError(null)
              setCsvFile(e.target.files?.[0] ?? null)
            }}
            disabled={loading || saving}
          />

          <button onClick={doImport} disabled={!csvFile || loading || saving}>
            Import Items
          </button>

          {importMsg && <span className="hint">{importMsg}</span>}
        </div>

        <div className="section">
          <button onClick={save} disabled={loading || saving || rows.length === 0}>
            {saving ? 'Saving…' : 'Save Snapshot'}
          </button>
        </div>

        <span className="hint">
          Enter moves down.<br />
          Categories are visual only.
        </span>
      </div>

      {/* ===== Main Table ===== */}
      <div className="main">
        {error && <div className="error">{error}</div>}
        {loading && <div>Loading…</div>}

        {!loading && rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ width: '55%' }}>Item</th>
                <th style={{ width: '20%' }}>Last On Hand</th>
                <th style={{ width: '25%' }}>Current On Hand</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, catRows]) => (
                <React.Fragment key={cat}>
                  <tr className="category-row">
                    <td colSpan={3}>{cat}</td>
                  </tr>
                  {catRows.map((r) => {
                    const idx = flatRows.findIndex((x) => x.id === r.id)
                    return (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.last_on_hand ?? 0}</td>
                        <td>
                          <input
                            ref={(el) => (inputRefs.current[idx] = el)}
                            type="number"
                            min={0}
                            step="any"
                            value={r.current_on_hand}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value)
                              setRows((prev) =>
                                prev.map((p) =>
                                  p.id === r.id
                                    ? { ...p, current_on_hand: Number.isNaN(v) ? 0 : v }
                                    : p
                                )
                              )
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleEnterMoveDown(idx)
                              }
                            }}
                          />

                        </td>
                      </tr>
                    )
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

}
