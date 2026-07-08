import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ExternalLink, FileText, MapPin, Phone, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readAdminSession } from '@/api/admin'
import { getDashboardOptions } from '@/api/adminAppConfig'
import { createWorkflowLog, listWorkflowLogs, type WorkflowLog } from '@/api/adminWorkflow'
import { type SalesDeal, type SalesStage } from '@/api/adminSales'
import { cn } from '@/lib/utils'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface SiteVisitsStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage) => void
}

type VisitType = 'physical' | 'virtual'
type VisitStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'missed'
type BuyerInterest = 'very_interested' | 'interested' | 'needs_time' | 'not_interested'
type NextActionChoice = 'negotiation' | 'another_visit' | 'follow_up' | 'lost'

interface ScheduledVisit {
  date: string
  time: string
  type: VisitType
  meetingLink: string
  assignee: string
  notes: string
  address: string
  status: VisitStatus
  rescheduleCount: number
}

interface VisitFeedback {
  interest: BuyerInterest
  notes: string
  nextAction: NextActionChoice
}

interface CallLogEntry {
  id: string
  calledAt: string
  duration: number
  outcome: string
  notes: string
}

interface NoteEntry {
  id: string
  text: string
  at: string
}

const CALL_OUTCOMES = [
  'Interested',
  'Not Interested',
  'Callback Later',
  'No Answer',
  'Wrong Number',
] as const

const OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

const PRE_VISIT_ITEMS = [
  'Called buyer to confirm',
  'Sent visit confirmation WhatsApp',
  'Property access arranged',
  'Property cleaned and ready',
  'Directions sent to buyer',
] as const

const INTEREST_OPTIONS: {
  id: BuyerInterest
  label: string
  emoji: string
  className: string
}[] = [
  { id: 'very_interested', label: 'Very Interested', emoji: '🔥', className: 'border-green-300 bg-green-50 text-green-800' },
  { id: 'interested', label: 'Interested', emoji: '👍', className: 'border-blue-300 bg-blue-50 text-blue-800' },
  { id: 'needs_time', label: 'Needs Time', emoji: '🤔', className: 'border-orange-300 bg-orange-50 text-orange-800' },
  { id: 'not_interested', label: 'Not Interested', emoji: '👎', className: 'border-red-300 bg-red-50 text-red-800' },
]

const DEFAULT_RESCHEDULE_REASONS = [
  'Buyer request',
  'Admin conflict',
  'Property not ready',
  'Other',
] as const

const STATUS_STYLES: Record<VisitStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-muted text-muted-foreground',
  missed: 'bg-red-100 text-red-700',
}

const SITE_VISIT_CALL_SUMMARY_PREFIX = 'Sales site visit call'
const SITE_VISIT_NOTE_SUMMARY = 'Sales site visit note'
const SITE_VISIT_STATE_SUMMARY = 'Sales site visit workflow state'

function toDatetimeLocal(date = new Date()) {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatCallDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatNoteTime(iso: string) {
  return formatCallDate(iso)
}

function formatVisitDateTime(date: string, time: string) {
  const d = new Date(`${date}T${time}`)
  return d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })
}

