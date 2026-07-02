import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquare,
  Phone,
  Plus,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CATEGORY_LABELS,
  REPLY_TEMPLATES,
  addAdminSupportTicketResponse,
  getAdminSupportTicket,
  isTicketOverdue,
  isUrgentOverdue,
  listAdminSupportTickets,
  updateAdminSupportTicket,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from '@/api/adminSupport'
import { bindToast, copyText, handleCall, handleEmail, openWhatsApp } from '@/utils/adminActions'
import {
  getKycStatusColor,
  getKycStatusLabel,
  getRoleLabel,
  getUserTypeBadgeColor,
  listAdminUsers,
  type User,
} from '@/api/adminUsers'
import { readAdminSession } from '@/api/admin'
import { getAdminSalesTeam, type SalesPerson } from '@/api/adminEnquiries'
import { createWorkflowLog, listWorkflowLogs, type WorkflowLog } from '@/api/adminWorkflow'
import {
  createAdminChatSocket,
  normalizeSupportTicketAck,
  mapSupportTicketPayload,
  type AdminChatSocket,
} from '@/realtime/chatSocket'
import { cn } from '@/lib/utils'

type CallOutcome =
  | 'Interested'
  | 'Not Interested'
  | 'Callback Later'
  | 'No Answer'
  | 'Wrong Number'

interface CallLog {
  id: string
  duration: number
  outcome: CallOutcome
  notes: string
  followUpDate?: string
  at: string
}

interface AdminNote {
  id: string
  text: string
  at: string
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function workflowLogToCall(log: WorkflowLog): CallLog {
  return {
    id: log.id,
    duration: log.durationMinutes ?? 0,
    outcome: (log.outcome || 'Interested') as CallOutcome,
    notes: log.body,
    at: log.occurredAt,
  }
}

function workflowLogToNote(log: WorkflowLog): AdminNote {
  return {
    id: log.id,
    text: log.body || log.summary,
    at: log.occurredAt,
  }
}

function hoursBetween(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 3600000))
}

function priorityBadge(p: TicketPriority) {
  const map: Record<TicketPriority, { label: string; className: string }> = {
    urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
    high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
    medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700' },
    low: { label: 'Low', className: 'bg-muted text-muted-foreground' },
  }
  const { label, className } = map[p]
  return <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>{label}</span>
}

function statusBadgeLarge(s: TicketStatus) {
  const map: Record<TicketStatus, { variant?: 'new' | 'pending' | 'responded' | 'default'; className?: string }> = {
    open: { variant: 'new' },
    in_progress: { variant: 'pending' },
    resolved: { variant: 'responded' },
    closed: { variant: 'default' },
  }
  const label = s.replace('_', ' ')
  const cfg = map[s]
  return (
    <Badge variant={cfg.variant} className={cn('px-3 py-1 text-sm capitalize', cfg.className)}>
      {label}
    </Badge>
  )
}

function outcomeBadgeClass(outcome: CallOutcome) {
  const map: Record<CallOutcome, string> = {
    Interested: 'bg-green-100 text-green-700',
    'Not Interested': 'bg-red-100 text-red-700',
    'Callback Later': 'bg-orange-100 text-orange-700',
    'No Answer': 'bg-muted text-muted-foreground',
    'Wrong Number': 'bg-red-100 text-red-700',
  }
  return map[outcome]
}

function Breadcrumb({ subject }: { subject: string }) {
  const navigate = useNavigate()
  const supportPath = '/admin/settings/support'

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      <ChevronRight className="size-4 text-muted-foreground" />
      <button
        type="button"
        onClick={() => navigate(supportPath)}
        className="text-muted-foreground hover:text-foreground"
      >
        Support Tickets
      </button>
      <ChevronRight className="size-4 text-muted-foreground" />
      <span className="max-w-[200px] truncate font-medium text-foreground sm:max-w-none">
        {subject}
      </span>
    </nav>
  )
}

