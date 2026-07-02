import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

export interface AdminNotification {
  id: string
  type: string
  title: string
  message: string
  time: string
  read: boolean
  route: string
  icon: string
}

function idOf(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '')
  const entity = value as RawEntity
  return String(entity.id ?? entity._id ?? '')
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawEntity) : {}
}

function relativeTime(value: unknown) {
  const date = value ? new Date(String(value)) : new Date()
  if (Number.isNaN(date.getTime())) return 'Just now'
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000))
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

const EVENT_META: Record<string, { title: string; icon: string; route: string }> = {
  enquiry_created: { title: 'New enquiry received', icon: '💬', route: '/admin/enquiries/buy' },
  sell_request_submitted: { title: 'New sell request', icon: '🏠', route: '/admin/enquiries/sell' },
  visit_scheduled: { title: 'Visit scheduled', icon: '📅', route: '/admin/enquiries/visits' },
  callback_overdue: { title: 'Callback overdue', icon: '🚨', route: '/admin/enquiries/callbacks' },
  support_ticket_created: { title: 'Support ticket created', icon: '🎫', route: '/admin/settings/support' },
  token_payment_created: { title: 'Payment update', icon: '💳', route: '/admin/sales/token' },
  bulk_message: { title: 'Bulk message queued', icon: '📣', route: '/admin/tools/bulkmessage' },
}

function titleFromEvent(event: string) {
  return event
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function mapNotification(raw: RawEntity): AdminNotification {
  const event = stringOf(raw.event, 'notification')
  const payload = objectOf(raw.payload)
  const meta = EVENT_META[event] ?? {
    title: titleFromEvent(event),
    icon: '🔔',
    route: '/admin/settings/audit',
  }
  const referenceId = stringOf(payload.referenceId)
  const status = stringOf(payload.status ?? raw.status)
  const messageParts = [referenceId, status].filter(Boolean)

  return {
    id: idOf(raw),
    type: event,
    title: stringOf(payload.title, meta.title),
    message: stringOf(
      payload.message,
      messageParts.length > 0
        ? messageParts.join(' • ')
        : `${meta.title} via ${stringOf(raw.channel, 'in-app')}`,
    ),
    time: relativeTime(raw.createdAt ?? raw.updatedAt),
    read: Boolean(raw.isRead ?? raw.readAt),
    route: stringOf(payload.route, meta.route),
    icon: stringOf(payload.icon, meta.icon),
  }
}

export async function listAdminNotifications(accessToken: string) {
  const result = await adminApiRequestEnvelope<RawEntity[]>('/admin/notifications?limit=20&sort=newest', {
    accessToken,
  })
  return {
    data: (result.data ?? []).map(mapNotification),
    meta: result.meta,
  }
}

export async function markAdminNotificationRead(accessToken: string, id: string) {
  return adminApiRequest<RawEntity>(`/admin/notifications/${id}`, {
    accessToken,
    method: 'PATCH',
    body: { isRead: true },
  })
}
