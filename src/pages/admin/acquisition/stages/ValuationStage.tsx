import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Phone, Upload, X } from 'lucide-react'
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
import { PropertyDetailsAccordion } from '@/utils/propertyFieldConfig'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

function currentAdminName() {
  const session = readAdminSession()
  return session?.admin?.name || session?.admin?.email || 'Current Admin'
}

export interface ValuationStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

interface InspectionSummary {
  condition: 'excellent' | 'good' | 'fair' | 'poor'
  recommendation: 'proceed' | 'caution' | 'reject'
  structuralIssues: boolean
  repairCost: number | null
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

interface ValuationData {
  valuedBy: string
  valuationDate: string
  marketValue: number
  builtgloryValuation: number
  comparables: string
  notes: string
  reportFileName: string | null
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

const VALUATION_CALL_SUMMARY_PREFIX = 'Acquisition valuation call'
const VALUATION_NOTE_SUMMARY = 'Acquisition valuation note'

const CONDITION_LABELS: Record<InspectionSummary['condition'], string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
}

const RECOMMENDATION_LABELS: Record<InspectionSummary['recommendation'], string> = {
  proceed: 'Proceed',
  caution: 'Proceed with Caution',
  reject: 'Recommend Reject',
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
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function parseAmount(value: string) {
  const n = Number(value.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function ValuationStage({ acquisition, onStageChange }: ValuationStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const inspectionSummary = useMemo(() => {
    const summary = acquisition.valuation?.inspectionSummary
    if (!summary || typeof summary !== 'object') return null
    return summary as unknown as InspectionSummary
  }, [acquisition.valuation])

  const [valuationSaved, setValuationSaved] = useState(false)
  const [savedValuation, setSavedValuation] = useState<ValuationData | null>(null)

  const [valuedBy, setValuedBy] = useState(currentAdminName)
  const [valuationDate, setValuationDate] = useState(todayIsoDate())
  const [marketValue, setMarketValue] = useState('')
  const [builtgloryValuation, setBuiltgloryValuation] = useState(
    acquisition.builtgloryOffer != null ? String(acquisition.builtgloryOffer) : '',
  )
  const [comparables, setComparables] = useState('')
  const [valuationNotes, setValuationNotes] = useState('')
  const [reportFileName, setReportFileName] = useState<string | null>(null)
  const [dateWarning, setDateWarning] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [notes, setNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showNegotiateConfirm, setShowNegotiateConfirm] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [notifySeller, setNotifySeller] = useState(true)

  const marketNum = parseAmount(marketValue)
  const offerNum = parseAmount(builtgloryValuation)
  const asking = acquisition.askingPrice

  const formValid = Boolean(
    valuedBy.trim() && valuationDate && marketNum != null && offerNum != null,
  )

  const gapAnalysis = useMemo(() => {
    if (!valuationSaved || !savedValuation) return null
    const offer = savedValuation.builtgloryValuation
    const gapAmount = asking - offer
    const gapPct = asking > 0 ? (gapAmount / asking) * 100 : 0
    const offerBelowAsking = offer < asking
    const veryLargeGap = offer < asking * 0.5
    const largeGap = gapPct > 20 && offer >= asking
    return { gapAmount, gapPct, offerBelowAsking, veryLargeGap, largeGap }
  }, [valuationSaved, savedValuation, asking])

  const topOfferExceeds = offerNum != null && offerNum > asking
  const topVeryLargeGap = offerNum != null && offerNum < asking * 0.5

  const handleDateChange = (value: string) => {
    setValuationDate(value)
    const selected = new Date(`${value}T12:00:00`)
    setDateWarning(selected > new Date())
  }

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('acquisition', acquisition.id, VALUATION_CALL_SUMMARY_PREFIX, VALUATION_NOTE_SUMMARY).then(
      ({ calls, notes }) => {
        if (cancelled) return
        setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
        setNotes(notes.map(workflowLogToStageNote))
      },
    )
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  const saveValuation = async () => {
    setSaveError(null)
    if (!valuedBy.trim()) {
      setSaveError('Valuer name is required')
      return
    }
    if (!valuationDate) {
      setSaveError('Valuation date is required')
      return
    }
    if (marketNum == null) {
      setSaveError('Market value required')
      return
    }
    if (offerNum == null) {
      setSaveError('Builtglory valuation is required')
      return
    }
    const nextValuation = {
      ...acquisition.valuation,
      amount: offerNum,
      valuedBy: valuedBy.trim(),
      valuationDate,
      marketValue: marketNum,
      builtgloryValuation: offerNum,
      comparables: comparables.trim(),
      notes: valuationNotes.trim(),
      reportFileName,
    }
    setSavedValuation(nextValuation)
    setValuationSaved(true)
    const session = readAdminSession()
    if (!session?.accessToken) {
      setSaveError('Admin session expired. Please sign in again.')
      return
    }
    try {
      const saved = await updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'valuation', nextValuation)
      onStageChange(saved.stage, { valuation: saved.valuation, builtgloryOffer: saved.builtgloryOffer })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save valuation')
    }
  }

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const log = await createStageCallLog(
      'acquisition',
      acquisition.id,
      VALUATION_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('acquisition', acquisition.id, VALUATION_NOTE_SUMMARY, noteText.trim())
    setNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const confirmReject = () => {
    if (!rejectNotes.trim()) return
    onStageChange('rejected', {
      rejectionReason: `Price too high: ${rejectNotes.trim()}`,
    })
    setShowRejectForm(false)
  }

  const offerForNegotiation = savedValuation?.builtgloryValuation ?? offerNum ?? 0

  const rejectPreview = notifySeller
    ? `Hi ${acquisition.sellerName}, we cannot proceed at the current asking price for ${acquisition.propertyTitle}. Reason: Price too high. ${rejectNotes}`
    : ''

  return (
    <div className="space-y-4">
      {topOfferExceeds && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          Offer exceeds asking — great acquisition opportunity
        </div>
      )}
      {topVeryLargeGap && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          Very large gap — consider rejection
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inspection Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {inspectionSummary ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="default" className="capitalize">
                  {CONDITION_LABELS[inspectionSummary.condition]}
                </Badge>
                <Badge
                  variant={
                    inspectionSummary.recommendation === 'reject'
                      ? 'red'
                      : inspectionSummary.recommendation === 'caution'
                        ? 'orange'
                        : 'responded'
                  }
                >
                  {RECOMMENDATION_LABELS[inspectionSummary.recommendation]}
                </Badge>
              </div>
              <p>
                <span className="text-muted-foreground">Structural issues:</span>{' '}
                {inspectionSummary.structuralIssues ? 'Yes' : 'No'}
              </p>
              {inspectionSummary.structuralIssues && inspectionSummary.repairCost != null && (
                <p>
                  <span className="text-muted-foreground">Repair cost:</span>{' '}
                  {formatPrice(inspectionSummary.repairCost)}
                </p>
              )}
              <p className="text-muted-foreground">{inspectionSummary.notes}</p>
            </div>
          ) : (
            <div className="rounded-lg bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
              No inspection report found
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Property Valuation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Valued by *</label>
            <input
              value={valuedBy}
              onChange={(e) => setValuedBy(e.target.value)}
              placeholder="Valuer name or agency"
              className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Valuation date *</label>
            <input
              type="date"
              value={valuationDate}
              onChange={(e) => handleDateChange(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            {dateWarning && (
              <p className="mt-1 text-xs text-orange-700">Date is in the future</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Current Market Value (₹) *</label>
            <input
              type="number"
              value={marketValue}
              onChange={(e) => setMarketValue(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Builtglory&apos;s Offer Price (₹) *</label>
            <p className="text-xs text-muted-foreground">What Builtglory is willing to pay</p>
            <input
              type="number"
              value={builtgloryValuation}
              onChange={(e) => setBuiltgloryValuation(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Comparable properties</label>
            <textarea
              rows={3}
              value={comparables}
              onChange={(e) => setComparables(e.target.value)}
              placeholder="List 2-3 similar properties and their prices for reference"
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Valuation notes</label>
            <textarea
              rows={3}
              value={valuationNotes}
              onChange={(e) => setValuationNotes(e.target.value)}
              placeholder="Additional observations..."
              className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setReportFileName(file?.name ?? null)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm text-muted-foreground hover:bg-muted/50"
            >
              <Upload className="size-6" />
              Upload valuation report (optional)
            </button>
            {reportFileName && (
              <p className="mt-1 text-xs text-green-700">{reportFileName}</p>
            )}
            {valuationSaved && !reportFileName && !savedValuation?.reportFileName && (
              <p className="mt-1 text-xs text-orange-700">No report uploaded</p>
            )}
          </div>
          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <Button type="button" className="w-full" disabled={!formValid} onClick={saveValuation}>
            {valuationSaved ? 'Update Valuation' : 'Save Valuation'}
          </Button>

          <PropertyDetailsAccordion
            propertyType={acquisition.propertyType}
            propertyDetails={acquisition.propertyDetails}
          />
        </CardContent>
      </Card>

      {valuationSaved && savedValuation && (
        <Card>
          <CardHeader>
            <CardTitle>Price Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-blue-50 p-3 text-center">
                <p className="text-xs font-medium uppercase text-muted-foreground">Asking Price</p>
                <p className="text-lg font-bold text-blue-700">{formatPrice(asking)}</p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-xs font-medium uppercase text-muted-foreground">Market Value</p>
                <p className="text-lg font-bold text-foreground">
                  {formatPrice(savedValuation.marketValue)}
                </p>
              </div>
              <div className="rounded-lg bg-green-50 p-3 text-center">
                <p className="text-xs font-medium uppercase text-muted-foreground">BG Offer</p>
                <p className="text-lg font-bold text-green-700">
                  {formatPrice(savedValuation.builtgloryValuation)}
                </p>
              </div>
            </div>

            {gapAnalysis && (
              <div className="space-y-2 text-sm">
                <p>
                  Gap from asking:{' '}
                  <span className="font-semibold">
                    {formatPrice(Math.max(0, gapAnalysis.gapAmount))}
                    {gapAnalysis.gapAmount < 0 && ` (${formatPrice(-gapAnalysis.gapAmount)} below asking)`}
                  </span>
                </p>
                {gapAnalysis.largeGap && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800">
                    ⚠️ Large gap ({gapAnalysis.gapPct.toFixed(0)}%) between asking and BG offer —
                    negotiation needed
                  </div>
                )}
                {asking > 0 &&
                  ((asking - savedValuation.builtgloryValuation) / asking) * 100 > 30 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      ⚠️ {(((asking - savedValuation.builtgloryValuation) / asking) * 100).toFixed(0)}%
                      below asking — Negotiate carefully
                    </div>
                  )}
                {gapAnalysis.offerBelowAsking && (
                  <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                    ✅ Great deal — offer below asking price
                  </div>
                )}
                {gapAnalysis.veryLargeGap && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                    🚫 Very large gap — likely to reject
                  </div>
                )}
              </div>
            )}
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
                  placeholder="Duration"
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
          <h3 className="font-semibold text-foreground">Next Step</h3>

          {!valuationSaved ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Save valuation to proceed
            </p>
          ) : (
            <>
              {showNegotiateConfirm ? (
                <div className="rounded-lg border border-border bg-muted p-4 text-sm">
                  <p className="font-medium">
                    Move to negotiation with offer of {formatPrice(offerForNegotiation)}?
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (!savedValuation) return
                        onStageChange('negotiation', {
                          builtgloryOffer: offerForNegotiation,
                          valuation: {
                            ...acquisition.valuation,
                            amount: offerForNegotiation,
                            marketValue: savedValuation.marketValue,
                            builtgloryValuation: savedValuation.builtgloryValuation,
                            valuedBy: savedValuation.valuedBy,
                            valuationDate: savedValuation.valuationDate,
                            comparables: savedValuation.comparables,
                            notes: savedValuation.notes,
                            reportFileName: savedValuation.reportFileName,
                          },
                        })
                        navigate('/admin/acquisition/negotiation')
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowNegotiateConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mb-3 w-full"
                  onClick={() => setShowNegotiateConfirm(true)}
                >
                  💬 Start Negotiation with Seller
                </Button>
              )}

              {!showRejectForm ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setShowRejectForm(true)}
                >
                  ❌ Reject — Price Gap Too Large
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/30 p-3">
                  <p className="text-sm font-medium">Reason: Price too high</p>
                  <textarea
                    rows={3}
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
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
                  {notifySeller && rejectNotes.trim() && (
                    <p className="text-xs text-muted-foreground">{rejectPreview}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!rejectNotes.trim()}
                      onClick={confirmReject}
                    >
                      Confirm Reject
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowRejectForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
