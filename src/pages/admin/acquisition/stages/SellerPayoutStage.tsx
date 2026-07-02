import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Phone, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  updateAdminAcquisitionSection,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
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

export interface SellerPayoutStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

type PayoutMethod = 'neft' | 'upi' | 'cheque'

interface FinalPayment {
  amount: number
  method: PayoutMethod
  paymentDate: string
  reference: string
  chequeDate: string | null
  proofUrl: string
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

const METHOD_LABELS: Record<PayoutMethod, string> = {
  neft: 'NEFT',
  upi: 'UPI',
  cheque: 'Cheque',
}

const CHECKLIST_ITEMS = [
  { key: 'allDocsVerified', label: 'All documents verified' },
  { key: 'paymentProofUploaded', label: 'Payment proof uploaded' },
  { key: 'sellerConfirmation', label: 'Seller confirmation received' },
  { key: 'legalClearance', label: 'Legal clearance confirmed' },
  { key: 'handoverScheduled', label: 'Property handover scheduled' },
] as const

type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]['key']

const SELLER_PAYOUT_NOTE_SUMMARY = 'Acquisition seller payout note'
const SELLER_PAYOUT_CALL_SUMMARY_PREFIX = 'Acquisition seller payout call'
const SELLER_PAYOUT_PROOF_SUMMARY = 'Acquisition seller payout proof'

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

function payoutFromRecord(record: unknown): FinalPayment | null {
  const payment = objectOf(record)
  const amount = numberOf(payment.amount)
  const method = stringOf(payment.method) as PayoutMethod
  if (!amount || !['neft', 'upi', 'cheque'].includes(method)) return null
  return {
    amount,
    method,
    paymentDate: stringOf(payment.paymentDate, todayIsoDate()),
    reference: stringOf(payment.reference),
    chequeDate: payment.chequeDate == null ? null : stringOf(payment.chequeDate),
    proofUrl: stringOf(payment.proofUrl),
    notes: stringOf(payment.notes),
  }
}

