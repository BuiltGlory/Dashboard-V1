import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertCircle,
  Building2,
  Copy,
  Eye,
  FilterX,
  LayoutGrid,
  List,
  MapPin,
  Search,
  SearchX,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  getCompletenessColor,
  listAdminSellRequests,
  type SellRequest,
  type SellRequestStatus,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { getPropertyTypeLabel } from '@/domain/properties'
import { cn } from '@/lib/utils'
import { ListingPreviewModal } from './ListingPreviewModal'

function getSellRequestRowFlags(req: SellRequest, all: SellRequest[]) {
  const phoneKey = req.phone.replace(/\D/g, '')
  const titleKey = req.propertyTitle.trim().toLowerCase()
  const siblings = all.filter(
    (o) =>
      o.id !== req.id &&
      o.phone.replace(/\D/g, '') === phoneKey &&
      o.propertyTitle.trim().toLowerCase() === titleKey,
  )
  const original = [...siblings, req].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  )[0]
  const duplicateOf =
    siblings.length > 0 && original.id !== req.id ? original.id : null
  return { duplicateOf }
}

type ViewMode = 'table' | 'card'
type StatusFilter =
  | 'all'
  | 'new'
  | 'under_review'
  | 'accepted'
  | 'rejected'
  | 'changes_requested'
  | 'paused'
  | 'sold'

const VIEW_STORAGE_KEY = 'builtglory-sell-requests-view'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'accepted', label: 'Approved' },
  { key: 'changes_requested', label: 'Changes Requested' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'paused', label: 'Paused' },
  { key: 'sold', label: 'Sold' },
]

