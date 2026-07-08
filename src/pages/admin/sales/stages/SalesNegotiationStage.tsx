import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, X } from 'lucide-react'
import {
  CallLogPanel,
  type CallLog,
  type CallRecordingPayload,
} from '@/components/admin/CallLogPanel'
import { NegotiationChat } from '@/components/admin/NegotiationChat'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { cn } from '@/lib/utils'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToPanelCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'
import { NOTIFICATION_TEMPLATES, sendPushNotification } from '@/utils/notifications'

export interface SalesNegotiationStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type OfferedBy = 'builtglory' | 'buyer'
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

const LOST_REASONS = [
  'Price too high',
  'Found better property',
  'Financial issues',
  'No response',
  'Changed mind',
  'Other',
] as const

const OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

const SALES_NEGOTIATION_CALL_SUMMARY_PREFIX = 'Sales negotiation call'
const SALES_NEGOTIATION_NOTE_SUMMARY = 'Sales negotiation note'

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

function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

function initialOffers(deal: SalesDeal): Offer[] {
  if (deal.offeredPrice != null) {
    return [
      {
        id: 'offer-init',
        offeredBy: 'builtglory',
        amount: deal.offeredPrice,
        offeredAt: deal.lastActivityAt,
        notes: 'Initial offer',
        status: 'active',
      },
    ]
  }
  return []
}

function latestOfferBy(
  offers: Offer[],
  party: OfferedBy,
): Offer | undefined {
  return [...offers]
    .filter((o) => o.offeredBy === party)
    .sort((a, b) => new Date(b.offeredAt).getTime() - new Date(a.offeredAt).getTime())[0]
}

