import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { AlertCircle, Building2, LayoutGrid, List, MapPin, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  formatPrice,
  getStageColor,
  getStageCounts,
  getStageLabel,
  type Acquisition,
  type AcquisitionPriority,
  type AcquisitionStage,
  listAdminAcquisitions,
} from '@/api/adminAcquisitions'
import { readAdminSession } from '@/api/admin'
import { getPropertyTypeLabel } from '@/domain/properties'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'

const ALL_ROUTE = '/admin/acquisition/all'
const VIEW_STORAGE_KEY = 'builtglory-acquisition-view'

const ROUTE_STAGE_MAP: Record<string, AcquisitionStage> = {
  '/admin/acquisition/pending': 'pending_review',
  '/admin/acquisition/inspection': 'site_inspection',
  '/admin/acquisition/valuation': 'valuation',
  '/admin/acquisition/negotiation': 'negotiation',
  '/admin/acquisition/token': 'token_to_seller',
  '/admin/acquisition/documentation': 'documentation',
  '/admin/acquisition/payout': 'seller_payout',
  '/admin/acquisition/acquired': 'acquired',
  '/admin/acquisition/rejected': 'rejected',
  '/admin/acquisition/on-hold': 'on_hold',
}

function getActiveStageFromPath(pathname: string): AcquisitionStage | null {
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

const PRIORITY_ORDER: Record<AcquisitionPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
}

