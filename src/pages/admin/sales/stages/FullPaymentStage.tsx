import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Home, Phone, Plus, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  updateAdminSalesDealPaymentPlan,
  type SalesDeal,
  type SalesStage,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import { uploadWorkflowProof } from '@/api/adminWorkflow'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'
import { downloadTextReceipt } from '@/utils/receipts'

export interface FullPaymentStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type PaymentMethod = 'neft' | 'upi' | 'cheque'

interface FullPayment {
  amount: number
  method: PaymentMethod
  paymentDate: string
  reference: string | null
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

const METHOD_LABELS: Record<PaymentMethod, string> = {
  neft: 'NEFT',
  upi: 'UPI',
  cheque: 'Cheque',
}

const FULL_PAYMENT_CALL_SUMMARY_PREFIX = 'Sales full payment call'
const FULL_PAYMENT_NOTE_SUMMARY = 'Sales full payment note'
const FULL_PAYMENT_PROOF_SUMMARY = 'Sales full payment proof'

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

function fullPaymentFromRecord(value: unknown): FullPayment | null {
  const record = objectOf(value)
  if (Object.keys(record).length === 0) return null
  const method = stringOf(record.method)
  if (method !== 'neft' && method !== 'upi' && method !== 'cheque') return null
  return {
    amount: numberOf(record.amount),
    method,
    paymentDate: stringOf(record.paymentDate, todayIsoDate()),
    reference: record.reference == null ? null : stringOf(record.reference),
    chequeDate: record.chequeDate == null ? null : stringOf(record.chequeDate),
    proofUrl: stringOf(record.proofUrl),
    notes: stringOf(record.notes),
  }
}

interface OtherCharge {
  id: string
  label: string
  amount: number
}

interface CostBreakdownState {
  propertyBasePrice: number
  infrastructureCharge: number
  clubMembershipFee: number
  carParkingCharge: number
  floorRisePremium: number
  facingPremium: number
  otherPropertyCost: number
  otherPropertyCostNote: string
  stampDuty: number
  registrationFee: number
  legalFee: number
  gst: number
}

const PRE_POPULATED_CHARGE_IDS = new Set([
  'maintenance',
  'electricity',
  'water',
  'brokerage',
])

const QUICK_CHARGE_PRESETS: {
  key: string
  label: string
  amount: (agreedPrice: number) => number
}[] = [
  { key: 'gst', label: 'GST (5%)', amount: (p) => Math.round(p * 0.05) },
  { key: 'khata', label: 'Khata Transfer Fee', amount: () => 2000 },
  { key: 'betterment', label: 'Betterment Charges', amount: () => 0 },
  { key: 'society', label: 'Society Transfer Fee', amount: () => 0 },
  { key: 'noc', label: 'NOC Charges', amount: () => 0 },
  { key: 'franking', label: 'Franking Charges', amount: () => 0 },
]

function defaultCosts(agreedPrice: number): CostBreakdownState {
  const autoStampDuty = Math.round(agreedPrice * 0.056)
  const autoRegFee = Math.round(agreedPrice * 0.01)
  return {
    propertyBasePrice: agreedPrice,
    infrastructureCharge: 0,
    clubMembershipFee: 0,
    carParkingCharge: 0,
    floorRisePremium: 0,
    facingPremium: 0,
    otherPropertyCost: 0,
    otherPropertyCostNote: '',
    stampDuty: autoStampDuty,
    registrationFee: autoRegFee,
    legalFee: 0,
    gst: 0,
  }
}

function defaultOtherCharges(): OtherCharge[] {
  return [
    { id: 'maintenance', label: 'Maintenance Deposit', amount: 0 },
    { id: 'electricity', label: 'Electricity Deposit', amount: 0 },
    { id: 'water', label: 'Water / BWSSB Deposit', amount: 0 },
    { id: 'brokerage', label: 'Brokerage / Agent Fee', amount: 0 },
  ]
}

function createInitialBreakdown(
  agreedPrice: number,
): { costs: CostBreakdownState; otherCharges: OtherCharge[] } {
  return {
    costs: defaultCosts(agreedPrice),
    otherCharges: defaultOtherCharges(),
  }
}

function costBreakdownFromRecord(value: unknown) {
  const record = objectOf(value)
  const costs = objectOf(record.costs)
  const otherCharges = Array.isArray(record.otherCharges)
    ? record.otherCharges.map((item, index) => {
        const charge = objectOf(item)
        return {
          id: stringOf(charge.id, `charge-${index}`),
          label: stringOf(charge.label, 'Charge'),
          amount: numberOf(charge.amount),
        }
      })
    : []
  return {
    costs: Object.keys(costs).length
      ? {
          propertyBasePrice: numberOf(costs.propertyBasePrice),
          infrastructureCharge: numberOf(costs.infrastructureCharge),
          clubMembershipFee: numberOf(costs.clubMembershipFee),
          carParkingCharge: numberOf(costs.carParkingCharge),
          floorRisePremium: numberOf(costs.floorRisePremium),
          facingPremium: numberOf(costs.facingPremium),
          otherPropertyCost: numberOf(costs.otherPropertyCost),
          otherPropertyCostNote: stringOf(costs.otherPropertyCostNote),
          stampDuty: numberOf(costs.stampDuty),
          registrationFee: numberOf(costs.registrationFee),
          legalFee: numberOf(costs.legalFee),
          gst: numberOf(costs.gst),
        }
      : null,
    otherCharges,
  }
}

function CostNumberRow({
  label,
  value,
  onChange,
  placeholder = '0',
  helper,
  disabled,
}: {
  label: string
  value: number
  onChange?: (n: number) => void
  placeholder?: string
  helper?: string
  disabled?: boolean
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[1fr_140px] sm:items-center sm:gap-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      </div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          ₹
        </span>
        <input
          type="number"
          min={0}
          value={value || ''}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange?.(Number(e.target.value) || 0)}
          className={cn(
            'h-9 w-full rounded-md border border-border bg-input pl-7 pr-3 text-sm',
            disabled && 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        />
      </div>
    </div>
  )
}

export function FullPaymentStage({ deal, onStageChange }: FullPaymentStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const agreed = deal.agreedPrice ?? 0
  const token = deal.tokenAmount ?? 0
  const hasToken = deal.tokenAmount != null && deal.tokenAmount > 0
  const balance = hasToken ? Math.max(0, agreed - token) : agreed
  const possessionStatus = (deal as SalesDeal & { possessionStatus?: string }).possessionStatus
  const isUnderConstruction = possessionStatus === 'Under Construction'

  const initialBreakdownRef = useRef(createInitialBreakdown(agreed))
  const [costs, setCosts] = useState<CostBreakdownState>(initialBreakdownRef.current.costs)
  const [otherCharges, setOtherCharges] = useState<OtherCharge[]>(
    initialBreakdownRef.current.otherCharges,
  )
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [newChargeLabel, setNewChargeLabel] = useState('')
  const [newChargeAmount, setNewChargeAmount] = useState(0)
  const [costsSaved, setCostsSaved] = useState(false)
  const [amountSyncedToTotal, setAmountSyncedToTotal] = useState(true)

  const [payment, setPayment] = useState<FullPayment | null>(null)
  const [editingPayment, setEditingPayment] = useState(true)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [paymentDate, setPaymentDate] = useState(todayIsoDate())
  const [reference, setReference] = useState('')
  const [chequeDate, setChequeDate] = useState(todayIsoDate())
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUploading, setProofUploading] = useState(false)
  const [notes, setNotes] = useState('')

  const [toast, setToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(
    null,
  )
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

  useEffect(() => {
    if (agreed > 0) {
      setCosts(defaultCosts(agreed))
    }
  }, [agreed])

  useEffect(() => {
    const saved = objectOf(deal.fullPayment)
    const savedBreakdown = costBreakdownFromRecord(saved.costBreakdown)
    if (savedBreakdown.costs) {
      setCosts(savedBreakdown.costs)
      setOtherCharges(savedBreakdown.otherCharges.length ? savedBreakdown.otherCharges : defaultOtherCharges())
      setCostsSaved(true)
    }
    const savedPayment = fullPaymentFromRecord(saved)
    if (savedPayment) {
      setPayment(savedPayment)
      setEditingPayment(false)
      loadPaymentIntoForm(savedPayment)
    }
  }, [deal.fullPayment])

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'sales-deal',
      deal.id,
      FULL_PAYMENT_CALL_SUMMARY_PREFIX,
      FULL_PAYMENT_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
      setInternalNotes(notes.map(workflowLogToStageNote))
    })
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const showToast = (message: string, variant: 'success' | 'error' = 'success') => {
    setToast({ message, variant })
    setTimeout(() => setToast(null), 2500)
  }

