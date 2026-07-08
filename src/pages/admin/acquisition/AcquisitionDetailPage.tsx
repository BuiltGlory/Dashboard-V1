import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import {
  AlertCircle,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Phone,
  Settings,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  formatPrice,
  getStageColor,
  getStageLabel,
  type Acquisition,
  type AcquisitionPriority,
  type AcquisitionStage,
  getAdminAcquisition,
  updateAdminAcquisitionSection,
  updateAdminAcquisitionStage,
} from '@/api/adminAcquisitions'
import { readAdminSession } from '@/api/admin'
import { getAdminSalesTeam, type SalesPerson } from '@/api/adminEnquiries'
import { SentMessagesCard } from '@/components/admin/SentMessagesCard'
import { cn } from '@/lib/utils'
import {
  claimConcurrentEditing,
  getConcurrentEditingWarning,
  releaseConcurrentEditing,
} from '@/utils/edgeCases'
import {
  DEFAULT_SENT_BY,
  formatMessageTimeAgo,
  loadMessages,
  logMessage,
  messageToActivityText,
  openEmail,
  openWhatsApp,
  type SentMessage,
} from '@/utils/messageLog'
import { handleCall, resolveAcquisitionPropertyPath } from '@/utils/adminActions'
import { PendingReviewStage } from './stages/PendingReviewStage'
import { SiteInspectionStage } from './stages/SiteInspectionStage'
import { ValuationStage } from './stages/ValuationStage'
import { NegotiationStage } from './stages/NegotiationStage'
import { TokenToSellerStage } from './stages/TokenToSellerStage'
import { DocumentationStage } from './stages/DocumentationStage'
import { SellerPayoutStage } from './stages/SellerPayoutStage'
import { AcquiredStage } from './stages/AcquiredStage'
import { RejectedStage } from './stages/RejectedStage'
import { OnHoldStage } from './stages/OnHoldStage'

const PIPELINE_STAGES: AcquisitionStage[] = [
  'pending_review',
  'site_inspection',
  'valuation',
  'negotiation',
  'token_to_seller',
  'documentation',
  'seller_payout',
  'acquired',
]

const STAGE_ROUTE_MAP: Record<AcquisitionStage, string> = {
  pending_review: '/admin/acquisition/pending',
  site_inspection: '/admin/acquisition/inspection',
  valuation: '/admin/acquisition/valuation',
  negotiation: '/admin/acquisition/negotiation',
  token_to_seller: '/admin/acquisition/token',
  documentation: '/admin/acquisition/documentation',
  seller_payout: '/admin/acquisition/payout',
  acquired: '/admin/acquisition/acquired',
  rejected: '/admin/acquisition/rejected',
  on_hold: '/admin/acquisition/on-hold',
}

