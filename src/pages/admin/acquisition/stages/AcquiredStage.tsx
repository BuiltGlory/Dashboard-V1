import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { FileText, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { resolveAcquisitionPropertyPath } from '@/utils/adminActions'
import { hoursSince } from '@/utils/timer'
import {
  createStageNoteLog,
  deleteStageWorkflowLog,
  loadStageWorkflowLogs,
  workflowLogToStageNote,
} from '@/pages/admin/workflowStagePersistence'

export interface AcquiredStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
}

interface NoteEntry {
  id: string
  text: string
  at: string
}

const ACQUIRED_NOTE_SUMMARY = 'Acquisition acquired note'

const ACQUISITION_DOCUMENTS = [
  { name: 'Title Deed', status: 'Verified' },
  { name: 'Encumbrance Certificate', status: 'Verified' },
  { name: 'Property Tax Receipt', status: 'Verified' },
  { name: 'NOC', status: 'Verified' },
  { name: 'Sale Agreement (Draft)', status: 'Verified' },
  { name: 'Inspection Report', status: 'Verified' },
  { name: 'Valuation Certificate', status: 'Verified' },
  { name: 'Seller ID (Aadhar + PAN)', status: 'Verified' },
]

function formatAcquiredDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatNoteTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AcquiredStage({ acquisition }: AcquiredStageProps) {
  const navigate = useNavigate()

  const asking = acquisition.askingPrice
  const agreed = acquisition.agreedPrice
  const finalPrice = acquisition.finalPurchasePrice
  const savings = agreed != null ? asking - agreed : 0

  const [listingTitle, setListingTitle] = useState(acquisition.propertyTitle)
  const [sellingPrice, setSellingPrice] = useState('')
  const [featured, setFeatured] = useState(false)
  const [upcoming, setUpcoming] = useState(false)
  const [listed, setListed] = useState(false)

  const [internalNotes, setInternalNotes] = useState<NoteEntry[]>([])
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [addedToMasterSheet, setAddedToMasterSheet] = useState(false)

  const daysSinceAcquired = hoursSince(acquisition.lastActivityAt) / 24

  const sellingNum = Number(sellingPrice.replace(/,/g, ''))
  const belowAcquisition =
    finalPrice != null && Number.isFinite(sellingNum) && sellingNum > 0 && sellingNum < finalPrice
  const belowAgreed =
    agreed != null && Number.isFinite(sellingNum) && sellingNum > 0 && sellingNum < agreed
  const bothToggles = featured && upcoming

  const canList =
    !listed &&
    listingTitle.trim() &&
    Number.isFinite(sellingNum) &&
    sellingNum > 0 &&
    !bothToggles

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs('acquisition', acquisition.id, 'Acquisition acquired call', ACQUIRED_NOTE_SUMMARY).then(
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
    const log = await createStageNoteLog('acquisition', acquisition.id, ACQUIRED_NOTE_SUMMARY, noteText.trim())
    setInternalNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setInternalNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const addToProperties = () => {
    if (!canList) return
    setListed(true)
    setToast('Property added to listings')
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      {daysSinceAcquired > 7 && !addedToMasterSheet && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <span>Add this property to the master sheet (acquired {Math.floor(daysSinceAcquired)}d ago)</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddedToMasterSheet(true)
              setToast('Marked for master sheet')
            }}
          >
            Add to Master Sheet →
          </Button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Acquisition Complete</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="font-semibold text-green-800">🏠 Property Acquired!</p>
            <p className="mt-1 text-sm text-green-700">
              This property is now owned by Builtglory
            </p>
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Asking Price</p>
              <p className="font-medium">{formatPrice(asking)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Agreed Price</p>
              <p className="font-medium">
                {agreed != null ? formatPrice(agreed) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Paid</p>
              <p className="font-medium">
                {finalPrice != null ? formatPrice(finalPrice) : 'Purchase price not recorded'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Savings</p>
              <p className="font-medium">
                {agreed != null ? formatPrice(Math.max(0, savings)) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Acquired On</p>
              <p className="font-medium">{formatAcquiredDate(acquisition.createdAt)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Acquired By</p>
              <p className="font-medium">{acquisition.assignedTo}</p>
            </div>
          </div>

          {savings > 0 && agreed != null && (
            <p className="text-sm font-medium text-green-700">
              Saved {formatPrice(savings)} below asking
            </p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border border-primary p-4">
        <h3 className="font-semibold text-foreground">List This Property for Sale</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This property is ready to list on app
        </p>

        {listed ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge className="bg-green-600 hover:bg-green-600">Listed</Badge>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate(resolveAcquisitionPropertyPath(acquisition))}
            >
              View Property →
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <label className="text-sm font-medium">Listing title</label>
              <input
                value={listingTitle}
                onChange={(e) => setListingTitle(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Selling price (₹) *</label>
              <input
                type="number"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              {belowAcquisition && (
                <p className="mt-1 text-sm text-red-700">Selling below acquisition cost</p>
              )}
              {belowAgreed && !belowAcquisition && (
                <p className="mt-1 text-sm text-orange-700">Selling below agreed price</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Mark as Featured
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={upcoming}
                onChange={(e) => setUpcoming(e.target.checked)}
                className="size-4 rounded border-border"
              />
              Mark as Upcoming
            </label>

            {bothToggles && (
              <p className="text-sm text-orange-700">
                Cannot be both Featured and Upcoming
              </p>
            )}

            <Button type="button" className="w-full" disabled={!canList} onClick={addToProperties}>
              Add to Properties
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Acquisition Documents</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setToast('Downloading all documents…')
              setTimeout(() => setToast(null), 2500)
            }}
          >
            Download All
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {ACQUISITION_DOCUMENTS.map((doc) => (
              <li
                key={doc.name}
                className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0"
              >
                <span>{doc.name}</span>
                <span className="text-green-700">✅ {doc.status}</span>
              </li>
            ))}
          </ul>
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
