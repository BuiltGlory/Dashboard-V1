import { useState } from 'react'
import { AlertTriangle, Copy, ExternalLink, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  isNriBuyer,
  VIRTUAL_PLATFORM_LABELS,
  type Visit,
  type VisitStatus,
  type VirtualPlatform,
} from '@/api/adminEnquiries'
import { cn } from '@/lib/utils'
import type { bindToast } from '@/utils/adminActions'
import { copyText } from '@/utils/adminActions'

const DOC_OPTIONS = [
  'Floor Plan PDF',
  'RERA Certificate',
  'Property Photos',
  'Brochure',
  'Price Sheet',
  'Legal Documents',
] as const

const NRI_CHECKLIST_KEYS = [
  { key: 'walkthrough', label: 'Property walkthrough shown' },
  { key: 'rera', label: 'RERA documents verified' },
  { key: 'floorPlan', label: 'Floor plan explained' },
  { key: 'pricing', label: 'Pricing discussed' },
  { key: 'legal', label: 'Legal process explained' },
  { key: 'fema', label: 'FEMA compliance discussed' },
  { key: 'payment', label: 'Payment terms explained' },
  { key: 'nextSteps', label: 'Next steps agreed' },
] as const

const PLATFORM_STYLES: Record<NonNullable<VirtualPlatform>, string> = {
  zoom: 'bg-blue-100 text-blue-800',
  google_meet: 'bg-green-100 text-green-800',
  teams: 'bg-indigo-100 text-indigo-800',
  whatsapp_video: 'bg-emerald-100 text-emerald-800',
}

function truncateLink(link: string, max = 42) {
  return link.length > max ? `${link.slice(0, max)}…` : link
}

export function VirtualVisitHeaderBadges({ visit }: { visit: Visit }) {
  const platform = visit.virtualPlatform
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Badge className="bg-blue-100 text-blue-800">Virtual Visit</Badge>
      {platform && (
        <Badge className={PLATFORM_STYLES[platform]}>
          {VIRTUAL_PLATFORM_LABELS[platform]}
        </Badge>
      )}
      {isNriBuyer(visit.buyerUserType) && (
        <Badge className="bg-purple-100 text-purple-700">{visit.buyerUserType}</Badge>
      )}
    </div>
  )
}

