import { createWorkflowLog, listWorkflowLogs, type WorkflowLog } from '@/api/adminWorkflow'
import { readAdminSession } from '@/api/admin'
import {
  listAdminCommunicationLogs,
  type CommunicationLog,
} from '@/api/adminCommunicationLogs'

export interface SentMessage {
  id: string
  sentAt: string
  channel: 'whatsapp' | 'email' | 'sms' | 'push'
  to: string
  toName: string
  subject?: string
  message: string
  sentBy: string
  relatedTo: {
    type:
      | 'user'
      | 'enquiry'
      | 'visit'
      | 'deal'
      | 'acquisition'
      | 'interior'
      | 'callback'
      | 'ticket'
    id: string
    title: string
  }
}

export const DEFAULT_SENT_BY = 'Current Admin'

const MAX_PER_RECORD = 50

const workflowLogToMessage = (log: WorkflowLog | CommunicationLog): SentMessage => {
  const related = log.entityType === 'buy_enquiry'
    ? 'enquiry'
    : log.entityType === 'sales_deal'
      ? 'deal'
      : log.entityType === 'interior_lead'
        ? 'interior'
        : log.entityType === 'support_ticket'
          ? 'ticket'
          : log.entityType === 'sell_request'
            ? 'acquisition'
            : log.entityType
  return {
    id: log.id,
    sentAt: log.occurredAt,
    channel: log.channel === 'email' || log.channel === 'whatsapp' || log.channel === 'push' ? log.channel : 'sms',
    to: log.outcome || '',
    toName: log.summary.replace(/^(Email|WhatsApp|SMS|Push) sent to\s*/i, '') || 'Recipient',
    subject: undefined,
    message: log.body || log.summary,
    sentBy: log.actorName,
    relatedTo: {
      type: related as SentMessage['relatedTo']['type'],
      id: log.entityId,
      title: log.summary,
    },
  }
}

export const logMessage = (
  msg: Omit<SentMessage, 'id' | 'sentAt'>,
): SentMessage => {
  const message: SentMessage = {
    ...msg,
    id: 'MSG-' + Date.now(),
    sentAt: new Date().toISOString(),
  }

  const session = readAdminSession()
  if (session?.accessToken) {
    void createWorkflowLog(session.accessToken, msg.relatedTo.type, msg.relatedTo.id, {
      channel: msg.channel === 'sms' ? 'message' : msg.channel,
      direction: 'outbound',
      summary: `${formatChannel(msg.channel)} sent to ${msg.toName}`,
      body: msg.message,
      outcome: msg.to,
      occurredAt: message.sentAt,
    }).catch(() => undefined)
  }

  return message
}

export const getMessages = (type: string, id: string): SentMessage[] => {
  void type
  void id
  return []
}

export const loadMessages = async (type: string, id: string): Promise<SentMessage[]> => {
  const session = readAdminSession()
  if (!session?.accessToken) return []
  try {
    const result = await listWorkflowLogs(session.accessToken, type, id)
    return result.data
      .filter((log) => ['message', 'email', 'whatsapp', 'push'].includes(log.channel))
      .slice(0, MAX_PER_RECORD)
      .map(workflowLogToMessage)
  } catch {
    return []
  }
}

export const getAllMessages = (): SentMessage[] => []

export const loadAllMessages = async (): Promise<SentMessage[]> => {
  const session = readAdminSession()
  if (!session?.accessToken) return []
  try {
    const result = await listAdminCommunicationLogs(session.accessToken, {
      channel: ['message', 'email', 'whatsapp', 'push'],
      direction: 'outbound',
      limit: MAX_PER_RECORD,
    })
    return result.data.map(workflowLogToMessage)
  } catch {
    return []
  }
}

export const formatChannel = (channel: string): string => {
  return channel === 'whatsapp'
    ? '💬 WhatsApp'
    : channel === 'email'
      ? '📧 Email'
      : channel === 'push'
        ? '🔔 Push'
        : '📱 SMS'
}

export function formatMessageTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

export function messageToActivityText(msg: SentMessage): string {
  const preview =
    msg.message.length > 50 ? `${msg.message.slice(0, 50)}...` : msg.message
  if (msg.channel === 'whatsapp') {
    return `💬 WhatsApp sent to ${msg.toName}: '${preview}'`
  }
  if (msg.channel === 'email') {
    return `📧 Email sent to ${msg.to}`
  }
  if (msg.channel === 'push') {
    return `🔔 Push sent to ${msg.toName}: '${preview}'`
  }
  return `📱 SMS sent to ${msg.toName}`
}

export function phoneForWhatsAppLink(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function openWhatsApp(phone: string, message: string): void {
  const tel = phoneForWhatsAppLink(phone)
  const url = message
    ? `https://wa.me/${tel}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${tel}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openEmail(to: string, subject?: string, body?: string): void {
  const params = new URLSearchParams()
  if (subject) params.set('subject', subject)
  if (body) params.set('body', body)
  const qs = params.toString()
  window.open(`mailto:${to}${qs ? `?${qs}` : ''}`, '_self')
}
