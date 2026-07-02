import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronDown, ChevronUp, FileText, Phone, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  updateAdminSalesDealPaymentPlan,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import { getAdminDesigners, type Designer } from '@/api/adminEnquiries'
import { uploadWorkflowProof } from '@/api/adminWorkflow'
import { cn } from '@/lib/utils'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface InteriorDesignStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type QuoteStatus = 'pending' | 'sent' | 'accepted' | 'negotiating' | 'declined'
type PaymentMethod = 'cash' | 'neft' | 'upi' | 'cheque'
type MilestoneStatus = 'pending' | 'in_progress' | 'paid' | 'overdue'

interface InteriorRequest {
  rooms: string[]
  style: string
  budget: string
  notes: string | null
}

interface InteriorQuote {
  packageName: string
  amount: number
  timelineWeeks: number
  inclusions: string
  terms: string
  status: QuoteStatus
}

interface PaymentMilestone {
  id: string
  name: string
  pct: number
  amount: number
  dueDate: string
  status: MilestoneStatus
  paidAmount: number | null
  payment?: Record<string, unknown>
}

interface WorkPhase {
  id: string
  label: string
  done: boolean
  note: string
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

const INTERIOR_MILESTONE_TEMPLATE = [
  { id: 'consult', name: 'Design Consultation', pct: 25 },
  { id: 'materials', name: 'Material Selection', pct: 25 },
  { id: 'execution', name: 'Work Execution', pct: 35 },
  { id: 'handover', name: 'Final Handover', pct: 15 },
] as const

const WORK_PHASE_LABELS = [
  'Design approved by buyer',
  'Materials ordered',
  'Work in progress',
  'Work completed',
  'Final inspection done',
  'Buyer sign-off received',
] as const

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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  neft: 'NEFT',
  upi: 'UPI',
  cheque: 'Cheque',
}

const INTERIOR_CALL_SUMMARY_PREFIX = 'Sales interior design call'
const INTERIOR_NOTE_SUMMARY = 'Sales interior design note'
const INTERIOR_PROOF_SUMMARY = 'Sales interior design payment proof'

const QUOTE_STATUS_BADGE: Record<
  QuoteStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'bg-muted text-muted-foreground' },
  sent: { label: 'Sent', className: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', className: 'bg-green-100 text-green-700' },
  negotiating: { label: 'Negotiating', className: 'bg-orange-100 text-orange-700' },
  declined: { label: 'Declined', className: 'bg-red-100 text-red-700' },
}

const MILESTONE_STATUS: Record<MilestoneStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'text-blue-700' },
  paid: { label: 'Paid', className: 'text-green-700' },
  overdue: { label: 'Overdue', className: 'text-red-700' },
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

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

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberOf(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isQuoteStatus(value: unknown): value is QuoteStatus {
  return value === 'pending' || value === 'sent' || value === 'accepted' || value === 'negotiating' || value === 'declined'
}

function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return value === 'pending' || value === 'in_progress' || value === 'paid' || value === 'overdue'
}

function quoteFromRecord(value: unknown): InteriorQuote | null {
  const record = objectOf(value)
  if (Object.keys(record).length === 0) return null
  return {
    packageName: stringOf(record.packageName),
    amount: numberOf(record.amount),
    timelineWeeks: numberOf(record.timelineWeeks),
    inclusions: stringOf(record.inclusions),
    terms: stringOf(record.terms),
    status: isQuoteStatus(record.status) ? record.status : 'pending',
  }
}

function milestonesFromRecord(value: unknown): PaymentMilestone[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = objectOf(item)
    return {
      id: stringOf(record.id),
      name: stringOf(record.name),
      pct: numberOf(record.pct),
      amount: numberOf(record.amount),
      dueDate: stringOf(record.dueDate),
      status: isMilestoneStatus(record.status) ? record.status : 'pending',
      paidAmount: record.paidAmount == null ? null : numberOf(record.paidAmount),
      payment: objectOf(record.payment),
    }
  })
}

function interiorRequestFromRecord(value: unknown): InteriorRequest | null {
  const record = objectOf(value)
  if (Object.keys(record).length === 0) return null
  return {
    rooms: Array.isArray(record.rooms) ? record.rooms.map(String).filter(Boolean) : [],
    style: stringOf(record.style),
    budget: stringOf(record.budget),
    notes: record.notes == null ? null : stringOf(record.notes),
  }
}