function sortAcquisitions(items: Acquisition[]): Acquisition[] {
  return [...items].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (priorityDiff !== 0) {
      return priorityDiff
    }
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

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
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

function EmptyAcquisitions({ stage }: { stage: AcquisitionStage | null }) {
  const stageLabel = stage ? getStageLabel(stage) : null
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <Building2 className="size-16 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">
        {stageLabel ? `No ${stageLabel} properties` : 'No acquisitions'}
      </p>
      {stageLabel ? (
        <p className="text-sm text-muted-foreground">Properties in this stage will appear here</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Accepted sell requests and submitted listings will appear here automatically.
        </p>
      )}
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

function TablePriorityCell({ priority }: { priority: AcquisitionPriority }) {
  if (priority === 'urgent') {
    return <Badge variant="red">Urgent</Badge>
  }
  if (priority === 'high') {
    return <Badge variant="orange">High</Badge>
  }
  return <span className="text-sm text-muted-foreground">—</span>
}

function StageBadge({ stage }: { stage: AcquisitionStage }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 shrink-0 rounded-full', getStageColor(stage))} />
      <span className="text-xs font-medium text-foreground">{getStageLabel(stage)}</span>
    </span>
  )
}

function PriorityBadge({ priority }: { priority: AcquisitionPriority }) {
  if (priority === 'urgent') {
    return <Badge variant="red">Urgent</Badge>
  }
  if (priority === 'high') {
    return <Badge variant="orange">High</Badge>
  }
  return null
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

function AcquisitionCard({
  item,
  onCardClick,
}: {
  item: Acquisition
  onCardClick: () => void
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
          <Badge variant="default" className="capitalize">
            {getPropertyTypeLabel(item.propertyType)}
          </Badge>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-background/90 px-2.5 py-1 shadow-sm backdrop-blur">
          <StageBadge stage={item.stage} />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/10">
              {getInitials(item.sellerName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{item.sellerName}</p>
              <p className="truncate text-xs text-muted-foreground">{item.referenceId}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {formatTimeAgo(item.lastActivityAt)}
          </span>
        </div>

        <div className="mt-4">
          <p className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{item.propertyTitle}</p>
          <p className="mt-1 text-xl font-bold tracking-tight text-primary">{formatPrice(item.askingPrice)}</p>
        </div>

        <div className="mt-3 grid gap-2 rounded-xl bg-muted/40 p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Asking Price</span>
            <span className="font-medium">{formatPrice(item.askingPrice)}</span>
          </div>
          {item.builtgloryOffer != null && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Builtglory Offer</span>
              <span className="font-semibold text-green-700">{formatPrice(item.builtgloryOffer)}</span>
            </div>
          )}
          {item.agreedPrice != null && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Agreed</span>
              <span className="font-semibold text-green-700">{formatPrice(item.agreedPrice)}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <DaysInStageChip days={item.daysInStage} />
          {stalled && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
              ⚠️ Stalled
            </span>
          )}
        </div>
        {item.stage === 'on_hold' && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-medium">Hold reason: </span>
            {item.onHoldReason || 'No reason recorded'}
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
            variant="outline"
            className="rounded-full"
            onClick={(e) => {
              e.stopPropagation()
              onCardClick()
            }}
          >
            {item.stage === 'on_hold' ? 'Resume →' : 'View Details →'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function AcquisitionListTable({
  items,
  onRowClick,
  activeStage,
}: {
  items: Acquisition[]
  onRowClick: (id: string) => void
  activeStage: AcquisitionStage | null
}) {
  if (items.length === 0) {
    return <EmptyAcquisitions stage={activeStage} />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[900px] w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[220px]">Property</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[160px]">Seller</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[130px]">Asking Price</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[140px]">Stage</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[100px]">Priority</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[120px]">Assigned</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[110px]">Last Activity</th>
            <th className="sticky top-0 z-10 bg-muted px-4 py-3 w-[90px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const stalled = item.daysInStage > 14
            const isRejected = item.stage === 'rejected'
            return (
              <tr
                key={item.id}
                onClick={() => onRowClick(item.id)}
                className={cn(
                  'h-16 cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                  item.priority === 'urgent' && 'border-l-4 border-l-red-500',
                  stalled && 'bg-amber-50/40',
                  isRejected && 'opacity-60',
                )}
              >
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
                        {getPropertyTypeLabel(item.propertyType)}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                      {getInitials(item.sellerName)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium">{item.sellerName}</p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{item.sellerPhone}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <p className="font-bold text-primary">{formatPrice(item.askingPrice)}</p>
                  {item.builtgloryOffer != null && (
                    <p className="text-xs text-muted-foreground">
                      Offer: {formatPrice(item.builtgloryOffer)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className={cn('size-2.5 shrink-0 rounded-full', getStageColor(item.stage))} />
                    {getStageLabel(item.stage)}
                  </span>
                  <DaysInStageText days={item.daysInStage} />
                  {item.stage === 'on_hold' && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      Hold reason: {item.onHoldReason || 'No reason recorded'}
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
                    {item.stage === 'on_hold' ? 'Resume →' : 'View →'}
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

function AcquisitionGrid({
  items,
  onCardClick,
  activeStage,
}: {
  items: Acquisition[]
  onCardClick: (id: string) => void
  activeStage: AcquisitionStage | null
}) {
  if (items.length === 0) {
    return <EmptyAcquisitions stage={activeStage} />
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <AcquisitionCard
          key={item.id}
          item={item}
          onCardClick={() => onCardClick(item.id)}
        />
      ))}
    </div>
  )
}

export function AcquisitionPipelinePage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const activeStage = getActiveStageFromPath(pathname)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView)

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    persistView(mode)
  }, [])
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([])

  const loadAcquisitions = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setAcquisitions([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminAcquisitions(session.accessToken, {
        limit: 100,
        sort: 'newest',
      })
      setAcquisitions(result.data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load acquisitions.')
      setAcquisitions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadAcquisitions()
    }, 0)
    return () => clearTimeout(t)
  }, [loadAcquisitions, pathname])

  const stageCounts = useMemo(() => getStageCounts(acquisitions), [acquisitions])

  const filtered = useMemo(() => {
    let list = activeStage ? acquisitions.filter((a) => a.stage === activeStage) : acquisitions
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (a) =>
          a.propertyTitle.toLowerCase().includes(q) ||
          a.sellerName.toLowerCase().includes(q) ||
          a.propertyLocation.toLowerCase().includes(q),
      )
    }
    return sortAcquisitions(list)
  }, [acquisitions, search, activeStage])

  const displayCount = useMemo(() => {
    if (loading) {
      return activeStage ? (stageCounts[activeStage] ?? 0) : (stageCounts.all ?? 0)
    }
    return filtered.length
  }, [loading, activeStage, stageCounts, filtered.length])

  const handleCardClick = useCallback(
    (id: string) => {
      navigate(`/admin/acquisition/${id}`)
    },
    [navigate],
  )

  const showGrid = viewMode === 'grid'

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Acquisition Pipeline</h1>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {displayCount}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search properties, sellers…"
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

      {loadError && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-4" />
            {loadError}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadAcquisitions()}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        viewMode === 'grid' ? <GridSkeleton /> : <ListSkeleton />
      ) : showGrid ? (
        <AcquisitionGrid
          items={filtered}
          activeStage={activeStage}
          onCardClick={handleCardClick}
        />
      ) : (
        <AcquisitionListTable
          items={filtered}
          activeStage={activeStage}
          onRowClick={handleCardClick}
        />
      )}
    </div>
  )
}
