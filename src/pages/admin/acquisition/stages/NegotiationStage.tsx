import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Handshake, X } from 'lucide-react'
import {
  CallLogPanel,
  type CallLog,
  type CallRecordingPayload,
} from '@/components/admin/CallLogPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  updateAdminAcquisitionSection,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { readAdminSession } from '@/api/admin'
import { cn } from '@/lib/utils'
import { hoursSince } from '@/utils/timer'
import { PropertyDetailsAccordion } from '@/utils/propertyFieldConfig'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToPanelCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'
import { NOTIFICATION_TEMPLATES, sendPushNotification } from '@/utils/notifications'

export interface NegotiationStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

type OfferedBy = 'builtglory' | 'seller'
type OfferStatus = 'active' | 'accepted' | 'rejected' | 'countered'

interface Offer {
  id: string
  offeredBy: OfferedBy
  amount: number
  offeredAt: string
  notes: string
  status: OfferStatus
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

const NEGOTIATION_CALL_SUMMARY_PREFIX = 'Acquisition negotiation call'
const NEGOTIATION_NOTE_SUMMARY = 'Acquisition negotiation note'

const FAIL_REASONS = [
  'Price disagreement',
  'Seller changed mind',
  'Property issues found',
  'No response from seller',
  'Other',
] as const

const STATUS_BADGE: Record<
  OfferStatus,
  { label: string; variant?: 'new' | 'responded' | 'red' | 'default' }
> = {
  active: { label: 'Active', variant: 'new' },
  accepted: { label: 'Accepted', variant: 'responded' },
  rejected: { label: 'Rejected', variant: 'red' },
  countered: { label: 'Countered', variant: 'default' },
}

function toDatetimeLocal(date = new Date()) {
  const d = new Date(date)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatOfferDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatCallDate(iso: string) {
  return formatOfferDate(iso)
}

function formatNoteTime(iso: string) {
  return formatOfferDate(iso)
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function initialOffers(acquisition: Acquisition): Offer[] {
  const savedOffers = acquisition.negotiation?.offers
  if (Array.isArray(savedOffers)) {
    return savedOffers as Offer[]
  }
  if (acquisition.builtgloryOffer != null) {
    return [
      {
        id: 'offer-init',
        offeredBy: 'builtglory',
        amount: acquisition.builtgloryOffer,
        offeredAt: acquisition.lastActivityAt,
        notes: 'Initial offer from valuation',
        status: 'active',
      },
    ]
  }
  return []
}

export function NegotiationStage({ acquisition, onStageChange }: NegotiationStageProps) {
  const navigate = useNavigate()
  const asking = acquisition.askingPrice

  const [offers, setOffers] = useState<Offer[]>(() => initialOffers(acquisition))
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [offerBy, setOfferBy] = useState<OfferedBy>('builtglory')
  const [offerAmount, setOfferAmount] = useState('')
  const [offerNotes, setOfferNotes] = useState('')

  const [deadline, setDeadline] = useState<string | null>(null)
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false)
  const [deadlineDraft, setDeadlineDraft] = useState('')

  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showDealModal, setShowDealModal] = useState(false)
  const [agreedPriceInput, setAgreedPriceInput] = useState('')
  const [showFailForm, setShowFailForm] = useState(false)
  const [failReason, setFailReason] = useState('')
  const [failNotes, setFailNotes] = useState('')
  const [notifySeller, setNotifySeller] = useState(true)

  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const bgOfferAmount = useMemo(() => {
    const bgOffers = offers.filter((o) => o.offeredBy === 'builtglory')
    if (bgOffers.length > 0) {
      return [...bgOffers].sort(
        (a, b) => new Date(b.offeredAt).getTime() - new Date(a.offeredAt).getTime(),
      )[0].amount
    }
    return acquisition.builtgloryOffer
  }, [offers, acquisition.builtgloryOffer])

  const gapAmount = bgOfferAmount != null ? asking - bgOfferAmount : asking
  const gapPct = asking > 0 && bgOfferAmount != null ? (gapAmount / asking) * 100 : 0

  const gapColorClass =
    gapPct < 10
      ? 'text-green-700 bg-green-50 border-green-200'
      : gapPct <= 20
        ? 'text-orange-700 bg-orange-50 border-orange-200'
        : 'text-red-700 bg-red-50 border-red-200'

  const sortedOffers = useMemo(
    () => [...offers].sort((a, b) => new Date(b.offeredAt).getTime() - new Date(a.offeredAt).getTime()),
    [offers],
  )

  const lastOffer = sortedOffers[0]

  const sellerAboveAsking = useMemo(
    () => offers.some((o) => o.offeredBy === 'seller' && o.amount > asking),
    [offers, asking],
  )

  const bgAboveAsking = bgOfferAmount != null && bgOfferAmount > asking

  const deadlineInfo = useMemo(() => {
    if (!deadline) return null
    const end = new Date(`${deadline}T23:59:59`)
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
    const passed = days < 0
    return { days, passed, label: passed ? 'DEADLINE PASSED' : `${days} days remaining` }
  }, [deadline])

  const [sellerMessage, setSellerMessage] = useState(
    () =>
      `Hi ${acquisition.sellerName}, we are pleased to offer ₹${formatPrice(lastOffer?.amount ?? bgOfferAmount ?? asking)} for your property at ${acquisition.propertyLocation}. This offer is valid for 3 days. Please respond via the app.`,
  )

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'acquisition',
      acquisition.id,
      NEGOTIATION_CALL_SUMMARY_PREFIX,
      NEGOTIATION_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToPanelCall(log, CALL_OUTCOMES[0])))
      setNotes(notes.map(workflowLogToStageNote))
    })
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  const saveOffer = async () => {
    const amount = Number(offerAmount.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) return
    const nextOffer = {
      id: `offer-${Date.now()}`,
      offeredBy: offerBy,
      amount,
      offeredAt: new Date().toISOString(),
      notes: offerNotes.trim(),
      status: 'active' as OfferStatus,
    }
    const nextOffers = [nextOffer, ...offers]
    setOffers(nextOffers)
    const session = readAdminSession()
    if (session?.accessToken) {
      updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'negotiation', {
        ...acquisition.negotiation,
        offers: nextOffers,
        lastOfferAt: nextOffer.offeredAt,
      })
        .then((saved) => onStageChange(saved.stage, { negotiation: saved.negotiation, builtgloryOffer: saved.builtgloryOffer }))
        .catch(() => undefined)
    }
    if (offerBy === 'builtglory') {
      const offerTemplate = NOTIFICATION_TEMPLATES.N04_OFFER_SENT(
        acquisition.sellerName,
        acquisition.propertyTitle,
      )
      sendPushNotification(acquisition.sellerName, offerTemplate, 'N-04', {
        dedupeKey: `N-04:${acquisition.id}:${nextOffer.id}`,
        audience: 'seller',
        userId: acquisition.sellerUserId,
        relatedTo: { type: 'acquisition', id: acquisition.id },
      })
    }
    setShowOfferForm(false)
    setOfferAmount('')
    setOfferNotes('')
    setOfferBy('builtglory')
    setSellerMessage(
      `Hi ${acquisition.sellerName}, we are pleased to offer ${formatPrice(amount)} for your property at ${acquisition.propertyLocation}. This offer is valid for 3 days. Please respond via the app.`,
    )
  }

  const saveCall = async (recording?: CallRecordingPayload): Promise<boolean> => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return false
    const attachments = recording
      ? [{ fileName: recording.fileName, url: recording.url, mimeType: 'audio/*', sizeBytes: recording.size }]
      : undefined
    const log = await createStageCallLog(
      'acquisition',
      acquisition.id,
      NEGOTIATION_CALL_SUMMARY_PREFIX,
      new Date(callAt).toISOString(),
      duration,
      callOutcome,
      callNotes.trim(),
      attachments,
    )
    setCallLogs((prev) => [workflowLogToPanelCall(log, CALL_OUTCOMES[0]), ...prev])
    setShowCallForm(false)
    setCallDuration('')
    setCallNotes('')
    setCallAt(toDatetimeLocal())
    return true
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    const log = await createStageNoteLog('acquisition', acquisition.id, NEGOTIATION_NOTE_SUMMARY, noteText.trim())
    setNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const openDealModal = () => {
    const prefill = lastOffer?.amount ?? bgOfferAmount ?? asking
    setAgreedPriceInput(String(prefill))
    setShowDealModal(true)
  }

  const agreedNum = Number(agreedPriceInput.replace(/,/g, ''))
  const discountPct =
    Number.isFinite(agreedNum) && asking > 0 ? ((asking - agreedNum) / asking) * 100 : 0

  const confirmDeal = () => {
    if (!Number.isFinite(agreedNum) || agreedNum <= 0) return
    onStageChange('token_to_seller', {
      agreedPrice: agreedNum,
      negotiation: {
        ...acquisition.negotiation,
        offers,
        agreedPrice: agreedNum,
        closedAt: new Date().toISOString(),
      },
    })
    const sellerTemplate = NOTIFICATION_TEMPLATES.N05_DEAL_CONFIRMED_SELLER(
      acquisition.sellerName,
      acquisition.propertyTitle,
    )
    sendPushNotification(acquisition.sellerName, sellerTemplate, 'N-05', {
      dedupeKey: `N-05:seller:${acquisition.id}`,
      audience: 'seller',
      userId: acquisition.sellerUserId,
      relatedTo: { type: 'acquisition', id: acquisition.id },
    })
    navigate('/admin/acquisition/token')
  }

  const confirmFail = () => {
    if (!failReason || !failNotes.trim()) return
    onStageChange('rejected', {
      rejectionReason: `${failReason}: ${failNotes.trim()}`,
      negotiation: {
        ...acquisition.negotiation,
        offers,
        failReason,
        failNotes: failNotes.trim(),
      },
    })
    setShowFailForm(false)
  }

  const sendOfferToSeller = () => {
    const tel = phoneForTel(acquisition.sellerPhone)
    if (sendWhatsApp) {
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(sellerMessage)}`,
        '_blank',
      )
    }
    if (sendEmail && acquisition.sellerEmail) {
      window.open(
        `mailto:${acquisition.sellerEmail}?subject=${encodeURIComponent('Offer for your property')}&body=${encodeURIComponent(sellerMessage)}`,
        '_self',
      )
    }
  }

  const stallDays = hoursSince(acquisition.lastActivityAt) / 24

  return (
    <div className="space-y-4">
      {stallDays > 7 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span className="font-medium">Stalled {Math.floor(stallDays)}d</span> — No activity in{' '}
          {Math.floor(stallDays)} days
        </div>
      )}
      {acquisition.daysInStage > 14 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
          ⚠️ Negotiation running for {acquisition.daysInStage} days
        </div>
      )}

      {bgAboveAsking && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Offering above asking — great for seller
        </div>
      )}

      {sellerAboveAsking && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Seller increased price above original asking
        </div>
      )}

      {deadlineInfo?.passed && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          ⚠️ Deadline passed — close or extend negotiation
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Negotiation Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">Asking</p>
              <p className="text-lg font-bold text-blue-700">{formatPrice(asking)}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-3 text-center">
              <p className="text-xs font-medium uppercase text-muted-foreground">BG Offer</p>
              <p className="text-lg font-bold text-green-700">
                {bgOfferAmount != null ? formatPrice(bgOfferAmount) : '—'}
              </p>
            </div>
            <div className={cn('rounded-lg border p-3 text-center', gapColorClass)}>
              <p className="text-xs font-medium uppercase opacity-80">Gap</p>
              <p className="text-lg font-bold">
                {bgOfferAmount != null ? formatPrice(Math.max(0, gapAmount)) : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Offer History</CardTitle>
          {!showOfferForm && (
            <Button type="button" size="sm" onClick={() => setShowOfferForm(true)}>
              + Make Offer
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {showOfferForm && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div>
                <p className="mb-2 text-sm font-medium">Offered by</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={offerBy === 'builtglory' ? 'default' : 'outline'}
                    onClick={() => setOfferBy('builtglory')}
                  >
                    Builtglory
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={offerBy === 'seller' ? 'default' : 'outline'}
                    onClick={() => setOfferBy('seller')}
                  >
                    Seller
                  </Button>
                </div>
              </div>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder="Amount (₹) *"
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <textarea
                rows={2}
                value={offerNotes}
                onChange={(e) => setOfferNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveOffer}>
                  Save Offer
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowOfferForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {offers.length === 0 && !showOfferForm && (
            <div className="py-8 text-center">
              <Handshake className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-2 font-medium text-foreground">No offers yet</p>
              <p className="text-sm text-muted-foreground">Start with Builtglory&apos;s initial offer</p>
            </div>
          )}

          {offers.length > 5 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Many offers exchanged — consider making a final offer
            </div>
          )}

          <div className="space-y-3">
            {sortedOffers.map((offer) => {
              const status = STATUS_BADGE[offer.status]
              return (
                <div key={offer.id} className="flex gap-3">
                  <span
                    className={cn(
                      'mt-1.5 size-3 shrink-0 rounded-full',
                      offer.offeredBy === 'builtglory' ? 'bg-blue-500' : 'bg-green-500',
                    )}
                  />
                  <div className="min-w-0 flex-1 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          offer.offeredBy === 'builtglory' ? 'text-blue-700' : 'text-green-700',
                        )}
                      >
                        {offer.offeredBy === 'builtglory' ? 'Builtglory' : 'Seller'}
                      </span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-lg font-bold text-foreground">{formatPrice(offer.amount)}</p>
                    <p className="text-xs text-muted-foreground">{formatOfferDate(offer.offeredAt)}</p>
                    {offer.notes && (
                      <p className="mt-1 text-sm text-muted-foreground">{offer.notes}</p>
                    )}
                    {offer.offeredBy === 'seller' && offer.amount > asking && (
                      <p className="mt-1 text-xs font-medium text-red-600">
                        Above asking price
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <PropertyDetailsAccordion
        propertyType={acquisition.propertyType}
        propertyDetails={acquisition.propertyDetails}
      />

      <Card>
        <CardHeader>
          <CardTitle>Negotiation Deadline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {showDeadlinePicker ? (
            <div className="space-y-2">
              <input
                type="date"
                value={deadlineDraft}
                onChange={(e) => setDeadlineDraft(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!deadlineDraft}
                  onClick={() => {
                    setDeadline(deadlineDraft)
                    setShowDeadlinePicker(false)
                  }}
                >
                  {deadline ? 'Save' : 'Set Deadline'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeadlinePicker(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : !deadline ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">No deadline set</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDeadlinePicker(true)}
              >
                + Set Deadline
              </Button>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="font-medium">
                Deadline:{' '}
                {new Date(`${deadline}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              </p>
              {deadlineInfo && (
                <p
                  className={cn(
                    'font-semibold',
                    deadlineInfo.passed && 'text-red-600',
                    !deadlineInfo.passed && deadlineInfo.days > 7 && 'text-green-600',
                    !deadlineInfo.passed &&
                      deadlineInfo.days >= 3 &&
                      deadlineInfo.days <= 7 &&
                      'text-orange-600',
                    !deadlineInfo.passed && deadlineInfo.days < 3 && 'animate-pulse text-red-600',
                  )}
                >
                  {deadlineInfo.label}
                </p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    setDeadlineDraft(deadline)
                    setShowDeadlinePicker(true)
                  }}
                >
                  Change Deadline
                </button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDeadline(null)
                    setShowDeadlinePicker(false)
                  }}
                >
                  Remove Deadline
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {offers.length >= 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Send Offer to Seller</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              rows={4}
              value={sellerMessage}
              onChange={(e) => setSellerMessage(e.target.value)}
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
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
            <Button type="button" onClick={sendOfferToSeller}>
              Send Offer
            </Button>
          </CardContent>
        </Card>
      )}

      <CallLogPanel
        callLogs={callLogs}
        showForm={showCallForm}
        onShowFormChange={setShowCallForm}
        callDuration={callDuration}
        onCallDurationChange={setCallDuration}
        callOutcome={callOutcome}
        onCallOutcomeChange={setCallOutcome}
        callNotes={callNotes}
        onCallNotesChange={setCallNotes}
        onSave={saveCall}
        formatTimestamp={formatCallDate}
        outcomeOptions={CALL_OUTCOMES}
        outcomeBadgeClass={(outcome) =>
          OUTCOME_STYLES[outcome] ?? 'bg-muted text-muted-foreground'
        }
        logCallLabel="+ Log Call"
        saveLabel="Save"
        formPrefix={
          <input
            type="datetime-local"
            value={callAt}
            onChange={(e) => setCallAt(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
        }
      />

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
          {notes.length === 0 && !showNoteForm && (
            <div className="py-6 text-center">
              <FileText className="mx-auto size-10 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">No notes yet</p>
            </div>
          )}
          {notes.map((note) => (
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
          <h3 className="font-semibold text-foreground">Close Negotiation</h3>

          {showDealModal ? (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h4 className="font-semibold">Confirm Deal</h4>
              <input
                type="number"
                value={agreedPriceInput}
                onChange={(e) => setAgreedPriceInput(e.target.value)}
                placeholder="Final agreed price (₹) *"
                className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              {Number.isFinite(agreedNum) && agreedNum > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Discount given: {discountPct.toFixed(1)}% below asking
                </p>
              )}
              {discountPct > 20 && (
                <p className="mt-2 text-sm font-medium text-red-600">
                  Large discount — get management approval
                </p>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  type="button"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={!Number.isFinite(agreedNum) || agreedNum <= 0}
                  onClick={confirmDeal}
                >
                  Confirm Deal
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowDealModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              className="mb-3 w-full bg-green-600 text-white hover:bg-green-700"
              disabled={offers.length === 0}
              title={offers.length === 0 ? 'Make at least one offer first' : undefined}
              onClick={openDealModal}
            >
              ✅ Deal Agreed — Move to Token Payment
            </Button>
          )}

          {!showFailForm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowFailForm(true)}
            >
              ❌ Negotiation Failed
            </Button>
          ) : (
            <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/30 p-3">
              <select
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                <option value="">Select reason *</option>
                {FAIL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                value={failNotes}
                onChange={(e) => setFailNotes(e.target.value)}
                placeholder="Notes *"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={notifySeller}
                  onChange={(e) => setNotifySeller(e.target.checked)}
                />
                Notify seller
              </label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!failReason || !failNotes.trim()}
                  onClick={confirmFail}
                >
                  Confirm
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowFailForm(false)}>
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
