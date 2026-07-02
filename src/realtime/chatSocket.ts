import { io, type Socket } from 'socket.io-client'
import { ADMIN_API_BASE_URL } from '@/api/admin'
import { mapSupportTicket, type SupportTicket } from '@/api/adminSupport'

type RawEntity = Record<string, unknown>
type Ack<T> = ({ ok: true } & T) | { ok: false; error?: string }

type ServerToClientEvents = {
  'support:ticket_updated': (payload: { ticket: RawEntity }) => void
}

type ClientToServerEvents = {
  'support:join': (
    payload: { ticketId: string },
    ack?: (payload: Ack<{ ticket: RawEntity }>) => void,
  ) => void
  'support:send': (
    payload: { ticketId: string; message: string },
    ack?: (payload: Ack<{ ticket: RawEntity }>) => void,
  ) => void
}

export type AdminChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export type SupportTicketAck = Ack<{ ticket: SupportTicket }>

function chatServerUrl() {
  return ADMIN_API_BASE_URL
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/api\/?$/, '')
}

export function mapSupportTicketPayload(ticket: RawEntity): SupportTicket {
  return mapSupportTicket(ticket)
}

export function createAdminChatSocket(accessToken: string): AdminChatSocket {
  return io(`${chatServerUrl()}/chat`, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 800,
  })
}

export function normalizeSupportTicketAck(payload: Ack<{ ticket: RawEntity }>): SupportTicketAck {
  if (!payload.ok) return payload
  return { ok: true, ticket: mapSupportTicketPayload(payload.ticket) }
}
