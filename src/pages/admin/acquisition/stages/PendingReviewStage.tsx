import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Box,
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  ImageOff,
  Phone,
  Plane,
  Video,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { readAdminSession } from '@/api/admin'
import { cn } from '@/lib/utils'
import {
  buildRequestDetailsMessage,
  hasPropertyDetails,
  normalizePropertyType,
  renderFieldGroups,
} from '@/utils/propertyFieldConfig'
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

export interface PendingReviewStageProps {
  acquisition: Acquisition
  onStageChange: (newStage: AcquisitionStage, patch?: Partial<Acquisition>) => void
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

const CHECKLIST_ITEMS = [
  'Property photos reviewed',
  'Location verified on map',
  'Asking price is reasonable',
  'No duplicate listing',
  'Property type matches description',
] as const

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

const PENDING_REVIEW_CALL_SUMMARY_PREFIX = 'Acquisition pending review call'
const PENDING_REVIEW_NOTE_SUMMARY = 'Acquisition pending review note'

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

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function isValidMediaUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function truncateText(text: string, max = 40) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function buildReviewChecklistItems(isNri: boolean) {
  const items = [...CHECKLIST_ITEMS, 'Minimum 5 photos uploaded']
  if (isNri) {
    items.push('Video/virtual tour available (for NRI properties)')
  }
  return items
}

export function PendingReviewStage({ acquisition, onStageChange }: PendingReviewStageProps) {
  const navigate = useNavigate()

  const submittedDetails = acquisition.propertyDetails ?? {}
  const description =
    typeof submittedDetails.description === 'string' ? submittedDetails.description : ''
  const amenities = Array.isArray(submittedDetails.amenities)
    ? submittedDetails.amenities.map(String)
    : []

  const previousListingsCount =
    typeof submittedDetails.previousListings === 'number' ? submittedDetails.previousListings : 0

  const hadPreviousRejection = Boolean(submittedDetails.hadPreviousRejection)

  const isNriProperty =
    acquisition.userType === 'nri' || acquisition.propertyType.toLowerCase() === 'nri'

  const reviewChecklistItems = useMemo(
    () => buildReviewChecklistItems(isNriProperty),
    [isNriProperty],
  )

  const photos = useMemo(
    () => (acquisition.photos ?? []).filter(Boolean),
    [acquisition.photos],
  )

  const hasUploadedPhotos = photos.length > 0

  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [showLightbox, setShowLightbox] = useState(false)
  const [showFloorPlanPreview, setShowFloorPlanPreview] = useState(false)

  const [checklist, setChecklist] = useState<boolean[]>(() =>
    buildReviewChecklistItems(
      acquisition.userType === 'nri' || acquisition.propertyType.toLowerCase() === 'nri',
    ).map(() => false),
  )
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([])
  const [notes, setNotes] = useState<NoteEntry[]>([])

  const [showCallForm, setShowCallForm] = useState(false)
  const [callAt, setCallAt] = useState(toDatetimeLocal())
  const [callDuration, setCallDuration] = useState('')
  const [callOutcome, setCallOutcome] = useState<string>(CALL_OUTCOMES[0])
  const [callNotes, setCallNotes] = useState('')

  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')

  const [showAcceptForm, setShowAcceptForm] = useState(false)
  const [inspector, setInspector] = useState(currentAdminName)
  const [scheduledDate, setScheduledDate] = useState('')
  const [inspectionNotes, setInspectionNotes] = useState('')

  const [showMoreInfoForm, setShowMoreInfoForm] = useState(false)
  const [moreInfoMessage, setMoreInfoMessage] = useState(
    `Hi ${acquisition.sellerName}, we need the following to proceed with your listing:\n- Clear property photos\nPlease update via the app.`,
  )
  const [sendWhatsApp, setSendWhatsApp] = useState(true)
  const [sendEmail, setSendEmail] = useState(true)

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')
  const [notifySeller, setNotifySeller] = useState(true)

  const checklistChecked = checklist.filter(Boolean).length
  const checklistComplete = checklistChecked === reviewChecklistItems.length
  const hasPhotos = hasUploadedPhotos
  const acceptDisabled = !hasPhotos

  const acceptDisabledReason = !hasPhotos
    ? 'Add photos before accepting'
    : undefined

  const toggleChecklist = (index: number) => {
    setChecklist((prev) => {
      const next = [...prev]
      next[index] = !next[index]
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    void loadStageWorkflowLogs(
      'acquisition',
      acquisition.id,
      PENDING_REVIEW_CALL_SUMMARY_PREFIX,
      PENDING_REVIEW_NOTE_SUMMARY,
    ).then(({ calls, notes }) => {
      if (cancelled) return
      setCallLogs(calls.map((log) => workflowLogToStageCall(log, CALL_OUTCOMES[0])))
      setNotes(notes.map(workflowLogToStageNote))
    })
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
      PENDING_REVIEW_CALL_SUMMARY_PREFIX,
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
    const log = await createStageNoteLog('acquisition', acquisition.id, PENDING_REVIEW_NOTE_SUMMARY, noteText.trim())
    setNotes((prev) => [workflowLogToStageNote(log), ...prev])
    setNoteText('')
    setShowNoteForm(false)
  }

  const deleteInternalNote = async (id: string) => {
    await deleteStageWorkflowLog(id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  const confirmAccept = () => {
    if (!inspector.trim() || !scheduledDate) return
    onStageChange('site_inspection', {
      propertyDetails: {
        ...acquisition.propertyDetails,
        pendingReview: {
          inspector: inspector.trim(),
          scheduledDate,
          notes: inspectionNotes.trim(),
        },
      },
    })
    navigate('/admin/acquisition/inspection')
  }

  const confirmReject = () => {
    if (!rejectReason || !rejectNotes.trim()) return
    onStageChange('rejected', {
      rejectionReason: `${rejectReason}: ${rejectNotes.trim()}`,
    })
    setShowRejectForm(false)
  }

  const rejectPreview = notifySeller
    ? `Hi ${acquisition.sellerName}, we are unable to proceed with your property listing (${acquisition.propertyTitle}). Reason: ${rejectReason}. ${rejectNotes}`
    : ''

  const requestPhotosWhatsApp = () => {
    const msg = `Hi ${acquisition.sellerName}, please upload clear property photos (minimum 5) for "${acquisition.propertyTitle}" via the BuiltGlory app. Thank you!`
    window.open(
      `https://wa.me/${phoneForTel(acquisition.sellerPhone)}?text=${encodeURIComponent(msg)}`,
      '_blank',
    )
  }

  const openLightbox = (index: number) => {
    setSelectedPhotoIndex(index)
    setShowLightbox(true)
  }

  const navigateLightbox = (delta: number) => {
    setSelectedPhotoIndex((prev) => {
      const next = prev + delta
      if (next < 0) return photos.length - 1
      if (next >= photos.length) return 0
      return next
    })
  }

  const downloadCurrentPhoto = () => {
    const url = photos[selectedPhotoIndex]
    if (!url) return
    const link = document.createElement('a')
    link.href = url
    link.download = `property-photo-${selectedPhotoIndex + 1}.jpg`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <CardTitle>Listing Details</CardTitle>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              photos.length < 5
                ? 'bg-orange-100 text-orange-800'
                : 'bg-muted text-muted-foreground',
            )}
            title={photos.length < 5 ? 'Minimum 5 photos recommended' : undefined}
          >
            📷 {photos.length < 5 ? `Only ${photos.length} photos` : `${photos.length} photos`}
          </span>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default" className="capitalize">
              {acquisition.propertyType}
            </Badge>
            <span className="text-sm text-muted-foreground">{acquisition.propertyLocation}</span>
          </div>
          <p className="text-2xl font-bold text-primary">{formatPrice(acquisition.askingPrice)}</p>
          <div className="rounded-lg bg-muted p-3 text-sm">
            {description ? (
              <p className="text-foreground">{description}</p>
            ) : (
              <p className="italic text-muted-foreground">No description provided</p>
            )}
          </div>
          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {amenities.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">Property Photos</h4>
              {hasUploadedPhotos && (
                <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {photos.length} photos
                </span>
              )}
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                📱 App: SL-05
              </span>
            </div>

            {!hasUploadedPhotos ? (
              <div className="flex flex-col items-center rounded-xl bg-muted/50 px-4 py-10 text-center">
                <ImageOff className="size-12 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">No photos uploaded by seller</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={requestPhotosWhatsApp}
                >
                  Request Photos
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="block w-full overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                  onClick={() => openLightbox(selectedPhotoIndex)}
                >
                  <img
                    src={photos[selectedPhotoIndex]}
                    alt=""
                    className="h-64 w-full object-cover"
                  />
                </button>

                {photos.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {photos.map((url, i) => (
                      <button
                        key={url + i}
                        type="button"
                        onClick={() => setSelectedPhotoIndex(i)}
                        className={cn(
                          'shrink-0 overflow-hidden rounded-lg border-2',
                          i === selectedPhotoIndex
                            ? 'border-primary'
                            : 'border-transparent',
                        )}
                      >
                        <img
                          src={url}
                          alt=""
                          className="h-16 w-20 object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                {photos.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Showing {selectedPhotoIndex + 1} of {photos.length} photos
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h4 className="mb-3 mt-4 text-sm font-semibold text-foreground">
              Property Specifications
            </h4>
            {hasPropertyDetails(acquisition.propertyType, acquisition.propertyDetails) &&
            normalizePropertyType(acquisition.propertyType) ? (
              renderFieldGroups(acquisition.propertyType, acquisition.propertyDetails)
            ) : (
              <div className="rounded-lg bg-muted/50 px-4 py-4 text-sm text-muted-foreground">
                <p>📋 No detailed specifications submitted by seller</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    const msg =
                      buildRequestDetailsMessage(
                        acquisition.sellerName,
                        acquisition.propertyTitle,
                        acquisition.propertyType,
                        acquisition.propertyDetails,
                      ) ||
                      `Hi ${acquisition.sellerName}, please submit detailed property specifications for "${acquisition.propertyTitle}" via the app. Thank you, Team Builtglory`
                    window.open(
                      `https://wa.me/${phoneForTel(acquisition.sellerPhone)}?text=${encodeURIComponent(msg)}`,
                      '_blank',
                    )
                  }}
                >
                  Request Details
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FileText className="size-5 text-blue-600" />
          <h3 className="font-semibold text-foreground">Media & Documents</h3>
          <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            📱 App: SL-05
          </span>
        </div>

        <p className="mb-3 text-sm font-semibold text-foreground">Video Tours</p>
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <Video className="mt-0.5 size-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium">Video Walkthrough</p>
                {acquisition.videoUrl ? (
                  isValidMediaUrl(acquisition.videoUrl) ? (
                    <>
                      <p className="text-xs text-blue-600">{truncateText(acquisition.videoUrl)}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => window.open(acquisition.videoUrl!, '_blank')}
                      >
                        ▶ Watch Video
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-red-600">Invalid URL</p>
                  )
                ) : (
                  <p className="text-xs italic text-muted-foreground">Not uploaded</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <Plane className="mt-0.5 size-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Drone / Aerial View</p>
                {acquisition.droneVideoUrl ? (
                  isValidMediaUrl(acquisition.droneVideoUrl) ? (
                    <>
                      <p className="text-xs text-blue-600">
                        {truncateText(acquisition.droneVideoUrl)}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => window.open(acquisition.droneVideoUrl!, '_blank')}
                      >
                        ▶ Watch Video
                      </Button>
                    </>
                  ) : (
                    <p className="text-xs text-red-600">Invalid URL</p>
                  )
                ) : (
                  <p className="text-xs italic text-muted-foreground">Not uploaded</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              <Box className="mt-0.5 size-5 text-teal-600" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">3D Virtual Tour</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    📱 App: B-07
                  </span>
                </div>
                {acquisition.tourUrl3D ? (
                  isValidMediaUrl(acquisition.tourUrl3D) ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => window.open(acquisition.tourUrl3D!, '_blank')}
                      >
                        🔗 Open 3D Tour
                      </Button>
                      {isNriProperty && (
                        <span className="mt-2 block text-xs text-blue-700">
                          Essential for NRI buyers
                        </span>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-red-600">Invalid URL</p>
                  )
                ) : (
                  <>
                    <p className="text-xs italic text-muted-foreground">Not uploaded</p>
                    {isNriProperty && (
                      <p className="mt-2 text-xs font-medium text-orange-700">
                        ⚠️ NRI property without virtual tour — request from seller
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <hr className="my-4 border-border" />
        <p className="mb-3 text-sm font-semibold text-muted-foreground">Uploaded Documents</p>

        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            <FileImage className="mt-0.5 size-5 text-orange-600" />
            <div>
              <p className="text-sm font-medium">Floor Plan</p>
              {acquisition.floorPlanUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={() => setShowFloorPlanPreview(true)}
                >
                  View Floor Plan
                </Button>
              ) : (
                <p className="text-xs italic text-muted-foreground">Not uploaded</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seller Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm">
            {previousListingsCount > 0 ? (
              <span className="text-foreground">
                {previousListingsCount} previous listing{previousListingsCount > 1 ? 's' : ''}{' '}
                <button type="button" className="text-primary hover:underline">
                  View History
                </button>
              </span>
            ) : (
              <span className="text-muted-foreground">0 previous listings</span>
            )}
          </div>

          {hadPreviousRejection && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              ⚠️ This seller had a previous rejection
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Review Checklist</CardTitle>
          <p className="text-sm text-muted-foreground">Check before deciding</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewChecklistItems.map((label, index) => (
            <label key={label} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checklist[index] ?? false}
                onChange={() => toggleChecklist(index)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>{label}</span>
            </label>
          ))}
          {!acquisition.floorPlanUrl && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              No floor plan — consider requesting from seller
            </p>
          )}
          <p className="text-sm font-medium text-muted-foreground">
            {checklistChecked} of {reviewChecklistItems.length} checked
          </p>
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
                placeholder="Add an internal note…"
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
                aria-label="Delete note"
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
          <h3 className="font-semibold text-foreground">Review Decision</h3>

          {!showAcceptForm ? (
            <div className="relative">
              <Button
                type="button"
                className="mb-3 w-full bg-green-600 text-white hover:bg-green-700"
                disabled={acceptDisabled}
                title={acceptDisabledReason}
                onClick={() => setShowAcceptForm(true)}
              >
                ✅ Accept — Schedule Inspection
              </Button>
              {!checklistComplete && !acceptDisabled && (
                <p className="mb-3 text-center text-xs text-orange-700">
                  Review checklist incomplete — proceed anyway?
                </p>
              )}
            </div>
          ) : (
            <div className="mb-3 space-y-3 rounded-lg border border-border p-3">
              <input
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                placeholder="Inspector name *"
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
              <textarea
                rows={2}
                value={inspectionNotes}
                onChange={(e) => setInspectionNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-green-600 text-white hover:bg-green-700"
                  disabled={!inspector.trim() || !scheduledDate}
                  onClick={confirmAccept}
                >
                  Confirm & Move to Inspection
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAcceptForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!showMoreInfoForm ? (
            <Button
              type="button"
              variant="outline"
              className="mb-3 w-full border-orange-300 text-orange-700 hover:bg-orange-50"
              onClick={() => setShowMoreInfoForm(true)}
            >
              📝 Request More Info from Seller
            </Button>
          ) : (
            <div className="mb-3 space-y-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
              <textarea
                rows={5}
                value={moreInfoMessage}
                onChange={(e) => setMoreInfoMessage(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
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
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="bg-orange-600 text-white hover:bg-orange-700"
                  onClick={() => {
                    const tel = phoneForTel(acquisition.sellerPhone)
                    if (sendWhatsApp) {
                      window.open(
                        `https://wa.me/${tel}?text=${encodeURIComponent(moreInfoMessage)}`,
                        '_blank',
                      )
                    }
                    if (sendEmail && acquisition.sellerEmail) {
                      window.open(
                        `mailto:${acquisition.sellerEmail}?subject=${encodeURIComponent('Additional information needed')}&body=${encodeURIComponent(moreInfoMessage)}`,
                        '_self',
                      )
                    }
                    setShowMoreInfoForm(false)
                  }}
                >
                  Send
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowMoreInfoForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!showRejectForm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-red-300 text-red-700 hover:bg-red-50"
              onClick={() => setShowRejectForm(true)}
            >
              ❌ Reject This Property
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

      {showLightbox && photos.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            className="absolute right-4 top-4 text-sm text-white hover:underline"
            onClick={() => setShowLightbox(false)}
          >
            × Close
          </button>
          <p className="absolute left-4 top-4 text-sm text-white/80">
            Photo {selectedPhotoIndex + 1} of {photos.length}
          </p>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={() => navigateLightbox(-1)}
                aria-label="Previous photo"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={() => navigateLightbox(1)}
                aria-label="Next photo"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}
          <img
            src={photos[selectedPhotoIndex]}
            alt=""
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute bottom-6 border-white/30 bg-transparent text-white hover:bg-white/10"
            onClick={downloadCurrentPhoto}
          >
            Download
          </Button>
        </div>
      )}

      {showFloorPlanPreview && acquisition.floorPlanUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-border bg-card p-4 shadow-lg">
            <button
              type="button"
              className="absolute right-3 top-3 rounded p-1 hover:bg-muted"
              onClick={() => setShowFloorPlanPreview(false)}
              aria-label="Close floor plan preview"
            >
              <X className="size-4" />
            </button>
            <h3 className="mb-3 pr-8 font-semibold">Floor Plan</h3>
            <img
              src={acquisition.floorPlanUrl}
              alt="Floor plan"
              className="max-h-[75vh] w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </div>
  )
}
