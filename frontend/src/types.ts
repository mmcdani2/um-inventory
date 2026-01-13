export type Division = 'HVAC' | 'Spray Foam'

export type Item = {
  id: number
  name: string
  category: string
  division: Division
  min_order_qty: number
  case_qty: number
  price_per_unit: number
  last_on_hand: number
}

export type SnapshotCreateResponse = { snapshot_id: number }

export type OrderRecRow = {
  item_id: number
  name: string
  category: string
  division: Division
  on_hand: number
  predicted_weekly_usage: number
  recommended_order_qty: number
  min_order_qty: number
  case_qty: number
  price_per_unit: number
}
