import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  AlertCircle,
  Building2,
  FilterX,
  LayoutGrid,
  List,
  MapPin,
  Search,
  SearchX,
  TrendingUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatPrice,
  getSalesStageColor,
  getSalesStageCounts,
  getSalesStageLabel,
  type DealPriority,
  type SalesDeal,
  type SalesStage,
  listAdminSalesDeals,
} from '@/api/adminSales'
import { readAdminSession } from '@/api/admin'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'

const ALL_ROUTE = '/admin/sales/all'
const VIEW_STORAGE_KEY = 'builtglory-sales-view'

const ROUTE_STAGE_MAP: Record<string, SalesStage> = {
  '/admin/sales/leads': 'active_leads',
  '/admin/sales/visits': 'site_visits',
  '/admin/sales/negotiation': 'negotiation',
  '/admin/sales/token': 'token_payment',
  '/admin/sales/fullpayment': 'full_payment',
  '/admin/sales/stagepayment': 'stage_payment',
  '/admin/sales/interior': 'interior_design',
  '/admin/sales/documentation': 'documentation',
  '/admin/sales/closed': 'closed',
  '/admin/sales/lost': 'lost',
  '/admin/sales/reengagement': 're_engagement',
}

function getActiveStageFromPath(pathname: string): SalesStage | null {
  if (pathname === ALL_ROUTE) return null
  return ROUTE_STAGE_MAP[pathname] ?? null
}

function readStoredView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored === 'grid' || stored === 'list') return stored
  } catch {
    /* ignore */
  }
  return 'grid'
}

function persistView(mode: ViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

const PRIORITY_ORDER: Record<DealPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
}

function sortDeals(items: SalesDeal[]): SalesDeal[] {
  return [...items].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return b.daysInStage - a.daysInStage
  })
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
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatFollowUpDate(iso?: string | null) {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function buyerTypeLabel(type: SalesDeal['buyerType']) {
  if (type === 'nri') return 'NRI'
  if (type === 'pio') return 'PIO'
  return 'Resident'
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="h-10 animate-pulse bg-muted" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse border-b border-border bg-muted/30" />
      ))}
    </div>
  )
}

type EmptyVariant = 'all' | 'stage' | 'search'

function SalesEmptyState({
  variant,
  stage,
  searchTerm,
}: {
  variant: EmptyVariant
  stage: SalesStage | null
  searchTerm: string
}) {
  const navigate = useNavigate()

  if (variant === 'search') {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <SearchX className="size-16 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No results for &apos;{searchTerm}&apos;</p>
      </div>
    )
  }

  if (variant === 'all') {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <TrendingUp className="size-16 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No sales deals yet</p>
        <Button type="button" onClick={() => navigate('/admin/enquiries/buy')}>
          View buy enquiries
        </Button>
      </div>
    )
  }

  const label = stage ? getSalesStageLabel(stage) : 'matching'
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <FilterX className="size-16 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No {label} deals</p>
    </div>
  )
}

function DaysInStageText({ days }: { days: number }) {
  return (
    <span
      className={cn(
        'text-xs',
        days > 14 && 'text-red-600',
        days >= 7 && days <= 14 && 'text-amber-600',
        days < 7 && 'text-green-600',
      )}
    >
      {days}d in stage
    </span>
  )
}

function DaysInStageChip({ days }: { days: number }) {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-xs font-medium',
        days > 14 && 'border-red-200 bg-red-50 text-red-700',
        days >= 7 && days <= 14 && 'border-amber-200 bg-amber-50 text-amber-700',
        days < 7 && 'border-green-200 bg-green-50 text-green-700',
      )}
    >
      {days}d in stage
    </span>
  )
}

function TablePriorityCell({ priority }: { priority: DealPriority }) {
  if (priority === 'urgent') return <Badge variant="red">Urgent</Badge>
  if (priority === 'high') return <Badge variant="orange">High</Badge>
  return <span className="text-sm text-muted-foreground">—</span>
}

function PriorityBadge({ priority }: { priority: DealPriority }) {
  if (priority === 'urgent') return <Badge variant="red">Urgent</Badge>
  if (priority === 'high') return <Badge variant="orange">High</Badge>
  return null
}

function StageBadge({ stage }: { stage: SalesStage }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 shrink-0 rounded-full', getSalesStageColor(stage))} />
      <span className="text-xs font-medium text-foreground">{getSalesStageLabel(stage)}</span>
    </span>
  )
}

function activeDealsByPhone(deals: SalesDeal[]): Map<string, number> {
  const map = new Map<string, number>()
  deals.forEach((d) => {
    if (d.stage === 'lost' || d.stage === 'closed') return
    const key = d.buyerPhone.replace(/\D/g, '')
    map.set(key, (map.get(key) ?? 0) + 1)
  })
  return map
}