export function VirtualMeetingCard({
  visit,
  meetingLink,
  onLinkChange,
  onSaveLink,
  isFinal,
  toastApi,
}: {
  visit: Visit
  meetingLink: string
  onLinkChange: (v: string) => void
  onSaveLink: () => void
  isFinal: boolean
  toastApi: ReturnType<typeof bindToast>
}) {
  const platform = visit.virtualPlatform
  const hasLink = !!meetingLink.trim()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtual Meeting</CardTitle>
        <p className="text-xs text-muted-foreground">📱 App screen: B-12, B-13</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Video className="size-4 text-blue-600" />
          <span className="font-medium">Platform</span>
          {platform ? (
            <Badge className={PLATFORM_STYLES[platform]}>
              {VIRTUAL_PLATFORM_LABELS[platform]}
            </Badge>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Meeting Link</p>
          {hasLink ? (
            <div className="space-y-2">
              <p className="truncate rounded-md bg-muted px-3 py-2 font-mono text-xs">
                {truncateLink(meetingLink)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(meetingLink, toastApi)}
                >
                  <Copy className="size-4" /> Copy
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => window.open(meetingLink, '_blank')}
                >
                  <ExternalLink className="size-4" /> Join Meeting
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                Meeting link required before confirming visit
              </p>
              {!isFinal && (
                <>
                  <input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => onLinkChange(e.target.value)}
                    placeholder="https://zoom.us/j/… or meet.google.com/…"
                    className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                  />
                  <Button size="sm" onClick={onSaveLink}>
                    Save Link
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function CallRecordingCard({
  visit,
  status,
  isFinal,
  onSaveCallRecord,
}: {
  visit: Visit
  status: VisitStatus
  isFinal: boolean
  onSaveCallRecord: (data: {
    callDuration: number
    virtualRecordingUrl: string | null
    callNotes: string
    documentsShared: string[]
    followUpAction: string | null
    followUpDate: string | null
  }) => void
}) {
  const [duration, setDuration] = useState(
    visit.callDuration != null ? String(visit.callDuration) : '',
  )
  const [recordingUrl, setRecordingUrl] = useState(visit.virtualRecordingUrl ?? '')
  const [notes, setNotes] = useState(visit.callNotes ?? '')
  const [docs, setDocs] = useState<string[]>(visit.documentsShared ?? [])
  const [otherDoc, setOtherDoc] = useState('')
  const [followUp, setFollowUp] = useState(visit.followUpAction ?? '')
  const [followUpDate, setFollowUpDate] = useState(visit.followUpDate ?? '')

  if (status !== 'confirmed' && status !== 'completed' && status !== 'scheduled') {
    return null
  }

  const showCompletedSummary =
    visit.status === 'completed' && visit.callNotes && visit.callDuration != null

  return (
    <Card id="call-recording-section">
      <CardHeader>
        <CardTitle>Visit Recording & Notes</CardTitle>
        <p className="text-xs text-muted-foreground">Complete after the virtual call</p>
      </CardHeader>
      <CardContent>
        {showCompletedSummary ? (
          <div className="space-y-3 text-sm">
            <p>
              <strong>Duration:</strong> {visit.callDuration} minutes
            </p>
            {visit.virtualRecordingUrl && (
              <p>
                <strong>Recording:</strong>{' '}
                <a
                  href={visit.virtualRecordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  View recording
                </a>
              </p>
            )}
            <p>
              <strong>Call Notes:</strong> {visit.callNotes}
            </p>
            {visit.documentsShared.length > 0 && (
              <div>
                <strong>Documents Shared:</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {visit.documentsShared.map((d) => (
                    <Badge key={d} variant="default" className="bg-muted text-foreground">
                      {d}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {(visit.followUpAction || visit.followUpDate) && (
              <p>
                <strong>Follow-up:</strong> {visit.followUpAction}
                {visit.followUpDate ? ` · ${visit.followUpDate}` : ''}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              Call Duration (minutes)
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={isFinal && visit.status === 'completed'}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Recording URL (optional)
              <input
                type="url"
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
                placeholder="Zoom/Meet recording link"
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Call Notes *
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was discussed, buyer interest level, concerns..."
                className="mt-1 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
            </label>
            <div>
              <p className="text-sm font-medium">Documents Shared</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DOC_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDocs((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs',
                      docs.includes(d)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border',
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={otherDoc}
                  onChange={(e) => setOtherDoc(e.target.value)}
                  placeholder="Other document"
                  className="h-8 flex-1 rounded-md border border-border bg-input px-2 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (otherDoc.trim()) {
                      setDocs((p) => [...p, otherDoc.trim()])
                      setOtherDoc('')
                    }
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
            <label className="block text-sm font-medium">
              Follow-up Action
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="e.g. Send formal quote"
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Follow-up Date
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              />
            </label>
            <Button
              className="w-full"
              disabled={!notes.trim() || !duration}
              onClick={() =>
                onSaveCallRecord({
                  callDuration: parseInt(duration, 10) || 0,
                  virtualRecordingUrl: recordingUrl.trim() || null,
                  callNotes: notes.trim(),
                  documentsShared: docs,
                  followUpAction: followUp.trim() || null,
                  followUpDate: followUpDate || null,
                })
              }
            >
              Save Call Record
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function NriAssistanceCard({
  visit,
  checklist,
  onChecklistChange,
  notes,
  onNotesChange,
  onSaveChecklist,
  onSaveNotes,
}: {
  visit: Visit
  checklist: Record<string, boolean>
  onChecklistChange: (key: string, checked: boolean) => void
  notes: string
  onNotesChange: (v: string) => void
  onSaveChecklist: () => void
  onSaveNotes: () => void
}) {
  if (!isNriBuyer(visit.buyerUserType)) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>NRI Support</CardTitle>
        <p className="text-xs text-muted-foreground">📱 App: B-07, B-08</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {NRI_CHECKLIST_KEYS.map(({ key, label }) => (
            <li key={key}>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!checklist[key]}
                  onChange={(e) => onChecklistChange(key, e.target.checked)}
                />
                {checklist[key] ? '☑' : '☐'} {label}
              </label>
            </li>
          ))}
        </ul>
        <Button variant="outline" className="w-full" onClick={onSaveChecklist}>
          Save Checklist
        </Button>
        <div>
          <p className="text-sm font-medium">
            Special requirements or concerns noted by buyer:
          </p>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <Button variant="outline" className="mt-2 w-full" onClick={onSaveNotes}>
            Save Notes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function VirtualQuickActions({
  visit: _visit,
  meetingLink,
  onScrollToRecord,
  onShareDocs,
  onSendReminder,
  reminderSent,
}: {
  visit: Visit
  meetingLink: string | null
  onScrollToRecord: () => void
  onShareDocs: () => void
  onSendReminder: () => void
  reminderSent: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {meetingLink && (
          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            onClick={() => window.open(meetingLink, '_blank')}
          >
            🎥 Join Meeting
          </Button>
        )}
        <Button variant="outline" className="w-full" onClick={onScrollToRecord}>
          📋 Record Call Notes
        </Button>
        <Button variant="outline" className="w-full" onClick={onShareDocs}>
          📤 Share Documents
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={reminderSent}
          onClick={onSendReminder}
        >
          {reminderSent ? '✓ Reminder Sent' : '🔔 Send Reminder'}
        </Button>
      </CardContent>
    </Card>
  )
}

export function ShareDocumentsModal({
  visit,
  onClose,
  onSendWhatsApp,
}: {
  visit: Visit
  onClose: () => void
  onSendWhatsApp: (docs: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([...DOC_OPTIONS.slice(0, 3)])

  return (
    <>
      <button type="button" className="fixed inset-0 z-50 bg-black/50" aria-label="Close" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl">
        <h3 className="text-lg font-semibold">Share Documents</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Select documents to share with {visit.buyerName}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {DOC_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() =>
                setSelected((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))
              }
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                selected.includes(d) ? 'border-primary bg-primary/10' : 'border-border',
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          disabled={selected.length === 0}
          onClick={() => onSendWhatsApp(selected)}
        >
          Send via WhatsApp
        </Button>
        <Button variant="outline" className="mt-2 w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </>
  )
}
