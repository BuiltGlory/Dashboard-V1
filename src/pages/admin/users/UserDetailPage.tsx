import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ChevronLeft,
  Clock,
  FileText,
  Minus,
  MoreVertical,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { readAdminSession } from '@/api/admin'
import {
  exportAdminUserData,
  getAdminUser,
  getKycStatusColor,
  getKycStatusLabel,
  getRoleLabel,
  getUserTypeBadgeColor,
  updateAdminUserBlock,
  updateAdminUserFema,
  updateAdminUserKyc,
  updateAdminUserProfile,
  type KycDocument,
  type KycDocumentStatus,
  type FemaCompliance,
  type FemaComplianceStatus,
  type User as AppUser,
  type UserRole,
  type UserType,
} from '@/api/adminUsers'
import {
  getAdminSalesTeam,
  listAdminBuyEnquiries,
  listAdminSellRequests,
  listAdminVisits,
  parseSellAskingPrice,
  type BuyEnquiry,
  type SellRequest,
  type SalesPerson,
  type Visit,
} from '@/api/adminEnquiries'
import {
  formatPrice,
  getSalesStageLabel,
  listAdminSalesDeals,
  type SalesDeal,
} from '@/api/adminSales'
import { createWorkflowLog, deleteWorkflowLog, listWorkflowLogs, type WorkflowLog } from '@/api/adminWorkflow'
import { SentMessagesCard } from '@/components/admin/SentMessagesCard'
import NotificationPreview from '@/components/NotificationPreview'
import { bindToast, copyText, handleCall } from '@/utils/adminActions'
import { cn } from '@/lib/utils'
import {
  claimConcurrentEditing,
  getConcurrentEditingWarning,
  releaseConcurrentEditing,
} from '@/utils/edgeCases'
import {
  DEFAULT_SENT_BY,
  loadMessages,
  logMessage,
  messageToActivityText,
  openEmail,
  openWhatsApp,
  type SentMessage,
} from '@/utils/messageLog'
import { NOTIFICATION_TEMPLATES, sendPushNotification } from '@/utils/notifications'

/** Extends backend KYC documents with an optional preview URL for the admin viewer. */
type KycDocumentWithPreview = KycDocument & {
  previewUrl?: string | null
}

type DetailUser = Omit<AppUser, 'kycDocuments'> & {
  kycDocuments: KycDocumentWithPreview[]
}

interface AdminNote {
  id: string
  text: string
  adminName: string
  at: string
}

interface HistoryEnquiry {
  id: string
  propertyName: string
  type: string
  date: string
  status: string
}

interface HistoryVisit {
  id: string
  propertyName: string
  date: string
  time: string
  visitType: 'Physical' | 'Virtual'
  status: string
  platform?: string
  duration?: number
}

interface HistoryDeal {
  id: string
  propertyName: string
  price: number
  stage: string
  startedAt: string
}

interface HistoryListing {
  id: string
  title: string
  type: string
  price: number
  status: 'Pending' | 'Approved' | 'Rejected' | 'Paused' | 'Sold'
  submittedAt: string
}

function workflowLogToAdminNote(log: WorkflowLog): AdminNote {
  return {
    id: log.id,
    text: log.body || log.summary,
    adminName: log.actorName,
    at: log.occurredAt,
  }
}

const USER_TYPE_LABELS: Record<UserType, string> = {
  resident: 'Resident',
  nri: 'NRI',
  pio: 'PIO',
}

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  buyer: 'bg-green-100 text-green-700',
  seller: 'bg-yellow-100 text-yellow-800',
  both: 'bg-blue-100 text-blue-700',
}

const COUNTRY_FLAGS: Record<string, string> = {
  India: '🇮🇳',
  UAE: '🇦🇪',
  UK: '🇬🇧',
  Singapore: '🇸🇬',
}

const REJECT_REASONS = [
  'Document not clear',
  'Document expired',
  'Name mismatch with profile',
  'Wrong document type uploaded',
  'Document partially visible',
  'Other (specify below)',
]

const BLOCK_REASONS = [
  'Spam activity',
  'Fake enquiries',
  'Abusive behavior',
  'Fraud suspected',
  'Other',
]

const KYC_REMINDER_TEMPLATE = (name: string) =>
  `Hi ${name}, please complete your KYC verification on the Builtglory app to unlock all features.`

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

type ProfileEditForm = {
  name: string
  email: string
  city: string
  state: string
  country: string
  userType: UserType
  assignedTo: string
}

const USER_TYPE_OPTIONS: UserType[] = ['resident', 'nri', 'pio']

function FemaComplianceCard({
  user,
  onUpdate,
  toastApi,
}: {
  user: DetailUser
  onUpdate: (fema: FemaCompliance) => void | Promise<void>
  toastApi: ReturnType<typeof bindToast>
}) {
  const fema: FemaCompliance = user.femaCompliance ?? {
    status: 'not_checked',
    checkedBy: null,
    checkedAt: null,
    notes: null,
  }
  const [notes, setNotes] = useState(fema.notes ?? '')

  const patch = (status: FemaComplianceStatus, checkedBy: string | null = 'Priya Admin') => {
    onUpdate({
      status,
      checkedBy: status === 'not_checked' ? null : checkedBy,
      checkedAt: status === 'not_checked' ? null : new Date().toISOString(),
      notes: notes.trim() || null,
    })
    toastApi.success('FEMA status updated')
  }

  const statusBadge = () => {
    switch (fema.status) {
      case 'compliant':
        return <Badge className="bg-green-100 text-green-800">✅ FEMA Compliant</Badge>
      case 'non_compliant':
        return <Badge variant="red">❌ Non-Compliant</Badge>
      case 'under_review':
        return <Badge className="bg-orange-100 text-orange-800">⏳ Under Review</Badge>
      default:
        return <Badge className="bg-muted text-muted-foreground">Not Checked</Badge>
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">FEMA Compliance</CardTitle>
        <p className="text-xs text-muted-foreground">
          Required for NRI/PIO property purchases
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>{statusBadge()}</div>
        {fema.status === 'compliant' && fema.checkedBy && (
          <p className="text-sm text-muted-foreground">
            Checked by {fema.checkedBy}
            {fema.checkedAt ? ` · ${formatFullDate(fema.checkedAt)}` : ''}
          </p>
        )}
        {fema.status === 'non_compliant' && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Cannot purchase until resolved
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {fema.status === 'not_checked' && (
            <>
              <Button size="sm" onClick={() => patch('compliant')}>
                ✅ Mark Compliant
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch('non_compliant')}>
                ❌ Mark Non-Compliant
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch('under_review', null)}>
                ⏳ Under Review
              </Button>
            </>
          )}
          {fema.status === 'under_review' && (
            <>
              <Button size="sm" onClick={() => patch('compliant')}>
                Mark Compliant
              </Button>
              <Button size="sm" variant="outline" onClick={() => patch('non_compliant')}>
                Mark Non-Compliant
              </Button>
            </>
          )}
          {fema.status === 'compliant' && (
            <Button size="sm" variant="outline" onClick={() => patch('under_review', null)}>
              Update
            </Button>
          )}
          {fema.status === 'non_compliant' && (
            <Button size="sm" onClick={() => patch('compliant')}>
              Mark Resolved
            </Button>
          )}
        </div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="FEMA notes…"
          className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
        />
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            onUpdate({ ...fema, notes: notes.trim() || null })
            toastApi.success('Notes saved')
          }}
        >
          Save Notes
        </Button>
      </CardContent>
    </Card>
  )
}

