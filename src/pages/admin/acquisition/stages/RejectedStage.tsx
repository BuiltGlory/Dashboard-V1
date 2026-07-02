import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getStageLabel,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { cn } from '@/lib/utils'
import {
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface RejectedStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

interface NoteEntry {
  id: string
  text: string
  at: string
}

const REJECTED_NOTE_SUMMARY = 'Acquisition rejected note'

function formatRejectedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatNoteTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

export function RejectedStage({ acquisition, onStageChange }: RejectedStageProps) {
  const navigate = useNavigate()

  const [sellerNotified, setSellerNotified] = useState(
    Boolean(acquisition.rejectionReason),
  )
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)
  const [showReconsiderConfirm, setShowReconsiderConfirm] = useState(false)

  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const rejectedAtStage: AcquisitionStage = 'valuation'
  const reason =
    acquisition.rejectionReason?.trim() || null

  const notificationMessage = `Hi ${acquisition.sellerName}, after careful review we are unable to proceed with your property at this time. Reason: ${reason ?? 'Not specified'}. Thank you for your interest.`

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('acquisition', acquisition.id, 'Acquisition rejected call', REJECTED_NOTE_SUMMARY).then(
      ({ notes }) => {
        if (!cancelled) setInternalNotes(notes.map(workflowLogToStageNote))
      },
    )
    return () => {
      cancelled = true
    }
  }, [acquisition.id])

  const saveNote = async () => {
    if (!noteText.trim()) return
    const log = await createStageNoteLog('acquisition', acquisition.id, REJECTED_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const sendNotification = () => {
    const tel = phoneForTel(acquisition.sellerPhone)
    if (sendWhatsApp) {
      window.open(
        `https://wa.me/${tel}?text=${encodeURIComponent(notificationMessage)}`,
        '_blank',
      )
    }
    if (sendEmail && acquisition.sellerEmail) {
      window.open(
        `mailto:${acquisition.sellerEmail}?subject=${encodeURIComponent('Property review update')}&body=${encodeURIComponent(notificationMessage)}`,
        '_self',
      )
    }
    setSellerNotified(true)
    setShowSendModal(false)
  }

  const confirmReconsider = async () => {
    const log = await createStageNoteLog(
      'acquisition',
      acquisition.id,
      REJECTED_NOTE_SUMMARY,
      'Reconsidered from rejected stage',
    )
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    onStageChange('pending_review', {
      rejectionReason: null,
    })
    navigate('/admin/acquisition/pending')
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Rejection Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">
            ❌ Property Rejected
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Rejected On</p>
              <p className="font-medium">{formatRejectedDate(acquisition.lastActivityAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Rejected By</p>
              <p className="font-medium">{acquisition.assignedTo}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Stage When</p>
              <p className="font-medium">{getStageLabel(rejectedAtStage)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Seller Notified</p>
              <Badge
                className={cn(
                  sellerNotified
                    ? 'bg-green-600 hover:bg-green-600'
                    : 'bg-orange-500 hover:bg-orange-500',
                )}
              >
                {sellerNotified ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Reason</p>
              {reason ? (
                <p className="font-medium">{reason}</p>
              ) : (
                <p className="italic text-muted-foreground">No reason recorded</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seller Notification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sellerNotified ? (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                ✅ Seller was notified
              </div>
              <p className="text-sm text-muted-foreground">
                Notification sent via: WhatsApp + Email
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSendModal(true)}
              >
                Resend Notification
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                ⚠️ Seller not notified
              </div>
              <Button type="button" onClick={() => setShowSendModal(true)}>
                Send Notification Now
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Notify seller</h4>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {notificationMessage}
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
              <Button type="button" size="sm" onClick={sendNotification}>
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
          <CardTitle>Reconsider This Property</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            If circumstances have changed, you can move this property back for review.
          </p>
          {showReconsiderConfirm ? (
            <div className="rounded-lg border border-border bg-muted p-4 text-sm">
              <p>Move this property back to Pending Review?</p>
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" onClick={confirmReconsider}>
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReconsiderConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowReconsiderConfirm(true)}
            >
              ♻️ Move Back to Pending Review
            </Button>
          )}
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
