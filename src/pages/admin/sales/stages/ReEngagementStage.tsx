import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { CalendarClock, FileText, MessageCircle, Phone, RotateCcw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  listAdminSalesDealRecommendations,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import {
  createWorkflowLog,
  deleteWorkflowLog,
  listWorkflowLogs,
  type WorkflowChannel,
  type WorkflowLog,
} from '@/api/adminWorkflow'

export interface ReEngagementStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type ReengageReason =
  | 'price_reduced'
  | 'new_property'
  | 'situation_changed'
  | 'cooling_period'
  | 'special_offer'
  | 'other'

type OfferUnit = 'inr' | 'pct'
type OutreachChannel = 'call' | 'whatsapp' | 'email' | 'in_person'
type OutreachOutcome =
  | 'Interested'
  | 'Not Interested'
  | 'No Response'
  | 'Will Think'
  | 'Callback Later'

interface ReengagePlan {
  reason: ReengageReason
  approach: string
  offerValue: string
  offerUnit: OfferUnit
}

interface OutreachEntry {
  id: string
  channel: OutreachChannel
  outcome: OutreachOutcome
  notes: string
  at: string
}

interface AltProperty {
  id: string
  title: string
  price: number
  type: string
  image: string
  score: number
  reason: string
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

const REENGAGE_REASONS: { id: ReengageReason; label: string }[] = [
  { id: 'price_reduced', label: 'Price reduced on property' },
  { id: 'new_property', label: 'New similar property available' },
  { id: 'situation_changed', label: "Buyer's situation changed" },
  { id: 'cooling_period', label: 'Follow-up after cooling period' },
  { id: 'special_offer', label: 'Special offer/discount' },
  { id: 'other', label: 'Other' },
]

const OUTREACH_CHANNELS: { id: OutreachChannel; label: string }[] = [
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'in_person', label: 'In-person' },
]

const OUTREACH_OUTCOMES: OutreachOutcome[] = [
  'Interested',
  'Not Interested',
  'No Response',
  'Will Think',
  'Callback Later',
]

const POSITIVE_OUTCOMES: OutreachOutcome[] = [
  'Interested',
  'Will Think',
  'Callback Later',
]

const CHANNEL_BADGE: Record<OutreachChannel, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  in_person: 'In-person',
}

const OUTCOME_BADGE: Record<OutreachOutcome, 'new' | 'responded' | 'red' | 'pending' | 'default'> = {
  Interested: 'responded',
  'Not Interested': 'red',
  'No Response': 'pending',
  'Will Think': 'new',
  'Callback Later': 'new',
}

const LOST_STAGE_LABEL: Record<string, string> = {
  'DEAL-012': 'Negotiation',
}

const CALL_OUTCOMES = [
  'Interested',
  'Not Interested',
  'Callback Later',
  'No Answer',
  'Wrong Number',
] as const

const REENGAGEMENT_OUTREACH_SUMMARY_PREFIX = 'Sales re-engagement outreach'
const REENGAGEMENT_CALL_SUMMARY_PREFIX = 'Sales re-engagement call'
const REENGAGEMENT_NOTE_SUMMARY = 'Sales re-engagement note'

const OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

function formatDealDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCallDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatNoteTime(iso: string) {
  return formatCallDate(iso)
}

function toDatetimeLocal(date = new Date()) {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalFromIso(iso?: string | null) {
  return iso ? toDatetimeLocal(new Date(iso)) : toDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function workflowLogToOutreachEntry(log: WorkflowLog): OutreachEntry {
  const rawChannel = log.channel === 'whatsapp' || log.channel === 'email' || log.channel === 'call' ? log.channel : 'in_person'
  return {
    id: log.id,
    channel: rawChannel,
    outcome: (log.outcome as OutreachOutcome) || 'No Response',
    notes: log.body || '',
    at: log.occurredAt,
  }
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

function outreachWorkflowChannel(channel: OutreachChannel): WorkflowChannel {
  return channel === 'in_person' ? 'note' : channel
}

function daysSince(iso: string) {
  const then = new Date(iso).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)))
}

