export function parseRupeeAmount(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value ?? '').replace(/,/g, '').trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function amountsRoughlyEqual(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance
}

export function splitAmountEvenly(total: number, parts: number): number[] {
  if (parts <= 0) return []
  const safeTotal = Math.max(0, Math.round(total))
  if (safeTotal === 0) return Array.from({ length: parts }, () => 0)
  const base = Math.floor(safeTotal / parts)
  const remainder = safeTotal - base * parts
  return Array.from({ length: parts }, (_, index) => (
    index === parts - 1 ? base + remainder : base
  ))
}

export function stagePaymentBalance(agreed: number, tokenAmount: number | null | undefined): number {
  const hasToken = tokenAmount != null && tokenAmount > 0
  return hasToken ? Math.max(0, agreed - tokenAmount) : agreed
}