function ProfilePhotoSection({ user }: { user: DetailUser }) {
  return (
    <div className="flex flex-col items-center border-b border-border pb-4">
      {user.profilePhoto ? (
        <img
          src={user.profilePhoto}
          alt={user.name}
          className="size-20 rounded-full object-cover"
        />
      ) : (
        <>
          <div
            className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xl font-bold text-white"
            aria-hidden
          >
            {getInitials(user.name)}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">No profile photo</p>
          <p className="text-xs italic text-muted-foreground">
            Photos uploaded via app P-07
          </p>
        </>
      )}
    </div>
  )
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function roleTabPath(role: UserRole) {
  if (role === 'buyer') return '/admin/users/buyers'
  if (role === 'seller') return '/admin/users/sellers'
  return '/admin/users/all'
}

function cloneUser(u: AppUser): DetailUser {
  const raw = JSON.parse(JSON.stringify(u)) as AppUser
  return {
    ...raw,
    kycDocuments: raw.kycDocuments.map((doc) => enrichDocumentPreview(doc)),
  }
}

function enrichDocumentPreview(doc: KycDocument): KycDocumentWithPreview {
  return {
    ...doc,
    previewUrl: doc.fileUrl ?? (doc as KycDocumentWithPreview).previewUrl ?? null,
  }
}

function mapHistoryEnquiry(enquiry: BuyEnquiry): HistoryEnquiry {
  return {
    id: enquiry.id,
    propertyName: enquiry.propertyTitle,
    type: enquiry.propertyType,
    date: enquiry.submittedAt,
    status: enquiry.status,
  }
}

function mapHistoryVisit(visit: Visit): HistoryVisit {
  return {
    id: visit.id,
    propertyName: visit.propertyTitle,
    date: visit.visitDate,
    time: visit.visitTime,
    visitType: visit.visitType === 'virtual' ? 'Virtual' : 'Physical',
    status: visit.status,
    platform: visit.virtualPlatform ?? undefined,
    duration: visit.callDuration ?? undefined,
  }
}

function mapHistoryDeal(deal: SalesDeal): HistoryDeal {
  return {
    id: deal.id,
    propertyName: deal.propertyTitle,
    price: deal.agreedPrice ?? deal.offeredPrice ?? deal.propertyPrice,
    stage: getSalesStageLabel(deal.stage),
    startedAt: deal.createdAt,
  }
}

function mapHistoryListing(request: SellRequest): HistoryListing {
  return {
    id: request.id,
    title: request.propertyTitle,
    type: request.propertyType,
    price: parseSellAskingPrice(request.askingPrice),
    status:
      request.status === 'rejected'
        ? 'Rejected'
        : request.status === 'approved'
          ? 'Approved'
          : request.status === 'draft'
            ? 'Pending'
            : 'Pending',
    submittedAt: request.submittedAt,
  }
}

function buildTimeline(user: DetailUser, enquiries: HistoryEnquiry[], visits: HistoryVisit[]) {
  const items: { id: string; at: string; text: string }[] = [
    {
      id: 'reg',
      at: user.registeredAt,
      text: 'Account created — registered on app',
    },
  ]
  if (user.kycSubmittedAt) {
    items.push({
      id: 'kyc-sub',
      at: user.kycSubmittedAt,
      text: 'Submitted KYC documents',
    })
  }
  if (user.kycVerifiedAt) {
    items.push({
      id: 'kyc-ver',
      at: user.kycVerifiedAt,
      text: 'KYC verified by admin',
    })
  }
  enquiries.forEach((e) => {
    items.push({
      id: `enq-${e.id}`,
      at: e.date,
      text: `Enquiry submitted for ${e.propertyName}`,
    })
  })
  visits.forEach((v) => {
    items.push({
      id: `vis-${v.id}`,
      at: `${v.date}T10:00:00.000Z`,
      text: `Visit scheduled — ${v.propertyName}`,
    })
  })
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6">
      <div className="h-4 w-72 animate-pulse rounded bg-muted" />
      <div className="flex gap-4">
        <div className="size-14 animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-96 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    </div>
  )
}

function kycStatusLabel(status: KycDocumentStatus): string {
  if (status === 'verified') return 'Uploaded & Verified ✅'
  if (status === 'uploaded') return 'Uploaded, Pending Verify'
  if (status === 'rejected') return 'Rejected'
  if (status === 'expired') return 'Expired'
  return 'Missing'
}