export function SellerPayoutStage({ acquisition, onStageChange }: SellerPayoutStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const agreed = acquisition.agreedPrice
  const tokenPayment = acquisition.token?.payment as { amount?: number } | undefined
  const tokenPaid = typeof tokenPayment?.amount === 'number' ? tokenPayment.amount : null
  const balanceDue =
    agreed != null ? agreed - (tokenPaid ?? 0) : null

  const [payment, setPayment] = useState<FinalPayment | null>(null)
  const [editingPayment, setEditingPayment] = useState(true)

  const [amount, setAmount] = useState(() =>
    balanceDue != null ? String(balanceDue) : '',
  )
  const [method, setMethod] = useState<PayoutMethod | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [chequeDate, setChequeDate] = useState(todayIsoDate())
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [notes, setNotes] = useState('')
  const [proofWarning, setProofWarning] = useState(false)

  const [checklist, setChecklist] = useState<Record<ChecklistKey, boolean>>({
    allDocsVerified: false,
    paymentProofUploaded: false,
    sellerConfirmation: false,
    legalClearance: false,
    handoverScheduled: false,
  })

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [toast, setToast] = useState<string | null>(null)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showAcquireConfirm, setShowAcquireConfirm] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const amountNum = Number(amount.replace(/,/g, ''))
  const futureDate = useMemo(() => {
    if (!paymentDate) return false
    return new Date(`${paymentDate}T12:00:00`) > new Date()
  }, [paymentDate])

  const amountMismatch =
    balanceDue != null && Number.isFinite(amountNum) && amountNum !== balanceDue

  const hasBankAccount = Boolean(acquisition.sellerEmail)
  const needsReference = method === 'neft' || method === 'upi'
  const isCheque = method === 'cheque'

  const canSave =
    agreed != null &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    !amountMismatch &&
    method != null &&
    (method !== 'neft' || hasBankAccount) &&
    paymentDate &&
    proofUrl != null &&
    (!needsReference || reference.trim()) &&
    (!isCheque || (reference.trim() && chequeDate))

  const checklistCount = Object.values(checklist).filter(Boolean).length
  const checklistIncomplete = checklistCount < 5

  const totalPaid = (tokenPaid ?? 0) + (payment?.amount ?? 0)
  const paymentComplete = agreed != null && totalPaid === agreed
  const overpayment = agreed != null && totalPaid > agreed

  const persistChecklist = async (nextChecklist: Record<ChecklistKey, boolean>) => {
    const session = readAdminSession()
    if (!session?.accessToken) return
    const saved = await updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'payout', {
      ...acquisition.payout,
      checklist: nextChecklist,
    })
    onStageChange(saved.stage, { payout: saved.payout })
  }
  const underpayment = agreed != null && totalPaid < agreed

  const loadPaymentIntoForm = (p: FinalPayment) => {
    setAmount(String(p.amount))
    setMethod(p.method)
    setPaymentDate(p.paymentDate)
    setReference(p.reference)
    setChequeDate(p.chequeDate ?? todayIsoDate())
    setProofUrl(p.proofUrl)
    setNotes(p.notes)
  }

  useEffect(() => {
    const savedPayout = objectOf(acquisition.payout)
    const savedPayment = payoutFromRecord(savedPayout.finalPayment ?? savedPayout.payment)
    if (!savedPayment) return
    setPayment(savedPayment)
    setEditingPayment(false)
    loadPaymentIntoForm(savedPayment)
    const savedChecklist = objectOf(savedPayout.checklist)
    setChecklist((prev) => ({
      ...prev,
      ...(Object.fromEntries(
        CHECKLIST_ITEMS.map(({ key }) => [key, Boolean(savedChecklist[key])]),
      ) as Record<ChecklistKey, boolean>),
    }))
  }, [acquisition.payout])

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !acquisition.id) {
      setCallLogs([])
      setInternalNotes([])
      return
    }
    let cancelled = false
    void Promise.all([
      listWorkflowLogs(session.accessToken, 'acquisition', acquisition.id, 'call').catch(() => ({ data: [] as WorkflowLog[] })),
      listWorkflowLogs(session.accessToken, 'acquisition', acquisition.id, 'note').catch(() => ({ data: [] as WorkflowLog[] })),
    ]).then(([callResult, noteResult]) => {
      if (cancelled) return
      setCallLogs(
        callResult.data
          .filter((log) => log.summary.startsWith(SELLER_PAYOUT_CALL_SUMMARY_PREFIX))
          .map(workflowLogToCallEntry),
      )
      setInternalNotes(
        noteResult.data
          .filter((log) => log.summary === SELLER_PAYOUT_NOTE_SUMMARY)
          .map(workflowLogToNoteEntry),
      )
    })
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  const recordPayment = async () => {
    if (!canSave || !method || !proofUrl) {
      if (!proofUrl) setProofWarning(true)
      return
    }
    setProofUploading(true)
    try {
      const session = readAdminSession()
      if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
      setProofWarning(false)
      let uploadedProofUrl = proofUrl
      let proofLogId: string | null = null
      if (proofFile) {
        const proofLog = await uploadWorkflowProof(session.accessToken, 'acquisition', acquisition.id, proofFile, {
          summary: SELLER_PAYOUT_PROOF_SUMMARY,
          notes: notes.trim(),
        })
        proofLogId = proofLog.id
        uploadedProofUrl = proofLog.attachments[0]?.url || uploadedProofUrl
      }
      const record: FinalPayment & { proofLogId?: string | null } = {
        amount: amountNum,
        method,
        paymentDate,
        reference: reference.trim(),
        chequeDate: isCheque ? chequeDate : null,
        proofUrl: uploadedProofUrl,
        notes: notes.trim(),
        proofLogId,
      }
      const nextPayout = {
        ...acquisition.payout,
        finalPayment: { ...record },
        checklist: { ...checklist, paymentProofUploaded: true },
      }
      const saved = await updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'payout', nextPayout)
      setPayment(record)
      setEditingPayment(false)
      setProofFile(null)
      setChecklist((prev) => ({ ...prev, paymentProofUploaded: true }))
      onStageChange(saved.stage, { payout: saved.payout })
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not record seller payout')
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
      const saved = await createWorkflowLog(session.accessToken, 'acquisition', acquisition.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `${SELLER_PAYOUT_CALL_SUMMARY_PREFIX}: ${callOutcome}`,
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
      const saved = await createWorkflowLog(session.accessToken, 'acquisition', acquisition.id, {
        channel: 'note',
        direction: 'internal',
        summary: SELLER_PAYOUT_NOTE_SUMMARY,
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

  const displayReference = (p: FinalPayment) => {
    if (p.method === 'cheque' && p.chequeDate) {
      return `${p.reference} · ${formatReceiptDate(p.chequeDate)}`
    }
    return p.reference
  }

  const sendReceiptMessage = `Hi ${acquisition.sellerName}, your final payment of ${formatPrice(payment?.amount ?? 0)} for ${acquisition.propertyTitle} has been recorded. Total paid: ${formatPrice(totalPaid)}. Receipt: BG-PAY-${acquisition.id}.`

  if (agreed == null) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="space-y-3 p-6">
          <p className="font-semibold text-red-800">No agreed price found</p>
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => navigate('/admin/acquisition/negotiation')}
          >
            ← Back to Negotiation
          </button>
        </CardContent>
      </Card>
    )
  }

  const showForm = !payment || editingPayment
  const showConfirmation = payment && !editingPayment
  const activePayment = payment

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payout Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-blue-50/50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Agreed Price</p>
              <p className="font-medium text-blue-700">{formatPrice(agreed)}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs uppercase text-muted-foreground">Token Paid</p>
              <p className="font-medium text-muted-foreground">
                {tokenPaid != null ? formatPrice(tokenPaid) : 'Not recorded'}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Balance Due</p>
              <p className="text-lg font-bold text-green-700">
                {formatPrice(balanceDue ?? agreed)}
              </p>
            </div>
          </div>
          {tokenPaid == null && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              No token recorded — full amount due: {formatPrice(agreed)}
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Final Payment</CardTitle>
            {payment && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setEditingPayment(false)}
              >
                Cancel edit
              </button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Amount (₹) *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              {amountMismatch && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <p className="font-medium">Amount mismatch</p>
                  <p>Expected: {formatPrice(balanceDue ?? 0)}</p>
                  <p>Entered: {formatPrice(amountNum)}</p>
                </div>
              )}
              {!hasBankAccount && (
                <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  Seller bank details missing — NEFT blocked.{' '}
                  <button type="button" className="underline" onClick={() => setToast('Add seller bank details before NEFT payout')}>
                    Request bank details
                  </button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Payment method *</p>
              <div className="grid grid-cols-3 gap-2">
                {(['neft', 'upi', 'cheque'] as PayoutMethod[]).map((m) => (
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

            {isCheque && (
              <>
                <div>
                  <label className="text-sm font-medium">Cheque number *</label>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Cheque date *</label>
                  <input
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
              </>
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
                Upload payment proof *
              </button>
              {proofUrl && (
                <img src={proofUrl} alt="Payment proof" className="mt-2 h-24 rounded-lg object-cover" />
              )}
              {proofWarning && !proofUrl && (
                <p className="mt-1 text-xs text-red-700">Payment proof is required</p>
              )}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />

            <Button
              type="button"
              className="w-full"
              disabled={!canSave || proofUploading}
              onClick={recordPayment}
            >
              {proofUploading ? 'Recording…' : payment ? 'Update Payment' : 'Record Final Payment'}
            </Button>
          </CardContent>
        </Card>
      )}

      {showConfirmation && activePayment && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Payment Confirmation</CardTitle>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                loadPaymentIntoForm(activePayment)
                setEditingPayment(true)
              }}
            >
              Update Payment
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              ✅ Final payment recorded
            </div>
            <div className="rounded-lg border border-border p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Payment No</p>
                  <p className="font-medium">BG-PAY-{acquisition.id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{formatReceiptDate(activePayment.paymentDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Seller</p>
                  <p className="font-medium">{acquisition.sellerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Property</p>
                  <p className="font-medium">{acquisition.propertyTitle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agreed Price</p>
                  <p className="font-medium">{formatPrice(agreed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Token Paid</p>
                  <p className="font-medium">
                    {tokenPaid != null ? formatPrice(tokenPaid) : 'Not recorded'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final Payment</p>
                  <p className="font-medium">{formatPrice(activePayment.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium">{METHOD_LABELS[activePayment.method]}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="font-medium">{displayReference(activePayment)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold">{formatPrice(totalPaid)}</p>
                </div>
              </div>
              {paymentComplete ? (
                <p className="mt-3 text-sm font-medium text-green-700">✅ Payment complete</p>
              ) : overpayment ? (
                <p className="mt-3 text-sm font-medium text-red-700">⚠️ Overpayment detected</p>
              ) : (
                <>
                  <p className="mt-3 text-sm font-medium text-red-700">⚠️ Payment mismatch</p>
                  {underpayment && (
                    <p className="mt-1 text-xs text-orange-700">Underpayment warning</p>
                  )}
                </>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    downloadTextReceipt(`seller-payout-${acquisition.referenceId}.txt`, [
                      'Builtglory Seller Payout Receipt',
                      `Acquisition: ${acquisition.referenceId}`,
                      `Seller: ${acquisition.sellerName}`,
                      `Property: ${acquisition.propertyTitle}`,
                      payment ? `Amount: ${formatPrice(payment.amount)}` : null,
                      payment ? `Method: ${payment.method}` : null,
                      payment ? `Reference: ${payment.reference}` : null,
                      balanceDue != null ? `Expected balance: ${formatPrice(balanceDue)}` : null,
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
                  Send to Seller
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showSendModal && activePayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Send receipt to seller</h4>
            <p className="mt-2 text-sm text-muted-foreground">{sendReceiptMessage}</p>
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
                  const tel = phoneForTel(acquisition.sellerPhone)
                  if (sendWhatsApp) {
                    window.open(
                      `https://wa.me/${tel}?text=${encodeURIComponent(sendReceiptMessage)}`,
                      '_blank',
                    )
                  }
                  if (sendEmail && acquisition.sellerEmail) {
                    window.open(
                      `mailto:${acquisition.sellerEmail}?subject=${encodeURIComponent('Final payment receipt')}&body=${encodeURIComponent(sendReceiptMessage)}`,
                      '_self',
                    )
                  }
                  setShowSendModal(false)
                }}
              >
                Send
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSendModal(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pre-Acquisition Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {checklistCount} of 5 confirmed
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(checklistCount / 5) * 100}%` }}
            />
          </div>
          <ul className="space-y-2">
            {CHECKLIST_ITEMS.map(({ key, label }) => (
              <li key={key}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checklist[key]}
                    onChange={(e) => {
                      const nextChecklist = { ...checklist, [key]: e.target.checked }
                      setChecklist(nextChecklist)
                      void persistChecklist(nextChecklist).catch((error) =>
                        setToast(error instanceof Error ? error.message : 'Could not save checklist'),
                      )
                    }}
                    className="size-4 rounded border-border"
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
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

      <Card className="border-t-4 border-emerald-500">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Step</h3>
          {!payment ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Record final payment to mark property as acquired
            </p>
          ) : showAcquireConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p className="font-medium">Property: {acquisition.propertyTitle}</p>
              <p className="mt-1">Total paid: {formatPrice(totalPaid)}</p>
              <p className="mt-2">Mark as owned by Builtglory?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    onStageChange('acquired', {
                      finalPurchasePrice: totalPaid,
                      payout: {
                        ...acquisition.payout,
                        completed: true,
                        payment,
                        completedAt: new Date().toISOString(),
                      },
                    })
                    navigate('/admin/acquisition/acquired')
                  }}
                >
                  ✅ Confirm Acquisition
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAcquireConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              {checklistIncomplete && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  Pre-acquisition checklist incomplete ({checklistCount} of 5). You can still proceed.
                </div>
              )}
              <Button
                type="button"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setShowAcquireConfirm(true)}
              >
                🏠 Mark as Acquired
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