const STATUS_LABELS: Record<SellRequestStatus, string> = {
  draft: 'Draft',
  new: 'New',
  under_review: 'Under Review',
  accepted: 'Accepted',
  approved: 'Approved',
  active: 'Active',
  negotiating: 'Negotiating',
  paused: 'Paused',
  sold: 'Sold',
  rejected: 'Rejected',
  changes_requested: 'Changes Requested',
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function formatTimeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function formatFullDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function StatusBadge({ status }: { status: SellRequestStatus }) {
  const styles: Record<SellRequestStatus, { variant?: 'new' | 'default' | 'red'; className?: string }> = {
    draft: { className: 'bg-orange-100 text-orange-800' },
    new: { variant: 'new' },
    under_review: { className: 'bg-purple-100 text-purple-700' },
    accepted: { className: 'bg-green-100 text-green-700' },
    approved: { className: 'bg-green-100 text-green-700' },
    active: { className: 'bg-green-100 text-green-700' },
    negotiating: { className: 'bg-blue-100 text-blue-800' },
    paused: { className: 'bg-orange-100 text-orange-800' },
    sold: { className: 'bg-gray-800 text-white' },
    rejected: { variant: 'red' },
    changes_requested: { className: 'bg-orange-100 text-orange-700' },
  }
  const s = styles[status]
  return (
    <Badge variant={s.variant} className={s.className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function CompletenessBar({ percent }: { percent: number }) {
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', getCompletenessColor(percent))}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{percent}% complete</p>
    </div>
  )
}

function PropertyTypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="default">
      {getPropertyTypeLabel(type)}
    </Badge>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-[88px] items-center gap-4 border-b border-border px-4">
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="size-12 animate-pulse rounded bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="overflow-hidden">
          <div className="h-40 animate-pulse bg-muted" />
          <CardContent className="space-y-3 p-4">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SellTableView({
  requests,
  onView,
  onPreview,
  onCopyPhone,
}: {
  requests: SellRequest[]
  onView: (r: SellRequest) => void
  onPreview: (r: SellRequest) => void
  onCopyPhone: (phone: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[1100px] w-full border-collapse">
        <thead className="bg-muted">
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Seller</th>
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Completeness</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Submitted</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => {
            const { duplicateOf } = getSellRequestRowFlags(req, requests)
            return (
            <tr
              key={req.id}
              className="h-[88px] cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent"
              onClick={() => onView(req)}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white">
                    {getInitials(req.sellerName)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{req.sellerName}</p>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                      onClick={() => onCopyPhone(req.phone)}
                    >
                      {req.phone}
                      <Copy className="size-3" />
                    </button>
                    <p className="text-xs text-muted-foreground">{req.referenceId}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  {req.photos[0] ? (
                    <img
                      src={req.photos[0]}
                      alt=""
                      className="size-12 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted">
                      <Building2 className="size-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium" title={req.propertyTitle}>
                      {req.propertyTitle}
                    </p>
                    {duplicateOf && (
                      <button
                        type="button"
                        className="text-xs font-medium text-orange-700 underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          const orig = requests.find((x) => x.id === duplicateOf)
                          if (orig) onView(orig)
                        }}
                      >
                        Duplicate · View original →
                      </button>
                    )}
                    <PropertyTypeBadge type={req.propertyType} />
                    <p className="font-bold text-primary">{req.askingPrice}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {req.location}
                    </p>
                  </div>
                </div>
              </td>
              <td className="min-w-[140px] px-4 py-3">
                <CompletenessBar percent={req.completenessPercent} />
                <p className="mt-1 flex gap-2 text-xs text-muted-foreground">
                  <span>📸 {req.photosCount}</span>
                  <span>📄 {req.documentsCount}</span>
                </p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={req.status} />
                {req.isDraft && req.draftStep && (
                  <p className="mt-1 text-xs text-orange-800">
                    Step {req.draftStep}/6 completed
                  </p>
                )}
              </td>
              <td className="px-4 py-3">
                <span className="text-sm text-muted-foreground" title={formatFullDate(req.submittedAt)}>
                  {req.isDraft && req.draftSavedAt
                    ? `Saved ${req.draftSavedAt}`
                    : formatTimeAgo(req.submittedAt)}
                </span>
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap gap-1">
                  {req.isDraft ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `https://wa.me/${req.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${req.sellerName}, please complete your listing on BuiltGlory app.`)}`,
                          '_blank',
                        )
                      }
                    >
                      📞 Follow Up
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => onPreview(req)}>
                        <Eye className="size-4" /> Preview
                      </Button>
                      <Button variant="default" size="sm" onClick={() => onView(req)}>
                        View →
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

function SellCardView({
  requests,
  onView,
  onPreview,
}: {
  requests: SellRequest[]
  onView: (r: SellRequest) => void
  onPreview: (r: SellRequest) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {requests.map((req) => (
        <Card
          key={req.id}
          className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
          onClick={() => onView(req)}
        >
          <div className="relative h-40 bg-muted">
            {req.photos[0] ? (
              <img src={req.photos[0]} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Building2 className="size-10 text-muted-foreground/40" />
              </div>
            )}
            <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              📸 {req.photosCount}
            </span>
            <div className="absolute right-2 top-2">
              <StatusBadge status={req.status} />
            </div>
          </div>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="line-clamp-2 font-semibold">{req.propertyTitle}</p>
              <p className="text-lg font-bold text-primary">{req.askingPrice}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <PropertyTypeBadge type={req.propertyType} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {req.location}
                </span>
              </div>
            </div>
            {req.isDraft && req.draftStep && (
              <div>
                <p className="mb-1 text-xs text-orange-800">
                  Step {req.draftStep}/6 — {Math.round((req.draftStep / 6) * 100)}% complete
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${(req.draftStep / 6) * 100}%` }}
                  />
                </div>
                {req.draftSavedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">Saved {req.draftSavedAt}</p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white">
                {getInitials(req.sellerName)}
              </div>
              <div>
                <p className="text-sm font-medium">{req.sellerName}</p>
                <p className="text-xs text-muted-foreground">{req.phone}</p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">Completeness</span>
                <span className="font-medium">{req.completenessPercent}%</span>
              </div>
              <CompletenessBar percent={req.completenessPercent} />
              <p className="mt-1 text-xs text-muted-foreground">
                📸 {req.photosCount} photos · 📄 {req.documentsCount} doc
              </p>
            </div>
            <div
              className="flex justify-between gap-2 border-t border-border pt-3"
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="outline" size="sm" onClick={() => onPreview(req)}>
                <Eye className="size-4" /> Preview
              </Button>
              <Button variant="default" size="sm" onClick={() => onView(req)}>
                View →
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function SellRequestsPage() {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<SellRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY)
      return saved === 'card' ? 'card' : 'table'
    } catch {
      return 'table'
    }
  })
  const [previewRequest, setPreviewRequest] = useState<SellRequest | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const loadRequests = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setRequests([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminSellRequests(session.accessToken)
      setRequests(result.data.filter((r) => !r.isDraft && r.status !== 'draft'))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load sell requests.')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRequests()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadRequests])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: requests.length,
      new: 0,
      under_review: 0,
      accepted: 0,
      rejected: 0,
      changes_requested: 0,
      paused: 0,
      sold: 0,
    }
    requests.forEach((r) => {
      if (r.status === 'paused') counts.paused += 1
      if (r.status === 'sold') counts.sold += 1
      if (r.status === 'new') counts.new += 1
      if (r.status === 'under_review') counts.under_review += 1
      if (r.status === 'accepted' || r.status === 'approved' || r.status === 'active')
        counts.accepted += 1
      if (r.status === 'rejected') counts.rejected += 1
      if (r.status === 'changes_requested') counts.changes_requested += 1
    })
    return counts
  }, [requests])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((r) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'accepted'
            ? r.status === 'accepted' ||
              r.status === 'approved' ||
              r.status === 'active' ||
              r.status === 'negotiating'
            : r.status === statusFilter
      const matchesSearch =
        !q ||
        r.sellerName.toLowerCase().includes(q) ||
        r.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        r.propertyTitle.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [requests, search, statusFilter])

  const handleCopyPhone = useCallback((phone: string) => {
    void navigator.clipboard.writeText(phone)
    setToast('Copied!')
  }, [])

  const handleView = (req: SellRequest) => {
    navigate(`/admin/enquiries/sell/${req.id}`)
  }

  const handleViewChange = (mode: ViewMode) => {
    setView(mode)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  const showEmptyAll = !loading && requests.length === 0
  const showEmptySearch = !loading && requests.length > 0 && filtered.length === 0 && search.trim()
  const showEmptyFilter = !loading && requests.length > 0 && filtered.length === 0 && !search.trim()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {previewRequest && (
        <ListingPreviewModal
          request={previewRequest}
          open={Boolean(previewRequest)}
          onClose={() => setPreviewRequest(null)}
        />
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Sell Requests</h2>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {requests.length} requests
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs lg:w-64 lg:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search seller, phone, property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            className={cn(view === 'table' && 'bg-primary text-primary-foreground hover:bg-brand-700')}
            onClick={() => handleViewChange('table')}
            aria-label="Table view"
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === 'card' ? 'default' : 'outline'}
            size="sm"
            className={cn(view === 'card' && 'bg-primary text-primary-foreground hover:bg-brand-700')}
            onClick={() => handleViewChange('card')}
            aria-label="Card view"
          >
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              statusFilter === f.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label} ({statusCounts[f.key]})
          </button>
        ))}
      </div>

      {loading && (view === 'table' ? <TableSkeleton /> : <CardSkeleton />)}

      {!loading && loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-destructive/70" />
            <h3 className="text-lg font-semibold">Could not load sell requests</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadRequests()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyAll && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Building2 className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No sell requests yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Property listings from sellers will appear here
            </p>
          </CardContent>
        </Card>
      )}

      {showEmptySearch && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <SearchX className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No results for &apos;{search}&apos;</h3>
            <Button variant="outline" className="mt-4" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyFilter && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <FilterX className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No {STATUS_LABELS[statusFilter as SellRequestStatus]} requests</h3>
            <Button variant="outline" className="mt-4" onClick={() => setStatusFilter('all')}>
              Clear filter
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        view === 'table' ? (
          <SellTableView
            requests={filtered}
            onView={handleView}
            onPreview={setPreviewRequest}
            onCopyPhone={handleCopyPhone}
          />
        ) : (
          <SellCardView requests={filtered} onView={handleView} onPreview={setPreviewRequest} />
        )
      )}
    </div>
  )
}
