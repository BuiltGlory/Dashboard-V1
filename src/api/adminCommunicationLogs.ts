import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

export type CommunicationEntityType =
  | 'buy_enquiry'
  | 'sell_request'
  | 'acquisition'
  | 'sales_deal'
  | 'visit'
  | 'callback'
  | 'interior_lead'
  | 'support_ticket'
  | 'user'
  | 'property'

export type CommunicationChannel =
  | 'call'
  | 'note'
  | 'message'
  | 'push'
  | 'email'
  | 'whatsapp'
  | 'proof_upload'

export type CommunicationLog = {
  id: string
  referenceId?: string
  entityType: CommunicationEntityType
  entityId: string
  channel: CommunicationChannel
  direction: 'inbound' | 'outbound' | 'internal'
  summary: string
  body?: string
  outcome?: string
  durationMinutes?: number
  followUpAt?: string
  attachments: Array<{
    fileName?: string
    url: string
    mimeType?: string
    sizeBytes?: number
    storageKey?: string
  }>
  actorName: string
  occurredAt: string
  createdAt?: string
}

export type CommunicationTimelineResult = {
  data: CommunicationLog[]
  meta?: {
    requestId?: string
    page?: number
    limit?: number
    total?: number
    totalPages?: number
    [key: string]: unknown
  }
}

export type CreateCommunicationLogInput = {
  entityType: CommunicationEntityType
  entityId: string
  channel: CommunicationChannel
  direction?: 'inbound' | 'outbound' | 'internal'
  summary: string
  body?: string | null
  outcome?: string | null
  durationMinutes?: number
  followUpAt?: string | null
  occurredAt?: string
  attachments?: CommunicationLog['attachments']
}

function idOf(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const entity = value as RawEntity
    return String(entity.id ?? entity._id ?? '')
  }
  return String(value)
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberOf(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function mapCommunicationLog(raw: RawEntity): CommunicationLog {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId) || undefined,
    entityType: stringOf(raw.entityType) as CommunicationEntityType,
    entityId: idOf(raw.entityId),
    channel: stringOf(raw.channel) as CommunicationChannel,
    direction: stringOf(raw.direction, 'internal') as CommunicationLog['direction'],
    summary: stringOf(raw.summary),
    body: stringOf(raw.body) || undefined,
    outcome: stringOf(raw.outcome) || undefined,
    durationMinutes: numberOf(raw.durationMinutes),
    followUpAt: raw.followUpAt ? isoOf(raw.followUpAt) : undefined,
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments.map((item) => {
          const attachment = item as RawEntity
          return {
            fileName: stringOf(attachment.fileName) || undefined,
            url: stringOf(attachment.url),
            mimeType: stringOf(attachment.mimeType) || undefined,
            sizeBytes: numberOf(attachment.sizeBytes),
            storageKey: stringOf(attachment.storageKey) || undefined,
          }
        })
      : [],
    actorName: stringOf(
      raw.actorName ??
        (raw.actorId && typeof raw.actorId === 'object'
          ? (raw.actorId as RawEntity).name ?? (raw.actorId as RawEntity).email
          : undefined),
      'Admin',
    ),
    occurredAt: isoOf(raw.occurredAt ?? raw.createdAt),
    createdAt: raw.createdAt ? isoOf(raw.createdAt) : undefined,
  }
}

export async function listAdminCommunicationLogs(
  accessToken: string,
  options: {
    channel?: CommunicationChannel | CommunicationChannel[]
    direction?: CommunicationLog['direction']
    entityType?: CommunicationEntityType
    entityId?: string
    search?: string
    page?: number
    limit?: number
  } = {},
) {
  const params = new URLSearchParams()
  const channels = Array.isArray(options.channel) ? options.channel : options.channel ? [options.channel] : []
  channels.forEach((channel) => params.append('channel', channel))
  if (options.direction) params.set('direction', options.direction)
  if (options.entityType) params.set('entityType', options.entityType)
  if (options.entityId) params.set('entityId', options.entityId)
  if (options.search) params.set('search', options.search)
  if (options.page) params.set('page', String(options.page))
  if (options.limit) params.set('limit', String(options.limit))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const envelope = await adminApiRequestEnvelope<RawEntity[]>(`/admin/communication-logs${suffix}`, {
    accessToken,
  })
  return {
    data: (envelope.data ?? []).map(mapCommunicationLog),
    meta: envelope.meta,
  } satisfies CommunicationTimelineResult
}

export async function listAdminCommunicationTimeline(
  accessToken: string,
  entityType: CommunicationEntityType,
  entityId: string,
  options: { channel?: CommunicationChannel; page?: number; limit?: number } = {},
) {
  const params = new URLSearchParams()
  if (options.channel) params.set('channel', options.channel)
  if (options.page) params.set('page', String(options.page))
  if (options.limit) params.set('limit', String(options.limit))
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const envelope = await adminApiRequestEnvelope<RawEntity[]>(
    `/admin/${entityType}/${entityId}/timeline${suffix}`,
    { accessToken },
  )
  return {
    data: (envelope.data ?? []).map(mapCommunicationLog),
    meta: envelope.meta,
  } satisfies CommunicationTimelineResult
}

export async function createAdminCommunicationLog(
  accessToken: string,
  body: CreateCommunicationLogInput,
) {
  const data = await adminApiRequest<RawEntity>('/admin/communication-logs', {
    accessToken,
    method: 'POST',
    body: body as Record<string, unknown>,
  })
  return mapCommunicationLog(data ?? {})
}