  const propertyCostTotal = useMemo(
    () =>
      costs.propertyBasePrice +
      costs.infrastructureCharge +
      costs.clubMembershipFee +
      costs.carParkingCharge +
      costs.floorRisePremium +
      costs.facingPremium +
      costs.otherPropertyCost,
    [costs],
  )

  const registrationCostTotal = useMemo(
    () => costs.stampDuty + costs.registrationFee + costs.legalFee + costs.gst,
    [costs],
  )

  const otherChargesTotal = useMemo(
    () => otherCharges.reduce((sum, c) => sum + c.amount, 0),
    [otherCharges],
  )

  const grandTotal = propertyCostTotal + registrationCostTotal + otherChargesTotal
  const additionalCosts = grandTotal - agreed
  const noAdditionalCosts = additionalCosts <= 0
  const totalAboveAgreedWarning = agreed > 0 && grandTotal > agreed * 1.15
  const totalLessThanToken = hasToken && grandTotal < token

  useEffect(() => {
    if (amountSyncedToTotal && grandTotal > 0) {
      setAmount(String(grandTotal))
    }
  }, [grandTotal, amountSyncedToTotal])

  const amountNum = Number(amount.replace(/,/g, ''))
  const amountDiffers = Number.isFinite(amountNum) && amountNum !== grandTotal

