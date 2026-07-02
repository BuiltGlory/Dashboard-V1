import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Calendar, FileText, Phone, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import {
  createWorkflowLog,
  deleteWorkflowLog,
  listWorkflowLogs,
  type WorkflowLog,
} from '@/api/adminWorkflow'
import { cn } from '@/lib/utils'
import { hoursSince } from '@/utils/timer'

export interface ActiveLeadsStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type BuyerIntent = 'very_interested' | 'interested' | 'needs_time' | 'browsing'
type VisitType = 'physical' | 'virtual'

interface QualificationData {
  intent: BuyerIntent
  budgetMin: string
  budgetMax: string
  timeline: string
  financing: string
  notes: string
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

const ACTIVE_LEADS_CALL_SUMMARY_PREFIX = 'Sales active leads call'
const ACTIVE_LEADS_NOTE_SUMMARY = 'Sales active leads note'

const OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

const INTENT_OPTIONS: { id: BuyerIntent; label: string; emoji: string; className: string }[] = [
  { id: 'very_interested', label: 'Very Interested', emoji: '🔥', className: 'border-green-300 bg-green-50 text-green-800' },
  { id: 'interested', label: 'Interested', emoji: '👍', className: 'border-blue-300 bg-blue-50 text-blue-800' },
  { id: 'needs_time', label: 'Needs Time', emoji: '🤔', className: 'border-orange-300 bg-orange-50 text-orange-800' },
  { id: 'browsing', label: 'Just Browsing', emoji: '👎', className: 'border-border bg-muted text-muted-foreground' },
]

const TIMELINE_OPTIONS = [
  'Immediate (within 1 month)',
  'Short term (1-3 months)',
  'Medium term (3-6 months)',
  'Long term (6+ months)',
  'Not decided',
] as const

const FINANCING_OPTIONS = ['Self funded', 'Bank loan', 'Partial loan', 'Not decided'] as const

const ENQUIRY_TYPES = ['Schedule Visit', 'Price Negotiation', 'More Details'] as const

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

function formatSubmittedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function workflowLogToCallEntry(log: WorkflowLog): CallLogEntry {
  return {
    id: log.id,
    calledAt: log.occurredAt,
    duration: log.durationMinutes ?? 1,
    outcome: log.outcome || CALL_OUTCOMES[0],
    notes: log.body || '',
  }
}

function workflowLogToNoteEntry(log: WorkflowLog): NoteEntry {
  return {
    id: log.id,
    text: log.body || '',
    at: log.occurredAt || log.createdAt,
  }
}

function enquirySummaryForDeal(deal: SalesDeal) {
  const hasVisit = deal.sourceEnquiryId != null
  return {
    types: hasVisit
      ? ['Schedule Visit', 'More Details']
      : ['Price Negotiation'],
    preferredVisitTime: null,
    message: hasVisit
      ? `Hi, I'm interested in ${deal.propertyTitle}. Can we schedule a visit this week?`
      : null,
    submittedAt: deal.createdAt,
  }
}

function intentLabel(intent: BuyerIntent) {
  return INTENT_OPTIONS.find((o) => o.id === intent)?.label ?? intent
}

export function ActiveLeadsStage({ deal, onStageChange }: ActiveLeadsStageProps) {
  const navigate = useNavigate()
  const enquiry = useMemo(() => enquirySummaryForDeal(deal), [deal])
  const assigneeOptions = useMemo(
    () => [deal.assignedTo].filter((name) => name && name !== 'Unassigned'),
    [deal.assignedTo],
  )

  const [qualification, setQualification] = useState<QualificationData | null>(null)
  const [editingQualification, setEditingQualification] = useState(true)
  const [intent, setIntent] = useState<BuyerIntent | null>(null)
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [timeline, setTimeline] = useState('')
  const [financing, setFinancing] = useState('Not decided')
  const [qualNotes, setQualNotes] = useState('')

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [visitType, setVisitType] = useState<VisitType>('physical')
  const [meetingLink, setMeetingLink] = useState('')
  const [visitAssignee, setVisitAssignee] = useState(deal.assignedTo)
  const [visitNotes, setVisitNotes] = useState('')

  const [showSendModal, setShowSendModal] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const [showLostConfirm, setShowLostConfirm] = useState(false)

  const daysSinceCreated = hoursSince(deal.createdAt) / 24
  const noContactYet = callLogs.length === 0
  const followUpNeeded = daysSinceCreated > 3 && noContactYet
  const staleLead = daysSinceCreated > 7
  const budgetMaxNum = Number((qualification?.budgetMax || budgetMax).replace(/,/g, ''))
  const budgetBelowPrice =
    Number.isFinite(budgetMaxNum) && budgetMaxNum > 0 && budgetMaxNum < deal.propertyPrice

  const visitDatePast =
    visitDate && new Date(`${visitDate}T12:00:00`) < new Date(new Date().toDateString())

  const virtualNoLink = visitType === 'virtual' && showVisitForm && !meetingLink.trim()

  const canSaveQualification = intent != null && timeline !== ''

  const canConfirmVisit =
    visitDate &&
    visitTime &&
    visitAssignee &&
    (visitType === 'physical' || meetingLink.trim())

  const propertyMessage = `Hi ${deal.buyerName}, here are the details for ${deal.propertyTitle}:\nPrice: ${formatPrice(deal.propertyPrice)}\nLocation: ${deal.propertyLocation}\nView more details on the Builtglory app.`

  const saveQualification = () => {
    if (!canSaveQualification || !intent) return
    setQualification({
      intent,
      budgetMin,
      budgetMax,
      timeline,
      financing,
      notes: qualNotes.trim(),
    })
    setEditingQualification(false)
  }

  const loadQualificationIntoForm = (q: QualificationData) => {
    setIntent(q.intent)
    setBudgetMin(q.budgetMin)
    setBudgetMax(q.budgetMax)
    setTimeline(q.timeline)
    setFinancing(q.financing)
    setQualNotes(q.notes)
  }

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !deal.id) {
      setCallLogs([])
      setInternalNotes([])
      return
    }
    let cancelled = false
    void Promise.all([
      listWorkflowLogs(session.accessToken, 'sales-deal', deal.id, 'call').catch(() => ({ data: [] as WorkflowLog[] })),
      listWorkflowLogs(session.accessToken, 'sales-deal', deal.id, 'note').catch(() => ({ data: [] as WorkflowLog[] })),
    ]).then(([callResult, noteResult]) => {
      if (cancelled) return
      setCallLogs(
        callResult.data
          .filter((log) => log.summary.startsWith(ACTIVE_LEADS_CALL_SUMMARY_PREFIX))
          .map(workflowLogToCallEntry),
      )
      setInternalNotes(
        noteResult.data
          .filter((log) => log.summary === ACTIVE_LEADS_NOTE_SUMMARY)
          .map(workflowLogToNoteEntry),
      )
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      window.alert('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `${ACTIVE_LEADS_CALL_SUMMARY_PREFIX}: ${callOutcome}`,
        body: callNotes.trim(),
        outcome: callOutcome,
        durationMinutes: duration,
        occurredAt: new Date(callAt).toISOString(),
      })
      setCallLogs((prev) => [workflowLogToCallEntry(saved), ...prev])
      setShowCallForm(false)
      setCallDuration('')
      setCallNotes('')
      setCallAt(toDatetimeLocal())
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save call log')
    }
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      window.alert('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'note',
        direction: 'internal',
        summary: ACTIVE_LEADS_NOTE_SUMMARY,
        body: noteText.trim(),
      })
      setInternalNotes((prev) => [workflowLogToNoteEntry(saved), ...prev])
      setNoteText('')
      setShowNoteForm(false)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not save internal note')
    }
  }

  const deleteInternalNote = async (noteId: string) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      window.alert('Admin session expired. Please sign in again.')
      return
    }
    try {
      await deleteWorkflowLog(session.accessToken, noteId)
      setInternalNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not delete internal note')
    }
  }

  const confirmVisit = () => {
    if (!canConfirmVisit) return
    onStageChange('site_visits')
    navigate('/admin/sales/visits')
  }

  const sendPropertyInfo = () => {
    const tel = phoneForTel(deal.buyerPhone)
    if (sendWhatsApp) {
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(propertyMessage)}`,
        '_blank',
      )
    }
    if (sendEmail && deal.buyerEmail) {
      window.open(
        `mailto:${deal.buyerEmail}?subject=${encodeURIComponent(`Property details — ${deal.propertyTitle}`)}&body=${encodeURIComponent(propertyMessage)}`,
        '_self',
      )
    }
    setShowSendModal(false)
  }

  return (
    <div className="space-y-4">
      {followUpNeeded && !staleLead && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span className="font-medium">Follow up needed</span> — no contact in {Math.floor(daysSinceCreated)} days
        </div>
      )}

      {staleLead && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Stale Lead 🔴</span>
          <Button size="sm" variant="outline" onClick={() => onStageChange('lost', { lostReason: 'Stale lead' })}>
            Mark as Lost
          </Button>
        </div>
      )}

      {budgetBelowPrice && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Buyer budget ({formatPrice(budgetMaxNum)}) is below property price ({formatPrice(deal.propertyPrice)}) — gap{' '}
          {formatPrice(deal.propertyPrice - budgetMaxNum)}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Buyer Enquiry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {ENQUIRY_TYPES.map((type) => (
              <Badge
                key={type}
                variant={enquiry.types.includes(type) ? 'blue' : 'default'}
                className={cn(!enquiry.types.includes(type) && 'opacity-40')}
              >
                {type}
              </Badge>
            ))}
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {enquiry.preferredVisitTime ? (
              <span>{formatCallDate(enquiry.preferredVisitTime)}</span>
            ) : (
              <span className="italic text-muted-foreground">No preference</span>
            )}
          </div>

          {enquiry.message ? (
            <p className="rounded-lg bg-muted p-3 text-sm">{enquiry.message}</p>
          ) : (
            <p className="italic text-muted-foreground">No message provided</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="blue">Via App</Badge>
            <span className="text-muted-foreground">
              Submitted: {formatSubmittedDate(enquiry.submittedAt)}
            </span>
          </div>

          {deal.sourceEnquiryId && (
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate(`/admin/enquiries/buy/${deal.sourceEnquiryId}`)}
            >
              View Original Enquiry →
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Lead Qualification</CardTitle>
          {qualification && !editingQualification && (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                loadQualificationIntoForm(qualification)
                setEditingQualification(true)
              }}
            >
              Edit
            </button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {qualification && !editingQualification ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Buyer intent: </span>
                <span className="font-medium">{intentLabel(qualification.intent)}</span>
              </p>
              {(qualification.budgetMin || qualification.budgetMax) && (
                <p>
                  <span className="text-muted-foreground">Budget: </span>
                  {qualification.budgetMin && formatPrice(Number(qualification.budgetMin))}
                  {qualification.budgetMin && qualification.budgetMax && ' – '}
                  {qualification.budgetMax && formatPrice(Number(qualification.budgetMax))}
                </p>
              )}
              <p>
                <span className="text-muted-foreground">Timeline: </span>
                {qualification.timeline}
              </p>
              <p>
                <span className="text-muted-foreground">Financing: </span>
                {qualification.financing}
              </p>
              {qualification.notes && (
                <p className="rounded-lg bg-muted p-2 text-muted-foreground">{qualification.notes}</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-medium">Buyer intent *</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {INTENT_OPTIONS.map((opt) => (
                    <Button
                      key={opt.id}
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-auto justify-start gap-2 py-2 text-left',
                        intent === opt.id && opt.className,
                      )}
                      onClick={() => setIntent(opt.id)}
                    >
                      <span>{opt.emoji}</span>
                      {opt.label}
                    </Button>
                  ))}
                </div>
                {intent === 'browsing' && (
                  <p className="mt-2 text-sm text-orange-700">
                    Consider marking as lost — buyer may not be ready to purchase.
                  </p>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Budget range</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min ₹"
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    className="h-9 rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Max ₹"
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    className="h-9 rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Buyer&apos;s stated budget</p>
                {budgetBelowPrice && (
                  <p className="mt-1 text-sm text-orange-700">Budget below listed price</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Timeline *</label>
                <select
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                >
                  <option value="">Select timeline</option>
                  {TIMELINE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Financing</p>
                <div className="space-y-2">
                  {FINANCING_OPTIONS.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="financing"
                        checked={financing === f}
                        onChange={() => setFinancing(f)}
                      />
                      {f}
                    </label>
                  ))}
                </div>
              </div>

              <textarea
                rows={3}
                value={qualNotes}
                onChange={(e) => setQualNotes(e.target.value)}
                placeholder="Any other qualification notes..."
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />

              <Button type="button" disabled={!canSaveQualification} onClick={saveQualification}>
                Save Qualification
              </Button>
            </>
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
                onClick={() => void deleteInternalNote(note.id)}
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

          {!showVisitForm ? (
            <Button
              type="button"
              className="mb-3 w-full"
              onClick={() => setShowVisitForm(true)}
            >
              📅 Schedule Site Visit
            </Button>
          ) : (
            <div className="mb-3 space-y-3 rounded-lg border border-border p-3">
              <div>
                <label className="text-sm font-medium">Visit date *</label>
                <input
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
                {visitDatePast && (
                  <p className="mt-1 text-xs text-orange-700">Date is in the past</p>
                )}
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
                  {virtualNoLink && (
                    <p className="mt-1 text-xs text-orange-700">
                      Add meeting link for virtual visit
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Property address: {deal.propertyLocation}
                </p>
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
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={!canConfirmVisit} onClick={confirmVisit}>
                  Confirm Visit
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVisitForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="mb-3 w-full"
            onClick={() => setShowSendModal(true)}
          >
            📤 Send Property Details to Buyer
          </Button>

          {showLostConfirm ? (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm">
              <p>Mark this lead as not interested and move to Lost?</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onStageChange('lost')
                    navigate('/admin/sales/lost')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLostConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowLostConfirm(true)}
            >
              👎 Mark as Not Interested
            </Button>
          )}
        </CardContent>
      </Card>

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Send property details</h4>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {propertyMessage}
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendWhatsApp}
                onChange={(e) => setSendWhatsApp(e.target.checked)}
              />
              WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
              />
              Email
            </label>
            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" onClick={sendPropertyInfo}>
                Send
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSendModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
