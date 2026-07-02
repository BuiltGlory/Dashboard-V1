import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Phone, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPrice, type SalesDeal, type SalesStage } from '@/api/adminSales'
import { cn } from '@/lib/utils'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface LostDealStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
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

const LOSS_REASON_CHIPS = [
  'Price too high',
  'Found better property',
  'Financial issues',
  'No response',
  'Changed mind',
  'Property sold',
  'Other',
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

const LOST_DEAL_CALL_SUMMARY_PREFIX = 'Sales lost deal call'
const LOST_DEAL_NOTE_SUMMARY = 'Sales lost deal note'

const LOST_AT_STAGE: Record<string, string> = {
  'DEAL-012': 'Negotiation',
}

const PROPERTY_UNAVAILABLE: Record<string, boolean> = {
  'DEAL-012': false,
}

const REENGAGE_COUNT: Record<string, number> = {
  'DEAL-012': 0,
}

function formatDealDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeStyle: undefined,
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

export function LostDealStage({ deal, onStageChange }: LostDealStageProps) {
  const navigate = useNavigate()

  const [lostReason, setLostReason] = useState(deal.lostReason ?? '')
  const [analysisNotes, setAnalysisNotes] = useState('')
  const [showAddReason, setShowAddReason] = useState(false)
  const [newReasonInput, setNewReasonInput] = useState('')
  const [archived, setArchived] = useState(false)
  const [reEngageCount] = useState(REENGAGE_COUNT[deal.id] ?? 0)

  const [showReengageConfirm, setShowReengageConfirm] = useState(false)
  const [showNewDealConfirm, setShowNewDealConfirm] = useState(false)
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [refundStatus, setRefundStatus] = useState<'none' | 'refund_initiated'>('none')
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [refundReason, setRefundReason] = useState('')
  const [refundBeneficiary, setRefundBeneficiary] = useState(deal.buyerName)
  const [refundAccount, setRefundAccount] = useState('')
  const [refundIfsc, setRefundIfsc] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const tokenPaidAmount =
    deal.tokenPaid && deal.tokenAmount != null && deal.tokenAmount > 0
      ? deal.tokenAmount
      : 0

  const stageLostLabel = LOST_AT_STAGE[deal.id] ?? 'Negotiation'
  const propertyUnavailable =
    PROPERTY_UNAVAILABLE[deal.id] || lostReason === 'Property sold'

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('sales-deal', deal.id, LOST_DEAL_CALL_SUMMARY_PREFIX, LOST_DEAL_NOTE_SUMMARY).then(
      ({ calls, notes }) => {
        if (cancelled) return
        setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
        setInternalNotes(notes.map(workflowLogToStageNote))
      },
    )
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const log = await createStageCallLog(
      'sales-deal',
      deal.id,
      LOST_DEAL_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('sales-deal', deal.id, LOST_DEAL_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const saveAnalysis = () => {
    onStageChange('lost', { lostReason: lostReason || null })
  }

  return (
    <div className="space-y-4">
      {archived && (
        <Badge variant="default" className="w-full justify-center py-1">
          Archived
        </Badge>
      )}
      {reEngageCount > 0 && (
        <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
          Re-engaged {reEngageCount} time{reEngageCount > 1 ? 's' : ''} previously
        </p>
      )}
      {propertyUnavailable && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          Property no longer available
        </p>
      )}

      {tokenPaidAmount > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p>
            ⚠️ Token of {formatPrice(tokenPaidAmount)} was received. Refund required.
          </p>
          {refundStatus === 'refund_initiated' ? (
            <Badge className="mt-2 bg-orange-100 text-orange-800">Refund Pending</Badge>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="mt-2 border-red-300 text-red-700"
              onClick={() => setShowRefundModal(true)}
            >
              Initiate Refund
            </Button>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      {showRefundModal && tokenPaidAmount > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Token Refund</h3>
              <button type="button" onClick={() => setShowRefundModal(false)}>
                <X className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Amount: {formatPrice(tokenPaidAmount)}
            </p>
            <label className="mt-3 block text-sm">
              Reason *
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
              >
                <option value="">Select…</option>
                <option value="Deal cancelled by buyer">Deal cancelled by buyer</option>
                <option value="Property no longer available">Property no longer available</option>
                <option value="Terms not agreed">Terms not agreed</option>
                <option value="Admin decision">Admin decision</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="mt-2 block text-sm">
              Beneficiary name
              <input
                value={refundBeneficiary}
                onChange={(e) => setRefundBeneficiary(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <label className="mt-2 block text-sm">
              Bank account number
              <input
                value={refundAccount}
                onChange={(e) => setRefundAccount(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <label className="mt-2 block text-sm">
              IFSC code
              <input
                value={refundIfsc}
                onChange={(e) => setRefundIfsc(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={!refundReason || !refundBeneficiary.trim() || !refundAccount.trim() || !refundIfsc.trim()}
                onClick={() => {
                  setRefundStatus('refund_initiated')
                  onStageChange('lost', { lostReason: lostReason || null })
                  setShowRefundModal(false)
                  setToast(
                    `Refund of ${formatPrice(tokenPaidAmount)} initiated for ${deal.buyerName}`,
                  )
                }}
              >
                Process Refund
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowRefundModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deal Lost</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
            ❌ Deal Lost
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Property</p>
              <p className="font-medium">{deal.propertyTitle}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Buyer</p>
              <p className="font-medium">{deal.buyerName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Stage Lost At</p>
              <p className="font-medium">{stageLostLabel}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lost On</p>
              <p className="font-medium">{formatDealDate(deal.lastActivityAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Lost Reason</p>
              {lostReason ? (
                <p className="font-medium">{lostReason}</p>
              ) : (
                <p className="italic text-muted-foreground">No reason recorded</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Assigned To</p>
              <p className="font-medium">{deal.assignedTo}</p>
            </div>
            {deal.agreedPrice != null && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground">Last Agreed</p>
                <p className="font-medium">{formatPrice(deal.agreedPrice)}</p>
              </div>
            )}
          </div>
          {!lostReason && !showAddReason && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddReason(true)}
            >
              + Add Reason
            </Button>
          )}
          {showAddReason && (
            <div className="flex gap-2">
              <input
                value={newReasonInput}
                onChange={(e) => setNewReasonInput(e.target.value)}
                className="h-9 flex-1 rounded-md border border-border bg-input px-3 text-sm"
                placeholder="Enter reason"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setLostReason(newReasonInput.trim())
                  setShowAddReason(false)
                  setNewReasonInput('')
                }}
              >
                Save
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why was this lost?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lostReason && (
            <p className="rounded-lg bg-muted p-3 text-sm font-medium">{lostReason}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {LOSS_REASON_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setLostReason(chip)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  lostReason === chip
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background hover:bg-muted',
                )}
              >
                {chip}
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            value={analysisNotes}
            onChange={(e) => setAnalysisNotes(e.target.value)}
            placeholder="Additional notes on why the deal was lost…"
            className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <Button type="button" onClick={saveAnalysis}>
            Save Analysis
          </Button>
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

      <Card className="border-t-4 border-primary">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Recovery Options</h3>

          {showReengageConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Move to re-engagement?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('re_engagement')
                    navigate('/admin/sales/reengagement')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReengageConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : showNewDealConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>
                Create new deal for this buyer with a different property?
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('active_leads')
                    navigate('/admin/sales/leads')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowNewDealConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : showArchiveConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>This deal will be archived.</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setArchived(true)
                    setShowArchiveConfirm(false)
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowArchiveConfirm(false)}
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
                onClick={() => setShowReengageConfirm(true)}
              >
                ♻️ Re-engage Buyer
              </Button>
              <Button
                type="button"
                variant="outline"
                className="mb-3 w-full"
                onClick={() => setShowNewDealConfirm(true)}
              >
                🔄 Start New Deal
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setShowArchiveConfirm(true)}
              >
                📊 Mark as Permanently Lost
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
