import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

export type PushAudience = 'buyer' | 'seller'

export type PushNotificationType =
  | 'N-01'
  | 'N-02'
  | 'N-03'
  | 'N-04'
  | 'N-05'
  | 'N-06'
  | 'N-07'
  | 'N-08'
  | 'ENQUIRY_SUBMITTED'
  | 'EXECUTIVE_CALL'
  | 'VISIT_SCHEDULED'
  | 'OFFER_SENT'
  | 'DEAL_CONFIRMED'
  | 'DOCUMENTS_SHARED'
  | 'REUPLOAD_REQUIRED'
  | 'PAYMENT_UPDATE'
  | 'REGISTRATION'
  | 'DEAL_COMPLETED'
  | 'LISTING_SUBMITTED'
  | 'LISTING_REJECTED'
  | 'MANUAL'

export interface AdminPushNotification {
  id: string
  userId: string | null
  title: string
  message: string
  notificationType: string
  channel: string
  status: string
  listingId: string
  enquiryId: string
  dealId: string
  propertyId: string
  screen: string
  sentAt: string | null
  deliveredAt: string | null
  createdAt: string
  failureReason: string | null
}

export interface SendAdminPushInput {
  userId: string
  audience?: PushAudience
  notificationType?: PushNotificationType | string
  title: string
  message: string
  screen?: string
  screenKey?: string
  listingId?: string
  enquiryId?: string
  dealId?: string
  propertyId?: string
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

function mapPushNotification(raw: RawEntity): AdminPushNotification {
  const payload = (raw.payload && typeof raw.payload === 'object' ? raw.payload : {}) as RawEntity
  return {
    id: idOf(raw),
    userId: stringOf(raw.userId) || null,
    title: stringOf(raw.title ?? payload.title, 'Notification'),
    message: stringOf(raw.message ?? payload.message ?? payload.body),
    notificationType: stringOf(raw.notificationType ?? payload.notificationType ?? payload.type),
    channel: stringOf(raw.channel, 'push'),
    status: stringOf(raw.status, 'queued'),
    listingId: stringOf(raw.listingId ?? payload.listingId),
    enquiryId: stringOf(raw.enquiryId ?? payload.enquiryId),
    dealId: stringOf(raw.dealId ?? payload.dealId),
    propertyId: stringOf(raw.propertyId ?? payload.propertyId),
    screen: stringOf(raw.screen ?? payload.screen),
    sentAt: stringOf(raw.sentAt) || null,
    deliveredAt: stringOf(raw.deliveredAt) || null,
    createdAt: stringOf(raw.createdAt, new Date().toISOString()),
    failureReason: stringOf(raw.failureReason) || null,
  }
}

export async function listAdminPushNotifications(
  accessToken: string,
  params: { limit?: number; status?: string; channel?: string } = {},
) {
  const query = new URLSearchParams()
  query.set('limit', String(params.limit ?? 50))
  query.set('sort', 'newest')
  query.set('channel', params.channel ?? 'push')
  if (params.status) query.set('status', params.status)

  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/notifications?${query.toString()}`, {
    accessToken,
  })

  return {
    data: (result.data ?? []).map(mapPushNotification),
    meta: result.meta,
  }
}

export async function sendAdminPushNotification(accessToken: string, body: SendAdminPushInput) {
  const data = await adminApiRequest<RawEntity>('/admin/notifications/push', {
    accessToken,
    method: 'POST',
    body: body as unknown as Record<string, unknown>,
  })
  return data
}

export async function retryAdminPushNotification(accessToken: string, notificationId: string) {
  return adminApiRequest<RawEntity>(`/admin/notifications/${notificationId}/retry`, {
    accessToken,
    method: 'POST',
  })
}
