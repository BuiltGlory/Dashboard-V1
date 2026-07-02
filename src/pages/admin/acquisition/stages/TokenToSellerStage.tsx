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

export interface TokenToSellerStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

type PaymentMethod = 'cash' | 'neft' | 'upi' | 'cheque'

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

const TOKEN_TO_SELLER_NOTE_SUMMARY = 'Acquisition token payment note'
const TOKEN_TO_SELLER_CALL_SUMMARY_PREFIX = 'Acquisition token payment call'
const TOKEN_TO_SELLER_PROOF_SUMMARY = 'Acquisition token payment proof'

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

export function TokenToSellerStage({ acquisition, onStageChange }: TokenToSellerStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const agreed = acquisition.agreedPrice
  const asking = acquisition.askingPrice

  const savedPayment = tokenPaymentFromRecord(acquisition.token?.payment)
  const [payment, setPayment] = useState<TokenPayment | null>(savedPayment ?? null)
  const [editingPayment, setEditingPayment] = useState(!savedPayment)

  const [tokenAmount, setTokenAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [notes, setNotes] = useState('')
  const [proofWarning, setProofWarning] = useState(false)
  const [chequeStatus, setChequeStatus] = useState<'pending' | 'cleared' | 'bounced'>('pending')

  const [toast, setToast] = useState<string | null>(null)
  const [showSendModal, setShowSendModal] = useState(false)
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

  const amountNum = Number(tokenAmount.replace(/,/g, ''))
  const tokenPct =
    agreed != null && agreed > 0 && Number.isFinite(amountNum)
      ? (amountNum / agreed) * 100
      : 0
  const highToken = tokenPct > 5

  const futureDate = useMemo(() => {
    if (!paymentDate) return false
    return new Date(`${paymentDate}T12:00:00`) > new Date()
  }, [paymentDate])

  const needsReference = method === 'neft' || method === 'upi'
  const needsChequeNo = method === 'cheque'

  const cashNeedsReceipt = method === 'cash' && !proofUrl

  const canSave =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    method != null &&
    paymentDate &&
    !cashNeedsReceipt &&
    chequeStatus !== 'bounced' &&
    (!needsReference || reference.trim()) &&
    (!needsChequeNo || reference.trim())

  const savings = agreed != null ? asking - agreed : 0

  const loadPaymentIntoForm = (p: TokenPayment) => {
    setTokenAmount(String(p.amount))
    setMethod(p.method)
    setPaymentDate(p.paymentDate)
    setReference(p.reference ?? '')
    setProofUrl(p.proofUrl)
    setNotes(p.notes)
  }

  useEffect(() => {
    const nextPayment = tokenPaymentFromRecord(acquisition.token?.payment)
    if (!nextPayment) return
    setPayment(nextPayment)
    setEditingPayment(false)
    loadPaymentIntoForm(nextPayment)
  }, [acquisition.token?.payment])

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
          .filter((log) => log.summary.startsWith(TOKEN_TO_SELLER_CALL_SUMMARY_PREFIX))
          .map(workflowLogToCallEntry),
      )
      setInternalNotes(
        noteResult.data
          .filter((log) => log.summary === TOKEN_TO_SELLER_NOTE_SUMMARY)
          .map(workflowLogToNoteEntry),
      )
    })
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

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
        const proofLog = await uploadWorkflowProof(session.accessToken, 'acquisition', acquisition.id, proofFile, {
          summary: TOKEN_TO_SELLER_PROOF_SUMMARY,
          notes: notes.trim(),
        })
        proofLogId = proofLog.id
        uploadedProofUrl = proofLog.attachments[0]?.url || uploadedProofUrl
      }
      const record: TokenPayment & { proofLogId?: string | null; chequeStatus?: string } = {
        amount: amountNum,
        method,
        paymentDate,
        reference: needsReference || needsChequeNo ? reference.trim() : null,
        proofUrl: uploadedProofUrl,
        notes: notes.trim(),
        proofLogId,
        chequeStatus,
      }
      const saved = await updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'token', {
        ...objectOf(acquisition.token),
        paid: true,
        payment: record,
      })
      setPayment(record)
      setEditingPayment(false)
      setProofFile(null)
      onStageChange(saved.stage, { token: saved.token })
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
      const saved = await createWorkflowLog(session.accessToken, 'acquisition', acquisition.id, {
        channel: 'call',
        direction: 'outbound',
        summary: `${TOKEN_TO_SELLER_CALL_SUMMARY_PREFIX}: ${callOutcome}`,
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
        summary: TOKEN_TO_SELLER_NOTE_SUMMARY,
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

  const sendReceiptMessage = `Hi ${acquisition.sellerName}, your token payment of ${formatPrice(payment?.amount ?? 0)} for ${acquisition.propertyTitle} has been recorded. Receipt: BG-TOKEN-${acquisition.id}.`

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
  const showReceipt = payment && !editingPayment

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deal Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            🎉 Deal Agreed!
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-blue-50/50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Asking Price</p>
              <p className="text-sm font-medium text-blue-700 line-through">
                {formatPrice(asking)}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Agreed Price</p>
              <p className="text-xl font-bold text-green-700">{formatPrice(agreed)}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs uppercase text-muted-foreground">Savings</p>
              <p className="text-lg font-semibold text-muted-foreground">
                {formatPrice(Math.max(0, savings))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Token Payment to Seller</CardTitle>
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
                  onClick={() => setTokenAmount(String(Math.round(agreed * 0.01)))}
                >
                  1% = {formatPrice(agreed * 0.01)}
                </button>
                <span className="text-muted-foreground">|</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setTokenAmount(String(Math.round(agreed * 0.02)))}
                >
                  2% = {formatPrice(agreed * 0.02)}
                </button>
              </div>
              {highToken && (
                <p className="mt-2 text-sm text-orange-700">
                  Unusually high token ({tokenPct.toFixed(1)}% of agreed price)
                </p>
              )}
              {tokenAmount && (!Number.isFinite(amountNum) || amountNum <= 0) && (
                <p className="mt-2 text-sm text-red-700">Token cannot be 0</p>
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
              <div className="space-y-2">
                <label className="text-sm font-medium">Cheque number *</label>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status:</span>
                  {(['pending', 'cleared', 'bounced'] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={chequeStatus === s ? 'default' : 'outline'}
                      className={cn(
                        'h-7 text-xs capitalize',
                        s === 'bounced' && chequeStatus === s && 'bg-red-600 hover:bg-red-700',
                      )}
                      onClick={() => setChequeStatus(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                {chequeStatus === 'bounced' && (
                  <p className="text-sm font-medium text-red-700">Cheque Bounced ❌ — re-initiate payment</p>
                )}
              </div>
            )}

            {method === 'cash' && (
              <p className="text-sm text-orange-800">
                Upload Cash Receipt (required){cashNeedsReceipt ? ' — missing' : ''}
              </p>
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
                    if (proofUrl) URL.revokeObjectURL(proofUrl)
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
                Receipt / bank screenshot
              </button>
              {proofUrl && (
                <img src={proofUrl} alt="Payment proof" className="mt-2 h-24 rounded-lg object-cover" />
              )}
              {proofWarning && !proofUrl && (
                <p className="mt-1 text-xs text-orange-700">No proof uploaded</p>
              )}
            </div>

            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />

            <Button type="button" className="w-full" disabled={!canSave || proofUploading} onClick={recordPayment}>
              {proofUploading ? 'Uploading proof...' : payment ? 'Update Payment' : 'Record Token Payment'}
            </Button>
          </CardContent>
        </Card>
      )}

      {showReceipt && payment && (
        <>
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
                Update Payment
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
                    <p className="font-medium">BG-TOKEN-{acquisition.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="font-medium">{formatReceiptDate(payment.paymentDate)}</p>
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
                <p className="mt-4 text-xs italic text-muted-foreground">
                  Balance due on documentation completion.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      downloadTextReceipt(`token-to-seller-${acquisition.referenceId}.txt`, [
                        'Builtglory Token to Seller Receipt',
                        `Acquisition: ${acquisition.referenceId}`,
                        `Seller: ${acquisition.sellerName}`,
                        `Property: ${acquisition.propertyTitle}`,
                        payment ? `Amount: ${formatPrice(payment.amount)}` : null,
                        payment ? `Method: ${payment.method}` : null,
                        payment ? `Reference: ${payment.reference}` : null,
                      ])
                      setToast('Receipt downloaded')
                      setTimeout(() => setToast(null), 2000)
                    }}
                  >
                    Download Receipt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSendModal(true)}>
                    Send to Seller
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {showSendModal && (
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
                          `mailto:${acquisition.sellerEmail}?subject=${encodeURIComponent('Token payment receipt')}&body=${encodeURIComponent(sendReceiptMessage)}`,
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
        </>
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

      <Card className="border-t-4 border-primary">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Step</h3>
          {!payment ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Record token payment to proceed
            </p>
          ) : showDocConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>
                Token of {formatPrice(payment.amount)} recorded. Move to documentation stage?
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('documentation', {
                      token: {
                        ...acquisition.token,
                        paid: true,
                        payment,
                      },
                    })
                    navigate('/admin/acquisition/documentation')
                  }}
                >
                  Confirm
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowDocConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" className="w-full" onClick={() => setShowDocConfirm(true)}>
              📄 Move to Documentation
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
