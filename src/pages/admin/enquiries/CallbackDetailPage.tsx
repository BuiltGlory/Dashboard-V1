import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Phone,
  Plus,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  addAdminCallbackAttempt,
  CATEGORY_LABELS,
  CATEGORY_STYLES,
  countOpenCallbacksByUser,
  formatPreferredTime,
  getAdminCallback,
  getEffectiveStatus,
  getSlaRemaining,
  isSlaOverdue,
  listAdminCallbacks,
  rescheduleAdminCallback,
  resolveAdminCallback,
  STATUS_LABELS,
  type AttemptOutcome,
  type BestTimePreference,
  type Callback,
  type CallbackStatus,
  type CallbackUserType,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { SentMessagesCard } from '@/components/admin/SentMessagesCard'
import { bindToast, copyText, handleCall } from '@/utils/adminActions'
import { cn } from '@/lib/utils'
import {
  DEFAULT_SENT_BY,
  loadMessages,
  logMessage,
  messageToActivityText,
  openEmail,
  openWhatsApp,
  type SentMessage,
} from '@/utils/messageLog'

interface CallbackNote {
  id: string
  text: string
  at: string
}

interface ActivityItem {
  id: string
  description: string
  at: string
}

const BEST_TIME_LABELS: Record<BestTimePreference, string> = {
  morning: '🌅 Morning',
  afternoon: '☀️ Afternoon',
  evening: '🌆 Evening',
}

const OUTCOME_LABELS: Record<AttemptOutcome, string> = {
  answered: 'Answered',
  no_answer: 'No Answer',
  busy: 'Busy',
  wrong_number: 'Wrong Number',
  callback_later: 'Callback Later',
}

const OUTCOME_STYLES: Record<AttemptOutcome, string> = {
  answered: 'bg-green-100 text-green-700',
  no_answer: 'bg-muted text-muted-foreground',
  busy: 'bg-orange-100 text-orange-700',
  wrong_number: 'bg-red-100 text-red-700',
  callback_later: 'bg-blue-100 text-blue-700',
}

const ALL_STATUSES: CallbackStatus[] = [
  'pending',
  'called',
  'resolved',
  'missed',
  'rescheduled',
  'overdue',
]

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
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  return `${Math.floor(hours / 24)} days ago`
}

function UserTypeBadge({ type }: { type: CallbackUserType }) {
  const styles: Record<CallbackUserType, string> = {
    buyer: 'bg-blue-100 text-blue-700',
    seller: 'bg-green-100 text-green-700',
    nri: 'bg-purple-100 text-purple-700',
  }
  return (
    <Badge variant="default" className={cn('capitalize', styles[type])}>
      {type === 'nri' ? 'NRI' : type}
    </Badge>
  )
}