function SalesDealCard({
  item,
  onCardClick,
  multiDealCount,
}: {
  item: SalesDeal
  onCardClick: () => void
  multiDealCount?: number
}) {
  const stalled = item.daysInStage > 14
  const showPriority = item.priority === 'urgent' || item.priority === 'high'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onCardClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onCardClick()
        }
      }}
      className={cn(
        'group w-full cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        item.stage === 'lost' && 'opacity-50',
        item.stage === 'closed' && 'opacity-60',
      )}
    >
      <div className="relative h-32 overflow-hidden bg-muted">
        {item.photos[0] ? (
          <img
            src={item.photos[0]}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Building2 className="size-10 text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {showPriority && <PriorityBadge priority={item.priority} />}
          <Badge variant="blue">{buyerTypeLabel(item.buyerType)}</Badge>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 shadow-sm backdrop-blur">
          <StageBadge stage={item.stage} />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/10">
              {getInitials(item.buyerName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{item.buyerName}</p>
              <p className="truncate text-xs text-muted-foreground">{item.referenceId}</p>
              {multiDealCount != null && multiDealCount > 1 && (
                <span className="text-xs font-medium text-orange-700">
                  Multiple deals ({multiDealCount})
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {formatTimeAgo(item.lastActivityAt)}
          </span>
        </div>

        <div className="mt-4">
          <p className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{item.propertyTitle}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-primary">{formatPrice(item.propertyPrice)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="default" className="capitalize">
              {item.propertyType}
            </Badge>
          </div>
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 text-sm">
          {item.offeredPrice != null && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Offer</span>
              <span className="font-medium">{formatPrice(item.offeredPrice)}</span>
            </div>
          )}
          {item.agreedPrice != null && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Agreed</span>
              <span className="font-semibold text-green-700">{formatPrice(item.agreedPrice)}</span>
            </div>
          )}
          {item.offeredPrice == null && item.agreedPrice == null && (
            <p className="text-xs text-muted-foreground">No offer recorded yet</p>
          )}
        </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <DaysInStageChip days={item.daysInStage} />
        {item.stage === 're_engagement' && (
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
            Follow-up: {formatFollowUpDate(item.reengagementFollowUpAt)}
          </span>
        )}
        {stalled && (
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
            ⚠️ Stalled
          </span>
        )}
      </div>
      {item.stage === 're_engagement' && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
          <p>
            <span className="font-medium">Lost reason: </span>
            {item.lostReason || 'No reason recorded'}
          </p>
          <p className="mt-1">
            {item.reengagementAttempts ?? 0} contact attempts
            {item.reengagementLastContactAt
              ? ` · Last: ${formatFollowUpDate(item.reengagementLastContactAt)}`
              : ''}
          </p>
        </div>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3 shrink-0" />
        <span className="truncate">{item.propertyLocation}</span>
      </p>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {getInitials(item.assignedTo)}
          </span>
          <span className="truncate text-xs text-muted-foreground">{item.assignedTo}</span>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onCardClick()
          }}
          variant="outline"
          className="rounded-full"
        >
          {item.stage === 're_engagement' ? 'Re-contact →' : 'View Details →'}
        </Button>
      </div>
      </div>
    </div>
  )
}

function SalesListTable({
  items,
  onRowClick,
  emptyVariant,
  activeStage,
  searchTerm,
}: {
  items: SalesDeal[]
  onRowClick: (id: string) => void
  emptyVariant: EmptyVariant
  activeStage: SalesStage | null
  searchTerm: string
}) {
  if (items.length === 0) {
    return (
      <SalesEmptyState variant={emptyVariant} stage={activeStage} searchTerm={searchTerm} />
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[950px] w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[200px]">Buyer</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[220px]">Property</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[140px]">Price</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[150px]">Stage</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[100px]">Priority</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[120px]">Assigned</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[110px]">Last Activity</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[90px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const stalled = item.daysInStage > 14
            const isLost = item.stage === 'lost'
            const isClosed = item.stage === 'closed'
            return (
              <tr
                key={item.id}
                onClick={() => onRowClick(item.id)}
                className={cn(
                  'h-16 cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                  item.priority === 'urgent' && 'border-l-4 border-l-red-500',
                  stalled && 'bg-amber-50/40',
                  isLost && 'bg-red-50/20 opacity-50',
                  isClosed && 'opacity-60',
                )}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {getInitials(item.buyerName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.buyerName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.buyerPhone}</p>
                      <Badge variant="blue" className="mt-0.5">
                        {buyerTypeLabel(item.buyerType)}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-3">
                    {item.photos[0] ? (
                      <img
                        src={item.photos[0]}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="size-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium">{item.propertyTitle}</p>
                      <Badge variant="default" className="mt-0.5 capitalize">
                        {item.propertyType}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <p className="font-bold text-primary">{formatPrice(item.propertyPrice)}</p>
                  {item.agreedPrice != null && (
                    <p className="text-xs font-medium text-green-700">
                      Agreed: {formatPrice(item.agreedPrice)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className={cn('size-2.5 shrink-0 rounded-full', getSalesStageColor(item.stage))} />
                    {getSalesStageLabel(item.stage)}
                  </span>
                  <DaysInStageText days={item.daysInStage} />
                  {item.stage === 're_engagement' && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      Follow-up: {formatFollowUpDate(item.reengagementFollowUpAt)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <TablePriorityCell priority={item.priority} />
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                      {getInitials(item.assignedTo)}
                    </span>
                    <span className="truncate text-sm">{item.assignedTo}</span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="text-sm text-muted-foreground">
                    {formatTimeAgo(item.lastActivityAt)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRowClick(item.id)
                    }}
                  >
                    {item.stage === 're_engagement' ? 'Re-contact →' : 'View →'}
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SalesGrid({
  items,
  onCardClick,
  emptyVariant,
  activeStage,
  searchTerm,
  phoneCounts,
}: {
  items: SalesDeal[]
  onCardClick: (id: string) => void
  emptyVariant: EmptyVariant
  activeStage: SalesStage | null
  searchTerm: string
  phoneCounts: Map<string, number>
}) {
  if (items.length === 0) {
    return (
      <SalesEmptyState variant={emptyVariant} stage={activeStage} searchTerm={searchTerm} />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <SalesDealCard
          key={item.id}
          item={item}
          multiDealCount={phoneCounts.get(item.buyerPhone.replace(/\D/g, ''))}
          onCardClick={() => onCardClick(item.id)}
        />
      ))}
    </div>
  )
}

export function SalesPipelinePage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeStage = getActiveStageFromPath(pathname)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView)
  const [deals, setDeals] = useState<SalesDeal[]>([])

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    persistView(mode)
  }, [])

  const loadDeals = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const session = readAdminSession()
    if (!session?.accessToken) {
      setDeals([])
      setLoadError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }
    try {
      const result = await listAdminSalesDeals(session.accessToken, { sort: 'newest' })
      setDeals(result.data)
    } catch (error) {
      setDeals([])
      setLoadError(error instanceof Error ? error.message : 'Unable to load sales deals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDeals()
  }, [loadDeals])

  const stageCounts = useMemo(() => getSalesStageCounts(deals), [deals])

  const phoneCounts = useMemo(() => activeDealsByPhone(deals), [deals])

  const filtered = useMemo(() => {
    let list = activeStage ? deals.filter((d) => d.stage === activeStage) : deals
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (d) =>
          d.propertyTitle.toLowerCase().includes(q) ||
          d.buyerName.toLowerCase().includes(q) ||
          d.propertyLocation.toLowerCase().includes(q),
      )
    }
    return sortDeals(list)
  }, [deals, search, activeStage])

  const emptyVariant = useMemo((): EmptyVariant => {
    if (search.trim()) return 'search'
    if (deals.length === 0) return 'all'
    return 'stage'
  }, [search, deals.length])

  const displayCount = useMemo(() => {
    if (loading) {
      return activeStage ? (stageCounts[activeStage] ?? 0) : (stageCounts.all ?? 0)
    }
    return filtered.length
  }, [loading, activeStage, stageCounts, filtered.length])

  const handleDealClick = useCallback(
    (id: string) => {
      navigate(`/admin/sales/${id}`)
    },
    [navigate],
  )

  const searchTerm = search.trim()

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Sales Pipeline</h1>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {displayCount}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search buyers, properties…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-input py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex rounded-md border border-border">
            <Button
              type="button"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              className="rounded-r-none"
              onClick={() => handleViewChange('grid')}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>
            <Button
              type="button"
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              className="rounded-l-none"
              onClick={() => handleViewChange('list')}
              aria-label="List view"
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
          <AlertCircle className="size-14 text-destructive" />
          <p className="text-sm font-medium text-foreground">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void loadDeals()}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        viewMode === 'grid' ? <GridSkeleton /> : <ListSkeleton />
      ) : viewMode === 'grid' ? (
        <SalesGrid
          items={filtered}
          phoneCounts={phoneCounts}
          activeStage={activeStage}
          emptyVariant={emptyVariant}
          searchTerm={searchTerm}
          onCardClick={handleDealClick}
        />
      ) : (
        <SalesListTable
          items={filtered}
          activeStage={activeStage}
          emptyVariant={emptyVariant}
          searchTerm={searchTerm}
          onRowClick={handleDealClick}
        />
      )}
    </div>
  )
}
