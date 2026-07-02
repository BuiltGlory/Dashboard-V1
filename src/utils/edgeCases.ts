import { claimEditLock, getEditLock, releaseEditLock } from '@/api/adminWorkflow'
import { readAdminSession } from '@/api/admin'

/** Shared edge-case helpers for admin dashboard (no mock data changes). */

export const SLA_BANNER_STORAGE_KEY = 'sla-banner-dismissed'
export const SLA_BANNER_DISMISS_MS = 30 * 60 * 1000

export const EDIT_LOCK_MS = 30 * 60 * 1000
export const CURRENT_ADMIN_NAME = 'Current Admin'

export function isValidPhone(phone: string | null | undefined): boolean {
  return !!phone && phone.replace(/\D/g, '').length >= 10
}

export function isSlaBannerDismissed(): boolean {
  try {
    const dismissed = localStorage.getItem(SLA_BANNER_STORAGE_KEY)
    if (!dismissed) return false
    return Date.now() - Number(dismissed) < SLA_BANNER_DISMISS_MS
  } catch {
    return false
  }
}

export function dismissSlaBanner(): void {
  try {
    localStorage.setItem(SLA_BANNER_STORAGE_KEY, Date.now().toString())
  } catch {
    /* ignore */
  }
}

export function editingLockKey(type: string, id: string) {
  return `editing-${type}-${id}`
}

function currentAdminName() {
  const session = readAdminSession()
  return session?.admin?.name || session?.admin?.email || CURRENT_ADMIN_NAME
}

export function setEditingLock(type: string, id: string, admin = CURRENT_ADMIN_NAME) {
  try {
    localStorage.setItem(
      editingLockKey(type, id),
      JSON.stringify({ admin, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function clearEditingLock(type: string, id: string) {
  try {
    localStorage.removeItem(editingLockKey(type, id))
  } catch {
    /* ignore */
  }
}

export function getOtherEditor(
  type: string,
  id: string,
  currentAdmin = currentAdminName(),
): { admin: string; at: number } | null {
  try {
    const raw = localStorage.getItem(editingLockKey(type, id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { admin: string; at: number }
    if (!parsed.admin || parsed.admin === currentAdmin) return null
    if (Date.now() - parsed.at >= EDIT_LOCK_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function truncateText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Returns warning text if another admin edited recently (< 30 min). */
export function getConcurrentEditingWarning(
  entityType: string,
  id: string,
): string | null {
  const session = readAdminSession()
  if (session?.accessToken) {
    void getEditLock(session.accessToken, entityType, id)
      .then((lock) => {
        if (!lock || lock.isMine) return
        setEditingLock(entityType, id, lock.adminName)
      })
      .catch(() => undefined)
  }
  const other = getOtherEditor(entityType, id)
  if (!other) return null
  const minsAgo = (Date.now() - other.at) / 60000
  return `${other.admin} opened this ${minsAgo.toFixed(0)}min ago`
}

export function claimConcurrentEditing(entityType: string, id: string) {
  setEditingLock(entityType, id, currentAdminName())
  const session = readAdminSession()
  if (session?.accessToken) {
    void claimEditLock(session.accessToken, entityType, id).catch(() => undefined)
  }
}

export function releaseConcurrentEditing(entityType: string, id: string) {
  clearEditingLock(entityType, id)
  const session = readAdminSession()
  if (session?.accessToken) {
    void releaseEditLock(session.accessToken, entityType, id).catch(() => undefined)
  }
}

export const TEMPLATE_KNOWN_VARS = [
  'buyerName',
  'sellerName',
  'propertyTitle',
  'price',
  'date',
  'time',
  'amount',
  'referenceId',
  'name',
  'phone',
  'city',
  'otp',
  'agentName',
  'meetingLink',
] as const

export function findUnknownTemplateVars(body: string): string[] {
  const matches = body.match(/\{(\w+)\}/g) ?? []
  const known = new Set<string>(TEMPLATE_KNOWN_VARS)
  return [...new Set(matches.map((m) => m.slice(1, -1)).filter((v) => !known.has(v)))]
}

export function chartHasNumericData(
  data: Record<string, unknown>[],
  keys?: string[],
): boolean {
  return data.some((row) =>
    Object.entries(row).some(([k, v]) => {
      if (keys && !keys.includes(k)) return false
      return typeof v === 'number' && v > 0
    }),
  )
}