function DocumentPreviewModal({
  doc,
  onClose,
  onToast,
  onVerify,
}: {
  doc: KycDocumentWithPreview
  onClose: () => void
  onToast: (msg: string) => void
  onVerify?: () => void
}) {
  const hasUrl = Boolean(doc.previewUrl)
  const uploadedLabel = doc.uploadedAt
    ? new Date(doc.uploadedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
    : new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="mx-auto mt-20 max-w-[600px] rounded-xl bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mb-4">
          <div className="pr-10">
            <p className="text-lg font-semibold text-foreground">{doc.name}</p>
            <div className="mt-1">
              <DocStatusBadge status={doc.status} />
            </div>
          </div>
          <button
            type="button"
            className="absolute right-0 top-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close preview"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-6">
          {hasUrl ? (
            <img
              src={doc.previewUrl!}
              alt={doc.name}
              className="max-h-[400px] w-full rounded-lg object-contain bg-muted"
            />
          ) : (
            <>
              <div className="flex flex-col items-center justify-center rounded-lg bg-muted py-12">
                <FileText className="size-16 text-muted-foreground" strokeWidth={1.25} />
                <p className="mt-3 font-medium text-foreground">Document Preview</p>
              </div>
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                📄 In production, the actual document uploaded by the buyer/seller appears here.
                Files are stored in cloud storage (S3/Cloudinary) and displayed via secure URL.
              </div>
              <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                <p>Document: {doc.name}</p>
                <p>Status: {kycStatusLabel(doc.status)}</p>
                <p>Uploaded: {uploadedLabel}</p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (doc.previewUrl) {
                window.open(doc.previewUrl, '_blank', 'noopener,noreferrer')
              } else {
                onToast('Download available when backend is connected')
              }
            }}
          >
            📥 Download
          </Button>
          {doc.status === 'verified' ? (
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
              ✅ Verified
            </span>
          ) : doc.status === 'uploaded' && onVerify ? (
            <Button type="button" variant="outline" onClick={onVerify}>
              Verify
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function DocStatusBadge({ status }: { status: KycDocumentStatus }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
        <ShieldCheck className="size-3" /> Verified ✅
      </span>
    )
  }
  if (status === 'uploaded') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
        <Clock className="size-3" /> Pending ⏳
      </span>
    )
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        <XCircle className="size-3" /> Rejected ❌
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        Expired
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Minus className="size-3" /> Missing —
    </span>
  )
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<DetailUser | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionSaving, setActionSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastApi = useMemo(() => bindToast(setToast), [])
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [assignDraft, setAssignDraft] = useState('')
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
  const [enquiries, setEnquiries] = useState<HistoryEnquiry[]>([])
  const [visits, setVisits] = useState<HistoryVisit[]>([])
  const [deals, setDeals] = useState<HistoryDeal[]>([])
  const [listings, setListings] = useState<HistoryListing[]>([])
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const [whatsappOpen, setWhatsappOpen] = useState(false)
  const [whatsappBody, setWhatsappBody] = useState('')
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([])
  const [pushOpen, setPushOpen] = useState(false)
  const [pushTitle, setPushTitle] = useState('')
  const [pushMessage, setPushMessage] = useState('')

  const [rejectDocIndex, setRejectDocIndex] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0])
  const [rejectNotes, setRejectNotes] = useState('')
  const [kycPushBanner, setKycPushBanner] = useState<string | null>(null)
  const [verifyPreviewDocIndex, setVerifyPreviewDocIndex] = useState<number | null>(null)

  const [blockOpen, setBlockOpen] = useState(false)
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS[0])
  const [blockNotes, setBlockNotes] = useState('')
  const [blockDealsConfirm, setBlockDealsConfirm] = useState<DetailUser | null>(null)
  const [previewDoc, setPreviewDoc] = useState<KycDocumentWithPreview | null>(null)
  const [profileEditOpen, setProfileEditOpen] = useState(false)
  const [editingWarning, setEditingWarning] = useState<string | null>(null)
  const [editingDismissed, setEditingDismissed] = useState(false)
  const [profileForm, setProfileForm] = useState<ProfileEditForm>({
    name: '',
    email: '',
    city: '',
    state: '',
    country: '',
    userType: 'resident',
    assignedTo: '',
  })

  useEffect(() => {
    if (!id || loading) return
    setEditingWarning(getConcurrentEditingWarning('user', id))
    setEditingDismissed(false)
    claimConcurrentEditing('user', id)
    return () => releaseConcurrentEditing('user', id)
  }, [id, loading])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  const showToast = useCallback((msg: string) => setToast(msg), [])

  const loadUser = useCallback(async () => {
    if (!id) {
      setUser(null)
      setLoading(false)
      return
    }

    const session = readAdminSession()
    if (!session?.accessToken) {
      setUser(null)
      setLoadError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const [loadedUser, team, noteResult] = await Promise.all([
        getAdminUser(session.accessToken, id),
        getAdminSalesTeam(session.accessToken).catch(() => []),
        listWorkflowLogs(session.accessToken, 'user', id, 'note').catch(() => ({ data: [] as WorkflowLog[] })),
      ])
      const detailUser = cloneUser(loadedUser)
      setUser(detailUser)
      setNotes(noteResult.data.map(workflowLogToAdminNote))
      setAssignDraft(detailUser.assignedTo ?? '')
      setWhatsappBody(KYC_REMINDER_TEMPLATE(detailUser.name))
      setSalesTeam(team)

      const [enquiryResult, visitResult, sellResult, salesResult] = await Promise.all([
        listAdminBuyEnquiries(session.accessToken, { buyerId: detailUser.id, limit: 5 }),
        listAdminVisits(session.accessToken, { buyerId: detailUser.id, limit: 5 }),
        listAdminSellRequests(session.accessToken, { sellerId: detailUser.id, limit: 5 }),
        listAdminSalesDeals(session.accessToken, { limit: 100 }),
      ])

      setEnquiries(enquiryResult.data.map(mapHistoryEnquiry))
      setVisits(visitResult.data.map(mapHistoryVisit))
      setListings(sellResult.data.map(mapHistoryListing))
      setDeals(
        salesResult.data
          .filter((deal) => deal.buyerUserId === detailUser.id)
          .slice(0, 5)
          .map(mapHistoryDeal),
      )
    } catch (error) {
      setUser(null)
      setEnquiries([])
      setVisits([])
      setDeals([])
      setListings([])
      setLoadError(error instanceof Error ? error.message : 'Unable to load user.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const replaceUser = useCallback((updated: AppUser) => {
    const detailUser = cloneUser(updated)
    setUser(detailUser)
    setAssignDraft(detailUser.assignedTo ?? '')
    setWhatsappBody(KYC_REMINDER_TEMPLATE(detailUser.name))
  }, [])

  const withSession = useCallback(
    async <T,>(fn: (accessToken: string) => Promise<T>) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        showToast('Admin session expired. Please sign in again.')
        return null
      }

      setActionSaving(true)
      try {
        return await fn(session.accessToken)
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to update user.')
        return null
      } finally {
        setActionSaving(false)
      }
    },
    [showToast],
  )

  const showNameMismatch = user?.id === 'usr_006'

  const sendKycPush = useCallback(
    (template: ReturnType<typeof NOTIFICATION_TEMPLATES.N13_KYC_VERIFIED>, notificationId: string) => {
      if (!user) return
      let msg = sendPushNotification(user.name, template, notificationId, {
        dedupeKey: `${notificationId}:${user.id}`,
        userId: user.id,
        relatedTo: { type: 'user', id: user.id },
      })
      if (msg.includes('recently') && window.confirm(`${msg}\n\nSend again?`)) {
        msg = sendPushNotification(user.name, template, notificationId, {
          skipDuplicateCheck: true,
          dedupeKey: `${notificationId}:${user.id}`,
          userId: user.id,
          relatedTo: { type: 'user', id: user.id },
        })
      }
      showToast(msg)
    },
    [user, showToast],
  )

  const handleVerifyDocument = useCallback(
    async (index: number) => {
      if (!user) return
      const doc = user.kycDocuments[index]
      if (!doc.id) {
        showToast('This KYC document is missing a backend document id.')
        return
      }
      if (verifyPreviewDocIndex !== index) {
        setVerifyPreviewDocIndex(index)
        return
      }
      if (showNameMismatch) {
        if (
          !window.confirm(
            'Name mismatch detected. Verify carefully before approving.',
          )
        ) {
          return
        }
      }
      if (
        !window.confirm(
          `Are you sure you want to verify ${doc.name}? Cannot be undone easily.`,
        )
      ) {
        return
      }
      setVerifyPreviewDocIndex(null)
      const docs = [...user.kycDocuments]
      docs[index] = {
        ...docs[index],
        status: 'verified',
        verifiedAt: new Date().toISOString(),
        rejectionReason: null,
      }
      const allUploadedVerified = docs
        .filter((d) => d.status !== 'missing')
        .every((d) => d.status === 'verified')
      const updated = await withSession((accessToken) =>
        updateAdminUserKyc(accessToken, user.id, {
          status: allUploadedVerified ? 'verified' : undefined,
          documentUpdates: [{ documentId: doc.id, status: 'verified', rejectionReason: null }],
          notes: `${doc.name} verified from admin user detail.`,
        }),
      )
      if (!updated) return
      replaceUser(updated)
      if (allUploadedVerified) {
        showToast('✅ KYC Complete!')
      } else {
        showToast(`${doc.name} verified`)
        sendKycPush(NOTIFICATION_TEMPLATES.N13_KYC_VERIFIED(user.name), 'N-13')
        setKycPushBanner('N-13')
      }
    },
    [user, showNameMismatch, verifyPreviewDocIndex, showToast, withSession, replaceUser, sendKycPush],
  )

  const handleRejectDocument = useCallback(
    async (index: number) => {
      if (!user) return
      const doc = user.kycDocuments[index]
      if (!doc.id) {
        showToast('This KYC document is missing a backend document id.')
        return
      }
      const needsDetails = rejectReason === 'Other (specify below)'
      if (needsDetails && !rejectNotes.trim()) {
        showToast('Details required when reason is Other')
        return
      }
      const reason = needsDetails
        ? rejectNotes.trim()
        : rejectNotes.trim()
          ? `${rejectReason}: ${rejectNotes.trim()}`
          : rejectReason
      const updated = await withSession((accessToken) =>
        updateAdminUserKyc(accessToken, user.id, {
          status: 'rejected',
          documentUpdates: [{ documentId: doc.id, status: 'rejected', rejectionReason: reason }],
          notes: reason,
        }),
      )
      if (!updated) return
      replaceUser(updated)
      sendKycPush(NOTIFICATION_TEMPLATES.N14_KYC_REJECTED(user.name, reason), 'N-14')
      setRejectDocIndex(null)
      setRejectNotes('')
      showToast(`${doc.name} rejected — notification N-14 sent`)
    },
    [user, rejectReason, rejectNotes, showToast, withSession, replaceUser, sendKycPush],
  )

  const refreshSentMessages = useCallback(() => {
    if (user) void loadMessages('user', user.id).then(setSentMessages)
  }, [user])

  useEffect(() => {
    refreshSentMessages()
  }, [refreshSentMessages])

  const timeline = useMemo(() => {
    if (!user) return []
    const base = buildTimeline(user, enquiries, visits)
    const fromMessages = sentMessages.map((m) => ({
      id: m.id,
      text: messageToActivityText(m),
      at: m.sentAt,
    }))
    return [...base, ...fromMessages].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
  }, [user, enquiries, visits, sentMessages])

  const logUserMessage = useCallback(
    (
      msg: Omit<SentMessage, 'id' | 'sentAt' | 'relatedTo' | 'sentBy'>,
    ) => {
      if (!user) return
      logMessage({
        ...msg,
        sentBy: DEFAULT_SENT_BY,
        relatedTo: { type: 'user', id: user.id, title: user.name },
      })
      refreshSentMessages()
    },
    [user, refreshSentMessages],
  )

  const overallKycMessage = useMemo(() => {
    if (!user) return null
    if (user.kycDocuments.length === 0) {
      return { type: 'none' as const, text: '📋 KYC not started' }
    }
    if (user.kycDocuments.some((d) => d.status === 'rejected')) {
      return { type: 'rejected' as const, text: '❌ Action required — documents rejected' }
    }
    if (user.kycDocuments.some((d) => d.status === 'uploaded')) {
      return { type: 'pending' as const, text: '⏳ Verification in progress' }
    }
    if (user.kycDocuments.every((d) => d.status === 'verified')) {
      return {
        type: 'complete' as const,
        text: '✅ KYC Complete',
        date: user.kycVerifiedAt,
      }
    }
    return { type: 'pending' as const, text: '⏳ Verification in progress' }
  }, [user])

  const assigneeOptions = useMemo(
    () => salesTeam.map((member) => ({ id: member.id, label: member.name })),
    [salesTeam],
  )

  const assigneeLabel = useCallback(
    (assigneeId: string | null | undefined, fallback?: string | null) => {
      if (!assigneeId) return 'Unassigned'
      return fallback ?? assigneeOptions.find((option) => option.id === assigneeId)?.label ?? assigneeId
    },
    [assigneeOptions],
  )

  const saveBlockState = useCallback(
    async (isBlocked: boolean, reason?: string | null) => {
      if (!user) return
      const updated = await withSession((accessToken) =>
        updateAdminUserBlock(accessToken, user.id, {
          isBlocked,
          blockedReason: isBlocked ? reason || 'Blocked by admin' : null,
        }),
      )
      if (!updated) return
      replaceUser(updated)
      showToast(isBlocked ? `${user.name} blocked` : `${user.name} unblocked`)
    },
    [user, withSession, replaceUser, showToast],
  )

  const performBlock = () => {
    if (!user) return
    void saveBlockState(true, blockNotes.trim() || blockReason).then(() => {
      setBlockOpen(false)
      setBlockNotes('')
    })
  }

  const handleBlockClick = () => {
    if (!user) return
    if (user.isBlocked) {
      void saveBlockState(false)
      return
    }
    if (user.totalDeals > 0) {
      setBlockDealsConfirm(user)
      return
    }
    setBlockOpen(true)
  }

  const openProfileEdit = useCallback(() => {
    if (!user) return
    setProfileForm({
      name: user.name,
      email: user.email ?? '',
      city: user.city,
      state: user.state,
      country: user.country,
      userType: user.userType,
      assignedTo: user.assignedTo ?? '',
    })
    setProfileEditOpen(true)
  }, [user])

  const saveProfileEdit = useCallback(async () => {
    if (!user) return
    if (!profileForm.name.trim()) {
      showToast('Full name is required.')
      return
    }
    const updated = await withSession((accessToken) =>
      updateAdminUserProfile(accessToken, user.id, {
        name: profileForm.name.trim(),
        email: profileForm.email.trim() || null,
        city: profileForm.city.trim() || null,
        state: profileForm.state.trim() || null,
        country: profileForm.country.trim() || null,
        userType: profileForm.userType,
        assignedTo: profileForm.assignedTo || null,
      }),
    )
    if (!updated) return
    replaceUser(updated)
    setProfileEditOpen(false)
    showToast('Profile updated')
  }, [profileForm, replaceUser, showToast, user, withSession])

  const exportUserData = useCallback(async () => {
    if (!user) return
    const payload = await withSession((accessToken) => exportAdminUserData(accessToken, user.id))
    if (!payload) return
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${user.referenceId || user.id}-export.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    showToast('User data export downloaded')
  }, [showToast, user, withSession])

  if (loading) return <DetailSkeleton />

  if (loadError) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4 text-center">
        <User className="size-16 text-muted-foreground" />
        <p className="max-w-md text-lg font-medium text-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/users/all')}>
            Back to Users
          </Button>
          <Button type="button" onClick={() => void loadUser()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
        <User className="size-16 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">User not found</p>
        <Button type="button" onClick={() => navigate('/admin/users/all')}>
          Back to Users
        </Button>
      </div>
    )
  }

  const kycColor = getKycStatusColor(user.kycStatus)
  const showListings = user.role === 'seller' || user.role === 'both'

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
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      {blockDealsConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBlockDealsConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              ⚠️ This user has {blockDealsConfirm.totalDeals} active{' '}
              {blockDealsConfirm.totalDeals === 1 ? 'deal' : 'deals'}.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Blocking will prevent app access. Active deals will not be affected.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBlockDealsConfirm(null)}>
                Cancel
              </Button>
              <Button
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setBlockDealsConfirm(null)
                  setBlockOpen(true)
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        <span>/</span>
        <Link to={roleTabPath(user.role)} className="hover:text-foreground">
          {getRoleLabel(user.role)}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{user.name}</span>
      </nav>

      {user.isBlocked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-600 px-4 py-3 text-white">
          <div>
            <p className="font-semibold">🚫 This user is blocked</p>
            <p className="text-sm text-red-100">
              Reason: {user.blockedReason ?? 'No reason provided'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="border-white bg-transparent text-white hover:bg-white/10"
            disabled={actionSaving}
            onClick={() => void saveBlockState(false)}
          >
            Unblock
          </Button>
        </div>
      )}

      {user.kycStatus === 'rejected' && user.kycRejectionReason && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>KYC rejected:</strong> {user.kycRejectionReason}
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-bold text-white">
            {getInitials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{user.name}</h1>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  getUserTypeBadgeColor(user.userType),
                )}
              >
                {USER_TYPE_LABELS[user.userType]}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  ROLE_BADGE_CLASSES[user.role],
                )}
              >
                {getRoleLabel(user.role)}
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ backgroundColor: `${kycColor}22`, color: kycColor }}
              >
                {getKycStatusLabel(user.kycStatus)}
              </span>
              {user.isBlocked && <Badge variant="red">Blocked</Badge>}
              {user.userType === 'pio' && (
                <span className="rounded bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                  PIO
                </span>
              )}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span>{user.referenceId}</span>
              <span>•</span>
              <span>{user.phone}</span>
              <span>•</span>
              <span>{user.email ?? 'No email'}</span>
              <span>•</span>
              <span>
                {user.userType === 'nri' && (
                  <span className="mr-1">{COUNTRY_FLAGS[user.country] ?? '🌍'}</span>
                )}
                {user.city}, {user.country}
              </span>
              <span>•</span>
              <span>Registered {formatTimeAgo(user.registeredAt)}</span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => handleCall(user.phone)}
          >
            📞 Call
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-green-200 text-green-700 hover:bg-green-50"
            onClick={() => {
              setWhatsappBody(`Hi ${user.name}, this is BuiltGlory admin.`)
              setWhatsappOpen(true)
            }}
          >
            💬 WhatsApp
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setEmailSubject(`BuiltGlory — ${user.name}`)
              setEmailOpen(true)
            }}
          >
            📧 Email
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              user.isBlocked
                ? 'border-green-300 text-green-700'
                : 'border-destructive/50 text-destructive',
            )}
            onClick={handleBlockClick}
          >
            {user.isBlocked ? '✅ Unblock' : '🚫 Block User'}
          </Button>
          <div ref={moreRef} className="relative">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="size-9 p-0"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <MoreVertical className="size-4" />
            </Button>
            {moreOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-md border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setMoreOpen(false)
                    showToast('Assign to — use Assignment card')
                  }}
                >
                  Assign To admin
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setMoreOpen(false)
                    setPushOpen(true)
                  }}
                >
                  Send Push Notification
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    setMoreOpen(false)
                    void exportUserData()
                  }}
                >
                  Export User Data
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Enquiries', value: user.totalEnquiries, color: 'text-blue-600' },
          { label: 'Visits', value: user.totalVisits, color: 'text-purple-600' },
          { label: 'Deals', value: user.totalDeals, color: 'text-green-600' },
          { label: 'Listings', value: user.totalListings, color: 'text-orange-600' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={cn('text-2xl font-bold', stat.color)}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="min-w-0 space-y-6">
          {(user.userType === 'nri' || user.userType === 'pio') && (
            <FemaComplianceCard
              user={user}
              toastApi={toastApi}
              onUpdate={async (fema) => {
                const updated = await withSession((accessToken) =>
                  updateAdminUserFema(accessToken, user.id, {
                    status: fema.status,
                    notes: fema.notes,
                  }),
                )
                if (updated) replaceUser(updated)
              }}
            />
          )}

          {/* KYC */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">KYC Documents</CardTitle>
              <p className="text-xs text-muted-foreground">📱 App screen: P-06</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {kycPushBanner === 'N-13' && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  ✅ KYC verified. Notification N-13 sent to user.
                </div>
              )}
              {showNameMismatch && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  ⚠️ Name mismatch detected between profile and document. Verify
                  carefully.
                </div>
              )}

              {user.kycDocuments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">No documents uploaded yet</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setWhatsappBody(KYC_REMINDER_TEMPLATE(user.name))
                      setWhatsappOpen(true)
                    }}
                  >
                    Send Reminder
                  </Button>
                </div>
              ) : (
                user.kycDocuments.map((doc, index) => (
                  <div
                    key={`${doc.type}-${index}`}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex gap-2">
                        <FileText className="mt-0.5 size-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{doc.name}</p>
                          <DocStatusBadge status={doc.status} />
                          {doc.uploadedAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Uploaded {formatFullDate(doc.uploadedAt)}
                            </p>
                          )}
                          {doc.verifiedAt && (
                            <p className="text-xs text-green-700">
                              Verified {formatFullDate(doc.verifiedAt)}
                            </p>
                          )}
                          {doc.rejectionReason && (
                            <p className="text-xs text-red-600">{doc.rejectionReason}</p>
                          )}
                          {doc.status === 'uploaded' && user.kycRejectionReason && (
                            <Badge variant="blue" className="mt-1 text-xs">
                              Resubmitted
                            </Badge>
                          )}
                          {doc.status === 'uploaded' && user.kycRejectionReason && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Previous rejection: {user.kycRejectionReason}
                            </p>
                          )}
                          {doc.status === 'expired' && (
                            <p className="text-xs text-red-600">Please reupload</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {doc.status !== 'missing' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setPreviewDoc(doc)}
                          >
                            View Document
                          </Button>
                        )}
                        {(doc.status === 'uploaded' || doc.status === 'expired') && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 border-green-300 text-xs text-green-700"
                              onClick={() => handleVerifyDocument(index)}
                            >
                              {verifyPreviewDocIndex === index ? 'Confirm Verify' : '✅ Verify'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 border-red-300 text-xs text-red-700"
                              onClick={() => {
                                setRejectDocIndex(index)
                                setVerifyPreviewDocIndex(null)
                                setRejectReason(REJECT_REASONS[0])
                                setRejectNotes('')
                              }}
                            >
                              ❌ Reject
                            </Button>
                          </>
                        )}
                        {verifyPreviewDocIndex === index && doc.status !== 'verified' && (
                          <NotificationPreview
                            notificationId="N-13"
                            title={NOTIFICATION_TEMPLATES.N13_KYC_VERIFIED(user.name).title}
                            body={NOTIFICATION_TEMPLATES.N13_KYC_VERIFIED(user.name).body}
                            deepLink="P-06 KYC Documents"
                            recipientLabel="user"
                            className="mt-2"
                          />
                        )}
                        {doc.status === 'verified' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-red-600"
                            disabled={actionSaving}
                            onClick={() => {
                              if (window.confirm(`Revoke verification for ${doc.name}?`)) {
                                void withSession((accessToken) =>
                                  updateAdminUserKyc(accessToken, user.id, {
                                    status: 'pending',
                                    documentUpdates: [
                                      { documentId: doc.id, status: 'uploaded', rejectionReason: null },
                                    ],
                                    notes: `${doc.name} verification revoked.`,
                                  }),
                                ).then((updated) => {
                                  if (!updated) return
                                  replaceUser(updated)
                                  showToast('Verification revoked')
                                })
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        )}
                        {doc.status === 'rejected' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={actionSaving}
                            onClick={() =>
                              void withSession((accessToken) =>
                                updateAdminUserKyc(accessToken, user.id, {
                                  status: 'pending',
                                  documentUpdates: [
                                    { documentId: doc.id, status: 'uploaded', rejectionReason: null },
                                  ],
                                  notes: `${doc.name} marked for re-review.`,
                                }),
                              ).then((updated) => {
                                if (!updated) return
                                replaceUser(updated)
                                showToast('Marked for re-review')
                              })
                            }
                          >
                            Re-review
                          </Button>
                        )}
                        {doc.status === 'missing' && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 border-green-300 text-xs text-green-700"
                              onClick={() => handleVerifyDocument(index)}
                            >
                              ✅ Verify
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 border-red-300 text-xs text-red-700"
                              onClick={() => {
                                setRejectDocIndex(index)
                                setRejectReason(REJECT_REASONS[0])
                                setRejectNotes('')
                              }}
                            >
                              ❌ Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {rejectDocIndex === index && (
                      <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
                        <select
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
                        >
                          {REJECT_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <textarea
                          value={rejectNotes}
                          onChange={(e) => setRejectNotes(e.target.value)}
                          placeholder={
                            rejectReason === 'Other (specify below)'
                              ? 'Details (required)'
                              : 'Additional notes (optional)'
                          }
                          className="min-h-[60px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
                        />
                        <NotificationPreview
                          notificationId="N-14"
                          title={NOTIFICATION_TEMPLATES.N14_KYC_REJECTED(
                            user.name,
                            rejectReason === 'Other (specify below)'
                              ? rejectNotes.trim() || '…'
                              : rejectNotes.trim()
                                ? `${rejectReason}: ${rejectNotes.trim()}`
                                : rejectReason,
                          ).title}
                          body={
                            NOTIFICATION_TEMPLATES.N14_KYC_REJECTED(
                              user.name,
                              rejectReason === 'Other (specify below)'
                                ? rejectNotes.trim() || '…'
                                : rejectNotes.trim()
                                  ? `${rejectReason}: ${rejectNotes.trim()}`
                                  : rejectReason,
                            ).body
                          }
                          deepLink="P-06 KYC Documents"
                          recipientLabel="user"
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="bg-destructive text-destructive-foreground"
                          onClick={() => handleRejectDocument(index)}
                        >
                          Reject & Notify
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}

              {overallKycMessage && (
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium',
                    overallKycMessage.type === 'complete' && 'bg-green-50 text-green-800',
                    overallKycMessage.type === 'rejected' && 'bg-red-50 text-red-800',
                    overallKycMessage.type === 'pending' && 'bg-orange-50 text-orange-800',
                    overallKycMessage.type === 'none' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {overallKycMessage.text}
                  {overallKycMessage.type === 'complete' && overallKycMessage.date && (
                    <span className="mt-1 block text-xs font-normal">
                      Verified on {formatFullDate(overallKycMessage.date)}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enquiries */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Enquiry History</CardTitle>
                <p className="text-xs text-muted-foreground">📱 App screen: B-10, P-02</p>
              </div>
              <Link
                to={`/admin/enquiries/buy?user=${user.id}`}
                className="text-sm text-primary hover:underline"
              >
                View All →
              </Link>
            </CardHeader>
            <CardContent>
              {enquiries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enquiries yet</p>
              ) : (
                <ul className="space-y-3">
                  {enquiries.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{e.propertyName}</p>
                        <div className="mt-1 flex gap-2">
                          <Badge variant="default">{e.type}</Badge>
                          <Badge variant="new">{e.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(e.date)}
                        </p>
                      </div>
                      <Link
                        to={`/admin/enquiries/buy/${e.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Visits */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Visit History</CardTitle>
                <p className="text-xs text-muted-foreground">📱 App screen: B-12, P-03</p>
              </div>
              <Link
                to={`/admin/enquiries/visits?user=${user.id}`}
                className="text-sm text-primary hover:underline"
              >
                View All →
              </Link>
            </CardHeader>
            <CardContent>
              {visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visits yet</p>
              ) : (
                <ul className="space-y-3">
                  {visits.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{v.propertyName}</p>
                        <p className="text-xs text-muted-foreground">
                          {v.date} · {v.time}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge
                            variant="blue"
                            className={
                              v.visitType === 'Virtual'
                                ? 'bg-blue-100 text-blue-800'
                                : undefined
                            }
                          >
                            {v.visitType === 'Virtual' ? 'Virtual' : v.visitType}
                          </Badge>
                          {v.platform && (
                            <Badge variant="default" className="bg-muted text-foreground">
                              {v.platform}
                            </Badge>
                          )}
                          {v.duration != null && (
                            <span className="text-xs text-muted-foreground">
                              {v.duration} min
                            </span>
                          )}
                          <Badge variant="pending">{v.status}</Badge>
                        </div>
                      </div>
                      <Link
                        to={`/admin/visits/${v.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Deals */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Deal History</CardTitle>
                <p className="text-xs text-muted-foreground">📱 App screen: P-04</p>
              </div>
              <Link
                to={`/admin/sales/all?user=${user.id}`}
                className="text-sm text-primary hover:underline"
              >
                View All →
              </Link>
            </CardHeader>
            <CardContent>
              {deals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deals yet</p>
              ) : (
                <ul className="space-y-3">
                  {deals.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {d.propertyName}{' '}
                          <span className="text-primary">{formatPrice(d.price)}</span>
                        </p>
                        <Badge variant="responded" className="mt-1">
                          {d.stage}
                        </Badge>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Started {formatFullDate(d.startedAt)}
                        </p>
                      </div>
                      <Link
                        to={`/admin/sales/${d.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        View Deal →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Listings */}
          {showListings && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Property Listings</CardTitle>
                  <p className="text-xs text-muted-foreground">📱 App screen: SL-02, P-05</p>
                </div>
              </CardHeader>
              <CardContent>
                {listings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No listings yet</p>
                ) : (
                  <ul className="space-y-3">
                    {listings.map((l) => (
                      <li
                        key={l.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {l.title}{' '}
                            <Badge variant="default" className="ml-1">
                              {l.type}
                            </Badge>
                          </p>
                          <p className="text-sm text-primary">{formatPrice(l.price)}</p>
                          <div className="mt-1 flex gap-2">
                            <Badge
                              variant={
                                l.status === 'Approved'
                                  ? 'responded'
                                  : l.status === 'Sold'
                                    ? 'default'
                                    : l.status === 'Rejected'
                                      ? 'red'
                                      : 'pending'
                              }
                              className={cn(
                                l.status === 'Paused' && 'bg-orange-100 text-orange-800',
                                l.status === 'Sold' && 'bg-gray-800 text-white',
                              )}
                            >
                              {l.status === 'Sold' ? 'Sold ✅' : l.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatFullDate(l.submittedAt)}
                            </span>
                          </div>
                        </div>
                        <Link
                          to={`/admin/enquiries/sell/${l.id}`}
                          className="text-sm text-primary hover:underline"
                        >
                          View →
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet</p>
              ) : (
                <ul className="relative space-y-4 border-l-2 border-border pl-4">
                  {timeline.map((item) => (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" />
                      <p className="text-sm text-foreground">{item.text}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(item.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ProfilePhotoSection user={user} />
              <ProfileRow
                label="Phone"
                value={user.phone}
                copyable
                onCopy={() => void copyText(user.phone, toastApi)}
              />
              <ProfileRow label="Email" value={user.email ?? '—'} />
              <ProfileRow
                label="User Type"
                value={
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      getUserTypeBadgeColor(user.userType),
                    )}
                  >
                    {USER_TYPE_LABELS[user.userType]}
                  </span>
                }
              />
              <ProfileRow
                label="Role"
                value={
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      ROLE_BADGE_CLASSES[user.role],
                    )}
                  >
                    {getRoleLabel(user.role)}
                  </span>
                }
              />
              <ProfileRow label="Country" value={user.country} />
              <ProfileRow label="City" value={`${user.city}, ${user.state}`} />
              <ProfileRow label="Registered" value={formatFullDate(user.registeredAt)} />
              <ProfileRow label="Last Login" value={formatTimeAgo(user.lastLoginAt)} />
              <ProfileRow
                label="Status"
                value={
                  user.isBlocked ? (
                    <Badge variant="red">Blocked</Badge>
                  ) : (
                    <Badge variant="responded">Active</Badge>
                  )
                }
              />
              <ProfileRow
                label="Assigned To"
                value={assigneeLabel(user.assignedTo, user.assignedToName)}
              />
              {!profileEditOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={openProfileEdit}
                >
                  Edit Profile
                </Button>
              ) : (
                <div className="space-y-3 border-t border-border pt-3">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Full Name</span>
                    <input
                      value={profileForm.name}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, name: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Email</span>
                    <input
                      type="email"
                      value={profileForm.email}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">City</span>
                    <input
                      value={profileForm.city}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, city: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">State</span>
                    <input
                      value={profileForm.state}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, state: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Country</span>
                    <input
                      value={profileForm.country}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, country: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                  <div>
                    <span className="text-xs text-muted-foreground">User Type</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {USER_TYPE_OPTIONS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                            profileForm.userType === t
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80',
                          )}
                          onClick={() =>
                            setProfileForm((f) => ({ ...f, userType: t }))
                          }
                        >
                          {USER_TYPE_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">Assigned To</span>
                    <select
                      value={profileForm.assignedTo}
                      onChange={(e) =>
                        setProfileForm((f) => ({ ...f, assignedTo: e.target.value }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {assigneeOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" className="flex-1" onClick={() => void saveProfileEdit()}>
                      Save Changes
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setProfileEditOpen(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setWhatsappBody(`Hi ${user.name}, this is BuiltGlory.`)
                  setWhatsappOpen(true)
                }}
              >
                📱 Send WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setEmailOpen(true)}
              >
                📧 Send Email
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setPushOpen(true)}
              >
                🔔 Send Push Notification
              </Button>
              {!user.isBlocked ? (
                <>
                  {user.totalDeals > 0 && (
                    <p className="text-xs text-amber-600">
                      ⚠️ Has {user.totalDeals} active deal
                      {user.totalDeals > 1 ? 's' : ''}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-destructive/50 text-destructive"
                    onClick={handleBlockClick}
                  >
                    🚫 Block User
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-green-300 text-green-700"
                  onClick={() => {
                    if (window.confirm('Unblock this user?')) {
                      void saveBlockState(false)
                    }
                  }}
                  disabled={actionSaving}
                >
                  ✅ Unblock User
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Admin Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {notes.length === 0 && (
                <p className="text-sm text-muted-foreground">No notes yet</p>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="flex gap-2 rounded-lg border border-border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p>{note.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {note.adminName} · {formatDateTime(note.at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      void withSession((accessToken) => deleteWorkflowLog(accessToken, note.id)).then(() => {
                        setNotes((prev) => prev.filter((n) => n.id !== note.id))
                      })
                    }}
                    aria-label="Delete note"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note…"
                className="min-h-[72px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!noteDraft.trim()}
                onClick={() => {
                  if (!user || !noteDraft.trim()) return
                  void withSession((accessToken) =>
                    createWorkflowLog(accessToken, 'user', user.id, {
                      channel: 'note',
                      direction: 'internal',
                      summary: 'Admin user note',
                      body: noteDraft.trim(),
                    }),
                  ).then((log) => {
                    if (!log) return
                    setNotes((prev) => [workflowLogToAdminNote(log), ...prev])
                    setNoteDraft('')
                    showToast('Note saved')
                  })
                }}
              >
                + Add Note
              </Button>
            </CardContent>
          </Card>

          <SentMessagesCard messages={sentMessages} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Current:{' '}
                <span className="font-medium text-foreground">
                  {assigneeLabel(assignDraft, user.assignedToName)}
                </span>
              </p>
              <select
                value={assignDraft}
                onChange={(e) => setAssignDraft(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
              >
                <option value="">Unassigned</option>
                {assigneeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="w-full"
                disabled={actionSaving}
                onClick={() => {
                  void withSession((accessToken) =>
                    updateAdminUserProfile(accessToken, user.id, {
                      assignedTo: assignDraft || null,
                    }),
                  ).then((updated) => {
                    if (!updated) return
                    replaceUser(updated)
                    showToast(assignDraft ? 'Assignment saved' : 'User unassigned')
                  })
                }}
              >
                Save
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {previewDoc && user && (
        <DocumentPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onToast={showToast}
          onVerify={
            previewDoc.status === 'uploaded'
              ? () => {
                  const index = user.kycDocuments.findIndex((d) => d.name === previewDoc.name)
                  if (index >= 0) handleVerifyDocument(index)
                }
              : undefined
          }
        />
      )}

      {/* Modals */}
      {whatsappOpen && (
        <Modal title="Send WhatsApp" onClose={() => setWhatsappOpen(false)}>
          <textarea
            value={whatsappBody}
            onChange={(e) => setWhatsappBody(e.target.value)}
            className="min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <Button
            className="mt-3 w-full"
            disabled={!whatsappBody.trim()}
            onClick={() => {
              if (!user || !whatsappBody.trim()) return
              logUserMessage({
                channel: 'whatsapp',
                to: user.phone,
                toName: user.name,
                message: whatsappBody.trim(),
              })
              openWhatsApp(user.phone, whatsappBody.trim())
              setWhatsappOpen(false)
              showToast('WhatsApp message sent')
            }}
          >
            Send
          </Button>
        </Modal>
      )}

      {emailOpen && (
        <Modal title="Send Email" onClose={() => setEmailOpen(false)}>
          <input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Subject"
            className="mb-2 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
          <textarea
            value={emailBody}
            onChange={(e) => setEmailBody(e.target.value)}
            placeholder="Body"
            className="min-h-[120px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <Button
            className="mt-3 w-full"
            disabled={!user?.email}
            onClick={() => {
              if (!user) return
              if (!user.email) {
                showToast('No email on file')
                return
              }
              logUserMessage({
                channel: 'email',
                to: user.email,
                toName: user.name,
                subject: emailSubject,
                message: emailBody,
              })
              openEmail(user.email, emailSubject, emailBody)
              setEmailOpen(false)
              showToast('Email sent')
            }}
          >
            Send
          </Button>
        </Modal>
      )}

      {pushOpen && (
        <Modal title="Push Notification" onClose={() => setPushOpen(false)}>
          <input
            value={pushTitle}
            onChange={(e) => setPushTitle(e.target.value)}
            placeholder="Title"
            className="mb-2 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
          />
          <textarea
            value={pushMessage}
            onChange={(e) => setPushMessage(e.target.value)}
            placeholder="Message"
            className="min-h-[100px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <Button
            className="mt-3 w-full"
            onClick={() => {
              setPushOpen(false)
              showToast('Push notification sent')
            }}
          >
            Send
          </Button>
        </Modal>
      )}

      {blockOpen && (
        <Modal title="Block User" onClose={() => setBlockOpen(false)}>
          <select
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            className="mb-2 h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
          >
            {BLOCK_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            value={blockNotes}
            onChange={(e) => setBlockNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="min-h-[80px] w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          {user.totalDeals > 0 && (
            <p className="mt-2 text-sm text-amber-600">
              ⚠️ Has {user.totalDeals} active deal{user.totalDeals > 1 ? 's' : ''}
            </p>
          )}
          <Button
            className="mt-3 w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={performBlock}
          >
            Confirm Block
          </Button>
        </Modal>
      )}
    </div>
  )
}

function ProfileRow({
  label,
  value,
  copyable,
  onCopy,
}: {
  label: string
  value: ReactNode
  copyable?: boolean
  onCopy?: () => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center justify-end gap-1 text-right font-medium">
        {value}
        {copyable && onCopy && typeof value === 'string' && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={onCopy}
          >
            Copy
          </button>
        )}
      </span>
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