const REJECT_REASONS = [
  'Price too high',
  'Poor condition',
  'Location not suitable',
  'Incomplete info',
  'Duplicate',
  'Other',
]

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatCreatedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function PriorityBadge({ priority }: { priority: AcquisitionPriority }) {
  if (priority === 'urgent') return <Badge variant="red">Urgent</Badge>
  if (priority === 'high') return <Badge variant="orange">High</Badge>
  return null
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse space-y-6 px-4 py-6">
      <div className="h-4 w-72 rounded bg-muted" />
      <div className="h-8 w-96 rounded bg-muted" />
      <div className="h-4 w-64 rounded bg-muted" />
      <div className="h-10 w-full max-w-lg rounded bg-muted" />
      <div className="h-24 rounded-xl bg-muted" />
      <div className="flex gap-6">
        <div className="h-64 flex-1 rounded-xl bg-muted" />
        <div className="h-96 w-[320px] rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function StageProgressBar({ stage }: { stage: AcquisitionStage }) {
  if (stage === 'rejected') {
    return (
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <Badge variant="red" className="text-sm">
          Rejected
        </Badge>
      </div>
    )
  }

  const currentIndex = PIPELINE_STAGES.indexOf(stage)

  return (
    <div className="mt-4 space-y-3">
      {stage === 'on_hold' && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800">
          On Hold
        </div>
      )}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between">
          {PIPELINE_STAGES.map((step, index) => {
            const isCompleted = currentIndex >= 0 && index < currentIndex
            const isCurrent = index === currentIndex
            const isUpcoming = currentIndex < 0 || index > currentIndex
            const isLast = index === PIPELINE_STAGES.length - 1

            return (
              <div key={step} className={cn('flex flex-1 items-start', !isLast && 'min-w-0')}>
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full border-2',
                      isCompleted && 'border-primary bg-primary text-primary-foreground',
                      isCurrent && 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/30',
                      isUpcoming && 'border-border bg-muted',
                    )}
                  >
                    {(isCompleted || isCurrent) && <Check className="size-3.5" strokeWidth={3} />}
                  </div>
                  <span
                    className={cn(
                      'mt-1.5 max-w-[72px] text-center text-[10px] leading-tight sm:max-w-none sm:text-xs',
                      isCurrent && 'font-medium text-primary',
                      (isCompleted || isUpcoming) && 'text-muted-foreground',
                    )}
                  >
                    {getStageLabel(step)}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      'mx-1 mt-3 h-0.5 flex-1 min-w-[8px]',
                      isCompleted ? 'bg-primary' : 'bg-muted',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AcquisitionRightColumn({
  acquisition,
  onUpdate,
  toast,
  onToast,
  messageRefresh,
}: {
  acquisition: Acquisition
  onUpdate: (patch: Partial<Acquisition>) => void | Promise<void>
  toast: string | null
  onToast: (msg: string | null) => void
  messageRefresh: number
}) {
  const navigate = useNavigate()
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])

  useEffect(() => {
    void loadMessages('acquisition', acquisition.id).then(setSentMessages)
  }, [acquisition.id, messageRefresh])
  const [showHoldForm, setShowHoldForm] = useState(false)
  const [holdReason, setHoldReason] = useState(acquisition.onHoldReason ?? '')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectNotes, setRejectNotes] = useState('')

  const hideActions = acquisition.stage === 'acquired' || acquisition.stage === 'rejected'

  const copyPhone = () => {
    void navigator.clipboard.writeText(acquisition.sellerPhone)
    onToast('Copied!')
  }

  return (
    <div className="w-[320px] shrink-0 space-y-4">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Seller</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
              {getInitials(acquisition.sellerName)}
            </span>
            <div>
              <p className="font-semibold">{acquisition.sellerName}</p>
              <Badge variant="default" className="mt-0.5 bg-muted text-muted-foreground">
                Property Owner
              </Badge>
            </div>
          </div>
          <button
            type="button"
            onClick={copyPhone}
            className="flex w-full items-center gap-2 text-left text-sm hover:text-primary"
          >
            <Phone className="size-3.5 shrink-0 text-muted-foreground" />
            {acquisition.sellerPhone}
          </button>
          {acquisition.sellerEmail ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-3.5 shrink-0" />
              {acquisition.sellerEmail}
            </p>
          ) : (
            <p className="text-sm italic text-muted-foreground">Not provided</p>
          )}
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => navigate(`/admin/users/${acquisition.sellerUserId}`)}
          >
            View Seller Profile →
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Property</CardTitle>
        </CardHeader>
        <CardContent>
          {acquisition.photos[0] ? (
            <img
              src={acquisition.photos[0]}
              alt=""
              className="h-32 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-32 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-8 text-muted-foreground" />
            </div>
          )}
          <p className="mt-2 text-sm font-medium">{acquisition.propertyTitle}</p>
          <p className="font-bold text-primary">{formatPrice(acquisition.askingPrice)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="default" className="capitalize">
              {acquisition.propertyType}
            </Badge>
            <span className="text-xs text-muted-foreground">{acquisition.propertyLocation}</span>
          </div>
          {acquisition.agreedPrice != null && (
            <p className="mt-1 text-sm font-medium text-green-700">
              Agreed: {formatPrice(acquisition.agreedPrice)}
            </p>
          )}
          <button
            type="button"
            className="mt-3 text-sm font-medium text-primary hover:underline"
            onClick={() =>
              navigate(resolveAcquisitionPropertyPath(acquisition))
            }
          >
            View Property →
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground">Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hideActions && !showHoldForm && !showRejectForm && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => setShowHoldForm(true)}
              >
                ⏸️ Put On Hold
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="w-full justify-start border border-destructive bg-transparent text-destructive hover:bg-destructive/10"
                onClick={() => setShowRejectForm(true)}
              >
                ❌ Reject
              </Button>
            </>
          )}

          {showHoldForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <label className="text-xs font-medium text-muted-foreground">Reason (required)</label>
              <textarea
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                placeholder="Why is this on hold?"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!holdReason.trim()}
                  onClick={() => {
                    void onUpdate({ onHoldReason: holdReason.trim(), stage: 'on_hold' })
                    setShowHoldForm(false)
                  }}
                >
                  Save
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowHoldForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {showRejectForm && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
              >
                <option value="">Select reason</option>
                {REJECT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                placeholder="Additional notes"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={!rejectReason}
                  onClick={() => {
                    void onUpdate({
                      stage: 'rejected',
                      rejectionReason: `${rejectReason}${rejectNotes ? `: ${rejectNotes}` : ''}`,
                    })
                    setShowRejectForm(false)
                  }}
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

      <SentMessagesCard messages={sentMessages} />

      {sentMessages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 border-l-2 border-border pl-4">
              {sentMessages.map((m) => (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                  <p className="text-sm">{messageToActivityText(m)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMessageTimeAgo(m.sentAt)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export function AcquisitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [acquisition, setAcquisition] = useState<Acquisition | null>(null)
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [stageBanner, setStageBanner] = useState<AcquisitionStage | null>(null)
  const [showStageWhatsApp, setShowStageWhatsApp] = useState(false)
  const [stageWhatsAppBody, setStageWhatsAppBody] = useState('')
  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [whatsappBody, setWhatsappBody] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [messageRefresh, setMessageRefresh] = useState(0)
  const [editingWarning, setEditingWarning] = useState<string | null>(null)
  const [editingDismissed, setEditingDismissed] = useState(false)

  const logAcquisitionMessage = useCallback(
    (msg: Omit<SentMessage, 'id' | 'sentAt' | 'relatedTo' | 'sentBy'>) => {
      if (!acquisition) return
      logMessage({
        ...msg,
        sentBy: DEFAULT_SENT_BY,
        relatedTo: {
          type: 'acquisition',
          id: acquisition.id,
          title: acquisition.propertyTitle,
        },
      })
      setMessageRefresh((n) => n + 1)
    },
    [acquisition],
  )

  useEffect(() => {
    if (!id || loading) return
    setEditingWarning(getConcurrentEditingWarning('acquisition', id))
    setEditingDismissed(false)
    claimConcurrentEditing('acquisition', id)
    return () => releaseConcurrentEditing('acquisition', id)
  }, [id, loading])

  const loadAcquisition = useCallback(async () => {
    const session = readAdminSession()
    if (!id || !session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setAcquisition(null)
      setNotFound(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setNotFound(false)
    setLoadError(null)
    try {
      const [found, team] = await Promise.all([
        getAdminAcquisition(session.accessToken, id),
        getAdminSalesTeam(session.accessToken),
      ])
      setAcquisition(found)
      setSalesTeam(team)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load acquisition.'
      setLoadError(message)
      setSalesTeam([])
      if (message.toLowerCase().includes('not found')) {
        setNotFound(true)
      }
      setAcquisition(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAcquisition()
    }, 0)
    return () => clearTimeout(t)
  }, [loadAcquisition])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!stageBanner) return
    const t = setTimeout(() => setStageBanner(null), 10000)
    return () => clearTimeout(t)
  }, [stageBanner])

  const updateAcquisition = useCallback(async (patch: Partial<Acquisition>) => {
    const session = readAdminSession()
    if (!acquisition || !session?.accessToken) {
      setToast('Your admin session has expired. Please log in again.')
      return
    }

    const previous = acquisition
    const nextStage = patch.stage
    const { assignedTo, assignedToId, ...restPatch } = patch
    const backendPatch: Record<string, unknown> = { ...restPatch }
    if (assignedToId) backendPatch.assignedTo = assignedToId
    if (!assignedToId && assignedTo && assignedTo !== previous.assignedTo) {
      backendPatch.assignedTo = assignedTo
    }
    setSaving(true)
    try {
      const updated =
        nextStage && nextStage !== previous.stage
          ? await updateAdminAcquisitionStage(session.accessToken, previous.id, nextStage, backendPatch)
          : await updateAdminAcquisitionSection(session.accessToken, previous.id, 'valuation', backendPatch, false)

      setAcquisition(updated)
      if (nextStage && nextStage !== previous.stage) {
        setStageBanner(nextStage)
        setStageWhatsAppBody(
          `Hi ${previous.sellerName}, your property ${previous.propertyTitle} has moved to ${getStageLabel(nextStage)} stage. Our team will contact you shortly. - Builtglory Team`,
        )
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to update acquisition.')
    } finally {
      setSaving(false)
    }
  }, [acquisition])

  const openStageWhatsApp = useCallback(() => {
    if (!acquisition) return
    logAcquisitionMessage({
      channel: 'whatsapp',
      to: acquisition.sellerPhone,
      toName: acquisition.sellerName,
      message: stageWhatsAppBody,
    })
    openWhatsApp(acquisition.sellerPhone, stageWhatsAppBody)
    setShowStageWhatsApp(false)
    setStageBanner(null)
  }, [acquisition, stageWhatsAppBody, logAcquisitionMessage])

  const stageRoute = useMemo(
    () => (acquisition ? STAGE_ROUTE_MAP[acquisition.stage] : '/admin/acquisition/all'),
    [acquisition],
  )

  if (loading) {
    return <DetailSkeleton />
  }

  if (notFound || !acquisition) {
    return (
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-center gap-4 px-4 py-24">
        <AlertCircle className="size-16 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">
          {loadError ? 'Unable to load acquisition' : 'Acquisition not found'}
        </p>
        {loadError && <p className="max-w-md text-center text-sm text-muted-foreground">{loadError}</p>}
        <div className="flex gap-2">
          {loadError && (
            <Button type="button" variant="outline" onClick={() => void loadAcquisition()}>
              Retry
            </Button>
          )}
          <Button type="button" onClick={() => navigate('/admin/acquisition/all')}>
            Back to Pipeline
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6">
      {editingWarning && !editingDismissed && (
        <div className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
          <p className="text-sm text-amber-900">
            ⚠️ {editingWarning}
            <span className="mt-0.5 block text-xs">Another admin may be viewing this record</span>
          </p>
          <button type="button" onClick={() => setEditingDismissed(true)} aria-label="Dismiss">
            <X className="size-4 text-amber-800" />
          </button>
        </div>
      )}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center text-muted-foreground hover:text-foreground"
          aria-label="Back"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/admin/acquisition/all')}
          className="text-muted-foreground hover:text-foreground"
        >
          Acquisition Pipeline
        </button>
        <ChevronRight className="size-4 text-muted-foreground" />
        <button
          type="button"
          onClick={() => navigate(stageRoute)}
          className="text-muted-foreground hover:text-foreground"
        >
          {getStageLabel(acquisition.stage)}
        </button>
        <ChevronRight className="size-4 text-muted-foreground" />
        <span className="max-w-[200px] truncate font-medium text-foreground sm:max-w-md">
          {acquisition.propertyTitle}
        </span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{acquisition.propertyTitle}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm">
            <span className={cn('size-2.5 rounded-full', getStageColor(acquisition.stage))} />
            {getStageLabel(acquisition.stage)}
          </span>
          <PriorityBadge priority={acquisition.priority} />
          {saving && (
            <Badge variant="default" className="bg-muted text-muted-foreground">
              Saving...
            </Badge>
          )}
        </div>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <span>{acquisition.referenceId}</span>
        <span>•</span>
        <span>Created: {formatCreatedDate(acquisition.createdAt)}</span>
        <span>•</span>
        <span>{acquisition.daysInStage} days in current stage</span>
        {acquisition.createdFrom === 'manual' && (
          <>
            <span>•</span>
            <Badge variant="default" className="bg-muted text-muted-foreground">
              Manually created
            </Badge>
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handleCall(acquisition.sellerPhone)}
        >
          <Phone className="size-4" /> Call Seller
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-green-600 hover:text-green-700"
          onClick={() => {
            setWhatsappBody(
              `Hi ${acquisition.sellerName}, regarding ${acquisition.propertyTitle} on BuiltGlory.`,
            )
            setWhatsappOpen(true)
          }}
        >
          <MessageCircle className="size-4" /> WhatsApp
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!acquisition.sellerEmail}
          onClick={() => {
            setEmailSubject(`BuiltGlory — ${acquisition.propertyTitle}`)
            setEmailBody(
              `Hi ${acquisition.sellerName},\n\nRegarding your property ${acquisition.propertyTitle}.`,
            )
            setEmailOpen(true)
          }}
        >
          <Mail className="size-4" /> Email
        </Button>

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAssignOpen((v) => !v)
              setPriorityOpen(false)
            }}
          >
            👤 Assign To
          </Button>
          {assignOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[160px] rounded-md border border-border bg-card py-1 shadow-md">
              {salesTeam.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted-foreground">No active sales admins</p>
              )}
              {salesTeam.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    void updateAcquisition({ assignedTo: person.name, assignedToId: person.id })
                    setAssignOpen(false)
                  }}
                >
                  {person.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPriorityOpen((v) => !v)
              setAssignOpen(false)
            }}
          >
            ⚑ Priority
          </Button>
          {priorityOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[120px] rounded-md border border-border bg-card py-1 shadow-md">
              {(['urgent', 'high', 'normal'] as AcquisitionPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm capitalize hover:bg-muted"
                  onClick={() => {
                    void updateAcquisition({ priority: p })
                    setPriorityOpen(false)
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <StageProgressBar stage={acquisition.stage} />

      {stageBanner && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <p>
            Stage updated to <strong>{getStageLabel(stageBanner)}</strong>
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowStageWhatsApp(true)}
          >
            Send WhatsApp to Seller
          </Button>
        </div>
      )}

      {showStageWhatsApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <h4 className="font-semibold">Message to seller</h4>
            <textarea
              rows={5}
              value={stageWhatsAppBody}
              onChange={(e) => setStageWhatsAppBody(e.target.value)}
              className="mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button type="button" size="sm" onClick={openStageWhatsApp}>
                Send
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowStageWhatsApp(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col items-start gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          {acquisition.stage === 'pending_review' ? (
            <PendingReviewStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'site_inspection' ? (
            <SiteInspectionStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'valuation' ? (
            <ValuationStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'negotiation' ? (
            <NegotiationStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'token_to_seller' ? (
            <TokenToSellerStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'documentation' ? (
            <DocumentationStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'seller_payout' ? (
            <SellerPayoutStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'acquired' ? (
            <AcquiredStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'rejected' ? (
            <RejectedStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : acquisition.stage === 'on_hold' ? (
            <OnHoldStage
              acquisition={acquisition}
              onStageChange={(newStage, patch) => void updateAcquisition({ ...patch, stage: newStage })}
            />
          ) : (
            <div className="rounded-xl bg-muted/50 p-8 text-center">
              <Settings className="mx-auto size-12 text-muted-foreground" />
              <p className="mt-3 font-medium text-foreground">Stage details coming soon</p>
              <p className="mt-1 text-sm text-muted-foreground">{getStageLabel(acquisition.stage)}</p>
            </div>
          )}
        </div>
        <AcquisitionRightColumn
          acquisition={acquisition}
          onUpdate={updateAcquisition}
          toast={toast}
          onToast={setToast}
          messageRefresh={messageRefresh}
        />
      </div>

      {whatsappOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setWhatsappOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Send WhatsApp</h3>
            <textarea
              value={whatsappBody}
              onChange={(e) => setWhatsappBody(e.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setWhatsappOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!whatsappBody.trim()}
                onClick={() => {
                  logAcquisitionMessage({
                    channel: 'whatsapp',
                    to: acquisition.sellerPhone,
                    toName: acquisition.sellerName,
                    message: whatsappBody.trim(),
                  })
                  openWhatsApp(acquisition.sellerPhone, whatsappBody.trim())
                  setWhatsappOpen(false)
                  setToast('WhatsApp message sent')
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}

      {emailOpen && acquisition.sellerEmail && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setEmailOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Send Email</h3>
            <input
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
              className="mt-3 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
            />
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              placeholder="Body"
              className="mt-2 min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEmailOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  logAcquisitionMessage({
                    channel: 'email',
                    to: acquisition.sellerEmail!,
                    toName: acquisition.sellerName,
                    subject: emailSubject,
                    message: emailBody,
                  })
                  openEmail(acquisition.sellerEmail!, emailSubject, emailBody)
                  setEmailOpen(false)
                  setToast('Email sent')
                }}
              >
                Send
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
