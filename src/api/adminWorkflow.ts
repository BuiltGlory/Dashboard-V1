import { adminFormRequest, adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

export type WorkflowEntityType =
  | 'user'
  | 'enquiry'
  | 'visit'
  | 'deal'
  | 'acquisition'
  | 'interior'
  | 'callback'
  | 'ticket'
  | 'property'
  | 'sell-request'
  | 'sales-deal'

export type BackendWorkflowEntityType =
  | 'user'
  | 'buy_enquiry'
  | 'visit'
  | 'sales_deal'
  | 'acquisition'
  | 'interior_lead'
  | 'callback'
  | 'support_ticket'
  | 'property'
  | 'sell_request'

export type WorkflowChannel = 'call' | 'note' | 'message' | 'push' | 'email' | 'whatsapp' | 'proof_upload'

export interface WorkflowLog {
  id: string
  referenceId: string
  entityType: BackendWorkflowEntityType
  entityId: string
  channel: WorkflowChannel
  direction: 'inbound' | 'outbound' | 'internal'
  summary: string
  body: string
  outcome: string
  durationMinutes: number | null
  occurredAt: string
  createdAt: string
  actorName: string
  attachments: Array<{
    fileName: string
    url: string
    mimeType: string
    sizeBytes: number
  }>
}

export interface EditLockState {
  id: string
  entityType: BackendWorkflowEntityType
  entityId: string
  adminId: string
  adminName: string
  lockedAt: string
  expiresAt: string
  isMine: boolean
}

export interface CreateWorkflowLogBody {
  channel: WorkflowChannel
  direction?: 'inbound' | 'outbound' | 'internal'
  summary: string
  body?: string | null
  outcome?: string | null
  durationMinutes?: number
  followUpAt?: string | null
  occurredAt?: string
  attachments?: WorkflowLog['attachments']
}

export function toBackendEntityType(type: string): BackendWorkflowEntityType {
  const normalized = type.replace(/_/g, '-')
  if (normalized === 'enquiry') return 'buy_enquiry'
  if (normalized === 'deal' || normalized === 'sales-deal') return 'sales_deal'
  if (normalized === 'interior') return 'interior_lead'
  if (normalized === 'ticket') return 'support_ticket'
  if (normalized === 'sell-request') return 'sell_request'
  return normalized as BackendWorkflowEntityType
}

function withWorkflowPath(type: string, id: string, suffix: string) {
  return `/admin/workflow/${toBackendEntityType(type)}/${id}/${suffix}`
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberOf(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function idOf(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '')
  const entity = value as RawEntity
  return String(entity.id ?? entity._id ?? '')
}

function mapWorkflowLog(raw: RawEntity): WorkflowLog {
  const actor = raw.actorId && typeof raw.actorId === 'object' ? (raw.actorId as RawEntity) : {}
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    entityType: stringOf(raw.entityType) as BackendWorkflowEntityType,
    entityId: idOf(raw.entityId),
    channel: stringOf(raw.channel, 'note') as WorkflowChannel,
    direction: stringOf(raw.direction, 'internal') as WorkflowLog['direction'],
    summary: stringOf(raw.summary),
    body: stringOf(raw.body),
    outcome: stringOf(raw.outcome),
    durationMinutes: numberOf(raw.durationMinutes),
    occurredAt: stringOf(raw.occurredAt ?? raw.createdAt, new Date().toISOString()),
    createdAt: stringOf(raw.createdAt, new Date().toISOString()),
    actorName: stringOf(actor.name ?? actor.email, 'Admin'),
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments.map((item) => {
          const attachment = item && typeof item === 'object' ? (item as RawEntity) : {}
          return {
            fileName: stringOf(attachment.fileName, 'Attachment'),
            url: stringOf(attachment.url),
            mimeType: stringOf(attachment.mimeType),
            sizeBytes: Number(attachment.sizeBytes) || 0,
          }
        })
      : [],
  }
}

export async function listWorkflowLogs(accessToken: string, type: string, id: string, channel?: WorkflowChannel) {
  const query = channel ? `?channel=${encodeURIComponent(channel)}` : ''
  const result = await adminApiRequestEnvelope<RawEntity[]>(`${withWorkflowPath(type, id, 'logs')}${query}`, {
    accessToken,
  })
  return {
    data: (result.data ?? []).map(mapWorkflowLog),
    meta: result.meta,
  }
}

export async function createWorkflowLog(accessToken: string, type: string, id: string, body: CreateWorkflowLogBody) {
  return mapWorkflowLog(
    await adminApiRequest<RawEntity>(withWorkflowPath(type, id, 'logs'), {
      method: 'POST',
      accessToken,
      body: body as unknown as Record<string, unknown>,
    }),
  )
}

export async function deleteWorkflowLog(accessToken: string, logId: string) {
  return adminApiRequest<RawEntity>(`/admin/workflow/logs/${logId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export async function sendWorkflowPush(
  accessToken: string,
  type: string,
  id: string,
  body: {
    userId?: string | null
    recipient?: string | null
    notificationId: string
    template: { title: string; body: string; deepLink?: string }
    dedupeKey?: string
    skipDuplicateCheck?: boolean
  },
) {
  return mapWorkflowLog(
    await adminApiRequest<RawEntity>(withWorkflowPath(type, id, 'push'), {
      method: 'POST',
      accessToken,
      body,
    }),
  )
}

export async function uploadWorkflowProof(
  accessToken: string,
  type: string,
  id: string,
  file: File,
  body: { summary?: string; notes?: string } = {},
) {
  const formData = new FormData()
  formData.append('file', file)
  if (body.summary) formData.append('summary', body.summary)
  if (body.notes) formData.append('notes', body.notes)

  const data = await adminFormRequest<RawEntity>(withWorkflowPath(type, id, 'proofs'), {
    accessToken,
    formData,
    errorMessage: 'Proof upload failed.',
  })
  return mapWorkflowLog(data ?? {})
}

export async function getEditLock(accessToken: string, type: string, id: string) {
  return adminApiRequest<EditLockState | null>(withWorkflowPath(type, id, 'lock'), { accessToken })
}

export async function claimEditLock(accessToken: string, type: string, id: string, ttlSeconds = 30 * 60) {
  return adminApiRequest<EditLockState | null>(withWorkflowPath(type, id, 'lock'), {
    accessToken,
    method: 'POST',
    body: { ttlSeconds },
  })
}

export async function releaseEditLock(accessToken: string, type: string, id: string) {
  return adminApiRequest<{ released: boolean }>(withWorkflowPath(type, id, 'lock'), {
    accessToken,
    method: 'DELETE',
  })
}
