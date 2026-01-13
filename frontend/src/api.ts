import type { Division, Item, SnapshotCreateResponse, OrderRecRow } from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export async function fetchItems(division: Division): Promise<Item[]> {
  const res = await fetch(`${API_BASE}/items?division=${encodeURIComponent(division)}`)
  if (!res.ok) throw new Error(`Failed to load items (${res.status})`)
  return res.json()
}

export async function createSnapshot(args: {
  division: Division
  snapshot_date?: string
  items: Array<{ item_id: number; on_hand: number }>
}): Promise<SnapshotCreateResponse> {
  const res = await fetch(`${API_BASE}/inventory-snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Failed to save snapshot (${res.status}): ${msg}`)
  }
  return res.json()
}

export async function fetchOrderRecommendations(snapshotId: number): Promise<OrderRecRow[]> {
  const res = await fetch(`${API_BASE}/order-recommendations/${snapshotId}`)
  if (!res.ok) throw new Error(`Failed to load recommendations (${res.status})`)
  return res.json()
}

export type CsvImportMode = 'update' | 'replace'

export async function uploadItemsCsv(
  division: Division,
  mode: CsvImportMode,
  file: File
): Promise<{ ok: boolean; division: string; mode: CsvImportMode; processed: number }> {
  const form = new FormData()
  form.append('division', division)
  form.append('mode', mode)
  form.append('file', file)

  const res = await fetch(`${API_BASE}/items/upload-csv`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || 'Upload failed')
  }

  return res.json()
}
