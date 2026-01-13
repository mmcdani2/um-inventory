import React, { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { OrderRecRow } from '../types'
import { fetchOrderRecommendations } from '../api'

type EditableRow = OrderRecRow & { final_order_qty: number }

export default function OrderRecommendationPage() {
  const params = useParams()
  const snapshotId = Number(params.snapshotId)
  const [rows, setRows] = useState<EditableRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!Number.isFinite(snapshotId)) {
      setError('Bad snapshot id')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchOrderRecommendations(snapshotId)
      .then((data) => {
        if (cancelled) return
        setRows(data.map((r) => ({ ...r, final_order_qty: r.recommended_order_qty })))
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [snapshotId])

  const grouped = useMemo(() => {
    const map = new Map<string, EditableRow[]>()
    for (const r of rows) {
      if (!map.has(r.category)) map.set(r.category, [])
      map.get(r.category)!.push(r)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  const grandTotal = useMemo(() => {
    return rows.reduce((sum, r) => sum + (r.final_order_qty || 0) * (r.price_per_unit || 0), 0)
  }, [rows])

  function exportCsv() {
    const headers = [
      'division',
      'category',
      'item',
      'on_hand',
      'predicted_weekly_usage',
      'recommended_order_qty',
      'final_order_qty',
      'price_per_unit',
      'line_total',
    ]
    const lines = [headers.join(',')]

    for (const r of rows) {
      const lineTotal = (r.final_order_qty || 0) * (r.price_per_unit || 0)
      const vals = [
        r.division,
        r.category,
        csvEscape(r.name),
        String(r.on_hand),
        String(r.predicted_weekly_usage),
        String(r.recommended_order_qty),
        String(r.final_order_qty),
        String(r.price_per_unit ?? 0),
        String(round2(lineTotal)),
      ]
      lines.push(vals.join(','))
    }

    // Add a footer total line
    lines.push(['', '', 'TOTAL', '', '', '', '', '', String(round2(grandTotal))].join(','))

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `order_recommendations_snapshot_${snapshotId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printPage() {
    window.print()
  }

  return (
    <div>
      <div className="toolbar no-print">
        <h1 style={{ marginRight: 12 }}>Order Recommendations</h1>
        <Link to="/count">← Back to Count</Link>
        <button onClick={exportCsv} disabled={rows.length === 0}>
          Export CSV
        </button>
        <button onClick={printPage} disabled={rows.length === 0}>
          Print
        </button>
        <span className="hint">Editable: change Final Order Qty before exporting/printing.</span>
      </div>

      {rows.length > 0 && (
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <strong>Estimated Total: ${round2(grandTotal)}</strong>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {loading && <div>Loading…</div>}

      {!loading && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th style={{ width: '34%' }}>Item</th>
              <th style={{ width: '8%' }}>On Hand</th>
              <th style={{ width: '12%' }}>Predicted Weekly</th>
              <th style={{ width: '10%' }}>Recommended</th>
              <th style={{ width: '16%' }}>Final Order Qty</th>
              <th style={{ width: '10%' }}>Unit Price</th>
              <th style={{ width: '10%' }}>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([cat, catRows]) => (
              <React.Fragment key={cat}>
                <tr className="category-row">
                  <td colSpan={7}>{cat}</td>
                </tr>
                {catRows.map((r) => {
                  const lineTotal = (r.final_order_qty || 0) * (r.price_per_unit || 0)
                  return (
                    <tr key={r.item_id}>
                      <td>{r.name}</td>
                      <td className="num">{r.on_hand}</td>
                      <td className="num">{r.predicted_weekly_usage}</td>
                      <td className="num">{r.recommended_order_qty}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={r.final_order_qty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value || '0', 10)
                            setRows((prev) =>
                              prev.map((p) =>
                                p.item_id === r.item_id ? { ...p, final_order_qty: Number.isNaN(v) ? 0 : v } : p,
                              ),
                            )
                          }}
                        />
                        <div className="hint">
                          min {r.min_order_qty}, case {r.case_qty}
                        </div>
                      </td>
                      <td className="num">${round2(r.price_per_unit ?? 0)}</td>
                      <td className="num">${round2(lineTotal)}</td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
            <tr>
              <td colSpan={6} style={{ textAlign: 'right' }}>
                <strong>Total</strong>
              </td>
              <td className="num">
                <strong>${round2(grandTotal)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

function csvEscape(s: string): string {
  const needs = /[",\n]/.test(s)
  const escaped = s.replace(/"/g, '""')
  return needs ? `"${escaped}"` : escaped
}

function round2(n: number): string {
  return (Math.round((n || 0) * 100) / 100).toFixed(2)
}