export function SalesNegotiationStage({ deal, onStageChange }: SalesNegotiationStageProps) {
  const navigate = useNavigate()
  const listed = deal.propertyPrice

  const [offers] = useState<Offer[]>(() => initialOffers(deal))
  const [, setShowOfferForm] = useState(false)

  const [deadline, setDeadline] = useState<string | null>(null)
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false)
  const [deadlineDraft, setDeadlineDraft] = useState('')

  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showDealModal, setShowDealModal] = useState(false)
  const [agreedPriceInput, setAgreedPriceInput] = useState('')
  const [showLostForm, setShowLostForm] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [lostNotes, setLostNotes] = useState('')

  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const lastBuyerOffer = latestOfferBy(offers, 'buyer')
  const buyerOfferAmount = lastBuyerOffer?.amount ?? null
  const buyerAboveListed = buyerOfferAmount != null && buyerOfferAmount > listed
  const inactiveNegotiation = daysSince(deal.lastActivityAt) > 5
  const daysSilent = daysSince(deal.lastActivityAt)
  const daysActive = daysSince(deal.createdAt)
  const hasOffers = offers.length > 0
  const [mgmtDiscountConfirmed, setMgmtDiscountConfirmed] = useState(false)

  const deadlineInfo = useMemo(() => {
    if (!deadline) return null
    const end = new Date(`${deadline}T23:59:59`)
    const days = Math.ceil((end.getTime() - Date.now()) / 86400000)
    const passed = days < 0
    let label = `${days} days remaining`
    if (passed) label = 'OVERDUE'
    return { days, passed, label }
  }, [deadline])

  const [buyerMessage, setBuyerMessage] = useState(
    () =>
      `Hi ${deal.buyerName}, we can offer ${deal.propertyTitle} at ${formatPrice(listed)}.\nThis offer is valid for 3 days.\nPlease respond via the Builtglory app.`,
  )

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'sales-deal',
      deal.id,
      SALES_NEGOTIATION_CALL_SUMMARY_PREFIX,
      SALES_NEGOTIATION_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToPanelCall(log, CALL_OUTCOMES[0])))
      setInternalNotes(notes.map(workflowLogToStageNote))
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const saveCall = async (recording?: CallRecordingPayload): Promise<boolean> => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return false
    const attachments = recording
      ? [{ fileName: recording.fileName, url: recording.url, mimeType: 'audio/*', sizeBytes: recording.size }]
      : undefined
    const log = await createStageCallLog(
      'sales-deal',
      deal.id,
      SALES_NEGOTIATION_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('sales-deal', deal.id, SALES_NEGOTIATION_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const openDealModal = () => {
    const prefill = buyerOfferAmount ?? deal.offeredPrice ?? listed
    setAgreedPriceInput(String(prefill))
    setShowDealModal(true)
  }

  const agreedNum = Number(agreedPriceInput.replace(/,/g, ''))
  const discountPct =
    Number.isFinite(agreedNum) && listed > 0 ? ((listed - agreedNum) / listed) * 100 : 0

  const confirmDeal = () => {
    if (!Number.isFinite(agreedNum) || agreedNum <= 0) return
    onStageChange('token_payment', {
      agreedPrice: agreedNum,
      offeredPrice: agreedNum,
    })
    const buyerTemplate = NOTIFICATION_TEMPLATES.N05_DEAL_CONFIRMED_BUYER(
      deal.buyerName,
      deal.propertyTitle,
    )
    sendPushNotification(deal.buyerName, buyerTemplate, 'N-05', {
      dedupeKey: `N-05:buyer:${deal.id}`,
      audience: 'buyer',
      userId: deal.buyerUserId,
      relatedTo: { type: 'sales-deal', id: deal.id },
    })
    navigate('/admin/sales/token')
  }

  const confirmLost = () => {
    if (!lostReason || !lostNotes.trim()) return
    onStageChange('lost', {
      lostReason: `${lostReason}${lostNotes ? `: ${lostNotes}` : ''}`,
    })
    navigate('/admin/sales/lost')
  }

  const sendOfferToBuyer = () => {
    const tel = phoneForTel(deal.buyerPhone)
    if (sendWhatsApp) {
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(buyerMessage)}`,
        '_blank',
      )
    }
    if (sendEmail && deal.buyerEmail) {
      window.open(
        `mailto:${deal.buyerEmail}?subject=${encodeURIComponent(`Offer — ${deal.propertyTitle}`)}&body=${encodeURIComponent(buyerMessage)}`,
        '_self',
      )
    }
  }

  return (
    <div className="space-y-4">
      {deal.daysInStage > 14 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-800">
          Negotiation running {deal.daysInStage} days
        </div>
      )}

      {daysActive > 14 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          Long negotiation ({Math.floor(daysActive)}d)
        </div>
      )}

      {inactiveNegotiation && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          <span>No buyer response in {Math.floor(daysSilent)} days</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  `https://wa.me/${deal.buyerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${deal.buyerName}, following up on ${deal.propertyTitle}.`)}`,
                  '_blank',
                )
              }
            >
              Send Reminder
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowLostForm(true)}>
              Move to Lost
            </Button>
          </div>
        </div>
      )}

      {buyerAboveListed && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          Buyer offering above listed price!
        </div>
      )}

      {deadlineInfo?.passed && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          ⚠️ Deadline passed
        </div>
      )}

      {buyerOfferAmount != null && listed > 0 && buyerOfferAmount < listed * 0.85 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-900">
          Below market rate — buyer offer is more than 15% under listed price
        </div>
      )}

      <NegotiationChat
        entityType="deal"
        entityId={deal.id}
        entityTitle={deal.propertyTitle}
        currentPrice={listed}
        otherPartyName={deal.buyerName}
        otherPartyPhone={deal.buyerPhone}
        otherPartyType="buyer"
        minimumTargetPrice={listed * 0.9}
        negotiationStartedAt={deal.lastActivityAt}
        onOfferAccepted={(amount) => {
          onStageChange('token_payment', {
            agreedPrice: amount,
            offeredPrice: amount,
          })
          navigate('/admin/sales/token')
        }}
        onOfferDeclined={() => onStageChange('lost', { lostReason: 'Negotiation declined' })}
      />

      {deadlineInfo?.passed && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-medium">Buyer counter offer expired (72hrs)</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => setShowOfferForm(true)}
          >
            Restart negotiation
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deadline</CardTitle>
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
                {new Date(`${deadline}T12:00:00`).toLocaleDateString('en-IN', {
                  dateStyle: 'long',
                })}
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
                    !deadlineInfo.passed &&
                      deadlineInfo.days < 3 &&
                      'animate-pulse text-red-600',
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
                  Change
                </button>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setDeadline(null)
                    setShowDeadlinePicker(false)
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {hasOffers && (
        <Card>
          <CardHeader>
            <CardTitle>Send Offer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              rows={4}
              value={buyerMessage}
              onChange={(e) => setBuyerMessage(e.target.value)}
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
            <Button type="button" onClick={sendOfferToBuyer}>
              Send
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

          {showDealModal ? (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h4 className="font-semibold">Confirm Deal</h4>
              <input
                type="number"
                value={agreedPriceInput}
                onChange={(e) => setAgreedPriceInput(e.target.value)}
                placeholder="Final price (₹) *"
                className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              {Number.isFinite(agreedNum) && agreedNum > 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Discount: {discountPct.toFixed(1)}% below listed
                </p>
              )}
              {discountPct > 10 && (
                <div className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                  <p>Confirm with management ({discountPct.toFixed(1)}% discount)</p>
                  <label className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mgmtDiscountConfirmed}
                      onChange={(e) => setMgmtDiscountConfirmed(e.target.checked)}
                    />
                    Management approved
                  </label>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={confirmDeal}
                  disabled={discountPct > 10 && !mgmtDiscountConfirmed}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDealModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              className="mb-3 w-full bg-green-600 hover:bg-green-700"
              disabled={!hasOffers}
              title={!hasOffers ? 'Make at least one offer' : undefined}
              onClick={openDealModal}
            >
              ✅ Deal Agreed — Collect Token
            </Button>
          )}

          {!showLostForm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowLostForm(true)}
            >
              ❌ Mark as Lost
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/30 p-3">
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                <option value="">Select reason *</option>
                {LOST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <textarea
                rows={3}
                value={lostNotes}
                onChange={(e) => setLostNotes(e.target.value)}
                placeholder="Notes *"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!lostReason || !lostNotes.trim()}
                  onClick={confirmLost}
                >
                  Confirm
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowLostForm(false)}>
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
