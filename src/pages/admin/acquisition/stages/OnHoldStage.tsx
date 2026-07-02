import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getStageLabel,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { cn } from '@/lib/utils'
import {
  createStageCallLog,
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageCall,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface OnHoldStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

type ResumeStage = Exclude<
  AcquisitionStage,
  'acquired' | 'rejected' | 'on_hold'
>

const RESUME_STAGES: ResumeStage[] = [
  'pending_review',
  'site_inspection',
  'valuation',
  'negotiation',
  'token_to_seller',
  'documentation',
  'seller_payout',
]

const STAGE_ROUTE_MAP: Record<ResumeStage, string> = {
  pending_review: '/admin/acquisition/pending',
  site_inspection: '/admin/acquisition/inspection',
  valuation: '/admin/acquisition/valuation',
  negotiation: '/admin/acquisition/negotiation',
  token_to_seller: '/admin/acquisition/token',
  documentation: '/admin/acquisition/documentation',
  seller_payout: '/admin/acquisition/payout',
}

const REJECT_REASONS = [
  'Price too high',
  'Poor condition',
  'Location not suitable',
  'Incomplete info',
  'Duplicate',
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

const ON_HOLD_CALL_SUMMARY_PREFIX = 'Acquisition on hold call'
const ON_HOLD_NOTE_SUMMARY = 'Acquisition on hold note'

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

function formatHoldDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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

export function OnHoldStage({ acquisition, onStageChange }: OnHoldStageProps) {
  const navigate = useNavigate()

  const holdReason = acquisition.onHoldReason?.trim() || null
  const putOnHoldDate = acquisition.lastActivityAt
  const longHold = acquisition.daysInStage > 60

  const [resumeStage, setResumeStage] = useState<ResumeStage | ''>('')
  const [showResumeConfirm, setShowResumeConfirm] = useState(false)

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')
  const [notifySeller, setNotifySeller] = useState(true)

  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const rejectPreview = notifySeller
    ? `Hi ${acquisition.sellerName}, we are unable to proceed with your property listing (${acquisition.propertyTitle}). Reason: ${rejectReason}. ${rejectNotes}`
    : ''

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('acquisition', acquisition.id, ON_HOLD_CALL_SUMMARY_PREFIX, ON_HOLD_NOTE_SUMMARY).then(
      ({ calls, notes }) => {
        if (cancelled) return
        setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
        setInternalNotes(notes.map(workflowLogToStageNote))
      },
    )
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
      ON_HOLD_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('acquisition', acquisition.id, ON_HOLD_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const confirmReject = () => {
    if (!rejectReason || !rejectNotes.trim()) return
    onStageChange('rejected', {
      rejectionReason: `${rejectReason}: ${rejectNotes.trim()}`,
    })
    navigate('/admin/acquisition/rejected')
  }

  const confirmResume = () => {
    if (!resumeStage) return
    onStageChange(resumeStage, {
      onHoldReason: null,
    })
    navigate(STAGE_ROUTE_MAP[resumeStage])
  }

  const handleResumeStageChange = (value: string) => {
    if (!value) {
      setResumeStage('')
      setShowResumeConfirm(false)
      return
    }
    setResumeStage(value as ResumeStage)
    setShowResumeConfirm(true)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>On Hold Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 font-semibold text-orange-800">
            ⏸️ Property On Hold
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Put On Hold</p>
              <p className="font-medium">{formatHoldDate(putOnHoldDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Held By</p>
              <p className="font-medium">{acquisition.assignedTo}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Days On Hold</p>
              <p className="font-medium">{acquisition.daysInStage}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Reason</p>
              {holdReason ? (
                <p className="font-medium">{holdReason}</p>
              ) : (
                <p className="italic text-muted-foreground">No reason recorded</p>
              )}
            </div>
          </div>

          {longHold && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              ⚠️ On hold for {acquisition.daysInStage} days — review or close this acquisition
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What would you like to do?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Button
              type="button"
              className="mb-3 w-full"
              onClick={() => document.getElementById('resume-stage-select')?.focus()}
            >
              ▶️ Resume Acquisition
            </Button>
            <label htmlFor="resume-stage-select" className="text-sm font-medium">
              Return to stage
            </label>
            <select
              id="resume-stage-select"
              value={resumeStage}
              onChange={(e) => handleResumeStageChange(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            >
              <option value="">Select stage…</option>
              {RESUME_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {getStageLabel(stage)}
                </option>
              ))}
            </select>

            {showResumeConfirm && resumeStage && (
              <div className="rounded-lg border border-border bg-muted p-4 text-sm">
                <p>Resume from {getStageLabel(resumeStage)}?</p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" size="sm" onClick={confirmResume}>
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowResumeConfirm(false)
                      setResumeStage('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

          </div>

          {!showRejectForm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowRejectForm(true)}
            >
              ❌ Reject & Close
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
                onClick={() => deleteInternalNote(note.id)}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