  const updateCost = <K extends keyof CostBreakdownState>(
    key: K,
    value: CostBreakdownState[K],
  ) => {
    setCosts((prev) => ({ ...prev, [key]: value }))
    setCostsSaved(false)
  }

  const currentCostBreakdown = () => ({
    costs,
    otherCharges,
    totals: {
      propertyCostTotal,
      registrationCostTotal,
      otherChargesTotal,
      grandTotal,
      additionalCosts,
    },
    savedAt: new Date().toISOString(),
  })

  const saveCostBreakdown = async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      showToast('Admin session expired. Please sign in again.', 'error')
      return
    }
    try {
      const existing = objectOf(deal.fullPayment)
      const updated = await updateAdminSalesDealPaymentPlan(session.accessToken, deal.id, {
        fullPayment: {
          ...existing,
          costBreakdown: currentCostBreakdown(),
        },
      })
      onStageChange(deal.stage, { fullPayment: updated.fullPayment })
      setCostsSaved(true)
      showToast('Cost breakdown saved')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save cost breakdown', 'error')
    }
  }

  const shareBreakdown = async () => {
    const text = `Cost Breakdown for ${deal.propertyTitle}
Property: ${formatPrice(propertyCostTotal)}
Registration: ${formatPrice(registrationCostTotal)}
Other: ${formatPrice(otherChargesTotal)}
Total: ${formatPrice(grandTotal)}`
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied to clipboard')
    } catch {
      showToast('Could not copy to clipboard', 'error')
    }
  }

  const updateOtherCharge = (id: string, patch: Partial<Pick<OtherCharge, 'label' | 'amount'>>) => {
    setOtherCharges((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
    setCostsSaved(false)
  }

  const removeOtherCharge = (charge: OtherCharge) => {
    if (PRE_POPULATED_CHARGE_IDS.has(charge.id)) {
      if (!window.confirm(`Remove ${charge.label}?`)) return
    }
    setOtherCharges((prev) => prev.filter((c) => c.id !== charge.id))
    setCostsSaved(false)
  }

  const chargeLabelExists = (label: string, excludeId?: string) =>
    otherCharges.some(
      (c) =>
        c.id !== excludeId &&
        c.label.trim().toLowerCase() === label.trim().toLowerCase(),
    )

  const addOtherCharge = (label: string, amount: number) => {
    const trimmed = label.trim()
    if (!trimmed) {
      showToast('Enter charge name', 'error')
      return false
    }
    if (amount < 0) {
      showToast('Amount cannot be negative', 'error')
      return false
    }
    if (chargeLabelExists(trimmed)) {
      if (!window.confirm('Similar charge already exists. Add anyway?')) return false
    }
    setOtherCharges((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, label: trimmed, amount },
    ])
    setCostsSaved(false)
    return true
  }

  const handleAddCustomCharge = () => {
    const label = newChargeLabel.trim()
    if (!label) {
      showToast('Enter charge name', 'error')
      return
    }
    if (newChargeAmount < 0) {
      showToast('Amount cannot be negative', 'error')
      return
    }
    if (addOtherCharge(label, newChargeAmount)) {
      showToast(`"${label}" added`)
      setNewChargeLabel('')
      setNewChargeAmount(0)
      setShowAddCharge(false)
    }
  }

  const handleQuickAddCharge = (preset: (typeof QUICK_CHARGE_PRESETS)[number]) => {
    if (chargeLabelExists(preset.label)) return
    const amount = preset.amount(agreed)
    setOtherCharges((prev) => [
      ...prev,
      { id: `quick_${preset.key}_${Date.now()}`, label: preset.label, amount },
    ])
    setCostsSaved(false)
    showToast(`"${preset.label}" added`)
  }

  const futureDate = useMemo(() => {
    if (!paymentDate) return false
    return new Date(`${paymentDate}T12:00:00`) > new Date()
  }, [paymentDate])

  const needsReference = method === 'neft' || method === 'upi'
  const needsCheque = method === 'cheque'

  const canSave =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    method != null &&
    paymentDate &&
    proofUrl != null &&
    (!needsReference || reference.trim()) &&
    (!needsCheque || reference.trim() && chequeDate)

  const totalReceived = token + (payment?.amount ?? 0)
  const paymentComplete = payment != null && !editingPayment

  const paymentStatus =
    paymentComplete && agreed > 0
      ? totalReceived === agreed
        ? 'complete'
        : totalReceived > agreed
          ? 'over'
          : 'under'
      : null

  const sendMessage = paymentComplete
    ? `Hi ${deal.buyerName}, we confirm full payment of ${formatPrice(totalReceived)} received for ${deal.propertyTitle}. Thank you!`
    : ''

  const loadPaymentIntoForm = (p: FullPayment) => {
    setAmount(String(p.amount))
    setMethod(p.method)
    setPaymentDate(p.paymentDate)
    setReference(p.reference ?? '')
    setChequeDate(p.chequeDate ?? todayIsoDate())
    setProofUrl(p.proofUrl)
    setNotes(p.notes)
  }

  const recordPayment = async () => {
    if (!canSave || !method || !proofUrl) return
    setProofUploading(true)
    try {
      const session = readAdminSession()
      if (!session?.accessToken) throw new Error('Admin session expired. Please sign in again.')
      let uploadedProofUrl = proofUrl
      let proofLogId: string | null = null
      if (proofFile) {
        const proofLog = await uploadWorkflowProof(session.accessToken, 'sales-deal', deal.id, proofFile, {
          summary: FULL_PAYMENT_PROOF_SUMMARY,
          notes: notes.trim(),
        })
        proofLogId = proofLog.id
        uploadedProofUrl = proofLog.attachments[0]?.url || uploadedProofUrl
      }
      const record: FullPayment & { proofLogId?: string | null; costBreakdown: ReturnType<typeof currentCostBreakdown> } = {
        amount: amountNum,
        method,
        paymentDate,
        reference: needsReference || needsCheque ? reference.trim() : null,
        chequeDate: needsCheque ? chequeDate : null,
        proofUrl: uploadedProofUrl,
        notes: notes.trim(),
        proofLogId,
        costBreakdown: currentCostBreakdown(),
      }
      const updated = await updateAdminSalesDealPaymentPlan(session.accessToken, deal.id, {
        paymentType: 'full',
        totalPaid: token + amountNum,
        fullPayment: { ...record },
      })
      setPayment(record)
      setProofUrl(uploadedProofUrl)
      setProofFile(null)
      setEditingPayment(false)
      onStageChange(deal.stage, {
        paymentType: updated.paymentType,
        totalPaid: updated.totalPaid,
        fullPayment: updated.fullPayment,
      })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not record payment', 'error')
    } finally {
      setProofUploading(false)
    }
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    try {
      const log = await createStageCallLog(
        'sales-deal',
        deal.id,
        FULL_PAYMENT_CALL_SUMMARY_PREFIX,
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save call', 'error')
    }
  }

  const saveNote = async () => {
    if (!noteText.trim()) return
    try {
      const log = await createStageNoteLog('sales-deal', deal.id, FULL_PAYMENT_NOTE_SUMMARY, noteText.trim())
      setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
      setNoteText('')
      setShowNoteForm(false)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save note', 'error')
    }
  }

  const deleteInternalNote = async (id: string) => {
    try {
      await deleteStageWorkflowLog(id)
      setInternalNotes((prev) => prev.filter((n) => n.id !== id))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete note', 'error')
    }
  }

  const showForm = !payment || editingPayment
  const showConfirmation = payment && !editingPayment

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 rounded-lg px-4 py-2 text-sm shadow-lg',
            toast.variant === 'error'
              ? 'bg-red-600 text-white'
              : 'bg-foreground text-background',
          )}
        >
          {toast.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasToken && agreed > 0 && (
            <p className="text-sm text-orange-700">
              No token recorded — full amount: {formatPrice(agreed)}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-blue-50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Agreed</p>
              <p className="text-sm font-semibold text-blue-700">{formatPrice(agreed)}</p>
            </div>
            <div className="rounded-lg bg-muted p-3">
              <p className="text-xs uppercase text-muted-foreground">Token Paid</p>
              <p className="text-sm font-medium text-muted-foreground">
                {hasToken ? formatPrice(token) : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-3">
              <p className="text-xs uppercase text-muted-foreground">Balance Due</p>
              <p className="text-xl font-bold text-green-700">{formatPrice(balance)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {showForm && (
        <>
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle>Payment Breakdown</CardTitle>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => window.print()}
                >
                  Print
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void shareBreakdown()}
                >
                  Share
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Home className="size-5 text-blue-600" />
                  <h3 className="text-base font-semibold text-foreground">Property Cost</h3>
                </div>
                <div className="space-y-4">
                  <div className="grid gap-1 sm:grid-cols-[1fr_140px] sm:items-center sm:gap-3">
                    <div>
                      <p className="text-sm font-medium">Base Property Price</p>
                      <p className="text-xs text-muted-foreground">
                        Agreed price — cannot change
                      </p>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                      </span>
                      <input
                        type="number"
                        value={costs.propertyBasePrice || ''}
                        disabled
                        className="h-9 w-full cursor-not-allowed rounded-md border border-border bg-muted pl-7 pr-3 text-sm text-muted-foreground"
                      />
                    </div>
                  </div>
                  <CostNumberRow
                    label="Infrastructure / Development Charge"
                    value={costs.infrastructureCharge}
                    onChange={(n) => updateCost('infrastructureCharge', n)}
                    helper="Common area, roads, drainage"
                  />
                  <CostNumberRow
                    label="Club Membership Fee"
                    value={costs.clubMembershipFee}
                    onChange={(n) => updateCost('clubMembershipFee', n)}
                  />
                  <CostNumberRow
                    label="Car Parking Charge"
                    value={costs.carParkingCharge}
                    onChange={(n) => updateCost('carParkingCharge', n)}
                    helper="If not included in base price"
                  />
                  <CostNumberRow
                    label="Floor Rise Premium"
                    value={costs.floorRisePremium}
                    onChange={(n) => updateCost('floorRisePremium', n)}
                    helper="For apartments above 5th floor"
                  />
                  <CostNumberRow
                    label="Facing / View Premium"
                    value={costs.facingPremium}
                    onChange={(n) => updateCost('facingPremium', n)}
                  />
                  <div className="space-y-2">
                    <CostNumberRow
                      label="Other Property Cost"
                      value={costs.otherPropertyCost}
                      onChange={(n) => updateCost('otherPropertyCost', n)}
                    />
                    <input
                      type="text"
                      value={costs.otherPropertyCostNote}
                      onChange={(e) => updateCost('otherPropertyCostNote', e.target.value)}
                      placeholder="Note for other property cost..."
                      className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm sm:ml-auto sm:max-w-[140px]"
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Property Sub-total
                    </span>
                    <span className="text-sm font-bold text-blue-900 dark:text-blue-200">
                      {formatPrice(propertyCostTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2">
                  <FileText className="size-5 text-green-600" />
                  <h3 className="text-base font-semibold text-foreground">
                    Registration & Legal Cost
                  </h3>
                </div>
                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  Auto-calculated based on Karnataka rates. Edit if different. Rates shown for
                  Karnataka. Update if property is in another state.
                </div>
                <div className="space-y-4">
                  <CostNumberRow
                    label="Stamp Duty (5.6%)"
                    value={costs.stampDuty}
                    onChange={(n) => updateCost('stampDuty', n)}
                    helper="5% stamp duty + 0.5% cess + 0.1% surcharge"
                  />
                  <CostNumberRow
                    label="Registration Fee (1%)"
                    value={costs.registrationFee}
                    onChange={(n) => updateCost('registrationFee', n)}
                  />
                  <CostNumberRow
                    label="Legal / Documentation Fee"
                    value={costs.legalFee}
                    onChange={(n) => updateCost('legalFee', n)}
                    placeholder="15000"
                    helper="Advocate, deed writing"
                  />
                  <div>
                    <CostNumberRow
                      label="GST (if applicable)"
                      value={costs.gst}
                      onChange={(n) => updateCost('gst', n)}
                      helper="5% GST for under-construction, 0% for ready-to-move"
                    />
                    {isUnderConstruction && costs.gst === 0 && agreed > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-orange-700">GST 5% applicable</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateCost('gst', Math.round(agreed * 0.05))}
                        >
                          Auto-fill GST 5%
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-green-50 p-3 dark:bg-green-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-green-900 dark:text-green-200">
                      Registration Sub-total
                    </span>
                    <span className="text-sm font-bold text-green-900 dark:text-green-200">
                      {formatPrice(registrationCostTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Plus className="size-5 text-orange-600" />
                    <h3 className="text-base font-semibold text-foreground">Other Charges</h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowAddCharge(true)}
                  >
                    + Add Charge
                  </Button>
                </div>

                {otherCharges.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-8 text-center">
                    <p className="text-sm text-muted-foreground">No other charges added</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowAddCharge(true)}
                    >
                      + Add Charge
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {otherCharges.map((charge) => (
                      <div
                        key={charge.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5"
                      >
                        <input
                          type="text"
                          value={charge.label}
                          maxLength={50}
                          title={charge.label}
                          onChange={(e) =>
                            updateOtherCharge(charge.id, {
                              label: e.target.value.slice(0, 50),
                            })
                          }
                          className="min-w-0 flex-1 truncate border-0 bg-transparent px-1 text-sm focus:rounded focus:border focus:bg-white focus:outline-none"
                        />
                        <div className="relative shrink-0">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            ₹
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={charge.amount || ''}
                            onChange={(e) => {
                              const n = Number(e.target.value)
                              if (Number.isFinite(n) && n < 0) {
                                showToast('Amount cannot be negative', 'error')
                                return
                              }
                              updateOtherCharge(charge.id, {
                                amount: Number.isFinite(n) ? Math.max(0, n) : 0,
                              })
                            }}
                            className="h-8 w-32 rounded-md border border-border bg-input pr-2 text-right text-sm"
                            style={{ paddingLeft: '1.25rem' }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeOtherCharge(charge)}
                          className="shrink-0 rounded p-1 text-red-600 hover:bg-red-50"
                          aria-label={`Remove ${charge.label}`}
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {QUICK_CHARGE_PRESETS.map((preset) => {
                    const added = chargeLabelExists(preset.label)
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        disabled={added}
                        onClick={() => handleQuickAddCharge(preset)}
                        className={cn(
                          'inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors',
                          added
                            ? 'cursor-not-allowed opacity-60'
                            : 'hover:bg-sidebar-accent',
                        )}
                      >
                        {added ? `✓ ${preset.label}` : `+ ${preset.label}`}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAddCharge(true)}
                    className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:bg-sidebar-accent"
                  >
                    + Custom...
                  </button>
                </div>

                {showAddCharge && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/40">
                    <input
                      type="text"
                      value={newChargeLabel}
                      onChange={(e) => setNewChargeLabel(e.target.value.slice(0, 50))}
                      placeholder="e.g. Solar Panel Installation Charge"
                      title={newChargeLabel.length > 50 ? newChargeLabel : undefined}
                      className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                    <div className="relative mt-2">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        ₹
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={newChargeAmount || ''}
                        placeholder="0"
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n) && n < 0) {
                            showToast('Amount cannot be negative', 'error')
                            return
                          }
                          setNewChargeAmount(Number.isFinite(n) ? Math.max(0, n) : 0)
                        }}
                        className="h-9 w-full rounded-md border border-border bg-input pl-7 pr-3 text-sm"
                      />
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Button type="button" size="sm" onClick={handleAddCustomCharge}>
                        Add Charge
                      </Button>
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setShowAddCharge(false)
                          setNewChargeLabel('')
                          setNewChargeAmount(0)
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 rounded-lg bg-orange-50 p-3 dark:bg-orange-950/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-orange-900 dark:text-orange-200">
                      Other Sub-total
                    </span>
                    <span className="text-sm font-bold text-orange-900 dark:text-orange-200">
                      {formatPrice(otherChargesTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-primary p-6 text-primary-foreground">
                <p className="text-sm text-white/80">Total Cost to Buyer</p>
                <p className="mt-1 text-3xl font-bold text-white">{formatPrice(grandTotal)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">
                    Property: {formatPrice(propertyCostTotal)}
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">
                    Registration: {formatPrice(registrationCostTotal)}
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs">
                    Other: {formatPrice(otherChargesTotal)}
                  </span>
                </div>
                {noAdditionalCosts && (
                  <p className="mt-3 text-sm text-white/80">No additional costs added</p>
                )}
                <hr className="my-4 border-white/20" />
                <div className="space-y-1 text-sm text-white/70">
                  <p>Agreed Price: {formatPrice(agreed)}</p>
                  <p>Additional Costs: {formatPrice(Math.max(0, additionalCosts))}</p>
                </div>
                {totalAboveAgreedWarning && (
                  <span className="mt-3 inline-block rounded-full bg-orange-500/90 px-3 py-1 text-xs font-medium text-white">
                    ⚠️ Total is 15%+ above agreed price
                  </span>
                )}
                {totalLessThanToken && (
                  <p className="mt-3 text-sm font-medium text-red-200">
                    Total cost is less than token already paid ({formatPrice(token)})
                  </p>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={saveCostBreakdown}
              >
                {costsSaved ? 'Cost breakdown saved ✓' : 'Save Cost Breakdown'}
              </Button>
            </CardContent>
          </Card>

          <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Full Payment</CardTitle>
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
              <label className="text-sm font-medium">Amount (₹) *</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setAmountSyncedToTotal(false)
                }}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Includes: property cost + registration + other charges
              </p>
              <button
                type="button"
                className="mt-1 text-xs text-primary hover:underline"
                onClick={() => {
                  setAmount(String(agreed))
                  setAmountSyncedToTotal(false)
                }}
              >
                Reset to agreed price
              </button>
              {amountDiffers && (
                <p className="mt-1 text-sm text-orange-700">
                  Amount differs from total cost ({formatPrice(grandTotal)})
                </p>
              )}
              {hasToken && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Balance due after token: {formatPrice(balance)}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Payment method *</p>
              <div className="grid grid-cols-3 gap-2">
                {(['neft', 'upi', 'cheque'] as PaymentMethod[]).map((m) => (
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

            {needsCheque && (
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
                Upload proof *
              </button>
              {proofUrl && (
                <img
                  src={proofUrl}
                  alt="Payment proof"
                  className="mt-2 h-24 rounded-lg object-cover"
                />
              )}
              {!proofUrl && (
                <p className="mt-1 text-xs text-orange-700">Payment proof required</p>
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
              {proofUploading ? 'Recording...' : 'Record Full Payment'}
            </Button>
          </CardContent>
        </Card>
        </>
      )}

      {showConfirmation && payment && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Payment Confirmation</CardTitle>
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
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              ✅ Full payment received
            </div>
            <div className="rounded-lg border-2 border-border p-4">
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Payment No</p>
                  <p className="font-medium">BG-SALE-PAY-{deal.id}</p>
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
                  <p className="text-xs text-muted-foreground">Agreed Price</p>
                  <p className="font-medium">{formatPrice(agreed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Token Paid</p>
                  <p className="font-medium">{hasToken ? formatPrice(token) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Final Payment</p>
                  <p className="font-bold text-primary">{formatPrice(payment.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Method</p>
                  <p className="font-medium">{METHOD_LABELS[payment.method]}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reference</p>
                  <p className="font-medium">
                    {payment.reference ??
                      (payment.chequeDate
                        ? `Cheque dated ${formatReceiptDate(payment.chequeDate)}`
                        : 'N/A')}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Total Received</p>
                  <p className="text-lg font-bold">{formatPrice(totalReceived)}</p>
                </div>
              </div>
              {paymentStatus === 'complete' && (
                <p className="mt-3 text-sm font-medium text-green-700">✅ Payment complete</p>
              )}
              {paymentStatus === 'over' && (
                <p className="mt-3 text-sm text-orange-700">Overpayment — verify amount</p>
              )}
              {paymentStatus === 'under' && (
                <p className="mt-3 text-sm text-red-700">Underpayment — check records</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    downloadTextReceipt(`full-payment-${deal.referenceId}.txt`, [
                      'Builtglory Full Payment Receipt',
                      `Deal: ${deal.referenceId}`,
                      `Buyer: ${deal.buyerName}`,
                      `Property: ${deal.propertyTitle}`,
                      `Total paid: ${formatPrice(totalReceived)}`,
                      `Balance: ${formatPrice(balance)}`,
                    ])
                    showToast('Receipt downloaded')
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

      {showSendModal && paymentComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Send confirmation to buyer</h4>
            <p className="mt-2 text-sm text-muted-foreground">{sendMessage}</p>
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
                      `https://wa.me/${tel}?text=${encodeURIComponent(sendMessage)}`,
                      '_blank',
                    )
                  }
                  if (sendEmail && deal.buyerEmail) {
                    window.open(
                      `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('Full payment confirmation')}&body=${encodeURIComponent(sendMessage)}`,
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

      <CallLogCard
        callLogs={callLogs}
        showCallForm={showCallForm}
        setShowCallForm={setShowCallForm}
        callAt={callAt}
        setCallAt={setCallAt}
        callDuration={callDuration}
        setCallDuration={setCallDuration}
        callOutcome={callOutcome}
        setCallOutcome={setCallOutcome}
        callNotes={callNotes}
        setCallNotes={setCallNotes}
        onSaveCall={saveCall}
      />

      <NotesCard
        internalNotes={internalNotes}
        showNoteForm={showNoteForm}
        setShowNoteForm={setShowNoteForm}
        noteText={noteText}
        setNoteText={setNoteText}
        onSaveNote={saveNote}
        onDeleteNote={deleteInternalNote}
      />

      <Card className="border-t-4 border-primary">
        <CardContent className="space-y-3 p-6">
          <h3 className="font-semibold text-foreground">Next Action</h3>
          {!paymentComplete ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Record full payment to proceed
            </p>
          ) : showDocConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Move deal to documentation stage?</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    onStageChange('documentation', {
                      totalPaid: totalReceived,
                      tokenPaid: true,
                    })
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CallLogCard(props: {
  callLogs: CallLogEntry[]
  showCallForm: boolean
  setShowCallForm: (v: boolean) => void
  callAt: string
  setCallAt: (v: string) => void
  callDuration: string
  setCallDuration: (v: string) => void
  callOutcome: string
  setCallOutcome: (v: string) => void
  callNotes: string
  setCallNotes: (v: string) => void
  onSaveCall: () => void
}) {
  const {
    callLogs,
    showCallForm,
    setShowCallForm,
    callAt,
    setCallAt,
    callDuration,
    setCallDuration,
    callOutcome,
    setCallOutcome,
    callNotes,
    setCallNotes,
    onSaveCall,
  } = props

  return (
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
              <Button type="button" size="sm" onClick={onSaveCall}>
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
  )
}

function NotesCard(props: {
  internalNotes: NoteEntry[]
  showNoteForm: boolean
  setShowNoteForm: (v: boolean) => void
  noteText: string
  setNoteText: (v: string) => void
  onSaveNote: () => void
  onDeleteNote: (id: string) => void
}) {
  const {
    internalNotes,
    showNoteForm,
    setShowNoteForm,
    noteText,
    setNoteText,
    onSaveNote,
    onDeleteNote,
  } = props

  return (
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
              <Button type="button" size="sm" onClick={onSaveNote}>
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
              onClick={() => onDeleteNote(note.id)}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