export function ReEngagementStage({ deal, onStageChange }: ReEngagementStageProps) {
  const navigate = useNavigate()

  const lostStageLabel = LOST_STAGE_LABEL[deal.id] ?? deal.lostReason ?? 'Negotiation'
  const daysLost = daysSince(deal.lastActivityAt)

  const [plan, setPlan] = useState<ReengagePlan | null>(null)
  const [reason, setReason] = useState<ReengageReason>('cooling_period')
  const [approach, setApproach] = useState('')
  const [offerValue, setOfferValue] = useState('')
  const [offerUnit, setOfferUnit] = useState<OfferUnit>('inr')

  const [outreach, setOutreach] = useState<OutreachEntry[]>([])
  const [showOutreachForm, setShowOutreachForm] = useState(false)
  const [outChannel, setOutChannel] = useState<OutreachChannel>('call')
  const [outOutcome, setOutOutcome] = useState<OutreachOutcome>('No Response')
  const [outNotes, setOutNotes] = useState('')
  const [outAt, setOutAt] = useState(toDatetimeLocal())
  const [followUpAt, setFollowUpAt] = useState(datetimeLocalFromIso(deal.reengagementFollowUpAt))
  const [followUpSaved, setFollowUpSaved] = useState(false)

  const [propertySearch, setPropertySearch] = useState('')
  const [altProperties, setAltProperties] = useState<AltProperty[]>([])
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null)
  const [suggestedIds, setSuggestedIds] = useState<string[]>([])
  const [showSuggestModal, setShowSuggestModal] = useState<AltProperty | null>(null)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const [showInterestedConfirm, setShowInterestedConfirm] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [closeReason, setCloseReason] = useState('')
  const [contactToast, setContactToast] = useState<string | null>(null)

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
    const session = readAdminSession()
    if (!session?.accessToken) {
      setAltProperties([])
      setRecommendationsLoading(false)
      setRecommendationsError('Admin session expired. Please sign in again.')
      return
    }
    let cancelled = false
    setRecommendationsLoading(true)
    setRecommendationsError(null)
    const timer = window.setTimeout(() => {
      listAdminSalesDealRecommendations(session.accessToken, deal.id, {
        search: propertySearch.trim() || undefined,
        limit: 6,
      })
        .then((result) => {
          if (cancelled) return
          setAltProperties(
            result.data
              .filter((property) => property.id !== deal.propertyId)
              .map((property) => ({
                id: property.id,
                title: property.title,
                price: property.price,
                type: property.type,
                image: property.coverPhoto || property.photos[0] || '',
                score: property.score,
                reason: property.reason,
              })),
          )
          setRecommendationsLoading(false)
        })
        .catch((error) => {
          if (!cancelled) {
            setAltProperties([])
            setRecommendationsLoading(false)
            setRecommendationsError(error instanceof Error ? error.message : 'Could not load recommendations')
          }
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [deal.id, deal.propertyId, propertySearch])

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !deal.id) {
      setOutreach([])
      setCallLogs([])
      setInternalNotes([])
      return
    }
    let cancelled = false
    void listWorkflowLogs(session.accessToken, 'sales-deal', deal.id)
      .then((result) => {
        if (cancelled) return
        setOutreach(
          result.data
            .filter((log) => log.summary.startsWith(REENGAGEMENT_OUTREACH_SUMMARY_PREFIX))
            .map(workflowLogToOutreachEntry),
        )
        setCallLogs(
          result.data
            .filter((log) => log.summary.startsWith(REENGAGEMENT_CALL_SUMMARY_PREFIX))
            .map(workflowLogToCallEntry),
        )
        setInternalNotes(
          result.data
            .filter((log) => log.summary === REENGAGEMENT_NOTE_SUMMARY)
            .map(workflowLogToNoteEntry),
        )
      })
      .catch(() => {
        if (!cancelled) setContactToast('Could not load persisted re-engagement history')
      })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const filteredProperties = useMemo(() => {
    const q = propertySearch.trim().toLowerCase()
    return altProperties.filter(
      (p) =>
        p.id !== deal.propertyId &&
        (!q ||
          p.title.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q)),
    ).slice(0, 3)
  }, [altProperties, propertySearch, deal.propertyId])

  const noPositiveOutreach =
    outreach.length >= 5 &&
    !outreach.some((o) => POSITIVE_OUTCOMES.includes(o.outcome))

  const canProceed = plan != null && plan.approach.trim().length > 0

  const suggestMessage = (prop: AltProperty) =>
    `Hi ${deal.buyerName}, we have a new property that might interest you:\n${prop.title} at ${formatPrice(prop.price)}\nCheck it out on the Builtglory app!`

  const nextAttemptCount = () => Math.max(deal.reengagementAttempts ?? 0, outreach.length) + 1

  const savePlan = () => {
    if (!approach.trim()) return
    setPlan({
      reason,
      approach: approach.trim(),
      offerValue,
      offerUnit,
    })
  }

  const saveOutreach = async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setContactToast('Admin session expired. Please sign in again.')
      return
    }
    const occurredAt = new Date(outAt).toISOString()
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: outreachWorkflowChannel(outChannel),
        direction: 'outbound',
        summary: `${REENGAGEMENT_OUTREACH_SUMMARY_PREFIX}: ${CHANNEL_BADGE[outChannel]}`,
        body: outNotes.trim(),
        outcome: outOutcome,
        occurredAt,
      })
      setOutreach((prev) => [workflowLogToOutreachEntry(saved), ...prev])
      setShowOutreachForm(false)
      setOutNotes('')
      setOutAt(toDatetimeLocal())
      onStageChange('re_engagement', {
        reengagementLastContactAt: occurredAt,
        reengagementAttempts: nextAttemptCount(),
      })
    } catch (error) {
      setContactToast(error instanceof Error ? error.message : 'Could not save outreach')
    }
  }

  const saveFollowUp = () => {
    if (!followUpAt) return
    onStageChange('re_engagement', {
      reengagementFollowUpAt: new Date(followUpAt).toISOString(),
    })
    setFollowUpSaved(true)
    window.setTimeout(() => setFollowUpSaved(false), 2000)
  }

  const reContactBuyer = (channel: OutreachChannel) => {
    const at = new Date().toISOString()
    const logContact = async () => {
      const session = readAdminSession()
      if (!session?.accessToken) return
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: outreachWorkflowChannel(channel),
        direction: 'outbound',
        summary: `${REENGAGEMENT_OUTREACH_SUMMARY_PREFIX}: ${CHANNEL_BADGE[channel]}`,
        body: `Re-contacted via ${CHANNEL_BADGE[channel]}`,
        outcome: 'No Response',
        occurredAt: at,
      })
      setOutreach((prev) => [workflowLogToOutreachEntry(saved), ...prev])
    }
    void logContact().catch(() => setContactToast('Could not persist re-contact log'))
    onStageChange('re_engagement', {
      reengagementLastContactAt: at,
      reengagementAttempts: nextAttemptCount(),
    })
    if (channel === 'call') {
      window.open(`tel:${phoneForTel(deal.buyerPhone)}`)
    }
    if (channel === 'whatsapp') {
      window.open(
        `https://wa.me/${phoneForTel(deal.buyerPhone)}?text=${encodeURIComponent(`Hi ${deal.buyerName}, just following up on your property requirement. Are you still interested in ${deal.propertyTitle}?`)}`,
        '_blank',
      )
    }
    if (channel === 'email') {
      window.open(
        `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('Following up on your property requirement')}&body=${encodeURIComponent(`Hi ${deal.buyerName},\n\nJust following up on your interest in ${deal.propertyTitle}. Let me know if you would like to revisit this or explore similar options.\n\nTeam Builtglory`)}`,
        '_self',
      )
    }
    setContactToast(`Re-contact logged via ${CHANNEL_BADGE[channel]}`)
    window.setTimeout(() => setContactToast(null), 2000)
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setContactToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `${REENGAGEMENT_CALL_SUMMARY_PREFIX}: ${callOutcome}`,
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
      setContactToast(error instanceof Error ? error.message : 'Could not save call log')
    }
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setContactToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'note',
        direction: 'internal',
        summary: REENGAGEMENT_NOTE_SUMMARY,
        body: noteText.trim(),
      })
      setInternalNotes((prev) => [workflowLogToNoteEntry(saved), ...prev])
      setNoteText('')
      setShowNoteForm(false)
    } catch (error) {
      setContactToast(error instanceof Error ? error.message : 'Could not save internal note')
    }
  }

  const deleteInternalNote = async (noteId: string) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setContactToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      await deleteWorkflowLog(session.accessToken, noteId)
      setInternalNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (error) {
      setContactToast(error instanceof Error ? error.message : 'Could not delete internal note')
    }
  }

  const suggestPropertyToBuyer = async (property: AltProperty) => {
    const tel = phoneForTel(deal.buyerPhone)
    const msg = suggestMessage(property)
    if (sendWhatsApp) {
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,
        '_blank',
      )
    }
    if (sendEmail && deal.buyerEmail) {
      window.open(
        `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('New property for you')}&body=${encodeURIComponent(msg)}`,
        '_self',
      )
    }
    setSuggestedIds((prev) => (prev.includes(property.id) ? prev : [...prev, property.id]))
    setShowSuggestModal(null)

    const session = readAdminSession()
    if (!session?.accessToken) return
    try {
      const channels = [
        sendWhatsApp ? 'WhatsApp' : null,
        sendEmail ? 'Email' : null,
      ].filter(Boolean).join(' + ') || 'Manual'
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: sendWhatsApp ? 'whatsapp' : sendEmail ? 'email' : 'message',
        direction: 'outbound',
        summary: `${REENGAGEMENT_OUTREACH_SUMMARY_PREFIX}: property suggestion`,
        body: `${channels} suggestion sent for ${property.title} (${property.id}). Match ${property.score}%: ${property.reason}`,
        outcome: 'No Response',
        occurredAt: new Date().toISOString(),
      })
      setOutreach((prev) => [workflowLogToOutreachEntry(saved), ...prev])
    } catch {
      setContactToast('Suggestion sent, but history could not be persisted')
    }
  }

  return (
    <div className="space-y-4">
      {daysLost > 90 && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Long time since deal lost — buyer may have moved on ({daysLost} days)
        </p>
      )}
      {noPositiveOutreach && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Multiple attempts — consider closing re-engagement
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Re-engagement Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
            🔄 Re-engagement in Progress
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Property</p>
              <p className="font-medium">{deal.propertyTitle}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Original Stage Lost</p>
              <p className="font-medium">{lostStageLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Days Since Lost</p>
              <p className="font-medium">{daysLost} days</p>
            </div>
            <div>
              <p className="text-muted-foreground">Re-engagement Started</p>
              <p className="font-medium">{formatDealDate(deal.lastActivityAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Follow-up & Re-contact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {contactToast && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              {contactToast}
            </p>
          )}
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="size-4 text-orange-600" />
              <p className="text-sm font-medium">Follow-up date</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(e) => setFollowUpAt(e.target.value)}
                className="h-9 flex-1 rounded-md border border-border bg-input px-3 text-sm"
              />
              <Button type="button" size="sm" onClick={saveFollowUp}>
                Save Follow-up
              </Button>
            </div>
            {followUpSaved && (
              <p className="mt-2 text-xs font-medium text-green-700">Follow-up date saved</p>
            )}
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-sm font-medium">Re-contact buyer</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button type="button" variant="outline" onClick={() => reContactBuyer('call')}>
                <Phone className="size-4" />
                Call
              </Button>
              <Button type="button" variant="outline" onClick={() => reContactBuyer('whatsapp')}>
                <MessageCircle className="size-4" />
                WhatsApp
              </Button>
              <Button type="button" variant="outline" onClick={() => reContactBuyer('email')}>
                Email
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {Math.max(deal.reengagementAttempts ?? 0, outreach.length)} contact attempts
              {deal.reengagementLastContactAt
                ? ` · Last contact: ${formatCallDate(deal.reengagementLastContactAt)}`
                : ''}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Re-engagement Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              Plan saved
            </p>
          )}
          <div>
            <p className="mb-2 text-sm font-medium">Reason for re-engagement *</p>
            <div className="space-y-2">
              {REENGAGE_REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reengage-reason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Planned approach *</label>
            <textarea
              rows={3}
              value={approach}
              onChange={(e) => setApproach(e.target.value)}
              placeholder="What is your plan to win back this buyer?"
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Offer to buyer (optional)</p>
            <div className="flex gap-2">
              <input
                type="number"
                value={offerValue}
                onChange={(e) => setOfferValue(e.target.value)}
                placeholder="Special offer"
                className="h-9 flex-1 rounded-md border border-border bg-input px-3 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant={offerUnit === 'inr' ? 'default' : 'outline'}
                onClick={() => setOfferUnit('inr')}
              >
                ₹
              </Button>
              <Button
                type="button"
                size="sm"
                variant={offerUnit === 'pct' ? 'default' : 'outline'}
                onClick={() => setOfferUnit('pct')}
              >
                %
              </Button>
            </div>
          </div>
          <Button type="button" className="w-full" disabled={!approach.trim()} onClick={savePlan}>
            Save Plan
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Re-engagement Outreach</CardTitle>
          {!showOutreachForm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowOutreachForm(true)}
            >
              + Log Outreach
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {showOutreachForm && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Channel</p>
                <div className="flex flex-wrap gap-2">
                  {OUTREACH_CHANNELS.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={outChannel === c.id ? 'default' : 'outline'}
                      onClick={() => setOutChannel(c.id)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </div>
              <select
                value={outOutcome}
                onChange={(e) => setOutOutcome(e.target.value as OutreachOutcome)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                {OUTREACH_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <textarea
                rows={2}
                value={outNotes}
                onChange={(e) => setOutNotes(e.target.value)}
                placeholder="Notes"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                value={outAt}
                onChange={(e) => setOutAt(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveOutreach}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOutreachForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {outreach.length === 0 && !showOutreachForm && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No outreach logged
            </p>
          )}
          {outreach.map((entry, i) => (
            <div key={entry.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{CHANNEL_BADGE[entry.channel]}</Badge>
                <Badge variant={OUTCOME_BADGE[entry.outcome]}>{entry.outcome}</Badge>
                <span className="text-xs text-muted-foreground">
                  Attempt {outreach.length - i}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatCallDate(entry.at)}
              </p>
              {entry.notes && (
                <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suggest Alternative Properties</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            value={propertySearch}
            onChange={(e) => setPropertySearch(e.target.value)}
            placeholder="Search properties…"
            className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
          {recommendationsLoading && (
            <p className="text-sm text-muted-foreground">Loading ranked recommendations...</p>
          )}
          {recommendationsError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {recommendationsError}
            </p>
          )}
          <div className="space-y-3">
            {filteredProperties.map((prop) => (
              <div
                key={prop.id}
                className="flex gap-3 rounded-lg border border-border p-3"
              >
                <img
                  src={prop.image}
                  alt=""
                  className="size-16 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{prop.title}</p>
                  <p className="text-sm text-primary font-semibold">
                    {formatPrice(prop.price)}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">{prop.type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Match {prop.score}% · {prop.reason}
                  </p>
                  {suggestedIds.includes(prop.id) && (
                    <Badge variant="responded" className="mt-1">
                      Suggested
                    </Badge>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => setShowSuggestModal(prop)}
                  >
                    Suggest to Buyer
                  </Button>
                </div>
              </div>
            ))}
            {!recommendationsLoading && !recommendationsError && filteredProperties.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No backend-ranked alternatives found for this buyer.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {showSuggestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Suggest property</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {suggestMessage(showSuggestModal)}
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
                onClick={() => void suggestPropertyToBuyer(showSuggestModal)}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSuggestModal(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
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
                onClick={() => void deleteInternalNote(note.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-t-4 border-orange-500">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Action</h3>

          {showInterestedConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>
                Move buyer back to Active Leads for continued follow-up?
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('active_leads', {
                      lostReason: null,
                      reengagementFollowUpAt: null,
                      reengagementLastContactAt: null,
                      reengagementAttempts: 0,
                    })
                    navigate('/admin/sales/leads')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInterestedConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : showCloseConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm space-y-2">
              <p>Close re-engagement and mark deal as lost?</p>
              <textarea
                rows={2}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    onStageChange('lost', {
                      lostReason: closeReason.trim() || 'Re-engagement closed',
                    })
                    navigate('/admin/sales/lost')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCloseConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                className="mb-3 w-full"
                onClick={() => setShowInterestedConfirm(true)}
              >
                <RotateCcw className="size-4" />
                Move Back to Active Leads
              </Button>
              {!canProceed && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Optional: save a re-engagement plan before moving the buyer back.
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setShowCloseConfirm(true)}
              >
                ❌ Close Re-engagement
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
