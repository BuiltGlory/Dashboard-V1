import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, FileText, Phone, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  updateAdminSalesDealTokenPayment,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import {
  createWorkflowLog,
  deleteWorkflowLog,
  listWorkflowLogs,
  uploadWorkflowProof,
  type WorkflowLog,
} from '@/api/adminWorkflow'
import { cn } from '@/lib/utils'
import { downloadTextReceipt } from '@/utils/receipts'

export interface TokenPaymentStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type PaymentMethod = 'cash' | 'neft' | 'upi' | 'cheque'
type BalancePaymentType = 'full' | 'stage'

interface TokenPayment {
  amount: number
  method: PaymentMethod
  paymentDate: string
  reference: string | null
  proofUrl: string | null
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

const TOKEN_PAYMENT_NOTE_SUMMARY = 'Sales token payment note'
const TOKEN_PAYMENT_CALL_SUMMARY_PREFIX = 'Sales token payment call'
const TOKEN_PAYMENT_PROOF_SUMMARY = 'Sales token payment proof'

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

function formatReceiptDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberOf(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
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

function tokenPaymentFromRecord(record: unknown): TokenPayment | null {
  const payment = objectOf(record)
  const amount = numberOf(payment.amount)
  const method = stringOf(payment.method) as PaymentMethod
  if (!amount || !['cash', 'neft', 'upi', 'cheque'].includes(method)) return null
  return {
    amount,
    method,
    paymentDate: stringOf(payment.paymentDate, todayIsoDate()),
    reference: payment.reference == null ? null : stringOf(payment.reference),
    proofUrl: payment.proofUrl == null ? null : stringOf(payment.proofUrl),
    notes: stringOf(payment.notes),
  }
}

export function TokenPaymentStage({ deal, onStageChange }: TokenPaymentStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const listed = deal.propertyPrice
  const agreed = deal.agreedPrice

  const [payment, setPayment] = useState<TokenPayment | null>(null)
  const [editingPayment, setEditingPayment] = useState(true)

  const [tokenAmount, setTokenAmount] = useState(
    deal.tokenAmount != null ? String(deal.tokenAmount) : '',
  )
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [notes, setNotes] = useState('')
  const [proofWarning, setProofWarning] = useState(false)

  const [paymentType, setPaymentType] = useState<BalancePaymentType | null>(
    deal.paymentType === 'full' || deal.paymentType === 'stage' ? deal.paymentType : null,
  )

  const [toast, setToast] = useState<string | null>(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showFullConfirm, setShowFullConfirm] = useState(false)
  const [showStageConfirm, setShowStageConfirm] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)
  const [partialPayment, setPartialPayment] = useState(false)
  const [partialReceived, setPartialReceived] = useState('')

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const amountNum = Number(tokenAmount.replace(/,/g, ''))
  const tokenPct =
    agreed != null && agreed > 0 && Number.isFinite(amountNum)
      ? (amountNum / agreed) * 100
      : 0
  const highToken = tokenPct > 10

  const futureDate = useMemo(() => {
    if (!paymentDate) return false
    return new Date(`${paymentDate}T12:00:00`) > new Date()
  }, [paymentDate])

  const needsReference = method === 'neft' || method === 'upi'
  const needsChequeNo = method === 'cheque'

  const canSave =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    method != null &&
    paymentDate &&
    (!needsReference || reference.trim()) &&
    (!needsChequeNo || reference.trim())

  const savings = agreed != null ? Math.max(0, listed - agreed) : 0
  const discountPct =
    agreed != null && listed > 0 ? Math.round(((listed - agreed) / listed) * 100) : 0

  const balanceDue = agreed != null && payment ? Math.max(0, agreed - payment.amount) : 0
  const tokenTarget = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0
  const partialReceivedNum = Number(partialReceived.replace(/,/g, ''))
  const partialBalance =
    partialPayment && Number.isFinite(partialReceivedNum)
      ? Math.max(0, tokenTarget - partialReceivedNum)
      : 0

  const loadPaymentIntoForm = (p: TokenPayment) => {
    setTokenAmount(String(p.amount))
    setMethod(p.method)
    setPaymentDate(p.paymentDate)
    setReference(p.reference ?? '')
    setProofUrl(p.proofUrl)
    setNotes(p.notes)
  }

  useEffect(() => {
    const savedPayment = tokenPaymentFromRecord(deal.tokenPayment)
    if (!savedPayment) return
    setPayment(savedPayment)
    setEditingPayment(false)
    loadPaymentIntoForm(savedPayment)
  }, [deal.tokenPayment])

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
          .filter((log) => log.summary.startsWith(TOKEN_PAYMENT_CALL_SUMMARY_PREFIX))
          .map(workflowLogToCallEntry),
      )
      setInternalNotes(
        noteResult.data
          .filter((log) => log.summary === TOKEN_PAYMENT_NOTE_SUMMARY)
          .map(workflowLogToNoteEntry),
      )
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const recordPayment = async () => {
    if (!canSave || !method) return
    if (!proofUrl) setProofWarning(true)
    else setProofWarning(false)

    setProofUploading(true)
    try {
      const session = readAdminSession()
      if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
      let uploadedProofUrl = proofUrl
      let proofLogId: string | null = null
      if (proofFile) {
        const proofLog = await uploadWorkflowProof(session.accessToken, 'sales-deal', deal.id, proofFile, {
          summary: TOKEN_PAYMENT_PROOF_SUMMARY,
          notes: notes.trim(),
        })
        proofLogId = proofLog.id
        uploadedProofUrl = proofLog.attachments[0]?.url || uploadedProofUrl
      }

      const record: TokenPayment & { proofLogId?: string | null } = {
        amount: amountNum,
        method,
        paymentDate,
        reference: needsReference || needsChequeNo ? reference.trim() : null,
        proofUrl: uploadedProofUrl,
        notes: notes.trim(),
        proofLogId,
      }
      const saved = await updateAdminSalesDealTokenPayment(session.accessToken, deal.id, {
        tokenAmount: amountNum,
        tokenPaid: true,
        tokenPayment: { ...record },
      })
      setPayment(record)
      setEditingPayment(false)
      setProofFile(null)
      onStageChange(saved.stage, {
        tokenAmount: saved.tokenAmount,
        tokenPaid: saved.tokenPaid,
        tokenPayment: saved.tokenPayment,
      })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not record token payment')
    } finally {
      setProofUploading(false)
    }
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `${TOKEN_PAYMENT_CALL_SUMMARY_PREFIX}: ${callOutcome}`,
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
      setToast(error instanceof Error ? error.message : 'Could not save call log')
    }
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await createWorkflowLog(session.accessToken, 'sales-deal', deal.id, {
        channel: 'note',
        direction: 'internal',
        summary: TOKEN_PAYMENT_NOTE_SUMMARY,
        body: noteText.trim(),
      })
      setInternalNotes((prev) => [workflowLogToNoteEntry(saved), ...prev])
      setNoteText('')
      setShowNoteForm(false)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not save internal note')
    }
  }

  const deleteInternalNote = async (noteId: string) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Admin session expired. Please sign in again.')
      return
    }
    try {
      await deleteWorkflowLog(session.accessToken, noteId)
      setInternalNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not delete internal note')
    }
  }

  const sendReceiptMessage =
    payment && agreed != null
      ? `Hi ${deal.buyerName}, we confirm receipt of token amount ${formatPrice(payment.amount)} for ${deal.propertyTitle}. Balance due: ${formatPrice(balanceDue)}. Thank you!`
      : ''

  const showForm = agreed != null && (!payment || editingPayment)
  const showReceipt = payment && !editingPayment
  const tokenRecorded = payment != null && !editingPayment
  const partialBlocksNext =
    partialPayment &&
    tokenRecorded &&
    (partialReceivedNum <= 0 || partialReceivedNum < tokenTarget)

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deal Confirmed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {agreed == null ? (
            <div className="space-y-3">
              <p className="font-semibold text-red-800">No agreed price set</p>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => onStageChange('negotiation')}
              >
                ← Back to Negotiation
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                🎉 Deal Agreed!
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Listed</p>
                  <p className="text-sm font-medium text-muted-foreground line-through">
                    {formatPrice(listed)}
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs uppercase text-muted-foreground">Agreed</p>
                  <p className="text-xl font-bold text-green-700">{formatPrice(agreed)}</p>
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs uppercase text-muted-foreground">Savings</p>
                  <p className="text-lg font-semibold text-muted-foreground">
                    {formatPrice(savings)}
                  </p>
                </div>
              </div>
              {discountPct > 0 && (
                <p className="text-sm text-muted-foreground">
                  Buyer gets {discountPct}% discount
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Token Payment from Buyer</CardTitle>
            {payment && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => {
                  setEditingPayment(false)
                  loadPaymentIntoForm(payment)
                }}
              >
                Cancel edit
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Token amount (₹) *</label>
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setTokenAmount(String(Math.round(agreed! * 0.01)))}
                >
                  1% = {formatPrice(agreed! * 0.01)}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setTokenAmount(String(Math.round(agreed! * 0.02)))}
                >
                  2% = {formatPrice(agreed! * 0.02)}
                </button>
              </div>
              {highToken && (
                <p className="mt-2 text-sm text-orange-700">Token is unusually high</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Payment method *</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['cash', 'neft', 'upi', 'cheque'] as PaymentMethod[]).map((m) => (
                  <Button
                    key={m}
                    type="button"
                    variant={method === m ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setMethod(m)
                      setReference('')
                    }}
                  >
                    {METHOD_LABELS[m]}
                  </Button>
                ))}
              </div>
            </div>

            {needsReference && (
              <div>
                <label className="text-sm font-medium">UTR / Reference number *</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
              </div>
            )}

            {needsChequeNo && (
              <div>
                <label className="text-sm font-medium">Cheque number *</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium">Payment date *</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              {futureDate && (
                <p className="mt-1 text-xs text-orange-700">Payment date is in the future</p>
              )}
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    if (proofUrl?.startsWith('blob:')) URL.revokeObjectURL(proofUrl)
                    setProofUrl(URL.createObjectURL(file))
                    setProofFile(file)
                    setProofWarning(false)
                  }
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <Upload className="size-6" />
                Upload proof (optional)
              </button>
              {proofUrl && (
                <img
                  src={proofUrl}
                  alt="Payment proof"
                  className="mt-2 h-24 rounded-lg object-cover"
                />
              )}
              {proofWarning && !proofUrl && (
                <p className="mt-1 text-xs text-orange-700">Add proof for records</p>
              )}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={partialPayment}
                onChange={(e) => setPartialPayment(e.target.checked)}
              />
              Partial payment received
            </label>
            {partialPayment && (
              <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                <label className="text-sm font-medium">Amount received (₹)</label>
                <input
                  type="number"
                  value={partialReceived}
                  onChange={(e) => setPartialReceived(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
                {partialReceivedNum > 0 && partialBalance > 0 && (
                  <p className="text-sm text-orange-800">
                    Balance due: {formatPrice(partialBalance)}
                  </p>
                )}
                <span className="inline-flex rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                  Partial Payment
                </span>
                <p className="text-xs text-orange-700">
                  Full token required before proceeding to next stage
                </p>
              </div>
            )}

            <Button type="button" className="w-full" disabled={!canSave || proofUploading} onClick={recordPayment}>
              {proofUploading ? 'Recording…' : 'Record Token Receipt'}
            </Button>
          </CardContent>
        </Card>
      )}

      {showReceipt && payment && agreed != null && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Token Receipt</CardTitle>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                loadPaymentIntoForm(payment)
                setEditingPayment(true)
              }}
            >
              Update
            </button>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border-2 border-border p-4">
              <p className="border-b border-border pb-2 text-center text-sm font-bold tracking-wide">
                BUILTGLORY — Token Receipt
              </p>
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Receipt No</p>
                  <p className="font-medium">BG-SALE-TOKEN-{deal.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatReceiptDate(payment.paymentDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Buyer</p>
                  <p className="font-medium">{deal.buyerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Property</p>
                  <p className="font-medium">{deal.propertyTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Listed Price</p>
                  <p className="font-medium">{formatPrice(listed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agreed Price</p>
                  <p className="font-medium">{formatPrice(agreed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Token Amount</p>
                  <p className="font-bold text-primary">{formatPrice(payment.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium">{METHOD_LABELS[payment.method]}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="font-medium">{payment.reference ?? 'N/A'}</p>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                Balance due: {formatPrice(balanceDue)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    downloadTextReceipt(`token-payment-${deal.referenceId}.txt`, [
                      'Builtglory Token Payment Receipt',
                      `Deal: ${deal.referenceId}`,
                      `Buyer: ${deal.buyerName}`,
                      `Property: ${deal.propertyTitle}`,
                      payment ? `Amount: ${formatPrice(payment.amount)}` : null,
                      payment ? `Method: ${payment.method}` : null,
                      payment ? `Date: ${payment.paymentDate}` : null,
                      agreed != null ? `Agreed Price: ${formatPrice(agreed)}` : null,
                      `Balance Due: ${formatPrice(balanceDue)}`,
                    ])
                    setToast('Receipt downloaded')
                    setTimeout(() => setToast(null), 2000)
                  }}
                >
                  Download
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSendModal(true)}
                >
                  Send to Buyer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showSendModal && payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Send receipt to buyer</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              {sendReceiptMessage}
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
                      `https://wa.me/${tel}?text=${encodeURIComponent(sendReceiptMessage)}`,
                      '_blank',
                    )
                  }
                  if (sendEmail && deal.buyerEmail) {
                    window.open(
                      `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('Token payment receipt')}&body=${encodeURIComponent(sendReceiptMessage)}`,
                      '_self',
                    )
                  }
                  setShowSendModal(false)
                }}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSendModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {tokenRecorded && (
        <Card>
          <CardHeader>
            <CardTitle>Choose Payment Method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">How will buyer pay the balance?</p>

            <div
              className={cn(
                'relative rounded-xl border-2 p-4 transition-colors',
                paymentType === 'full'
                  ? 'border-blue-500 bg-blue-50/30'
                  : 'border-border bg-card',
              )}
            >
              {paymentType === 'full' && (
                <Check className="absolute right-3 top-3 size-5 text-blue-600" />
              )}
              <h4 className="font-semibold text-foreground">Full Payment</h4>
              <p className="mt-1 text-sm text-muted-foreground">Pay entire balance at once</p>
              <Button
                type="button"
                variant={paymentType === 'full' ? 'default' : 'outline'}
                size="sm"
                className="mt-3"
                onClick={() => setPaymentType('full')}
              >
                Select Full Payment
              </Button>
            </div>

            <div
              className={cn(
                'relative rounded-xl border-2 p-4 transition-colors',
                paymentType === 'stage'
                  ? 'border-blue-500 bg-blue-50/30'
                  : 'border-border bg-card',
              )}
            >
              {paymentType === 'stage' && (
                <Check className="absolute right-3 top-3 size-5 text-blue-600" />
              )}
              <h4 className="font-semibold text-foreground">Stage Payment</h4>
              <p className="mt-1 text-sm text-muted-foreground">Pay in milestones</p>
              <Button
                type="button"
                variant={paymentType === 'stage' ? 'default' : 'outline'}
                size="sm"
                className="mt-3"
                onClick={() => setPaymentType('stage')}
              >
                Select Stage Payment
              </Button>
            </div>
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
          <h3 className="font-semibold text-foreground">Next Action</h3>
          {!tokenRecorded ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Record token to proceed
            </p>
          ) : showFullConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Move to full payment collection?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('full_payment', {
                      paymentType: 'full',
                      tokenPaid: true,
                      tokenAmount: payment!.amount,
                      totalPaid: payment!.amount,
                    })
                    navigate('/admin/sales/fullpayment')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFullConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : showStageConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Move to stage payment plan?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('stage_payment', {
                      paymentType: 'stage',
                      tokenPaid: true,
                      tokenAmount: payment!.amount,
                      totalPaid: payment!.amount,
                    })
                    navigate('/admin/sales/stagepayment')
                  }}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowStageConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : paymentType === 'full' ? (
            <Button
              type="button"
              className="w-full"
              disabled={partialBlocksNext}
              onClick={() => setShowFullConfirm(true)}
            >
              💳 Move to Full Payment
            </Button>
          ) : paymentType === 'stage' ? (
            <Button
              type="button"
              className="w-full"
              disabled={partialBlocksNext}
              onClick={() => setShowStageConfirm(true)}
            >
              📊 Move to Stage Payment
            </Button>
          ) : (
            <Button type="button" className="w-full" disabled>
              Select payment method first
            </Button>
          )}
          {partialBlocksNext && (
            <p className="text-xs text-orange-700">
              Full token required before proceeding to next stage
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