function StatusBadge({ status, large }: { status: CallbackStatus; large?: boolean }) {
  const config: Record<CallbackStatus, { variant?: 'new' | 'responded' | 'default' | 'red' | 'pending'; className?: string }> = {
    pending: { variant: 'new' },
    called: { className: 'bg-purple-100 text-purple-700' },
    resolved: { variant: 'responded' },
    missed: { variant: 'pending' },
    rescheduled: { variant: 'default' },
    overdue: { variant: 'red', className: 'animate-pulse' },
  }
  const { variant, className } = config[status]
  return (
    <Badge variant={variant} className={cn(large && 'px-3 py-1 text-sm', className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[800px] animate-pulse space-y-6 px-4 py-6">
      <div className="h-4 w-56 rounded bg-muted" />
      <div className="h-10 w-2/3 rounded bg-muted" />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <div className="h-40 rounded-xl bg-muted" />
          <div className="h-32 rounded-xl bg-muted" />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  )
}

export function CallbackDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [callback, setCallback] = useState<Callback | null>(null)
  const [allCallbacks, setAllCallbacks] = useState<Callback[]>([])
  const [status, setStatus] = useState<CallbackStatus>('pending')
  const [notes, setNotes] = useState<CallbackNote[]>([])
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [showRescheduleForm, setShowRescheduleForm] = useState(false)
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [calledAt, setCalledAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [duration, setDuration] = useState('5')
  const [outcome, setOutcome] = useState<AttemptOutcome>('answered')
  const [attemptNotes, setAttemptNotes] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [newPreferred, setNewPreferred] = useState('')
  const [newBestTime, setNewBestTime] = useState<BestTimePreference>('morning')
  const [rescheduleNotes, setRescheduleNotes] = useState('')
  const [noteText, setNoteText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const toastApi = useMemo(() => bindToast(setToast), [])
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [whatsappBody, setWhatsappBody] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])

  const loadCallback = useCallback(async () => {
    const session = readAdminSession()
    if (!id || !session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setCallback(null)
      setAllCallbacks([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const [found, list] = await Promise.all([
        getAdminCallback(session.accessToken, id),
        listAdminCallbacks(session.accessToken),
      ])
      const eff = getEffectiveStatus(found)
      setCallback(found)
      setAllCallbacks(list.data)
      setStatus(eff)
      setNewPreferred(found.preferredTime.slice(0, 16))
      setNewBestTime(found.bestTimePreference)
      setActivities([
        {
          id: 'act-init',
          description: 'Callback requested via app',
          at: found.createdAt,
        },
        ...found.attempts.map((a) => ({
          id: a.id,
          description: `Call attempt #${a.attemptNumber} — ${OUTCOME_LABELS[a.outcome]}`,
          at: a.calledAt,
        })),
      ])
      if (found.resolutionNotes && found.resolvedAt) {
        setActivities((prev) => [
          {
            id: 'act-resolved',
            description: 'Callback resolved',
            at: found.resolvedAt!,
          },
          ...prev,
        ])
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load callback.')
      setCallback(null)
      setAllCallbacks([])
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCallback()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadCallback])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const addActivity = useCallback((description: string, id?: string) => {
    setActivities((prev) => [
      {
        id: id ?? `act-${Date.now()}`,
        description,
        at: new Date().toISOString(),
      },
      ...prev,
    ])
  }, [])

  const refreshSentMessages = useCallback(() => {
    if (callback) void loadMessages('callback', callback.id).then(setSentMessages)
  }, [callback])

  useEffect(() => {
    refreshSentMessages()
  }, [refreshSentMessages])

  const logCallbackMessage = useCallback(
    (msg: Omit<SentMessage, 'id' | 'sentAt' | 'relatedTo' | 'sentBy'>) => {
      if (!callback) return
      logMessage({
        ...msg,
        sentBy: DEFAULT_SENT_BY,
        relatedTo: {
          type: 'callback',
          id: callback.id,
          title: callback.callerName,
        },
      })
      refreshSentMessages()
    },
    [callback, addActivity, refreshSentMessages],
  )

  const activityTimeline = useMemo(() => {
    const fromMessages = sentMessages.map((m) => ({
      id: m.id,
      description: messageToActivityText(m),
      at: m.sentAt,
    }))
    return [...fromMessages, ...activities].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
  }, [activities, sentMessages])

  const effectiveStatus = useMemo(
    () => (callback ? getEffectiveStatus({ ...callback, status }) : 'pending'),
    [callback, status],
  )

  const sla = callback ? getSlaRemaining({ ...callback, status }) : null
  const isOverdue = callback ? isSlaOverdue({ ...callback, status }) : false
  const isFinal = status === 'resolved' || status === 'missed'

  const openCount = useMemo(() => {
    if (!callback) return 0
    return countOpenCallbacksByUser(allCallbacks, callback.userId)
  }, [callback, allCallbacks])

  const noAnswerCount = useMemo(() => {
    if (!callback) return 0
    return callback.attempts.filter((a) => a.outcome === 'no_answer').length
  }, [callback])

  const updateStatus = (next: CallbackStatus) => {
    setStatus(next)
    setCallback((prev) => (prev ? { ...prev, status: next, updatedAt: new Date().toISOString() } : prev))
    addActivity(`Status changed to ${STATUS_LABELS[next]}`)
  }

  const saveAttempt = async () => {
    if (!callback) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const updated = await addAdminCallbackAttempt(session.accessToken, callback.id, {
        outcome,
        notes: attemptNotes,
        preferredTime: outcome === 'callback_later' ? new Date(calledAt).toISOString() : undefined,
      })
      setCallback(updated)
      setStatus(getEffectiveStatus(updated))
      addActivity(`Call attempt #${updated.attemptCount} — ${OUTCOME_LABELS[outcome]}`)
      setShowCallForm(false)
      setAttemptNotes('')
      setToast(outcome === 'answered' ? 'Call logged' : 'Attempt saved')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to save call attempt.')
    }
  }

  const saveResolve = async () => {
    if (!callback || !resolutionNotes.trim()) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const updated = await resolveAdminCallback(session.accessToken, callback.id, resolutionNotes.trim())
      setCallback(updated)
      setStatus(getEffectiveStatus(updated))
      addActivity('Callback resolved')
      setShowResolveForm(false)
      setToast(callback.attemptCount === 0 ? 'Resolved without call' : 'Callback resolved')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to resolve callback.')
    }
  }

  const saveReschedule = async () => {
    if (!callback || !newPreferred) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const updated = await rescheduleAdminCallback(session.accessToken, callback.id, {
        preferredTime: new Date(newPreferred).toISOString(),
        reason: rescheduleNotes.trim() || 'Rescheduled from admin dashboard',
        notes: rescheduleNotes.trim(),
      })
      setCallback(updated)
      setStatus(getEffectiveStatus(updated))
      addActivity(`Rescheduled to ${formatPreferredTime(newPreferred).date}`)
      setShowRescheduleForm(false)
      setToast('Callback rescheduled')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to reschedule callback.')
    }
  }

  if (loading) return <DetailSkeleton />

  if (!callback) {
    return (
      <div className="mx-auto flex max-w-[800px] flex-col items-center px-4 py-24 text-center">
        <AlertCircle className="mb-4 size-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">{loadError ? 'Could not load callback' : 'Callback not found'}</h2>
        {loadError && <p className="mt-2 max-w-md text-sm text-muted-foreground">{loadError}</p>}
        <div className="mt-6 flex gap-2">
          {loadError && <Button onClick={() => void loadCallback()}>Retry</Button>}
          <Button variant="outline" onClick={() => navigate('/admin/enquiries/callbacks')}>
            Back to Callbacks
          </Button>
        </div>
      </div>
    )
  }

  const pref = formatPreferredTime(callback.preferredTime)
  const slaDeadline = formatPreferredTime(callback.slaDeadline)

  return (
    <div className="mx-auto max-w-[800px] px-4 py-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 size-8"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {[
          { label: 'Enquiries', path: '/admin/enquiries/callbacks' },
          { label: 'Callbacks', path: '/admin/enquiries/callbacks' },
          { label: callback.callerName, path: null },
        ].map((item, index) => (
          <span key={item.label} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-4 text-muted-foreground" />}
            {item.path ? (
              <button
                type="button"
                onClick={() => navigate(item.path!)}
                className="text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </button>
            ) : (
              <span className="font-medium text-foreground">{item.label}</span>
            )}
          </span>
        ))}
      </nav>

      {isOverdue && effectiveStatus !== 'resolved' && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          🔴 This callback is overdue
        </div>
      )}

      {status === 'missed' && (
        <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          This callback was marked as missed
        </div>
      )}

      <header className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{callback.callerName}</h1>
          <p className="text-sm text-muted-foreground">
            {callback.referenceId} · Submitted {formatFullDate(callback.createdAt)}
          </p>
          {sla && (
            <p
              className={cn(
                'mt-2 text-sm font-medium',
                sla.variant === 'green' && 'text-green-700',
                sla.variant === 'orange' && 'text-orange-700',
                sla.variant === 'red' && 'text-red-700 animate-pulse',
              )}
            >
              SLA: {sla.label}
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <StatusBadge status={effectiveStatus} large />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!callback.phone}
              title={!callback.phone ? 'No phone number' : undefined}
              onClick={() => callback.phone && handleCall(callback.phone)}
            >
              <Phone className="size-4" /> Call
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-green-600"
              disabled={!callback.phone}
              onClick={() => {
                setWhatsappBody(`Hi ${callback.callerName}, this is BuiltGlory admin returning your callback request.`)
                setWhatsappOpen(true)
              }}
            >
              WhatsApp
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!callback.email}
              onClick={() => {
                setEmailSubject(`BuiltGlory — Callback request`)
                setEmailBody(`Hi ${callback.callerName},\n\nThank you for requesting a callback.`)
                setEmailOpen(true)
              }}
            >
              <Mail className="size-4" /> Email
            </Button>
            <select
              value={status}
              disabled={isFinal}
              onChange={(e) => updateStatus(e.target.value as CallbackStatus)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <hr className="my-6 border-border" />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Callback Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', CATEGORY_STYLES[callback.category])}>
                {CATEGORY_LABELS[callback.category]}
              </span>
              <p>
                <span className="text-muted-foreground">Source: </span>
                {callback.sourceScreen}
              </p>
              <div className="rounded-lg bg-muted p-3">{callback.reason}</div>
              <p>
                <span className="text-muted-foreground">Best time: </span>
                {BEST_TIME_LABELS[callback.bestTimePreference]}
              </p>
              <p>
                <span className="text-muted-foreground">Preferred callback: </span>
                {pref.date} {pref.time}
              </p>
              <p>
                <span className="text-muted-foreground">SLA deadline: </span>
                {slaDeadline.date} {slaDeadline.time}
              </p>
              {callback.propertyId && callback.propertyTitle && (
                <div className="flex gap-3 rounded-lg border border-border p-3">
                  {callback.propertyImage && (
                    <img src={callback.propertyImage} alt="" className="size-14 rounded object-cover" />
                  )}
                  <div>
                    <p className="font-medium">{callback.propertyTitle}</p>
                    {callback.propertyPrice && (
                      <p className="text-primary">{callback.propertyPrice}</p>
                    )}
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/properties/${callback.propertyId}`)}
                      className="text-xs text-primary hover:underline"
                    >
                      View Property →
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Call Attempts ({callback.attemptCount})</CardTitle>
              {!isFinal && !showCallForm && (
                <Button size="sm" onClick={() => setShowCallForm(true)}>
                  <Plus className="size-3" /> Log Call Attempt
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {noAnswerCount >= 3 && effectiveStatus !== 'resolved' && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                  <AlertTriangle className="size-4 shrink-0" />
                  Persistent follow-up needed
                </div>
              )}
              {callback.attempts.length === 0 && !showCallForm && (
                <div className="py-8 text-center">
                  <Phone className="mx-auto mb-2 size-10 text-muted-foreground/40" />
                  <p className="font-medium">No call attempts yet</p>
                </div>
              )}
              {showCallForm && (
                <div className="mb-4 space-y-2 rounded-lg border border-border p-3">
                  <input
                    type="datetime-local"
                    value={calledAt}
                    onChange={(e) => setCalledAt(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Duration (minutes)"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <select
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value as AttemptOutcome)}
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                  >
                    {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    value={attemptNotes}
                    onChange={(e) => setAttemptNotes(e.target.value)}
                    placeholder="Notes"
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveAttempt}>
                      Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowCallForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <ul className="space-y-2">
                {callback.attempts.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">#{a.attemptNumber}</Badge>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs', OUTCOME_STYLES[a.outcome])}>
                        {OUTCOME_LABELS[a.outcome]}
                      </span>
                      <span className="text-muted-foreground">
                        {formatPreferredTime(a.calledAt).date} {formatPreferredTime(a.calledAt).time}
                      </span>
                      <span>{a.duration} min</span>
                    </div>
                    {a.notes && <p className="mt-2">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resolution</CardTitle>
            </CardHeader>
            <CardContent>
              {status === 'resolved' && callback.resolutionNotes ? (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                  <p className="font-semibold">✅ Resolved</p>
                  <p className="mt-2">{callback.resolutionNotes}</p>
                  {callback.resolvedAt && (
                    <p className="mt-2 text-xs text-green-700">
                      Resolved at: {formatFullDate(callback.resolvedAt)}
                    </p>
                  )}
                </div>
              ) : !showResolveForm ? (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={isFinal}
                  onClick={() => setShowResolveForm(true)}
                >
                  Mark Resolved
                </Button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="What was discussed / resolved"
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      disabled={!resolutionNotes.trim()}
                      onClick={saveResolve}
                    >
                      Confirm Resolve
                    </Button>
                    <Button variant="outline" onClick={() => setShowResolveForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row justify-between">
              <CardTitle>Notes</CardTitle>
              {!showNoteForm && !isFinal && (
                <Button variant="outline" size="sm" onClick={() => setShowNoteForm(true)}>
                  <Plus className="size-3" /> Add Note
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {notes.length === 0 && !showNoteForm && (
                <div className="py-6 text-center">
                  <FileText className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No notes yet</p>
                </div>
              )}
              {notes.map((note) => (
                <div key={note.id} className="mb-2 flex items-start justify-between rounded-lg bg-muted p-3">
                  <div>
                    <p className="text-sm">{note.text}</p>
                    <p className="text-xs text-muted-foreground">{formatFullDate(note.at)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive"
                    onClick={() => setNotes((p) => p.filter((n) => n.id !== note.id))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              {showNoteForm && (
                <div className="space-y-2">
                  <textarea
                    rows={4}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!noteText.trim()) return
                        const note: CallbackNote = {
                          id: `n-${Date.now()}`,
                          text: noteText.trim(),
                          at: new Date().toISOString(),
                        }
                        setNotes((p) => [note, ...p])
                        addActivity('Note added')
                        setNoteText('')
                        setShowNoteForm(false)
                      }}
                    >
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

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Caller Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-2xl font-bold text-white">
                {getInitials(callback.callerName)}
              </div>
              <p className="text-lg font-semibold">{callback.callerName}</p>
              <UserTypeBadge type={callback.userType} />
              {openCount > 1 && (
                <Badge variant="pending" className="mt-2">
                  {openCount} open callbacks
                </Badge>
              )}
              <button
                type="button"
                className="mt-3 block text-sm hover:text-primary"
                onClick={() => callback.phone && void copyText(callback.phone, toastApi)}
              >
                {callback.phone}
              </button>
              <p className={cn('text-sm', !callback.email && 'italic text-muted-foreground')}>
                {callback.email ?? 'Not provided'}
              </p>
              <button
                type="button"
                onClick={() => navigate(`/admin/users/${callback.userId}`)}
                className="mt-4 text-sm font-medium text-primary hover:underline"
              >
                View Profile →
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Callback Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Source: </span>
                {callback.sourceScreen}
              </p>
              <p>
                <span className="text-muted-foreground">Category: </span>
                {CATEGORY_LABELS[callback.category]}
              </p>
              <p>
                <span className="text-muted-foreground">Best time: </span>
                {BEST_TIME_LABELS[callback.bestTimePreference]}
              </p>
              <p>
                <span className="text-muted-foreground">Created: </span>
                {formatFullDate(callback.createdAt)}
              </p>
              <div className="block pt-2">
                <span className="text-muted-foreground">Assigned to</span>
                <p className="mt-1 rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {callback.assignedTo}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reassignment is disabled until the callback assignment endpoint is available.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 border-l-2 border-border pl-4">
                {activityTimeline.map((a) => (
                  <li key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                    <p className="text-sm">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{formatTimeAgo(a.at)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <SentMessagesCard messages={sentMessages} />

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!showRescheduleForm ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={isFinal}
                  onClick={() => setShowRescheduleForm(true)}
                >
                  Reschedule
                </Button>
              ) : (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <input
                    type="datetime-local"
                    value={newPreferred}
                    onChange={(e) => setNewPreferred(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <select
                    value={newBestTime}
                    onChange={(e) => setNewBestTime(e.target.value as BestTimePreference)}
                    className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                  <textarea
                    rows={2}
                    value={rescheduleNotes}
                    onChange={(e) => setRescheduleNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                  />
                  {(callback.rescheduleCount ?? 0) >= 2 && (
                    <p className="text-xs text-orange-700">Rescheduled multiple times</p>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveReschedule}>
                      Save
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowRescheduleForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Assigned to {callback.assignedTo}. Reassignment endpoint pending.
              </div>

              <Button
                variant="outline"
                className="w-full border-destructive text-destructive"
                disabled={isFinal}
                onClick={() => {
                  if (window.confirm('Mark this callback as missed?')) {
                    updateStatus('missed')
                    setToast('Marked as missed')
                  }
                }}
              >
                Mark Missed
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {whatsappOpen && callback?.phone && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setWhatsappOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Send WhatsApp</h3>
            <textarea
              value={whatsappBody}
              onChange={(e) => setWhatsappBody(e.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setWhatsappOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!whatsappBody.trim()}
                onClick={() => {
                  logCallbackMessage({
                    channel: 'whatsapp',
                    to: callback.phone!,
                    toName: callback.callerName,
                    message: whatsappBody.trim(),
                  })
                  openWhatsApp(callback.phone!, whatsappBody.trim())
                  setWhatsappOpen(false)
                  setToast('WhatsApp message sent')
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}

      {emailOpen && callback?.email && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setEmailOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Send Email</h3>
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Body"
              className="mt-2 min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEmailOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  logCallbackMessage({
                    channel: 'email',
                    to: callback.email!,
                    toName: callback.callerName,
                    subject: emailSubject,
                    message: emailBody,
                  })
                  openEmail(callback.email!, emailSubject, emailBody)
                  setEmailOpen(false)
                  setToast('Email sent')
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