function isOverdue(dueDate: string) {
  if (!dueDate) return false
  return new Date(`${dueDate}T12:00:00`) < new Date(`${todayIsoDate()}T12:00:00`)
}

function buildMilestones(total: number): PaymentMilestone[] {
  return INTERIOR_MILESTONE_TEMPLATE.map((t, i) => ({
    id: t.id,
    name: t.name,
    pct: t.pct,
    amount: Math.round((total * t.pct) / 100),
    dueDate: '',
    status: i === 0 ? 'in_progress' : 'pending',
    paidAmount: null,
  }))
}

function resolveMilestoneStatus(m: PaymentMilestone): MilestoneStatus {
  if (m.status === 'paid') return 'paid'
  if (isOverdue(m.dueDate)) return 'overdue'
  if (m.status === 'in_progress') return 'in_progress'
  return 'pending'
}

function initialWorkPhases(): WorkPhase[] {
  return WORK_PHASE_LABELS.map((label, i) => ({
    id: `wp-${i}`,
    label,
    done: false,
    note: '',
  }))
}

export function InteriorDesignStage({ deal, onStageChange }: InteriorDesignStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [interiorRequest, setInteriorRequest] = useState<InteriorRequest | null>(null)
  const [designers, setDesigners] = useState<Designer[]>([])

  const [designerId, setDesignerId] = useState('')
  const [assignedDesignerId, setAssignedDesignerId] = useState<string | null>(null)
  const [consultationAt, setConsultationAt] = useState('')
  const [scheduledConsultation, setScheduledConsultation] = useState<string | null>(null)
  const [editingConsultation, setEditingConsultation] = useState(false)

  const [quote, setQuote] = useState<InteriorQuote | null>(null)
  const [editingQuote, setEditingQuote] = useState(false)
  const [packageName, setPackageName] = useState('')
  const [quoteAmount, setQuoteAmount] = useState('')
  const [timelineWeeks, setTimelineWeeks] = useState('')
  const [inclusions, setInclusions] = useState('')
  const [terms, setTerms] = useState('')
  const [negotiationNotes, setNegotiationNotes] = useState('')
  const [showNegotiateForm, setShowNegotiateForm] = useState(false)

  const [milestones, setMilestones] = useState<PaymentMilestone[]>([])
  const [recordingMilestoneId, setRecordingMilestoneId] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<PaymentMethod | null>(null)
  const [payReference, setPayReference] = useState('')
  const [payProofUrl, setPayProofUrl] = useState<string | null>(null)
  const [payProofFile, setPayProofFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)

  const [workPhases, setWorkPhases] = useState<WorkPhase[]>(initialWorkPhases)
  const [expandedPhaseId, setExpandedPhaseId] = useState<string | null>(null)

  const [showSendQuoteModal, setShowSendQuoteModal] = useState(false)
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false)
  const [showSkipConfirm, setShowSkipConfirm] = useState(false)
  const [showDocConfirm, setShowDocConfirm] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    const saved = objectOf(deal.interiorDesign)
    const savedRequest = interiorRequestFromRecord(saved.request)
    const savedQuote = quoteFromRecord(saved.quote)
    const savedMilestones = milestonesFromRecord(saved.milestones)
    setInteriorRequest(savedRequest)
    setAssignedDesignerId(stringOf(saved.assignedDesignerId) || null)
    setDesignerId(stringOf(saved.assignedDesignerId))
    setScheduledConsultation(stringOf(saved.scheduledConsultationAt) || null)
    if (savedQuote) {
      setQuote(savedQuote)
      setEditingQuote(false)
    }
    if (savedMilestones.length > 0) setMilestones(savedMilestones)
    if (Array.isArray(saved.workPhases)) {
      setWorkPhases(
        saved.workPhases.map((item, index) => {
          const phase = objectOf(item)
          return {
            id: stringOf(phase.id, `wp-${index}`),
            label: stringOf(phase.label, WORK_PHASE_LABELS[index] ?? `Phase ${index + 1}`),
            done: Boolean(phase.done),
            note: stringOf(phase.note),
          }
        }),
      )
    }
  }, [deal.interiorDesign])

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setDesigners([])
      return
    }
    let cancelled = false
    void getAdminDesigners(session.accessToken)
      .then((items) => {
        if (!cancelled) setDesigners(items.filter((designer) => designer.isAvailable))
      })
      .catch(() => {
        if (!cancelled) setDesigners([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'sales-deal',
      deal.id,
      INTERIOR_CALL_SUMMARY_PREFIX,
      INTERIOR_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
      setInternalNotes(notes.map(workflowLogToStageNote))
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const assignedDesigner = designers.find((d) => d.id === assignedDesignerId)
  const quoteAccepted = quote?.status === 'accepted'
  const quoteSent = quote?.status === 'sent'
  const quoteDeclined = quote?.status === 'declined'
  const quoteNegotiating = quote?.status === 'negotiating'

  const amountNum = Number(quoteAmount.replace(/,/g, ''))
  const canCreateQuote =
    packageName.trim() &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    Number(timelineWeeks) > 0 &&
    inclusions.trim()

  const paidInterior = useMemo(
    () => milestones.reduce((sum, m) => sum + (m.paidAmount ?? 0), 0),
    [milestones],
  )

  const quoteTotal = quote?.amount ?? 0
  const allPaymentsDone =
    milestones.length > 0 && milestones.every((m) => m.status === 'paid')
  const workCompletedCount = workPhases.filter((p) => p.done).length
  const allWorkDone = workCompletedCount === WORK_PHASE_LABELS.length

  const displayMilestones = useMemo(
    () =>
      milestones.map((m) => ({
        ...m,
        displayStatus: resolveMilestoneStatus(m),
      })),
    [milestones],
  )

  const progressPct =
    quoteTotal > 0 ? Math.min(100, Math.round((paidInterior / quoteTotal) * 100)) : 0

  const sendQuoteMessage = quote
    ? `Hi ${deal.buyerName}, your interior design quote is ready:\nPackage: ${quote.packageName}\nAmount: ${formatPrice(quote.amount)}\nTimeline: ${quote.timelineWeeks} weeks\nPlease check the Builtglory app to accept or negotiate.`
    : ''

  const warnings = useMemo(() => {
    const list: { text: string; tone: 'orange' | 'soft' }[] = []
    if (!assignedDesignerId) {
      list.push({ text: 'No designer assigned', tone: 'orange' })
    }
    if (assignedDesignerId && !scheduledConsultation) {
      list.push({ text: 'Consultation not scheduled yet', tone: 'soft' })
    }
    if (quoteAccepted && allWorkDone && !allPaymentsDone) {
      list.push({ text: 'Work done but payment pending', tone: 'orange' })
    }
    if (quoteAccepted && allPaymentsDone && !allWorkDone) {
      list.push({
        text: 'Payment received but work not marked complete',
        tone: 'orange',
      })
    }
    return list
  }, [
    assignedDesignerId,
    scheduledConsultation,
    quoteAccepted,
    allWorkDone,
    allPaymentsDone,
  ])

  const needsReference = payMethod === 'neft' || payMethod === 'upi'
  const canSavePayment =
    payMethod != null && payProofUrl != null && (!needsReference || payReference.trim())

  const persistInteriorDesign = useCallback(
    async (
      next: Partial<{
        assignedDesignerId: string | null
        scheduledConsultationAt: string | null
        request: InteriorRequest | null
        quote: InteriorQuote | null
        milestones: PaymentMilestone[]
        workPhases: WorkPhase[]
      }> = {},
    ) => {
      const session = readAdminSession()
      if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
      const nextQuote = next.quote !== undefined ? next.quote : quote
      const nextMilestones = next.milestones ?? milestones
      const nextWorkPhases = next.workPhases ?? workPhases
      const nextAssignedDesignerId =
        next.assignedDesignerId !== undefined ? next.assignedDesignerId : assignedDesignerId
      const nextScheduledConsultation =
        next.scheduledConsultationAt !== undefined ? next.scheduledConsultationAt : scheduledConsultation
      const nextRequest = next.request !== undefined ? next.request : interiorRequest
      const saved = await updateAdminSalesDealPaymentPlan(session.accessToken, deal.id, {
        interiorDesign: {
          assignedDesignerId: nextAssignedDesignerId,
          scheduledConsultationAt: nextScheduledConsultation,
          request: nextRequest,
          quote: nextQuote,
          milestones: nextMilestones,
          workPhases: nextWorkPhases,
          totalPaid: nextMilestones.reduce((sum, m) => sum + (m.paidAmount ?? 0), 0),
        },
      })
      onStageChange(deal.stage, { interiorDesign: saved.interiorDesign })
    },
    [assignedDesignerId, deal.id, deal.stage, interiorRequest, milestones, onStageChange, quote, scheduledConsultation, workPhases],
  )

  const loadQuoteIntoForm = (q: InteriorQuote) => {
    setPackageName(q.packageName)
    setQuoteAmount(String(q.amount))
    setTimelineWeeks(String(q.timelineWeeks))
    setInclusions(q.inclusions)
    setTerms(q.terms)
  }

  const createOrUpdateQuote = () => {
    if (!canCreateQuote) return
    const next: InteriorQuote = {
      packageName: packageName.trim(),
      amount: amountNum,
      timelineWeeks: Number(timelineWeeks),
      inclusions: inclusions.trim(),
      terms: terms.trim(),
      status: quote?.status === 'negotiating' ? 'negotiating' : 'pending',
    }
    setQuote(next)
    setEditingQuote(false)
    if (next.status === 'accepted' || quote?.status === 'accepted') {
      const nextMilestones = buildMilestones(next.amount)
      setMilestones(nextMilestones)
      void persistInteriorDesign({ quote: next, milestones: nextMilestones }).catch(() => undefined)
    } else {
      void persistInteriorDesign({ quote: next }).catch(() => undefined)
    }
  }

  const acceptQuote = () => {
    if (!quote) return
    const nextQuote = { ...quote, status: 'accepted' as QuoteStatus }
    const nextMilestones = buildMilestones(quote.amount)
    setQuote(nextQuote)
    setMilestones(nextMilestones)
    setShowNegotiateForm(false)
    void persistInteriorDesign({ quote: nextQuote, milestones: nextMilestones }).catch(() => undefined)
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const log = await createStageCallLog(
      'sales-deal',
      deal.id,
      INTERIOR_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('sales-deal', deal.id, INTERIOR_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const recordMilestonePayment = async (milestoneId: string) => {
    if (!canSavePayment || !payMethod) return
    const ms = milestones.find((m) => m.id === milestoneId)
    if (!ms) return

    setProofUploading(true)
    try {
      const session = readAdminSession()
      if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
      let uploadedProofUrl = payProofUrl
      let proofLogId: string | null = null
      if (payProofFile) {
        const proofLog = await uploadWorkflowProof(session.accessToken, 'sales-deal', deal.id, payProofFile, {
          summary: INTERIOR_PROOF_SUMMARY,
          notes: `${ms.name}: ${payReference.trim()}`,
        })
        proofLogId = proofLog.id
        uploadedProofUrl = proofLog.attachments[0]?.url || uploadedProofUrl
      }
      const updated = milestones.map((m) => {
        if (m.id !== milestoneId) return m
        return {
          ...m,
          status: 'paid' as MilestoneStatus,
          paidAmount: m.amount,
          payment: {
            method: payMethod,
            reference: needsReference ? payReference.trim() : null,
            proofUrl: uploadedProofUrl,
            proofLogId,
            paidAt: new Date().toISOString(),
          },
        }
      })
      const nextIdx = updated.findIndex((m) => m.status !== 'paid')
      const nextMilestones =
        nextIdx >= 0
          ? updated.map((m, i) =>
          i === nextIdx ? { ...m, status: 'in_progress' as MilestoneStatus } : m,
        )
          : updated
      setMilestones(nextMilestones)
      await persistInteriorDesign({ milestones: nextMilestones })
      setRecordingMilestoneId(null)
      setPayMethod(null)
      setPayReference('')
      setPayProofUrl(null)
      setPayProofFile(null)
    } finally {
      setProofUploading(false)
    }
  }

  const showQuoteForm = !quote || editingQuote

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((w) => (
            <p
              key={w.text}
              className={cn(
                'rounded-lg px-3 py-2 text-sm',
                w.tone === 'orange'
                  ? 'bg-orange-50 text-orange-800'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {w.text}
            </p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Interior Design Request</CardTitle>
        </CardHeader>
        <CardContent>
          {interiorRequest ? (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Selected rooms
                </p>
                <div className="flex flex-wrap gap-2">
                  {interiorRequest.rooms.map((room) => (
                    <Badge key={room} variant="default">
                      {room}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                  {interiorRequest.style}
                </Badge>
                <Badge variant="blue">{interiorRequest.budget}</Badge>
              </div>
              {interiorRequest.notes && (
                <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {interiorRequest.notes}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Source: app INT-04</p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">No interior request details</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Buyer expressed interest via app
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign Designer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!assignedDesigner ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className="text-sm font-medium">Select designer</label>
                <select
                  value={designerId}
                  onChange={(e) => setDesignerId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                >
                  <option value="">Choose…</option>
                  {designers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.specialization[0] || d.role || 'Designer'})
                    </option>
                  ))}
                </select>
                {designers.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">No available designers found.</p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!designerId}
                onClick={() => {
                  setAssignedDesignerId(designerId)
                  void persistInteriorDesign({ assignedDesignerId: designerId }).catch(() => undefined)
                }}
              >
                Assign
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{assignedDesigner.name}</span>
              <Badge variant="default">{assignedDesigner.specialization[0] || assignedDesigner.role || 'Designer'}</Badge>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setAssignedDesignerId(null)
                  setDesignerId('')
                  void persistInteriorDesign({ assignedDesignerId: null }).catch(() => undefined)
                }}
              >
                Change Designer
              </button>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">Consultation scheduled</p>
            {scheduledConsultation && !editingConsultation ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  {formatCallDate(scheduledConsultation)}
                </span>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setConsultationAt(toDatetimeLocal(new Date(scheduledConsultation)))
                    setEditingConsultation(true)
                  }}
                >
                  Reschedule
                </button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  type="datetime-local"
                  value={consultationAt}
                  onChange={(e) => setConsultationAt(e.target.value)}
                  className="h-9 flex-1 rounded-md border border-border bg-input px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!consultationAt}
                  onClick={() => {
                    const nextConsultation = new Date(consultationAt).toISOString()
                    setScheduledConsultation(nextConsultation)
                    setEditingConsultation(false)
                    void persistInteriorDesign({ scheduledConsultationAt: nextConsultation }).catch(() => undefined)
                  }}
                >
                  Schedule Consultation
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interior Quote</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {showQuoteForm ? (
            <>
              <div>
                <label className="text-sm font-medium">Package name *</label>
                <input
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="e.g. Premium Interior Package"
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Total quote amount (₹) *</label>
                  <input
                    type="number"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Timeline (weeks) *</label>
                  <input
                    type="number"
                    min={1}
                    value={timelineWeeks}
                    onChange={(e) => setTimelineWeeks(e.target.value)}
                    placeholder="8"
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Inclusions *</label>
                <textarea
                  rows={3}
                  value={inclusions}
                  onChange={(e) => setInclusions(e.target.value)}
                  placeholder="List what's included in the package"
                  className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Terms (optional)</label>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Payment terms, warranty etc"
                  className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={!canCreateQuote}
                onClick={createOrUpdateQuote}
              >
                {quote ? 'Update Quote' : 'Create Quote'}
              </Button>
            </>
          ) : quote ? (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{quote.packageName}</p>
                  <p className="text-xl font-bold text-primary">
                    {formatPrice(quote.amount)}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-medium',
                    QUOTE_STATUS_BADGE[quote.status].className,
                  )}
                >
                  {QUOTE_STATUS_BADGE[quote.status].label}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Timeline: {quote.timelineWeeks} weeks
              </p>
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Inclusions
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{quote.inclusions}</p>
              </div>
              {quote.terms && (
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">Terms</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {quote.terms}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {quote.status !== 'declined' && quote.status !== 'accepted' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSendQuoteModal(true)}
                  >
                    Send Quote to Buyer
                  </Button>
                )}
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    loadQuoteIntoForm(quote)
                    setEditingQuote(true)
                  }}
                >
                  Edit Quote
                </button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showSendQuoteModal && quote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Send quote to buyer</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {sendQuoteMessage}
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
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const tel = phoneForTel(deal.buyerPhone)
                  if (sendWhatsApp) {
                    window.open(
                      `https://wa.me/${tel}?text=${encodeURIComponent(sendQuoteMessage)}`,
                      '_blank',
                    )
                  }
                  if (sendEmail && deal.buyerEmail) {
                    window.open(
                      `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('Interior design quote')}&body=${encodeURIComponent(sendQuoteMessage)}`,
                      '_self',
                    )
                  }
                  const nextQuote = quote ? { ...quote, status: 'sent' as QuoteStatus } : null
                  setQuote(nextQuote)
                  void persistInteriorDesign({ quote: nextQuote }).catch(() => undefined)
                  setShowSendQuoteModal(false)
                }}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSendQuoteModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {quoteAccepted && milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Interior Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {displayMilestones.map((m) => {
              const meta = MILESTONE_STATUS[m.displayStatus]
              const isRecording = recordingMilestoneId === m.id
              const canRecord =
                (m.status === 'in_progress' || m.displayStatus === 'overdue') &&
                m.status !== 'paid'

              return (
                <div key={m.id} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {m.name}{' '}
                        <span className="text-muted-foreground">({m.pct}%)</span>
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          value={m.amount}
                          disabled={m.status === 'paid'}
                          onChange={(e) => {
                            const val = Number(e.target.value)
                            const nextMilestones = milestones.map((row) =>
                              row.id === m.id && Number.isFinite(val)
                                ? { ...row, amount: val }
                                : row,
                            )
                            setMilestones(nextMilestones)
                            void persistInteriorDesign({ milestones: nextMilestones }).catch(() => undefined)
                          }}
                          className="h-8 w-32 rounded-md border border-border bg-input px-2 text-sm"
                        />
                        <input
                          type="date"
                          value={m.dueDate}
                          disabled={m.status === 'paid'}
                          onChange={(e) => {
                            const due = e.target.value
                            const nextMilestones = milestones.map((row) =>
                              row.id === m.id ? { ...row, dueDate: due } : row,
                            )
                            setMilestones(nextMilestones)
                            void persistInteriorDesign({ milestones: nextMilestones }).catch(() => undefined)
                          }}
                          className="h-8 rounded-md border border-border bg-input px-2 text-sm"
                        />
                      </div>
                    </div>
                    <span className={cn('text-xs font-medium', meta.className)}>
                      {m.displayStatus === 'overdue' ? '⚠️ ' : ''}
                      {meta.label}
                    </span>
                  </div>

                  {canRecord && !isRecording && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setRecordingMilestoneId(m.id)}
                    >
                      Record Payment
                    </Button>
                  )}

                  {isRecording && (
                    <div className="space-y-3 rounded-lg bg-muted/30 p-3">
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {(['cash', 'neft', 'upi', 'cheque'] as PaymentMethod[]).map(
                          (method) => (
                            <Button
                              key={method}
                              type="button"
                              size="sm"
                              variant={payMethod === method ? 'default' : 'outline'}
                              onClick={() => {
                                setPayMethod(method)
                                setPayReference('')
                              }}
                            >
                              {METHOD_LABELS[method]}
                            </Button>
                          ),
                        )}
                      </div>
                      {needsReference && (
                        <input
                          value={payReference}
                          onChange={(e) => setPayReference(e.target.value)}
                          placeholder="UTR / Reference *"
                          className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                        />
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            if (payProofUrl?.startsWith('blob:')) URL.revokeObjectURL(payProofUrl)
                            setPayProofUrl(URL.createObjectURL(file))
                            setPayProofFile(file)
                          }
                          e.target.value = ''
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-4 text-sm text-muted-foreground"
                      >
                        <Upload className="size-5" />
                        Upload proof *
                      </button>
                      {payProofUrl && (
                        <img
                          src={payProofUrl}
                          alt="Proof"
                          className="h-20 rounded object-cover"
                        />
                      )}
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!canSavePayment || proofUploading}
                          onClick={() => recordMilestonePayment(m.id)}
                        >
                          {proofUploading ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRecordingMilestoneId(null)
                            setPayMethod(null)
                            setPayReference('')
                            setPayProofUrl(null)
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {formatPrice(paidInterior)} of {formatPrice(quoteTotal)} received
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {quoteAccepted && (
        <Card>
          <CardHeader>
            <CardTitle>Work Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {workCompletedCount} of {WORK_PHASE_LABELS.length} completed
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-pink-500 transition-all"
                style={{
                  width: `${Math.round((workCompletedCount / WORK_PHASE_LABELS.length) * 100)}%`,
                }}
              />
            </div>
            {workPhases.map((phase) => {
              const expanded = expandedPhaseId === phase.id
              return (
                <div key={phase.id} className="rounded-lg border border-border">
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={phase.done}
                      onChange={(e) => {
                        const nextWorkPhases = workPhases.map((p) =>
                          p.id === phase.id ? { ...p, done: e.target.checked } : p,
                        )
                        setWorkPhases(nextWorkPhases)
                        void persistInteriorDesign({ workPhases: nextWorkPhases }).catch(() => undefined)
                      }}
                      className="size-4"
                    />
                    <span
                      className={cn(
                        'flex-1 text-sm',
                        phase.done && 'text-muted-foreground line-through',
                      )}
                    >
                      {phase.label}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setExpandedPhaseId(expanded ? null : phase.id)
                      }
                    >
                      {expanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>
                  </div>
                  {expanded && (
                    <div className="border-t border-border px-3 pb-3">
                      <textarea
                        rows={2}
                        value={phase.note}
                        onChange={(e) => {
                          const nextWorkPhases = workPhases.map((p) =>
                            p.id === phase.id ? { ...p, note: e.target.value } : p,
                          )
                          setWorkPhases(nextWorkPhases)
                          void persistInteriorDesign({ workPhases: nextWorkPhases }).catch(() => undefined)
                        }}
                        placeholder="Notes for this phase…"
                        className="mt-2 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

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
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[log.outcome] ?? 'bg-muted text-muted-foreground'}`}
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

      <Card className="border-t-4 border-pink-500">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Action</h3>

          {!quote ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Create quote to proceed
            </p>
          ) : quote.status === 'pending' ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Send quote to buyer first
            </p>
          ) : quoteSent || quoteNegotiating ? (
            <div className="space-y-3">
              {showNegotiateForm && (
                <textarea
                  rows={3}
                  value={negotiationNotes}
                  onChange={(e) => setNegotiationNotes(e.target.value)}
                  placeholder="Buyer negotiation notes…"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full bg-green-600 hover:bg-green-700"
                  onClick={acceptQuote}
                >
                  ✅ Buyer Accepted Quote
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-orange-300 text-orange-800 hover:bg-orange-50"
                  onClick={() => {
                    const nextQuote = quote ? { ...quote, status: 'negotiating' as QuoteStatus } : null
                    setQuote(nextQuote)
                    void persistInteriorDesign({ quote: nextQuote }).catch(() => undefined)
                    setShowNegotiateForm(true)
                  }}
                >
                  💬 Buyer Wants to Negotiate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-red-300 text-red-800 hover:bg-red-50"
                  onClick={() => setShowDeclineConfirm(true)}
                >
                  ❌ Buyer Declined
                </Button>
              </div>
              {quoteNegotiating && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    loadQuoteIntoForm(quote)
                    setEditingQuote(true)
                  }}
                >
                  Update Quote
                </button>
              )}
            </div>
          ) : quoteDeclined ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Quote declined by buyer.</p>
              {showSkipConfirm ? (
                <div className="rounded-lg border border-border bg-muted p-4 text-sm">
                  <p>Skip interior and move to documentation?</p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        onStageChange('documentation')
                        navigate('/admin/sales/documentation')
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSkipConfirm(false)}
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
                  onClick={() => setShowSkipConfirm(true)}
                >
                  Skip Interior
                </Button>
              )}
            </div>
          ) : allPaymentsDone ? (
            showDocConfirm ? (
              <div className="rounded-lg border border-border bg-muted p-4 text-sm">
                <p>Move deal to documentation stage?</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      onStageChange('documentation')
                      navigate('/admin/sales/documentation')
                    }}
                  >
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDocConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button type="button" className="w-full" onClick={() => setShowDocConfirm(true)}>
                📄 Move to Documentation
              </Button>
            )
          ) : quoteAccepted ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Complete interior payments to proceed ({formatPrice(paidInterior)} /{' '}
              {formatPrice(quoteTotal)})
            </p>
          ) : null}

          {!showSkipConfirm && quote?.status !== 'declined' && (
            <button
              type="button"
              className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setShowSkipConfirm(true)}
            >
              Skip — Buyer doesn&apos;t want interior
            </button>
          )}

          {showSkipConfirm && quote?.status !== 'declined' && (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Skip interior design and move to documentation?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('documentation')
                    navigate('/admin/sales/documentation')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSkipConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showDeclineConfirm && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
              <p>Mark quote as declined?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    const nextQuote = quote ? { ...quote, status: 'declined' as QuoteStatus } : null
                    setQuote(nextQuote)
                    void persistInteriorDesign({ quote: nextQuote }).catch(() => undefined)
                    setShowDeclineConfirm(false)
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeclineConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
