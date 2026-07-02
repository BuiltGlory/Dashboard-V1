import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

function idOf(raw: RawEntity) {
  return String(raw.id ?? raw._id ?? raw.referenceId ?? '')
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function isoDate(value: unknown) {
  const date = value ? new Date(String(value)) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

export type AdminMessageTemplate = {
  id: string
  referenceId: string
  name: string
  channel: 'whatsapp' | 'email' | 'sms'
  category: string
  subject?: string
  body: string
}

export type AdminBulkMessage = {
  id: string
  referenceId: string
  message: string
  channel: string
  recipients: number
  sentBy: string
  date: string
  status: string
}

export type SaveMessageTemplateInput = {
  name: string
  channel: AdminMessageTemplate['channel']
  category: string
  subject?: string
  body: string
}

export type SendBulkMessageInput = {
  audience: string
  channel: 'whatsapp' | 'email' | 'sms' | 'all'
  title?: string
  message: string
  recipients?: string[]
  templateId?: string
  scheduledAt?: string
}

function mapTemplate(raw: RawEntity): AdminMessageTemplate {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    name: stringOf(raw.name),
    channel: stringOf(raw.channel, 'whatsapp') as AdminMessageTemplate['channel'],
    category: stringOf(raw.category, 'General'),
    subject: raw.subject ? stringOf(raw.subject) : undefined,
    body: stringOf(raw.body),
  }
}

function mapBulk(raw: RawEntity): AdminBulkMessage {
  const requestedBy = raw.requestedBy && typeof raw.requestedBy === 'object' ? raw.requestedBy as RawEntity : {}
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    message: stringOf(raw.message).slice(0, 80),
    channel: stringOf(raw.channel, 'whatsapp'),
    recipients: Array.isArray(raw.recipients) ? raw.recipients.length : Number(raw.queuedCount ?? 0),
    sentBy: stringOf(requestedBy.name, 'Admin'),
    date: isoDate(raw.sentAt ?? raw.scheduledAt ?? raw.createdAt).slice(0, 10),
    status: stringOf(raw.status, 'queued'),
  }
}

export async function listAdminMessageTemplates(accessToken: string) {
  const result = await adminApiRequestEnvelope<RawEntity[]>('/admin/message-templates', { accessToken })
  return (result.data ?? []).map(mapTemplate)
}

export async function createAdminMessageTemplate(accessToken: string, body: SaveMessageTemplateInput) {
  const data = await adminApiRequest<RawEntity>('/admin/message-templates', {
    accessToken,
    method: 'POST',
    body,
  })
  return mapTemplate(data ?? {})
}

export async function updateAdminMessageTemplate(accessToken: string, id: string, body: SaveMessageTemplateInput) {
  const data = await adminApiRequest<RawEntity>(`/admin/message-templates/${id}`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapTemplate(data ?? {})
}

export async function deleteAdminMessageTemplate(accessToken: string, id: string) {
  await adminApiRequest<RawEntity>(`/admin/message-templates/${id}`, {
    accessToken,
    method: 'DELETE',
  })
}

export async function listAdminBulkMessages(accessToken: string) {
  const result = await adminApiRequestEnvelope<RawEntity[]>('/admin/bulk-messages?limit=20', { accessToken })
  return (result.data ?? []).map(mapBulk)
}

export async function sendAdminBulkMessage(accessToken: string, body: SendBulkMessageInput) {
  const data = await adminApiRequest<RawEntity>('/admin/bulk-messages', {
    accessToken,
    method: 'POST',
    body,
  })
  return mapBulk(data ?? {})
}