function formatTime12(time: string) {
  const [h, m] = time.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function visitDateTime(date: string, time: string) {
  return new Date(`${date}T${time}`)
}

function isToday(date: string) {
  return date === todayIso()
}

function isOverdue(visit: ScheduledVisit) {
  if (visit.status === 'completed' || visit.status === 'cancelled' || visit.status === 'missed') {
    return false
  }
  return visitDateTime(visit.date, visit.time) < new Date()
}

function initialVisitFromDeal(_deal: SalesDeal): ScheduledVisit | null {
  return null
}

function parseSiteVisitState(logs: WorkflowLog[]): {
  visit: ScheduledVisit | null
  checklist: Record<string, boolean>
  feedback: VisitFeedback | null
} | null {
  const stateLog = logs
    .filter((log) => log.summary === SITE_VISIT_STATE_SUMMARY)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  if (!stateLog?.body) return null
  try {
    const parsed = JSON.parse(stateLog.body) as {
      visit?: ScheduledVisit | null
      checklist?: Record<string, boolean>
      feedback?: VisitFeedback | null
    }
    return {
      visit: parsed.visit ?? null,
      checklist: {
        ...Object.fromEntries(PRE_VISIT_ITEMS.map((item) => [item, false])),
        ...(parsed.checklist ?? {}),
      },
      feedback: parsed.feedback ?? null,
    }
  } catch {
    return null
  }
}

function interestLabel(id: BuyerInterest) {
  return INTEREST_OPTIONS.find((o) => o.id === id)?.label ?? id
}

function nextActionLabel(action: NextActionChoice) {
  switch (action) {
    case 'negotiation':
      return 'Move to Negotiation'
    case 'another_visit':
      return 'Schedule Another Visit'
    case 'follow_up':
      return 'Follow Up in 3 Days'
    case 'lost':
      return 'Mark as Lost'
  }
}

export function SiteVisitsStage({ deal, onStageChange }: SiteVisitsStageProps) {
  const navigate = useNavigate()

  const [visit, setVisit] = useState<ScheduledVisit | null>(() => initialVisitFromDeal(deal))
  const assigneeOptions = useMemo(
    () => [deal.assignedTo].filter((name) => name && name !== 'Unassigned'),
    [deal.assignedTo],
  )

  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [visitType, setVisitType] = useState<VisitType>('physical')
  const [meetingLink, setMeetingLink] = useState('')
  const [visitAssignee, setVisitAssignee] = useState(deal.assignedTo)
  const [visitNotes, setVisitNotes] = useState('')
  const [visitAddress, setVisitAddress] = useState(deal.propertyLocation)

  const [checklist, setChecklist] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PRE_VISIT_ITEMS.map((item) => [item, false])),
  )

  const [feedback, setFeedback] = useState<VisitFeedback | null>(null)
  const [editingFeedback, setEditingFeedback] = useState(false)
  const [interest, setInterest] = useState<BuyerInterest | null>(null)
  const [feedbackNotes, setFeedbackNotes] = useState('')
  const [nextAction, setNextAction] = useState<NextActionChoice>('negotiation')

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showRescheduleForm, setShowRescheduleForm] = useState(false)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')
  const [rescheduleReasons, setRescheduleReasons] = useState<readonly string[]>(DEFAULT_RESCHEDULE_REASONS)

  const [showAnotherVisitForm, setShowAnotherVisitForm] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const checklistCount = PRE_VISIT_ITEMS.filter((item) => checklist[item]).length
  const checklistIncomplete = checklistCount < PRE_VISIT_ITEMS.length
  const visitScheduled = visit != null && visit.status !== 'cancelled'
  const visitCompleted = visit?.status === 'completed'
  const visitCancelled = visit?.status === 'cancelled'

  const visitIsToday = visit != null && isToday(visit.date) && !visitCancelled
  const visitIsOverdue = visit != null && isOverdue(visit)
  const virtualNoLink = visit?.type === 'virtual' && !visit.meetingLink.trim()

  const canSchedule =
    visitDate && visitTime && visitAssignee && (visitType === 'physical' || meetingLink.trim())

  const canReschedule = rescheduleDate && rescheduleTime && rescheduleReason

  useEffect(() => {
    let cancelled = false
    void getDashboardOptions().then((options) => {
      const configured = options?.visits?.rescheduleReasons
      if (!cancelled && configured?.length) setRescheduleReasons(configured)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const session = readAdminSession()
    void Promise.all([
      loadStageWorkflowLogs(
        'sales-deal',
        deal.id,
        SITE_VISIT_CALL_SUMMARY_PREFIX,
        SITE_VISIT_NOTE_SUMMARY,
      ),
      session?.accessToken
        ? listWorkflowLogs(session.accessToken, 'sales-deal', deal.id, 'note').catch(() => ({ data: [] as WorkflowLog[] }))
        : Promise.resolve({ data: [] as WorkflowLog[] }),
    ]).then(([{ calls, notes }, stateResult]) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
      setInternalNotes(notes.map(workflowLogToStageNote))
      const savedState = parseSiteVisitState(stateResult.data)
      if (savedState) {
        setVisit(savedState.visit)
        setChecklist(savedState.checklist)
        setFeedback(savedState.feedback)
      }
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const persistSiteVisitState = async (
    next: Partial<{
      visit: ScheduledVisit | null
      checklist: Record<string, boolean>
      feedback: VisitFeedback | null
    }>,
  ) => {
    const session = readAdminSession()
    if (!session?.accessToken) return
    await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
      channel: 'note',
      direction: 'internal',
      summary: SITE_VISIT_STATE_SUMMARY,
      body: JSON.stringify({
        visit: next.visit !== undefined ? next.visit : visit,
        checklist: next.checklist ?? checklist,
        feedback: next.feedback !== undefined ? next.feedback : feedback,
      }),
    })
  }

  const mapsUrl = useMemo(
    () =>
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        visit?.address ?? deal.propertyLocation,
      )}`,
    [visit?.address, deal.propertyLocation],
  )

  const scheduleVisit = () => {
    if (!canSchedule) return
    const nextVisit = {
      date: visitDate,
      time: visitTime,
      type: visitType,
      meetingLink: visitType === 'virtual' ? meetingLink.trim() : '',
      assignee: visitAssignee,
      notes: visitNotes.trim(),
      address: visitType === 'physical' ? visitAddress : deal.propertyLocation,
      status: 'scheduled',
      rescheduleCount: visit?.rescheduleCount ?? 0,
    } satisfies ScheduledVisit
    setVisit(nextVisit)
    void persistSiteVisitState({ visit: nextVisit }).catch(() => undefined)
    setVisitDate('')
    setVisitTime('')
    setVisitNotes('')
    setShowAnotherVisitForm(false)
  }

  const resetVisitForReschedule = () => {
    setVisit(null)
    setFeedback(null)
    void persistSiteVisitState({ visit: null, feedback: null }).catch(() => undefined)
    setEditingFeedback(false)
    setVisitDate('')
    setVisitTime('')
    setMeetingLink('')
    setVisitAssignee(deal.assignedTo)
    setVisitAddress(deal.propertyLocation)
  }

  const applyReschedule = () => {
    if (!canReschedule || !visit) return
    const count = visit.rescheduleCount + 1
    const nextVisit = {
      ...visit,
      date: rescheduleDate,
      time: rescheduleTime,
      status: visit.status === 'cancelled' ? 'scheduled' : 'scheduled',
      rescheduleCount: count,
      notes: visit.notes
        ? `${visit.notes}\nRescheduled: ${rescheduleReason}`
        : `Rescheduled: ${rescheduleReason}`,
    } satisfies ScheduledVisit
    setVisit(nextVisit)
    void persistSiteVisitState({ visit: nextVisit }).catch(() => undefined)
    setShowRescheduleForm(false)
    setRescheduleDate('')
    setRescheduleTime('')
    setRescheduleReason('')
  }

  const saveFeedback = () => {
    if (!interest || !feedbackNotes.trim()) return
    const nextFeedback = {
      interest,
      notes: feedbackNotes.trim(),
      nextAction,
    }
    setFeedback(nextFeedback)
    void persistSiteVisitState({ feedback: nextFeedback }).catch(() => undefined)
    setEditingFeedback(false)
    if (nextAction === 'another_visit') {
      setShowAnotherVisitForm(true)
      resetVisitForReschedule()
    }
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const log = await createStageCallLog(
      'sales-deal',
      deal.id,
      SITE_VISIT_CALL_SUMMARY_PREFIX,
      new Date(callAt).toISOString(),
      duration,
      callOutcome,
      callNotes.trim(),
    )
    setCallLogs((prev) => [workflowLogToStageCall(log, CALL_OUTCOMES[0]), ...prev])
    setShowCallForm(false)
    setCallDuration('')
    setCallNotes('')
    setCallAt(toDatetimeLocal())
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    const log = await createStageNoteLog('sales-deal', deal.id, SITE_VISIT_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const setFollowUpReminder = async () => {
    const log = await createStageNoteLog(
      'sales-deal',
      deal.id,
      SITE_VISIT_NOTE_SUMMARY,
      'Follow-up reminder set for 3 days from now',
    )
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const renderScheduleForm = (onSubmit: () => void, submitLabel: string) => (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium">Visit date *</label>
        <input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium">Visit time *</label>
        <input
          type="time"
          value={visitTime}
          onChange={(e) => setVisitTime(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Visit type</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={visitType === 'physical' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisitType('physical')}
          >
            Physical
          </Button>
          <Button
            type="button"
            variant={visitType === 'virtual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setVisitType('virtual')}
          >
            Virtual
          </Button>
        </div>
      </div>
      {visitType === 'virtual' ? (
        <div>
          <label className="text-sm font-medium">Meeting link</label>
          <input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://..."
            className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
          {!meetingLink.trim() && (
            <p className="mt-1 text-xs text-orange-700">No meeting link added</p>
          )}
        </div>
      ) : (
        <div>
          <label className="text-sm font-medium">Property address</label>
          <input
            value={visitAddress}
            onChange={(e) => setVisitAddress(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
        </div>
      )}
      <div>
        <label className="text-sm font-medium">Assigned admin</label>
        <select
          value={visitAssignee}
          onChange={(e) => setVisitAssignee(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
        >
          {assigneeOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <textarea
        rows={2}
        value={visitNotes}
        onChange={(e) => setVisitNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
      />
      <Button type="button" disabled={!canSchedule} onClick={onSubmit}>
        {submitLabel}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled Visit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!visit || visitCancelled ? (
            renderScheduleForm(scheduleVisit, visitCancelled ? 'Reschedule Visit' : 'Schedule Visit')
          ) : (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-lg font-semibold text-foreground">
                  {formatVisitDateTime(visit.date, visit.time)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="default" className="capitalize">
                    {visit.type}
                  </Badge>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                      STATUS_STYLES[visit.status],
                    )}
                  >
                    {visit.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Assigned: <span className="font-medium text-foreground">{visit.assignee}</span>
                </p>
                {visit.type === 'physical' && (
                  <div className="mt-2">
                    <p className="flex items-start gap-1 text-sm">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      {visit.address}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="size-3.5" /> Get Directions
                    </Button>
                  </div>
                )}
                {visit.type === 'virtual' && (
                  <div className="mt-2">
                    {visit.meetingLink ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(visit.meetingLink, '_blank', 'noopener,noreferrer')}
                      >
                        Join Call
                      </Button>
                    ) : (
                      <p className="text-sm text-orange-700">No meeting link added</p>
                    )}
                  </div>
                )}
                {visit.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{visit.notes}</p>
                )}
              </div>

              {visit.rescheduleCount > 0 && (
                <p
                  className={cn(
                    'text-sm',
                    visit.rescheduleCount >= 3 ? 'font-medium text-orange-700' : 'text-muted-foreground',
                  )}
                >
                  Rescheduled {visit.rescheduleCount} time{visit.rescheduleCount !== 1 ? 's' : ''}
                  {visit.rescheduleCount >= 3 && ' — Multiple reschedules'}
                </p>
              )}

              {virtualNoLink && visit.type === 'virtual' && (
                <p className="text-sm text-orange-700">No meeting link added</p>
              )}

              {visitIsToday && visit.status !== 'completed' && (
                <>
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                    🗓️ Visit is TODAY at {formatTime12(visit.time)}
                  </div>
                  {checklistIncomplete && (
                    <p className="text-sm text-orange-700">
                      Pre-visit checklist incomplete — complete before the visit.
                    </p>
                  )}
                </>
              )}

              {visitIsOverdue && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
                  <p className="font-medium text-orange-800">⚠️ Visit time has passed</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const nextVisit = { ...visit, status: 'completed' as VisitStatus }
                        setVisit(nextVisit)
                        void persistSiteVisitState({ visit: nextVisit }).catch(() => undefined)
                      }}
                    >
                      Mark Completed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const nextVisit = { ...visit, status: 'missed' as VisitStatus }
                        setVisit(nextVisit)
                        void persistSiteVisitState({ visit: nextVisit }).catch(() => undefined)
                      }}
                    >
                      Mark Missed
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {visitScheduled && (
        <Card>
          <CardHeader>
            <CardTitle>Pre-Visit Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {checklistCount} of {PRE_VISIT_ITEMS.length} completed
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(checklistCount / PRE_VISIT_ITEMS.length) * 100}%` }}
              />
            </div>
            <ul className="space-y-2">
              {PRE_VISIT_ITEMS.map((item) => (
                <li key={item}>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checklist[item]}
                      onChange={(e) => {
                        const nextChecklist = { ...checklist, [item]: e.target.checked }
                        setChecklist(nextChecklist)
                        void persistSiteVisitState({ checklist: nextChecklist }).catch(() => undefined)
                      }}
                      className="size-4 rounded border-border"
                    />
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Post-Visit Feedback</CardTitle>
          {feedback && !editingFeedback && (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                setInterest(feedback.interest)
                setFeedbackNotes(feedback.notes)
                setNextAction(feedback.nextAction)
                setEditingFeedback(true)
              }}
            >
              Edit
            </button>
          )}
        </CardHeader>
        <CardContent>
          {!visitCompleted ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Complete visit to add feedback
            </p>
          ) : feedback && !editingFeedback ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Interest: </span>
                <span className="font-medium">{interestLabel(feedback.interest)}</span>
              </p>
              <p className="rounded-lg bg-muted p-2">{feedback.notes}</p>
              <p>
                <span className="text-muted-foreground">Next action: </span>
                {nextActionLabel(feedback.nextAction)}
              </p>
              {feedback.interest === 'not_interested' && (
                <p className="text-sm text-orange-700">Consider marking as lost</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Buyer interest</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INTEREST_OPTIONS.map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-auto justify-start gap-2 py-2',
                        interest === opt.id && opt.className,
                      )}
                      onClick={() => setInterest(opt.id)}
                    >
                      <span>{opt.emoji}</span>
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {interest === 'not_interested' && (
                  <p className="mt-2 text-sm text-orange-700">Consider marking as lost</p>
                )}
              </div>
              <textarea
                rows={4}
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="How did the visit go?"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div>
                <p className="mb-2 text-sm font-medium">Next action *</p>
                <div className="space-y-2">
                  {(
                    [
                      ['negotiation', 'Move to Negotiation'],
                      ['another_visit', 'Schedule Another Visit'],
                      ['follow_up', 'Follow Up in 3 Days'],
                      ['lost', 'Mark as Lost'],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="nextAction"
                        checked={nextAction === value}
                        onChange={() => setNextAction(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                disabled={!interest || !feedbackNotes.trim()}
                onClick={saveFeedback}
              >
                Save Feedback
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Call Log</CardTitle>
          {!showCallForm && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCallForm(true)}>
              + Log Call
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {showCallForm && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <input
                type="datetime-local"
                value={callAt}
                onChange={(e) => setCallAt(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="flex items-end gap-2">
                <input
                  type="number"
                  min={1}
                  value={callDuration}
                  onChange={(e) => setCallDuration(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-input px-3 text-sm"
                />
                <span className="pb-2 text-sm text-muted-foreground">minutes</span>
              </div>
              <select
                value={callOutcome}
                onChange={(e) => setCallOutcome(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                value={callNotes}
                onChange={(e) => setCallNotes(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveCall}>
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowCallForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {callLogs.length === 0 && !showCallForm && (
            <div className="py-6 text-center">
              <Phone className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No calls logged yet</p>
            </div>
          )}
          {callLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    OUTCOME_STYLES[log.outcome] ?? 'bg-muted text-muted-foreground',
                  )}
                >
                  {log.outcome}
                </span>
                <span className="text-xs text-muted-foreground">
                  {log.duration} min · {formatCallDate(log.calledAt)}
                </span>
              </div>
              {log.notes && <p className="mt-2 text-sm text-muted-foreground">{log.notes}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Internal Notes</CardTitle>
          {!showNoteForm && (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowNoteForm(true)}>
              + Add Note
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {showNoteForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveNote}>
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowNoteForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {internalNotes.length === 0 && !showNoteForm && (
            <div className="py-6 text-center">
              <FileText className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
            </div>
          )}
          {internalNotes.map((note) => (
            <div
              key={note.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{note.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatNoteTime(note.at)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => deleteInternalNote(note.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-t-4 border-primary">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Step</h3>

          {!feedback ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Complete visit and save feedback first
            </p>
          ) : (
            <>
              {feedback.nextAction === 'negotiation' && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    onStageChange('negotiation')
                    navigate('/admin/sales/negotiation')
                  }}
                >
                  💬 Move to Negotiation
                </Button>
              )}
              {feedback.nextAction === 'follow_up' && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={setFollowUpReminder}
                >
                  📅 Set Follow-up Reminder
                </Button>
              )}
              {feedback.nextAction === 'lost' && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    onStageChange('lost')
                    navigate('/admin/sales/lost')
                  }}
                >
                  Mark as Lost
                </Button>
              )}
              {feedback.nextAction === 'another_visit' && showAnotherVisitForm && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-2 text-sm font-medium">Schedule another visit</p>
                  {renderScheduleForm(scheduleVisit, 'Schedule Visit')}
                </div>
              )}
            </>
          )}

          {showRescheduleForm ? (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Reschedule visit</p>
              <input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <input
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <select
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                <option value="">Reason</option>
                {rescheduleReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={!canReschedule} onClick={applyReschedule}>
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRescheduleForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowRescheduleForm(true)}
            >
              🔄 Reschedule Visit
            </Button>
          )}

          {showCancelConfirm ? (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/30 p-3">
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Cancellation reason"
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!cancelReason.trim()}
                  onClick={() => {
                    if (visit) {
                      const nextVisit = { ...visit, status: 'cancelled' as VisitStatus, notes: cancelReason.trim() }
                      setVisit(nextVisit)
                      void persistSiteVisitState({ visit: nextVisit }).catch(() => undefined)
                    }
                    setShowCancelConfirm(false)
                    setCancelReason('')
                  }}
                >
                  Confirm Cancel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelConfirm(false)}
                >
                  Back
                </Button>
              </div>
            </div>
          ) : (
            visit &&
            (visit.status === 'scheduled' || visit.status === 'confirmed') && (
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setShowCancelConfirm(true)}
              >
                ❌ Cancel Visit
              </Button>
            )
          )}
        </CardContent>
      </Card>
    </div>
  )
}