export function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const socketRef = useRef<AdminChatSocket | null>(null)
  const conversationScrollRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionSaving, setActionSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
  const [userTicketTotal, setUserTicketTotal] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastApi = useMemo(() => bindToast(setToast), [])

  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<CallOutcome>('Interested')
  const [callNotes, setCallNotes] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [noteText, setNoteText] = useState('')

  const [showEscalate, setShowEscalate] = useState(false)
  const [escalateTo, setEscalateTo] = useState<string>('')
  const [escalateReason, setEscalateReason] = useState('')
  const [showResolveConfirm, setShowResolveConfirm] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  const loadTicket = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setNotFound(false)

    const session = readAdminSession()
    if (!session?.accessToken) {
      setTicket(null)
      setLoadError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }

    if (!id) {
      setTicket(null)
      setNotFound(true)
      setLoading(false)
      return
    }

    try {
      const [loadedTicket, userResult, team, ticketResult] = await Promise.all([
        getAdminSupportTicket(session.accessToken, id),
        listAdminUsers(session.accessToken).catch(() => ({ data: [] as User[] })),
        getAdminSalesTeam(session.accessToken).catch(() => [] as SalesPerson[]),
        listAdminSupportTickets(session.accessToken).catch(() => ({ data: [] as SupportTicket[] })),
      ])
      const [callResult, noteResult] = await Promise.all([
        listWorkflowLogs(session.accessToken, 'ticket', loadedTicket.id, 'call').catch(() => ({ data: [] as WorkflowLog[] })),
        listWorkflowLogs(session.accessToken, 'ticket', loadedTicket.id, 'note').catch(() => ({ data: [] as WorkflowLog[] })),
      ])
      setTicket(loadedTicket)
      setUsers(userResult.data)
      setSalesTeam(team)
      setCallLogs(callResult.data.map(workflowLogToCall))
      setNotes(noteResult.data.map(workflowLogToNote))
      setUserTicketTotal(ticketResult.data.filter((item) => item.userId === loadedTicket.userId).length)
      setEscalateTo(team[0]?.id ?? '')
      setNotFound(false)
      if (id !== loadedTicket.referenceId) {
        navigate(`/admin/settings/support/${encodeURIComponent(loadedTicket.referenceId)}`, { replace: true })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not load support ticket.'
      setTicket(null)
      if (message.toLowerCase().includes('not found')) {
        setNotFound(true)
      } else {
        setLoadError(message)
      }
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    void loadTicket()
  }, [loadTicket])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    })
    return () => cancelAnimationFrame(frame)
  }, [id, ticket?.id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const linkedUser = useMemo(
    () => (ticket ? users.find((u) => u.referenceId === ticket.userId || u.id === ticket.userId) : undefined),
    [ticket, users],
  )

  const isClosed = ticket?.status === 'closed'
  const overdue = ticket ? isTicketOverdue(ticket) : false
  const urgentOverdue = ticket ? isUrgentOverdue(ticket) : false

  const lastUpdated = useMemo(() => {
    if (!ticket) return ''
    const times = [ticket.createdAt, ticket.resolvedAt, ...ticket.responses.map((r) => r.at)].filter(
      Boolean,
    ) as string[]
    return times.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
  }, [ticket])

  const responseTimeLabel = useMemo(() => {
    if (!ticket) return '—'
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      const end = ticket.resolvedAt ?? lastUpdated
      return `${hoursBetween(ticket.createdAt, end)} hours`
    }
    return `Waiting ${hoursBetween(ticket.createdAt, new Date().toISOString())} hours`
  }, [ticket, lastUpdated])

  const withSession = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        setToast('Admin session expired. Please sign in again.')
        throw new Error('Admin session expired.')
      }
      setActionSaving(true)
      try {
        return await fn(session.accessToken)
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Support ticket action failed.')
        throw err
      } finally {
        setActionSaving(false)
      }
    },
    [],
  )

  const replaceTicket = useCallback((updated: SupportTicket) => {
    setTicket(updated)
  }, [])

  useEffect(() => {
    const session = readAdminSession()
    const ticketId = ticket?.id
    if (!session?.accessToken || !ticketId) return

    const socket = createAdminChatSocket(session.accessToken)
    socketRef.current = socket

    const applyRealtimeTicket = (updated: SupportTicket) => {
      setTicket((current) => {
        if (!current) return updated
        const sameTicket = updated.id === current.id || updated.referenceId === current.referenceId
        return sameTicket ? updated : current
      })
    }

    socket.on('support:ticket_updated', ({ ticket: updatedTicket }) => {
      applyRealtimeTicket(mapSupportTicketPayload(updatedTicket))
    })
    socket.on('connect', () => {
      socket.emit('support:join', { ticketId }, (payload) => {
        const normalized = normalizeSupportTicketAck(payload)
        if (normalized.ok) {
          applyRealtimeTicket(normalized.ticket)
        } else if (normalized.error) {
          setToast(normalized.error)
        }
      })
    })
    socket.on('connect_error', () => {
      setToast('Realtime chat is reconnecting. Replies can still send.')
    })

    return () => {
      socket.disconnect()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [ticket?.id, ticket?.referenceId])

  useEffect(() => {
    if (!ticket) return
    const frame = requestAnimationFrame(() => {
      const container = conversationScrollRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [ticket?.id, ticket?.responses.length])

  const updateTicket = useCallback(
    async (
      patch: Parameters<typeof updateAdminSupportTicket>[2],
      successMessage?: string,
    ) => {
      if (!ticket) return
      const updated = await withSession((accessToken) =>
        updateAdminSupportTicket(accessToken, ticket.id, patch),
      )
      replaceTicket(updated)
      if (successMessage) setToast(successMessage)
    },
    [ticket, replaceTicket, withSession],
  )

  const handleSendReply = async () => {
    if (!ticket || !replyText.trim() || isClosed || actionSaving) return
    const message = replyText.trim()
    const socket = socketRef.current
    if (socket?.connected) {
      setActionSaving(true)
      socket.emit('support:send', { ticketId: ticket.id, message }, (payload) => {
        setActionSaving(false)
        const normalized = normalizeSupportTicketAck(payload)
        if (normalized.ok) {
          replaceTicket(normalized.ticket)
          setReplyText('')
          setShowTemplates(false)
          setToast('Reply sent')
        } else {
          setToast(normalized.error ?? 'Unable to send reply.')
        }
      })
      return
    }
    const updated = await withSession((accessToken) =>
      addAdminSupportTicketResponse(accessToken, ticket.id, { message }),
    )
    replaceTicket(updated)
    setReplyText('')
    setShowTemplates(false)
    setToast('Reply sent')
  }

  const handleMarkResolved = async () => {
    if (!ticket || isClosed) return
    if (ticket.responses.length === 0) {
      setToast('Add a response before resolving')
      setShowResolveConfirm(false)
      return
    }
    const resolutionResponse = ticket.responses.at(-1)?.message ?? 'Resolved by admin'
    await updateTicket({ status: 'resolved', resolutionResponse }, 'Ticket marked resolved')
    setShowResolveConfirm(false)
  }

  const handleClose = async () => {
    if (!ticket || isClosed) return
    await updateTicket({ status: 'closed' }, 'Ticket closed')
    setShowCloseConfirm(false)
  }

  const handleReopen = () => {
    void updateTicket({ status: 'open' }, 'Ticket reopened')
  }

  const handleEscalate = async () => {
    if (!ticket || !escalateReason.trim() || isClosed) return
    if (!escalateTo) {
      setToast('Select an assignee before escalating.')
      return
    }
    const assignee = salesTeam.find((person) => person.id === escalateTo)
    await updateTicket(
      {
        priority: 'urgent',
        assignedTo: escalateTo,
        escalation: { targetAssignee: escalateTo, reason: escalateReason.trim() },
      },
      `Escalated to ${assignee?.name ?? 'selected assignee'}`,
    )
    setShowEscalate(false)
    setEscalateReason('')
  }

  const handleSaveCall = async () => {
    if (!ticket) return
    const duration = parseInt(callDuration, 10) || 0
    const log = await withSession((accessToken) =>
      createWorkflowLog(accessToken, 'ticket', ticket.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `Support call: ${callOutcome}`,
        body: callNotes,
        outcome: callOutcome,
        durationMinutes: duration,
        followUpAt: followUpDate || null,
      }),
    )
    const mapped = workflowLogToCall(log)
    if (followUpDate) mapped.followUpDate = followUpDate
    setCallLogs((prev) => [mapped, ...prev])
    setShowCallForm(false)
    setCallDuration('')
    setCallNotes('')
    setFollowUpDate('')
  }

  const handleSaveNote = async () => {
    if (!ticket || !noteText.trim()) return
    const log = await withSession((accessToken) =>
      createWorkflowLog(accessToken, 'ticket', ticket.id, {
        channel: 'note',
        direction: 'internal',
        summary: 'Internal support note',
        body: noteText.trim(),
      }),
    )
    setNotes((prev) => [workflowLogToNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const handleCopyPhone = () => {
    if (!ticket) return
    void copyText(ticket.phone, toastApi)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-4 px-4 py-6">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
          <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-[400px] max-w-[1000px] flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <AlertCircle className="size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Could not load ticket</h1>
        <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/settings/support')}>
            Back to Support Tickets
          </Button>
          <Button onClick={() => void loadTicket()}>Retry</Button>
        </div>
      </div>
    )
  }

  if (notFound || !ticket) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-12 text-center">
        <AlertCircle className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Ticket not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">No ticket matches {id}</p>
        <Button className="mt-4" onClick={() => navigate('/admin/settings/support')}>
          Back to Support Tickets
        </Button>
      </div>
    )
  }

  const userEmail = linkedUser?.email ?? '—'
  const profilePath = `/admin/users/${linkedUser?.id ?? ticket.userId}`

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Breadcrumb subject={ticket.subject} />

      {urgentOverdue && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          Urgent ticket overdue — no response in 24+ hours
        </div>
      )}

      {isClosed && (
        <div className="mb-4 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          <p className="font-medium">This ticket is closed</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={actionSaving}
            onClick={handleReopen}
          >
            {actionSaving ? 'Saving...' : 'Reopen Ticket'}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-muted-foreground">{ticket.referenceId}</p>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="default">{CATEGORY_LABELS[ticket.category]}</Badge>
            {priorityBadge(ticket.priority)}
            {overdue && (
              <Badge variant="pending" className="bg-orange-100 text-orange-800">
                Overdue
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {statusBadgeLarge(ticket.status)}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isClosed}
          onClick={() => handleCall(ticket.phone)}
        >
          📞 Call User
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isClosed}
          onClick={() => openWhatsApp(ticket.phone)}
        >
          💬 WhatsApp
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isClosed}
          onClick={() =>
            handleEmail(userEmail !== '—' ? userEmail : 'support@builtglory.com')
          }
        >
          📧 Email
        </Button>
        <select
          disabled={isClosed || actionSaving}
          value={ticket.status}
          onChange={(e) => void updateTicket({ status: e.target.value as TicketStatus }, 'Status updated')}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          disabled={isClosed || actionSaving}
          value={ticket.priority}
          onChange={(e) => void updateTicket({ priority: e.target.value as TicketPriority }, 'Priority updated')}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ticket Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <Badge variant="default" className="mt-1">
                  {CATEGORY_LABELS[ticket.category]}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Subject</p>
                <p className="font-medium">{ticket.subject}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="mt-1 rounded-md bg-muted p-3">{ticket.description}</p>
              </div>
              <p className="text-muted-foreground">
                Submitted: {formatFullDate(ticket.createdAt)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversation</CardTitle>
            </CardHeader>
            <CardContent className="overflow-hidden p-0">
              <div ref={conversationScrollRef} className="max-h-[430px] space-y-3 overflow-y-auto bg-muted/30 px-3 py-4">
                <div className="flex justify-center">
                  <span className="rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground">
                    {formatFullDate(ticket.createdAt)}
                  </span>
                </div>

                <div className="flex justify-start">
                  <div className="max-w-[82%]">
                    <div className="mb-1 flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {getInitials(ticket.userName)}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{ticket.userName}</span>
                    </div>
                    <div className="rounded-t-2xl rounded-br-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-sm shadow-sm">
                      <p>{ticket.description}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{formatTimeAgo(ticket.createdAt)}</p>
                    </div>
                  </div>
                </div>

                {ticket.responses.length === 0 && (
                  <div className="flex flex-col items-center py-6 text-center text-sm text-muted-foreground">
                    <MessageSquare className="mb-2 size-8 opacity-40" />
                    <p className="font-medium text-foreground">No messages yet</p>
                    <p>Be the first to respond</p>
                  </div>
                )}

                {ticket.responses.map((r) => {
                  const isAdmin = r.responderType === 'admin'
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        'flex',
                        isAdmin ? 'justify-end' : 'justify-start',
                      )}
                    >
                      <div className={cn('max-w-[82%]', isAdmin && 'text-right')}>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          {isAdmin ? 'You' : r.author}
                        </p>
                        <div
                          className={cn(
                            'px-3 py-2 text-sm shadow-sm',
                            isAdmin
                              ? 'rounded-t-2xl rounded-bl-2xl rounded-br-md bg-primary text-primary-foreground'
                              : 'rounded-t-2xl rounded-br-2xl rounded-bl-md border border-border bg-card text-card-foreground',
                          )}
                        >
                          <p>{r.message}</p>
                          <p
                            className={cn(
                              'mt-1 text-[10px]',
                              isAdmin ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                          >
                            {formatTimeAgo(r.at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {!isClosed && (
                <div className="border-t border-border bg-card px-3 pb-3 pt-2">
                  <div className="mb-2 flex gap-2 overflow-x-auto">
                    <div className="relative">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 rounded-full px-3 text-xs"
                        onClick={() => setShowTemplates((v) => !v)}
                      >
                        Use Template
                      </Button>
                      {showTemplates && (
                        <div className="absolute left-0 top-full z-10 mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-lg">
                          {REPLY_TEMPLATES.map((tpl, i) => (
                            <button
                              key={i}
                              type="button"
                              className="block w-full rounded px-2 py-2 text-left text-xs hover:bg-muted"
                              onClick={() => {
                                setReplyText(tpl)
                                setShowTemplates(false)
                              }}
                            >
                              {tpl}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {REPLY_TEMPLATES.slice(0, 2).map((tpl, i) => (
                      <button
                        key={i}
                        type="button"
                        className="shrink-0 rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground hover:bg-muted/80"
                        onClick={() => setReplyText(tpl)}
                      >
                        {tpl.length > 34 ? `${tpl.slice(0, 34)}...` : tpl}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="min-h-11 flex-1 rounded-3xl bg-muted px-4 py-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Type your reply..."
                        rows={2}
                        className="max-h-28 min-h-7 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-11 rounded-full px-4"
                      disabled={actionSaving || !replyText.trim()}
                      onClick={() => void handleSendReply()}
                    >
                      {actionSaving ? 'Sending...' : 'Send Reply'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Call Log</CardTitle>
              {!showCallForm && !isClosed && (
                <Button variant="outline" size="sm" onClick={() => setShowCallForm(true)}>
                  <Plus className="size-3" /> Log Call
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {callLogs.length === 0 && !showCallForm && (
                <div className="flex flex-col items-center py-8 text-center">
                  <Phone className="mb-3 size-10 text-muted-foreground/40" />
                  <p className="font-medium">No calls logged yet</p>
                  <p className="text-sm text-muted-foreground">Log your first call</p>
                </div>
              )}
              {callLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{log.duration} min</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        outcomeBadgeClass(log.outcome),
                      )}
                    >
                      {log.outcome}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatFullDate(log.at)}</span>
                  </div>
                  {log.notes && <p className="mt-2 text-sm">{log.notes}</p>}
                </div>
              ))}
              {showCallForm && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <input
                    type="number"
                    min={0}
                    placeholder="Duration (minutes)"
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value as CallOutcome)}
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                  >
                    <option>Interested</option>
                    <option>Not Interested</option>
                    <option>Callback Later</option>
                    <option>No Answer</option>
                    <option>Wrong Number</option>
                  </select>
                  <textarea
                    rows={3}
                    value={callNotes}
                    onChange={(e) => setCallNotes(e.target.value)}
                    placeholder="Call notes"
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveCall}>
                      Save Call
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowCallForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Notes</CardTitle>
              {!showNoteForm && !isClosed && (
                <Button variant="outline" size="sm" onClick={() => setShowNoteForm(true)}>
                  <Plus className="size-3" /> Add Note
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Internal notes only — not visible to users</p>
              {notes.length === 0 && !showNoteForm && (
                <div className="flex flex-col items-center py-8 text-center">
                  <FileText className="mb-3 size-10 text-muted-foreground/40" />
                  <p className="font-medium">No notes yet</p>
                </div>
              )}
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg bg-muted p-3">
                  <p className="text-sm">{note.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatFullDate(note.at)}</p>
                </div>
              ))}
              {showNoteForm && (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Internal note..."
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNote}>
                      Save Note
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowNoteForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="w-full shrink-0 space-y-6 lg:w-[300px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
                  {getInitials(ticket.userName)}
                </div>
                <p className="font-medium">{ticket.userName}</p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{ticket.phone}</span>
                <Button type="button" size="sm" variant="ghost" onClick={handleCopyPhone}>
                  Copy
                </Button>
              </div>
              <p>{userEmail}</p>
              {linkedUser && (
                <>
                  <span
                    className={cn(
                      'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      getUserTypeBadgeColor(linkedUser.userType),
                    )}
                  >
                    {linkedUser.userType.toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      'ml-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                      getKycStatusColor(linkedUser.kycStatus),
                    )}
                  >
                    KYC: {getKycStatusLabel(linkedUser.kycStatus)}
                  </span>
                  <p className="text-xs text-muted-foreground">{getRoleLabel(linkedUser.role)}</p>
                </>
              )}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => navigate(profilePath)}
              >
                View User Profile →
              </Button>
              <p className="text-muted-foreground">
                {userTicketTotal} ticket{userTicketTotal !== 1 ? 's' : ''} total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ticket Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p>{formatFullDate(ticket.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p>{formatFullDate(lastUpdated)}</p>
              </div>
              <label className="block">
                <span className="text-xs text-muted-foreground">Assigned To</span>
                <select
                  disabled={isClosed || actionSaving}
                  value={ticket.assignedTo ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      void updateTicket({ assignedTo: null }, 'Ticket unassigned')
                      return
                    }
                    void updateTicket({ assignedTo: e.target.value }, 'Assignment updated')
                  }}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {salesTeam.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">Priority</span>
                <select
                  disabled={isClosed || actionSaving}
                  value={ticket.priority}
                  onChange={(e) => void updateTicket({ priority: e.target.value as TicketPriority }, 'Priority updated')}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <div>
                <p className="text-xs text-muted-foreground">Response Time</p>
                <p className="font-medium">{responseTimeLabel}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                type="button"
                className="w-full bg-green-600 hover:bg-green-700"
                disabled={isClosed || actionSaving}
                onClick={() => setShowResolveConfirm(true)}
              >
                ✅ Mark Resolved
              </Button>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">🔄 Reassign</span>
                <select
                  disabled={isClosed || actionSaving}
                  value={ticket.assignedTo ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      void updateTicket({ assignedTo: null }, 'Ticket unassigned')
                      return
                    }
                    const person = salesTeam.find((item) => item.id === e.target.value)
                    void updateTicket({ assignedTo: e.target.value }, `Reassigned to ${person?.name ?? 'selected assignee'}`)
                  }}
                  className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {salesTeam.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                className="w-full border-orange-300 text-orange-700"
                disabled={isClosed || actionSaving}
                onClick={() => setShowEscalate(true)}
              >
                ⬆️ Escalate
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isClosed || actionSaving}
                onClick={() => setShowCloseConfirm(true)}
              >
                🔒 Close Ticket
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {showResolveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="font-semibold">Mark as resolved?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will set the ticket status to resolved.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                className="bg-green-600 hover:bg-green-700"
                disabled={actionSaving}
                onClick={() => void handleMarkResolved()}
              >
                {actionSaving ? 'Saving...' : 'Confirm'}
              </Button>
              <Button variant="outline" onClick={() => setShowResolveConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-lg">
            <h3 className="font-semibold">Close ticket?</h3>
            <p className="mt-2 text-sm text-muted-foreground">This ticket will be marked closed.</p>
            <div className="mt-4 flex gap-2">
              <Button disabled={actionSaving} onClick={() => void handleClose()}>
                {actionSaving ? 'Saving...' : 'Confirm'}
              </Button>
              <Button variant="outline" onClick={() => setShowCloseConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showEscalate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">Escalate ticket</h3>
              <button type="button" onClick={() => setShowEscalate(false)} aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
            <label className="mb-3 block text-sm">
              Escalate to
              <select
                value={escalateTo}
                onChange={(e) => setEscalateTo(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-card px-2 text-sm"
              >
                <option value="">Select assignee</option>
                {salesTeam.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-4 block text-sm">
              Reason
              <textarea
                rows={3}
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
            </label>
            <Button
              className="w-full border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100"
              variant="outline"
              disabled={actionSaving || !escalateReason.trim() || !escalateTo}
              onClick={() => void handleEscalate()}
            >
              Confirm Escalation
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
