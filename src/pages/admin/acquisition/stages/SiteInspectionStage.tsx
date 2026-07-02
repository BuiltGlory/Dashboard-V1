import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertTriangle,
  CheckCircle,
  FileText,
  Phone,
  ThumbsUp,
  Upload,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { updateAdminAcquisitionSection, type Acquisition, type AcquisitionStage } from '@/api/adminAcquisitions'
import { readAdminSession } from '@/api/admin'
import { listWorkflowLogs, uploadWorkflowProof } from '@/api/adminWorkflow'
import { cn } from '@/lib/utils'
import { ExpectedSpecificationsPanel } from '@/utils/propertyFieldConfig'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface SiteInspectionStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

interface InspectionSchedule {
  inspector: string
  scheduledDate: string
  scheduledTime: string
  notes: string
  completed: boolean
  rescheduleCount: number
}

type PropertyCondition = 'excellent' | 'good' | 'fair' | 'poor'
type Recommendation = 'proceed' | 'caution' | 'reject'

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

const REJECT_REASONS = [
  'Price too high',
  'Poor condition expected',
  'Location not suitable',
  'Incomplete information',
  'Duplicate listing',
  'Other',
] as const

const OUTCOME_STYLES: Record<string, string> = {
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-muted text-muted-foreground',
  'Callback Later': 'bg-blue-100 text-blue-700',
  'No Answer': 'bg-orange-100 text-orange-700',
  'Wrong Number': 'bg-red-100 text-red-700',
}

const SITE_INSPECTION_CALL_SUMMARY_PREFIX = 'Acquisition site inspection call'
const SITE_INSPECTION_NOTE_SUMMARY = 'Acquisition site inspection note'
const SITE_INSPECTION_PHOTO_SUMMARY = 'Acquisition site inspection photo'

const CONDITIONS: {
  key: PropertyCondition
  label: string
  icon: typeof CheckCircle
  className: string
}[] = [
  { key: 'excellent', label: 'Excellent', icon: CheckCircle, className: 'border-green-500 bg-green-50 text-green-700' },
  { key: 'good', label: 'Good', icon: ThumbsUp, className: 'border-blue-500 bg-blue-50 text-blue-700' },
  { key: 'fair', label: 'Fair', icon: AlertTriangle, className: 'border-orange-500 bg-orange-50 text-orange-700' },
  { key: 'poor', label: 'Poor', icon: XCircle, className: 'border-red-500 bg-red-50 text-red-700' },
]

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

