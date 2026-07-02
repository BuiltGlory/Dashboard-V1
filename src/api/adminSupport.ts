import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type ApiMeta = {
  requestId?: string
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  [key: string]: unknown
}

export type AdminListResult<T> = {
  data: T[]
  meta?: ApiMeta
}

type RawEntity = Record<string, unknown>

export type TicketCategory =
  | 'property_inquiry'
  | 'payment'
  | 'technical'
  | 'kyc'
  | 'general'
  | 'complaint'

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TicketResponse {
  id: string
  author: string
  message: string
  at: string
  responderType: 'admin' | 'customer' | string
  responderId: string | null
}

export interface SupportTicket {
  id: string
  referenceId: string
  userId: string
  userName: string
  phone: string
  category: TicketCategory
  subject: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  slaDeadline: string | null
  assignedTo: string | null
  assignedToName: string
  escalationTarget: string | null
  escalationReason: string | null
  responses: TicketResponse[]
}

export type FeedbackStatus = 'new' | 'reviewed' | 'archived'

export interface AppFeedback {
  id: string
  referenceId: string
  userId: string
  userName: string
  phone: string
  message: string
  source: string
  sourceScreen: string
  status: FeedbackStatus
  createdAt: string
  updatedAt: string
}

export interface AdminAuditEntry {
  id: string
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'EXPORT'
  description: string
  admin: string
  section: string
  recordId: string | null
  details: string
  before?: string
  after?: string
  ip: string
  device: string
  at: string
}

export const CURRENT_ADMIN = 'Current Admin'

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  property_inquiry: 'Property Inquiry',
  payment: 'Payment',
  technical: 'Technical',
  kyc: 'KYC',
  general: 'General',
  complaint: 'Complaint',
}

export const REPLY_TEMPLATES = [
  'Thank you for contacting BuiltGlory. We have received your request and will respond shortly.',
  'We are looking into your issue and will update you within 24 hours.',
  'Could you please share more details or a screenshot so we can assist you better?',
  'Your request has been forwarded to the relevant team. We appreciate your patience.',
  'We tried reaching you by phone. Please let us know a convenient time to call back.',
] as const

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

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function nullableIsoOf(value: unknown) {
  return value ? isoOf(value) : null
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' ? (value as RawEntity) : {}
}

function withQuery(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

function entityName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const entity = value as RawEntity
  return stringOf(entity.name || entity.email || entity.referenceId) || null
}

function mapCategory(value: unknown): TicketCategory {
  const normalized = stringOf(value, 'general').toLowerCase()
  if (
    normalized === 'property_inquiry' ||
    normalized === 'payment' ||
    normalized === 'technical' ||
    normalized === 'kyc' ||
    normalized === 'complaint'
  ) {
    return normalized
  }
  return 'general'
}

function mapStatus(value: unknown): TicketStatus {
  const normalized = stringOf(value, 'open').toLowerCase()
  if (normalized === 'in_progress' || normalized === 'resolved' || normalized === 'closed') return normalized
  return 'open'
}

function mapPriority(value: unknown): TicketPriority {
  const normalized = stringOf(value, 'medium').toLowerCase()
  if (normalized === 'low' || normalized === 'high' || normalized === 'urgent') return normalized
  return 'medium'
}

function mapFeedbackStatus(value: unknown): FeedbackStatus {
  const normalized = stringOf(value, 'new').toLowerCase()
  if (normalized === 'reviewed' || normalized === 'archived') return normalized
  return 'new'
}

