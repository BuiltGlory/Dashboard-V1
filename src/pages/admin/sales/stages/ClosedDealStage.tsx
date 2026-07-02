import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, FileText, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPrice, type SalesDeal, type SalesStage } from '@/api/adminSales'
import { cn } from '@/lib/utils'
import {
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface ClosedDealStageProps {
  deal: SalesDeal
  onStageChange: (stage: SalesStage, patch?: Partial<SalesDeal>) => void
}

type ReviewStatus = 'not_requested' | 'requested' | 'received'

interface NoteEntry {
  id: string
  text: string
  at: string
}

const CLOSED_DEAL_NOTE_SUMMARY = 'Sales closed deal note'

const FINAL_DOCUMENTS = [
  'Sale Agreement',
  'Title Deed (from seller)',
  'Encumbrance Certificate',
  'NOC',
  'Registration Documents',
  'Khata Transfer',
  'Possession Letter',
  'Property Tax Receipt',
]

const TIMELINE_STAGES = [
  'Active Leads',
  'Site Visits',
  'Negotiation',
  'Token Payment',
  'Payment',
  'Documentation',
  'Closed',
] as const

function formatDealDate(iso: string | null) {
  if (!iso) return '—'
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

function daysBetween(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
}

function buildTimeline(deal: SalesDeal) {
  const closed = deal.closedAt ?? deal.lastActivityAt
  const created = new Date(deal.createdAt).getTime()
  const closedTime = new Date(closed).getTime()
  const span = closedTime - created
  const step = span / (TIMELINE_STAGES.length - 1)

  return TIMELINE_STAGES.map((label, i) => {
    const at = new Date(created + step * i)
    return {
      label,
      date: at.toISOString(),
      isLast: i === TIMELINE_STAGES.length - 1,
    }
  })
}

export function ClosedDealStage({ deal }: ClosedDealStageProps) {
  const navigate = useNavigate()

  const agreed = deal.agreedPrice ?? 0
  const listed = deal.propertyPrice
  const discountPct =
    agreed > 0 && listed > 0 ? Math.round(((listed - agreed) / listed) * 100) : 0
  const fullyPaid = deal.totalPaid >= agreed && agreed > 0
  const underpayment = agreed > 0 && deal.totalPaid < agreed

  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('not_requested')
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const timeline = useMemo(() => buildTimeline(deal), [deal])
  const totalDays = daysBetween(
    deal.createdAt,
    deal.closedAt ?? deal.lastActivityAt,
  )

  const reviewMessage = `Hi ${deal.buyerName}, congratulations on your new property! We'd love to hear about your experience. Please rate us on the Builtglory app. Thank you!`

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('sales-deal', deal.id, 'Sales closed deal call', CLOSED_DEAL_NOTE_SUMMARY).then(
      ({ notes }) => {
        if (!cancelled) setInternalNotes(notes.map(workflowLogToStageNote))
      },
    )
    return () => {
      cancelled = true
    }
  }, [deal.id])

  const saveNote = async () => {
    if (!noteText.trim()) return
    const log = await createStageNoteLog('sales-deal', deal.id, CLOSED_DEAL_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Deal Complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
            🎉 Deal Closed Successfully!
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
              <p className="text-muted-foreground">Listed Price</p>
              <p className="font-medium">{formatPrice(listed)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Agreed Price</p>
              <p className="font-medium">{formatPrice(agreed)}</p>
            </div>
            {discountPct > 0 && (
              <div>
                <p className="text-muted-foreground">Discount</p>
                <p className="font-medium">{discountPct}% below listed</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Total Received</p>
              <p className="font-medium">{formatPrice(deal.totalPaid)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Closed On</p>
              <p className="font-medium">{formatDealDate(deal.closedAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Assigned To</p>
              <p className="font-medium">{deal.assignedTo}</p>
            </div>
          </div>
          {fullyPaid && (
            <p className="text-sm font-medium text-green-700">✅ Fully paid</p>
          )}
          {underpayment && (
            <p className="text-sm text-red-700">
              ⚠️ Underpayment: {formatPrice(agreed - deal.totalPaid)} pending
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deal Journey</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Deal completed in {totalDays} days
          </p>
          <div className="relative space-y-0 border-l-2 border-border pl-6">
            {timeline.map((item, i) => (
              <div key={item.label} className="relative pb-6 last:pb-0">
                <span
                  className={cn(
                    'absolute -left-[1.65rem] top-1 flex size-3 rounded-full',
                    item.isLast ? 'bg-green-500' : 'bg-primary',
                  )}
                />
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDealDate(item.date)}
                  {i === 0 && ' · Deal created'}
                  {item.isLast && ' · Closed'}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Final Documents</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setToast('Downloading all documents…')
              setTimeout(() => setToast(null), 2000)
            }}
          >
            Download All
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {FINAL_DOCUMENTS.map((name) => (
              <li key={name} className="flex items-center gap-2 text-sm">
                <Check className="size-4 text-green-600" />
                <span>{name}</span>
                <span className="text-xs text-green-700">Verified</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Request Review</CardTitle>
          {reviewStatus === 'requested' && (
            <Badge variant="blue">Review requested</Badge>
          )}
          {reviewStatus === 'received' && (
            <Badge variant="responded">Review received</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Status:{' '}
            {reviewStatus === 'not_requested'
              ? 'Not requested'
              : reviewStatus === 'requested'
                ? 'Requested'
                : 'Received'}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={reviewStatus !== 'not_requested'}
            onClick={() => setShowReviewModal(true)}
          >
            📱 Request App Review from Buyer
          </Button>
        </CardContent>
      </Card>

      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Request app review</h4>
            <p className="mt-2 text-sm text-muted-foreground">{reviewMessage}</p>
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
                      `https://wa.me/${tel}?text=${encodeURIComponent(reviewMessage)}`,
                      '_blank',
                    )
                  }
                  if (sendEmail && deal.buyerEmail) {
                    window.open(
                      `mailto:${deal.buyerEmail}?subject=${encodeURIComponent('Share your experience')}&body=${encodeURIComponent(reviewMessage)}`,
                      '_self',
                    )
                  }
                  setReviewStatus('requested')
                  setShowReviewModal(false)
                }}
              >
                Send
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowReviewModal(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

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

      <Card className="border border-green-200 bg-green-50">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="font-semibold text-green-800">This deal is complete ✅</p>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => navigate(`/admin/properties/${deal.propertyId}`)}
          >
            View Property →
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