function formatScheduledDisplay(date: string, time: string) {
  const d = new Date(`${date}T${time || '00:00'}`)
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function getScheduledTimestamp(schedule: InspectionSchedule) {
  return new Date(`${schedule.scheduledDate}T${schedule.scheduledTime || '00:00'}`).getTime()
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function currentAdminName() {
  const session = readAdminSession()
  return session?.admin?.name || session?.admin?.email || 'Current Admin'
}

function parseSchedule(value: unknown): InspectionSchedule | null {
  const record = objectOf(value)
  if (!record.scheduledDate) return null
  return {
    inspector: stringOf(record.inspector),
    scheduledDate: stringOf(record.scheduledDate),
    scheduledTime: stringOf(record.scheduledTime, '10:00'),
    notes: stringOf(record.notes),
    completed: Boolean(record.completed),
    rescheduleCount: Number(record.rescheduleCount) || 0,
  }
}

export function SiteInspectionStage({ acquisition, onStageChange }: SiteInspectionStageProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [schedule, setSchedule] = useState<InspectionSchedule | null>(null)
  const [showReschedule, setShowReschedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({
    inspector: currentAdminName(),
    scheduledDate: '',
    scheduledTime: '10:00',
    notes: '',
  })

  const [visitMarkedComplete, setVisitMarkedComplete] = useState(false)
  const [reportSaved, setReportSaved] = useState(false)
  const [condition, setCondition] = useState<PropertyCondition | null>(null)
  const [structuralIssues, setStructuralIssues] = useState(false)
  const [repairCost, setRepairCost] = useState('')
  const [structuralDetails, setStructuralDetails] = useState('')
  const [inspectionPhotos, setInspectionPhotos] = useState<string[]>([])
  const [reportNotes, setReportNotes] = useState('')
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)
  const [photoWarning, setPhotoWarning] = useState(false)
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

  const [verifiedSpecs, setVerifiedSpecs] = useState<Record<string, boolean>>({})

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')
  const [notifySeller, setNotifySeller] = useState(true)
  const [showProceedConfirm, setShowProceedConfirm] = useState(false)

  const isOverdue = useMemo(() => {
    if (!schedule || schedule.completed) return false
    return getScheduledTimestamp(schedule) < Date.now()
  }, [schedule])

  const repairRequired = structuralIssues || condition === 'poor'

  useEffect(() => {
    const inspection = objectOf(objectOf(acquisition.valuation).siteInspection)
    const savedSchedule = parseSchedule(inspection.schedule)
    const report = objectOf(inspection.report)
    setSchedule(savedSchedule)
    setVisitMarkedComplete(Boolean(inspection.visitMarkedComplete || savedSchedule?.completed))
    setReportSaved(Boolean(inspection.reportSaved))
    const savedCondition = stringOf(report.condition)
    setCondition(
      savedCondition === 'excellent' || savedCondition === 'good' || savedCondition === 'fair' || savedCondition === 'poor'
        ? savedCondition
        : null,
    )
    setStructuralIssues(Boolean(report.structuralIssues))
    setRepairCost(report.repairCost == null ? '' : String(report.repairCost))
    setStructuralDetails(stringOf(report.structuralDetails))
    setReportNotes(stringOf(report.notes))
    const savedRecommendation = stringOf(report.recommendation)
    setRecommendation(
      savedRecommendation === 'proceed' || savedRecommendation === 'caution' || savedRecommendation === 'reject'
        ? savedRecommendation
        : null,
    )
    setVerifiedSpecs(objectOf(inspection.verifiedSpecs) as Record<string, boolean>)
  }, [acquisition.valuation])

  const persistInspectionState = async (
    next: Partial<{
      schedule: InspectionSchedule | null
      visitMarkedComplete: boolean
      verifiedSpecs: Record<string, boolean>
      reportSaved: boolean
      report: Record<string, unknown>
    }>,
  ) => {
    const session = readAdminSession()
    if (!session?.accessToken) return
    const currentValuation = objectOf(acquisition.valuation)
    const currentInspection = objectOf(currentValuation.siteInspection)
    const siteInspection = {
      ...currentInspection,
      schedule: next.schedule !== undefined ? next.schedule : schedule,
      visitMarkedComplete:
        next.visitMarkedComplete !== undefined ? next.visitMarkedComplete : visitMarkedComplete,
      verifiedSpecs: next.verifiedSpecs ?? verifiedSpecs,
      reportSaved: next.reportSaved !== undefined ? next.reportSaved : reportSaved,
      report: next.report ?? currentInspection.report ?? null,
      updatedAt: new Date().toISOString(),
    }
    const saved = await updateAdminAcquisitionSection(session.accessToken, acquisition.id, 'valuation', {
      ...currentValuation,
      siteInspection,
    })
    onStageChange(saved.stage, { valuation: saved.valuation })
  }

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'acquisition',
      acquisition.id,
      SITE_INSPECTION_CALL_SUMMARY_PREFIX,
      SITE_INSPECTION_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
      setNotes(notes.map(workflowLogToStageNote))
    })
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !acquisition.id) return
    let cancelled = false
    void listWorkflowLogs(session.accessToken, 'acquisition', acquisition.id, 'proof_upload')
      .then((result) => {
        if (cancelled) return
        const urls = result.data
          .filter((log) => log.summary === SITE_INSPECTION_PHOTO_SUMMARY)
          .flatMap((log) => log.attachments.map((attachment) => attachment.url))
          .filter(Boolean)
        setInspectionPhotos(urls)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  const saveCall = async () => {
    const duration = Number(callDuration)
    if (!callAt || !duration || duration < 1) return
    const log = await createStageCallLog(
      'acquisition',
      acquisition.id,
      SITE_INSPECTION_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('acquisition', acquisition.id, SITE_INSPECTION_NOTE_SUMMARY, noteText.trim())
    setNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const handleSchedule = () => {
    if (!scheduleForm.inspector.trim() || !scheduleForm.scheduledDate) return
    const nextSchedule = {
      inspector: scheduleForm.inspector.trim(),
      scheduledDate: scheduleForm.scheduledDate,
      scheduledTime: scheduleForm.scheduledTime,
      notes: scheduleForm.notes,
      completed: false,
      rescheduleCount: schedule ? schedule.rescheduleCount + 1 : 0,
    } satisfies InspectionSchedule
    setSchedule(nextSchedule)
    void persistInspectionState({ schedule: nextSchedule }).catch(() => undefined)
    setShowReschedule(false)
  }

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length) return
    const session = readAdminSession()
    if (!session?.accessToken) return
    const uploads = await Promise.all(
      Array.from(files).map((file) =>
        uploadWorkflowProof(session.accessToken, 'acquisition', acquisition.id, file, {
          summary: SITE_INSPECTION_PHOTO_SUMMARY,
          notes: reportNotes.trim(),
        }),
      ),
    )
    const urls = uploads.flatMap((log) => log.attachments.map((attachment) => attachment.url)).filter(Boolean)
    setInspectionPhotos((prev) => [...prev, ...urls])
  }

  const removePhoto = (url: string) => {
    setInspectionPhotos((prev) => prev.filter((p) => p !== url))
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const saveReport = () => {
    setSaveError(null)
    if (!condition) {
      setSaveError('Select overall condition')
      return
    }
    if (!recommendation) {
      setSaveError('Select a recommendation')
      return
    }
    if (repairRequired && !repairCost.trim()) {
      setSaveError('Add estimated repair cost')
      return
    }
    if (inspectionPhotos.length === 0) {
      setPhotoWarning(true)
    } else {
      setPhotoWarning(false)
    }
    const report = {
      condition,
      recommendation,
      structuralIssues,
      repairCost: repairCost ? Number(repairCost) : null,
      structuralDetails: structuralDetails.trim(),
      notes: reportNotes.trim(),
      photos: inspectionPhotos,
      savedAt: new Date().toISOString(),
    }
    setReportSaved(true)
    void persistInspectionState({ reportSaved: true, report }).catch(() => undefined)
  }

  const confirmReject = () => {
    if (!rejectReason || !rejectNotes.trim()) return
    onStageChange('rejected', {
      rejectionReason: `${rejectReason}: ${rejectNotes.trim()}`,
    })
    setShowRejectForm(false)
  }

  const rejectPreview = notifySeller
    ? `Hi ${acquisition.sellerName}, we cannot proceed with ${acquisition.propertyTitle}. Reason: ${rejectReason}. ${rejectNotes}`
    : ''

  const reportFormEnabled = visitMarkedComplete

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Inspection Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!schedule || showReschedule ? (
            <div className="space-y-3">
              <input
                value={scheduleForm.inspector}
                onChange={(e) => setScheduleForm((f) => ({ ...f, inspector: e.target.value }))}
                placeholder="Inspector name *"
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  value={scheduleForm.scheduledDate}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledDate: e.target.value }))}
                  className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
                <input
                  type="time"
                  value={scheduleForm.scheduledTime}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                  className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
              </div>
              <textarea
                rows={2}
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleSchedule}
                  disabled={!scheduleForm.inspector.trim() || !scheduleForm.scheduledDate}
                >
                  {showReschedule ? 'Save Reschedule' : 'Schedule Inspection'}
                </Button>
                {showReschedule && (
                  <Button type="button" variant="outline" onClick={() => setShowReschedule(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Inspector:</span>{' '}
                  <span className="font-medium">{schedule.inspector}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Scheduled:</span>{' '}
                  {formatScheduledDisplay(schedule.scheduledDate, schedule.scheduledTime)}
                </p>
                {schedule.notes && (
                  <p className="text-muted-foreground">{schedule.notes}</p>
                )}
                <Badge variant={schedule.completed ? 'responded' : 'blue'}>
                  {schedule.completed ? 'Completed' : 'Scheduled'}
                </Badge>
              </div>
              {!schedule.completed && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowReschedule(true)}>
                  Reschedule
                </Button>
              )}
            </>
          )}

          {isOverdue && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              ⚠️ Inspection overdue — reschedule or mark completed
            </div>
          )}

          {schedule && schedule.rescheduleCount >= 3 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              Multiple reschedules ({schedule.rescheduleCount}×)
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expected Specifications</CardTitle>
          <p className="text-sm text-muted-foreground">Verify seller-submitted details on site</p>
        </CardHeader>
        <CardContent>
          <ExpectedSpecificationsPanel
            propertyType={acquisition.propertyType}
            propertyDetails={acquisition.propertyDetails}
            verified={verifiedSpecs}
            onToggleVerified={(key) => {
              const nextVerifiedSpecs = { ...verifiedSpecs, [key]: !verifiedSpecs[key] }
              setVerifiedSpecs(nextVerifiedSpecs)
              void persistInspectionState({ verifiedSpecs: nextVerifiedSpecs }).catch(() => undefined)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inspection Report</CardTitle>
          <p className="text-sm text-muted-foreground">Complete after site visit</p>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {!reportFormEnabled && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
                <p className="text-sm font-medium text-muted-foreground">Complete inspection first</p>
                <Button
                  type="button"
                  className="mt-3"
                  onClick={() => {
                    const nextSchedule = schedule ? { ...schedule, completed: true } : schedule
                    setVisitMarkedComplete(true)
                    setSchedule(nextSchedule)
                    void persistInspectionState({
                      visitMarkedComplete: true,
                      schedule: nextSchedule,
                    }).catch(() => undefined)
                  }}
                >
                  Mark Inspection Complete
                </Button>
              </div>
            )}

            <div
              className={cn(
                'space-y-4',
                !reportFormEnabled && 'pointer-events-none opacity-50',
              )}
            >
              <div>
                <p className="mb-2 text-sm font-medium">Overall Condition *</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CONDITIONS.map(({ key, label, icon: Icon, className }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCondition(key)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-xs font-medium transition-colors',
                        condition === key ? className : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      <Icon className="size-5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Structural Issues Found?</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={structuralIssues ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStructuralIssues(true)}
                  >
                    Yes
                  </Button>
                  <Button
                    type="button"
                    variant={!structuralIssues ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStructuralIssues(false)}
                  >
                    No
                  </Button>
                </div>
                {structuralIssues && (
                  <div className="mt-3 space-y-2">
                    <input
                      type="number"
                      value={repairCost}
                      onChange={(e) => setRepairCost(e.target.value)}
                      placeholder="Estimated repair cost (₹) *"
                      className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                    <textarea
                      rows={2}
                      value={structuralDetails}
                      onChange={(e) => setStructuralDetails(e.target.value)}
                      placeholder="Structural issue details"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Site Photos</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handlePhotoUpload(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border py-8 text-sm text-muted-foreground hover:bg-muted/50"
                >
                  <Upload className="size-8" />
                  Drop photos here or click to upload
                </button>
                {inspectionPhotos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {inspectionPhotos.map((url) => (
                      <div key={url} className="relative">
                        <img src={url} alt="" className="h-24 w-full rounded-lg object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow"
                          onClick={() => removePhoto(url)}
                          aria-label="Remove photo"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <textarea
                  rows={4}
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Describe property condition, location, surroundings, access..."
                  className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Your Recommendation *</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant={recommendation === 'proceed' ? 'default' : 'outline'}
                    className={cn(
                      recommendation === 'proceed' && 'bg-green-600 text-white hover:bg-green-700',
                    )}
                    onClick={() => setRecommendation('proceed')}
                  >
                    Proceed ✅
                  </Button>
                  <Button
                    type="button"
                    variant={recommendation === 'caution' ? 'default' : 'outline'}
                    className={cn(
                      recommendation === 'caution' &&
                        'border-orange-500 bg-orange-600 text-white hover:bg-orange-700',
                    )}
                    onClick={() => setRecommendation('caution')}
                  >
                    Proceed with Caution ⚠️
                  </Button>
                  <Button
                    type="button"
                    variant={recommendation === 'reject' ? 'default' : 'outline'}
                    className={cn(
                      recommendation === 'reject' && 'bg-red-600 text-white hover:bg-red-700',
                    )}
                    onClick={() => setRecommendation('reject')}
                  >
                    Recommend Reject ❌
                  </Button>
                </div>
              </div>

              {photoWarning && (
                <p className="text-sm text-orange-700">Add photos before saving report</p>
              )}
              {saveError && <p className="text-sm text-red-600">{saveError}</p>}

              <Button type="button" className="w-full" onClick={saveReport}>
                Save Inspection Report
              </Button>
            </div>
          </div>
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
              <div>
                <label className="text-xs font-medium text-muted-foreground">Called at</label>
                <input
                  type="datetime-local"
                  value={callAt}
                  onChange={(e) => setCallAt(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Duration</label>
                  <input
                    type="number"
                    min={1}
                    value={callDuration}
                    onChange={(e) => setCallDuration(e.target.value)}
                    className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                </div>
                <span className="pb-2 text-sm text-muted-foreground">minutes</span>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Outcome</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                >
                  {CALL_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                />
              </div>
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

          {!reportSaved ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              Save inspection report to proceed
            </p>
          ) : (
            <>
              {recommendation === 'caution' && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  ⚠️ Proceeding with caution noted. Add valuation notes about condition.
                </div>
              )}

              {showProceedConfirm && (
                <div className="rounded-lg border border-border bg-muted p-3 text-sm">
                  <p className="font-medium">Recommendation is reject. Proceed to valuation anyway?</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setShowProceedConfirm(false)
                        onStageChange('valuation', {
                          valuation: {
                            ...acquisition.valuation,
                            inspectionSummary: {
                              condition,
                              recommendation,
                              structuralIssues,
                              repairCost: repairCost ? Number(repairCost) : null,
                              structuralDetails: structuralDetails.trim(),
                              notes: reportNotes.trim(),
                            },
                          },
                        })
                        navigate('/admin/acquisition/valuation')
                      }}
                    >
                      Yes, proceed
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowProceedConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <Button
                type="button"
                className="mb-3 w-full bg-green-600 text-white hover:bg-green-700"
                disabled={!reportSaved || !recommendation}
                onClick={() => {
                  if (recommendation === 'reject') {
                    setShowProceedConfirm(true)
                    return
                  }
                  if (recommendation === 'proceed' || recommendation === 'caution') {
                    onStageChange('valuation', {
                      valuation: {
                        ...acquisition.valuation,
                        inspectionSummary: {
                          condition,
                          recommendation,
                          structuralIssues,
                          repairCost: repairCost ? Number(repairCost) : null,
                          structuralDetails: structuralDetails.trim(),
                          notes: reportNotes.trim(),
                        },
                      },
                    })
                    navigate('/admin/acquisition/valuation')
                  }
                }}
              >
                ✅ Move to Valuation
              </Button>

              {!showRejectForm ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setShowRejectForm(true)}
                >
                  ❌ Reject — Poor Condition
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/30 p-3">
                  <select
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  >
                    <option value="">Select reason *</option>
                    {REJECT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
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
                  {notifySeller && rejectReason && (
                    <p className="text-xs text-muted-foreground">{rejectPreview}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!rejectReason || !rejectNotes.trim()}
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