function stringifyDiff(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function actionTypeFor(action: string): AdminAuditEntry['actionType'] {
  const lower = action.toLowerCase()
  if (lower.includes('delete') || lower.includes('removed')) return 'DELETE'
  if (lower.includes('login')) return 'LOGIN'
  if (lower.includes('export')) return 'EXPORT'
  if (lower.includes('create') || lower.includes('created')) return 'CREATE'
  return 'UPDATE'
}

function humanize(value: string) {
  return value
    .replace(/[_:.-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

export function mapSupportTicket(raw: RawEntity): SupportTicket {
  const user = objectOf(raw.userId)
  const escalation = objectOf(raw.escalation)
  const createdAt = isoOf(raw.createdAt)
  const updatedAt = isoOf(raw.updatedAt ?? raw.createdAt, createdAt)
  const responses = Array.isArray(raw.responses)
    ? raw.responses.map((item, index) => {
        const response = objectOf(item)
        const responderType = stringOf(response.responderType, 'admin')
        return {
          id: idOf(response) || `${idOf(raw)}-response-${index}`,
          author: entityName(response.responderId) ?? (responderType === 'customer' ? entityName(user) ?? 'Customer' : 'Admin'),
          message: stringOf(response.message),
          at: isoOf(response.createdAt ?? response.at, createdAt),
          responderType,
          responderId: response.responderId ? idOf(response.responderId) : null,
        }
      })
    : []

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    userId: idOf(raw.userId),
    userName: entityName(user) ?? stringOf(raw.userName, 'Unknown customer'),
    phone: stringOf(user.phone ?? user.mobileNumber ?? user.phoneNormalized ?? raw.phone),
    category: mapCategory(raw.category),
    subject: stringOf(raw.subject, 'Support ticket'),
    description: stringOf(raw.message ?? raw.description),
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    createdAt,
    updatedAt,
    resolvedAt: mapStatus(raw.status) === 'resolved' || mapStatus(raw.status) === 'closed' ? updatedAt : nullableIsoOf(raw.resolvedAt),
    slaDeadline: nullableIsoOf(raw.slaDeadline),
    assignedTo: raw.assignedTo ? idOf(raw.assignedTo) : null,
    assignedToName: entityName(raw.assignedTo) ?? (idOf(raw.assignedTo) || 'Unassigned'),
    escalationTarget: escalation.targetAssignee ? idOf(escalation.targetAssignee) : null,
    escalationReason: stringOf(escalation.reason) || null,
    responses,
  }
}

export function mapAppFeedback(raw: RawEntity): AppFeedback {
  const user = objectOf(raw.userId)
  const createdAt = isoOf(raw.createdAt)
  const updatedAt = isoOf(raw.updatedAt ?? raw.createdAt, createdAt)

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    userId: idOf(raw.userId),
    userName: entityName(user) ?? stringOf(raw.userName, 'Unknown customer'),
    phone: stringOf(user.phone ?? user.mobileNumber ?? user.phoneNormalized ?? raw.phone),
    message: stringOf(raw.message),
    source: stringOf(raw.source, 'customer_app'),
    sourceScreen: stringOf(raw.sourceScreen, 'help'),
    status: mapFeedbackStatus(raw.status),
    createdAt,
    updatedAt,
  }
}

function mapAuditEntry(raw: RawEntity): AdminAuditEntry {
  const action = stringOf(raw.action, 'updated')
  const resourceType = stringOf(raw.resourceType, 'Admin')
  const actorType = stringOf(raw.actorType, 'system')
  return {
    id: idOf(raw),
    actionType: actionTypeFor(action),
    description: humanize(action),
    admin: entityName(raw.actorId) ?? humanize(actorType),
    section: humanize(resourceType),
    recordId: raw.resourceId ? idOf(raw.resourceId) : null,
    details: `Resource: ${resourceType}`,
    before: stringifyDiff(raw.before),
    after: stringifyDiff(raw.after),
    ip: stringOf(raw.ipAddress, '-'),
    device: stringOf(raw.userAgent, '-'),
    at: isoOf(raw.createdAt),
  }
}

export function isTicketOverdue(ticket: SupportTicket) {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false
  if (ticket.responses.length > 0) return false
  const deadline = ticket.slaDeadline ? new Date(ticket.slaDeadline).getTime() : new Date(ticket.createdAt).getTime() + 24 * 60 * 60 * 1000
  return Date.now() >= deadline
}

export function isUrgentOverdue(ticket: SupportTicket) {
  return ticket.priority === 'urgent' && isTicketOverdue(ticket)
}

export async function listAdminSupportTickets(
  accessToken: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<AdminListResult<SupportTicket>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/support/tickets', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapSupportTicket), meta: result.meta }
}

export async function getAdminSupportTicket(accessToken: string, ticketId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/support/tickets/${ticketId}`, { accessToken })
  return mapSupportTicket(data)
}

export async function addAdminSupportTicketResponse(
  accessToken: string,
  ticketId: string,
  body: { message: string; resolve?: boolean },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/support/tickets/${ticketId}/responses`, {
    accessToken,
    method: 'POST',
    body,
  })
  return mapSupportTicket(data)
}

export async function updateAdminSupportTicket(
  accessToken: string,
  ticketId: string,
  body: {
    status?: TicketStatus
    priority?: TicketPriority
    assignedTo?: string | null
    resolutionResponse?: string
    message?: string
    escalation?: { targetAssignee: string; reason: string }
  },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/support/tickets/${ticketId}`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSupportTicket(data)
}

export async function listAdminFeedback(
  accessToken: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<AdminListResult<AppFeedback>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/feedback', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapAppFeedback), meta: result.meta }
}

export async function updateAdminFeedbackStatus(
  accessToken: string,
  feedbackId: string,
  status: FeedbackStatus,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/feedback/${feedbackId}`, {
    accessToken,
    method: 'PATCH',
    body: { status },
  })
  return mapAppFeedback(data)
}

export async function listAdminAuditLogs(
  accessToken: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<AdminListResult<AdminAuditEntry>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/audit-logs', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapAuditEntry), meta: result.meta }
}
