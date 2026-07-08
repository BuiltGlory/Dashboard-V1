import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import * as XLSX from 'xlsx'
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Clock,
  FilterX,
  Heart,
  Home,
  LayoutGrid,
  Leaf,
  List,
  MapPin,
  Search,
  SearchX,
  Star,
  Store,
  Trees,
  CheckCircle,
  FileUp,
  MoreVertical,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AMENITIES_BY_TYPE,
  formatPrice,
  getPropertyTypeLabel,
  getSourceLabel,
  getStatusBadgeColor,
  normalizePropertyTypeKey,
  type Property,
  type PropertySource,
  type PropertyStatus,
  type PropertyType,
} from '@/domain/properties'
import { readAdminSession } from '@/api/admin'
import { getDashboardOptions, type DashboardOptions } from '@/api/adminAppConfig'
import {
  bulkUploadAdminProperties,
  createAdminProperty,
  deleteAdminProperty,
  getAdminProperty,
  getAdminPropertyTemplate,
  listAdminPropertyImportJobs,
  listAdminProperties,
  permanentlyDeleteAdminProperty,
  restoreAdminProperty,
  updateAdminProperty,
  updateAdminPropertyStatus,
  type AdminPropertyPayload,
  type PropertyImportJob,
  type PropertyTemplateField,
  type PropertyTemplateMode,
  type PropertyTemplateRow,
} from '@/api/adminProperties'
import { cn } from '@/lib/utils'

type ViewMode = 'grid' | 'list'
type PageTab = 'all' | 'add' | 'upload' | 'featured' | 'upcoming' | 'templates'

/** Page-local visibility flag (mock may not define this yet). */
type PropertyRow = Property & { isVisibleOnApp: boolean }

function enrichProperty(p: Property): PropertyRow {
  const ext = p as Property & { isVisibleOnApp?: boolean }
  return {
    ...p,
    isVisibleOnApp:
      typeof ext.isVisibleOnApp === 'boolean'
        ? ext.isVisibleOnApp
        : p.status === 'available',
  }
}

function isShownOnApp(p: PropertyRow): boolean {
  return p.status === 'available' && p.isVisibleOnApp
}

const VIEW_STORAGE_KEY = 'builtglory-properties-view'
const FEATURED_MAX = 20

function isLaunchDatePassed(p: PropertyRow, todayIso: string) {
  return !!(p.isUpcoming && p.launchDate && p.launchDate.slice(0, 10) < todayIso)
}

type StoredImportProperty = {
  id: string
  title: string
  type: PropertyType
  price: number
  status: PropertyStatus
}

type DeleteConfirmState = {
  property: PropertyRow
  mode: 'default' | 'sold' | 'active_deals'
} | null

function formatImportDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

const LIST_PAGE_SIZES = [20, 50, 100] as const
const GRID_LOAD_CHUNK = 12

function hasActiveDeals(property: PropertyRow) {
  return property.enquiries > 0 || property.visits > 0
}

const ROUTE_TAB_MAP: Record<string, PageTab> = {
  '/admin/properties/all': 'all',
  '/admin/properties/add': 'add',
  '/admin/properties/upload': 'upload',
  '/admin/properties/featured': 'featured',
  '/admin/properties/upcoming': 'upcoming',
  '/admin/properties/templates': 'templates',
}

const ALL_TYPES: { value: PropertyType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'plot', label: 'Plot' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'organic_home', label: 'Organic Home' },
  { value: '3d_printing', label: '3D Printing' },
  { value: 'fractional', label: 'Fractional' },
  { value: 'ceo_mansion', label: 'CEO Mansion' },
  { value: 'holiday_home', label: 'Holiday Home' },
  { value: 'land', label: 'Land' },
  { value: 'farmhouse', label: 'Farmhouse' },
  { value: 'nri', label: 'NRI' },
  { value: 'interior', label: 'Interior' },
  { value: 'villa', label: 'Villa' },
]

const ALL_STATUSES: { value: PropertyStatus | ''; label: string }[] = [
  { value: '', label: 'All Status' },
  { value: 'available', label: 'Available' },
  { value: 'reserved', label: 'Paused' },
  { value: 'sold', label: 'Sold' },
  { value: 'under_construction', label: 'Under Construction' },
  { value: 'draft', label: 'Draft' },
]

const TYPE_OPTIONS: { type: PropertyType; icon: typeof Building2 }[] = [
  { type: 'plot', icon: MapPin },
  { type: 'apartment', icon: Building2 },
  { type: 'residential', icon: Home },
  { type: 'commercial', icon: Store },
  { type: 'organic_home', icon: Leaf },
  { type: '3d_printing', icon: Building2 },
  { type: 'fractional', icon: Building2 },
  { type: 'ceo_mansion', icon: Home },
  { type: 'holiday_home', icon: Home },
  { type: 'land', icon: Trees },
  { type: 'farmhouse', icon: Trees },
  { type: 'nri', icon: Building2 },
  { type: 'interior', icon: Home },
]

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

function formatAddedDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function importJobToStoredProperty(job: PropertyImportJob, fallbackType: PropertyType = 'plot'): StoredImportProperty {
  return {
    id: job.referenceId,
    title: `${job.rowsAccepted} accepted rows from ${job.fileName}`,
    type: fallbackType,
    price: 0,
    status: job.status === 'rejected' || job.status === 'failed' ? 'draft' : 'available',
  }
}

function getStatusOverlayClass(status: PropertyStatus) {
  switch (status) {
    case 'available':
      return 'bg-green-600 text-white'
    case 'reserved':
      return 'bg-orange-600 text-white'
    case 'sold':
      return 'bg-gray-600 text-white'
    case 'under_construction':
      return 'bg-blue-600 text-white'
    case 'draft':
      return 'bg-yellow-500 text-yellow-950'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getStatusLabel(status: PropertyStatus) {
  return ALL_STATUSES.find((s) => s.value === status)?.label ?? status
}

function getSourceOverlayClass(source: PropertySource) {
  switch (source) {
    case 'acquired':
      return 'bg-purple-600 text-white'
    case 'manual':
      return 'bg-blue-600 text-white'
    case 'bulk_upload':
      return 'bg-teal-600 text-white'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function getSourceShortLabel(source: PropertySource) {
  if (source === 'bulk_upload') return 'Bulk'
  return getSourceLabel(source)
}

function sortProperties(items: PropertyRow[]): PropertyRow[] {
  return [...items].sort((a, b) => {
    if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1
    return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  })
}

function getSpecsRow(p: Property): string {
  const s = p.specs
  if (p.type === 'apartment' || p.type === 'nri') {
    const parts = [s.bhk, s.builtUpArea ? `${s.builtUpArea} sqft` : null, s.floor ? `Floor ${s.floor}` : null]
    return parts.filter(Boolean).join(' • ')
  }
  if (p.type === 'plot' || p.type === 'land') {
    const parts = [
      s.plotArea ? `${s.plotArea} sqft` : null,
      s.plotDimension,
    ]
    return parts.filter(Boolean).join(' • ')
  }
  if (p.type === 'commercial') {
    const parts = [
      s.builtUpArea ? `${s.builtUpArea} sqft` : null,
      s.subType,
    ]
    return parts.filter(Boolean).join(' • ')
  }
  if (s.builtUpArea) return `${s.builtUpArea} sqft`
  if (s.plotArea) return `${s.plotArea} sqft plot`
  return '—'
}

function getKeySpec(p: Property): string {
  const s = p.specs
  if (p.type === 'apartment' || p.type === 'nri') return s.bhk ?? '—'
  if (p.type === 'plot' || p.type === 'land') {
    return s.plotArea ? `${s.plotArea} sqft` : '—'
  }
  if (s.builtUpArea) return `${s.builtUpArea} sqft`
  return '—'
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-xl bg-muted" />
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

function PropertyPhoto({
  property,
  className,
}: {
  property: Property
  className?: string
}) {
  const src = property.coverPhoto ?? property.photos[0]
  if (src) {
    return <img src={src} alt="" className={className} />
  }
  return (
    <div className={cn('flex items-center justify-center bg-muted', className)}>
      <Building2 className="size-8 text-muted-foreground" />
    </div>
  )
}

function ShowOnAppToggle({
  property,
  onToggle,
  onToast,
  compact,
}: {
  property: PropertyRow
  onToggle: (id: string, visible: boolean) => void
  onToast: (message: string) => void
  compact?: boolean
}) {
  const on = isShownOnApp(property)
  const isDraft = property.status === 'draft'
  const isSold = property.status === 'sold'
  const noPrice = property.price <= 0
  const disabled = isDraft || isSold || noPrice
  const tooltip = isDraft
    ? 'Publish property first to show on app'
    : isSold
      ? 'Sold properties cannot be shown on app'
      : noPrice
        ? 'Add price first'
        : undefined

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (disabled) return
    const next = e.target.checked
    if (next) {
      const hasPhotos =
        property.photos.some(Boolean) || Boolean(property.coverPhoto)
      if (!hasPhotos) {
        onToast('Property has no photos — add photos for better visibility')
      }
    }
    onToggle(property.id, next)
    onToast(
      next ? 'Property visible on app' : 'Property hidden from app',
    )
  }

  return (
    <div
      className={cn('flex items-center gap-2', compact && 'justify-center')}
      onClick={(e) => e.stopPropagation()}
      title={tooltip}
    >
      {!compact && (
        <span className="text-xs text-muted-foreground">{on ? 'On App' : 'Off'}</span>
      )}
      <label
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        title={tooltip}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={on}
          disabled={disabled}
          onChange={handleChange}
          aria-label={on ? 'On App' : 'Off'}
        />
        <span
          className={cn(
            'absolute inset-0 rounded-full transition-colors',
            on ? 'bg-green-600' : 'bg-muted-foreground/40',
            disabled && 'bg-muted-foreground/25',
          )}
        />
        <span
          className={cn(
            'absolute left-0.5 size-4 rounded-full bg-white shadow transition-transform',
            on && 'translate-x-4',
          )}
        />
      </label>
    </div>
  )
}

function PropertyDeleteDialog({
  state,
  onCancel,
  onConfirm,
}: {
  state: DeleteConfirmState
  onCancel: () => void
  onConfirm: (deleteAnyway?: boolean) => void
}) {
  if (!state) return null
  const { property, mode } = state
  const isActiveDeals = mode === 'active_deals'
  const isSold = mode === 'sold'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-foreground">
          Delete {property.title}?
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          This will move the property to Deleted Properties. You can restore it later.
        </p>
        {property.savedCount > 0 && (
          <p className="mt-2 text-sm text-orange-800">
            {property.savedCount} users have saved this. They will be notified of removal.
          </p>
        )}
        {isSold && (
          <p className="mt-2 text-sm text-amber-700">
            This is a sold property. Delete record anyway?
          </p>
        )}
        {isActiveDeals && (
          <p className="mt-2 text-sm text-amber-700">
            Property has active deals (enquiries or visits on record).
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(isActiveDeals || isSold)}
          >
            {isActiveDeals || isSold ? 'Delete anyway' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PropertyActionsMenu({
  property,
  onEdit,
  onPatch,
  onRequestDelete,
}: {
  property: PropertyRow
  onEdit: () => void
  onPatch: (id: string, patch: Partial<PropertyRow>) => void
  onRequestDelete: (property: PropertyRow) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const run = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  const isPaused =
    property.status === 'reserved' || property.status === 'under_construction'
  const canPublish = property.status === 'draft' || isPaused

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="size-8 shrink-0 p-0"
        aria-label="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-md border border-border bg-card py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => run(onEdit)}
          >
            Edit
          </button>
          {!property.isFeatured ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() => onPatch(property.id, { isFeatured: true }))
              }
            >
              Mark as Featured
            </button>
          ) : (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() => onPatch(property.id, { isFeatured: false }))
              }
            >
              Remove from Featured
            </button>
          )}
          {!property.isUpcoming ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() => onPatch(property.id, { isUpcoming: true }))
              }
            >
              Mark as Upcoming
            </button>
          ) : (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() => onPatch(property.id, { isUpcoming: false }))
              }
            >
              Remove from Upcoming
            </button>
          )}
          <div className="my-1 border-t border-border" />
          {property.status === 'available' && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() => onPatch(property.id, { status: 'reserved' }))
              }
            >
              Pause Listing
            </button>
          )}
          {canPublish && (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() =>
                run(() =>
                  onPatch(property.id, {
                    status: 'available',
                    isVisibleOnApp: true,
                  }),
                )
              }
            >
              Publish
            </button>
          )}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() =>
              run(() =>
                onPatch(property.id, {
                  status: 'sold',
                  soldAt: new Date().toISOString(),
                  isFeatured: false,
                  isUpcoming: false,
                }),
              )
            }
          >
            Mark as Sold
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted"
            onClick={() => run(() => onRequestDelete(property))}
          >
            Delete Property
          </button>
        </div>
      )}
    </div>
  )
}

function PropertyCard({
  property,
  onView,
  onToggleApp,
  onToast,
  onEdit,
  onPatch,
  onRequestDelete,
}: {
  property: PropertyRow
  onView: () => void
  onToggleApp: (id: string, visible: boolean) => void
  onToast: (message: string) => void
  onEdit: () => void
  onPatch: (id: string, patch: Partial<PropertyRow>) => void
  onRequestDelete: (property: PropertyRow) => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onView()
        }
      }}
      className={cn(
        'cursor-pointer overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md',
        property.status === 'sold' && 'opacity-60',
      )}
    >
      <div className="relative h-48">
        <PropertyPhoto property={property} className="size-full rounded-t-xl object-cover" />
        <span
          className={cn(
            'absolute left-2 top-2 rounded px-2 py-0.5 text-xs font-medium',
            getStatusOverlayClass(property.status),
          )}
        >
          {getStatusLabel(property.status)}
        </span>
        <div className="absolute right-2 top-2 flex items-start gap-1">
          <div className="flex flex-col gap-1">
            {property.isFeatured && (
              <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-medium text-amber-950">
                ⭐ Featured
              </span>
            )}
            {property.isUpcoming && (
              <span className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                🕐 Upcoming
              </span>
            )}
          </div>
          <PropertyActionsMenu
            property={property}
            onEdit={onEdit}
            onPatch={onPatch}
            onRequestDelete={onRequestDelete}
          />
        </div>
        <span
          className={cn(
            'absolute bottom-2 left-2 rounded px-2 py-0.5 text-xs font-medium',
            getSourceOverlayClass(property.source),
          )}
        >
          {getSourceShortLabel(property.source)}
        </span>
      </div>
      <div className="p-4">
        <p className="line-clamp-2 font-semibold text-foreground">{property.title}</p>
        <p className="text-lg font-bold text-primary">{formatPrice(property.price)}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant="default">{getPropertyTypeLabel(property.type)}</Badge>
          <span className="text-xs text-muted-foreground">{property.locality}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{getSpecsRow(property)}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          👁️ {property.views} · 💬 {property.enquiries} · 📅 {property.visits} · 🔄{' '}
          {property.compareCount} · <Heart className="inline size-3" /> {property.savedCount}
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <ShowOnAppToggle
            property={property}
            onToggle={onToggleApp}
            onToast={onToast}
          />
          <span className="text-xs text-muted-foreground">{formatAddedDate(property.addedAt)}</span>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-2 w-full"
          onClick={(e) => {
            e.stopPropagation()
            onView()
          }}
        >
          View →
        </Button>
      </div>
    </div>
  )
}

function PropertyListTable({
  items,
  onRowClick,
  onToggleApp,
  onToast,
  onEdit,
  onPatch,
  onRequestDelete,
  enableBulkSelect,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  showUpcomingActions,
  onMoveToAvailable,
  todayIso,
}: {
  items: PropertyRow[]
  onRowClick: (id: string) => void
  onToggleApp: (id: string, visible: boolean) => void
  onToast: (message: string) => void
  onEdit: (id: string) => void
  onPatch: (id: string, patch: Partial<PropertyRow>) => void
  onRequestDelete: (property: PropertyRow) => void
  enableBulkSelect?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectAll?: () => void
  showUpcomingActions?: boolean
  onMoveToAvailable?: (property: PropertyRow) => void
  todayIso?: string
}) {
  const allSelected =
    enableBulkSelect &&
    items.length > 0 &&
    items.every((p) => selectedIds?.has(p.id))

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[1260px] w-full border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {enableBulkSelect && (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  aria-label="Select all"
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
            )}
            <th className="px-4 py-3 w-[220px]">Property</th>
            <th className="px-4 py-3 w-[160px]">Location</th>
            <th className="px-4 py-3 w-[130px]">Price</th>
            <th className="px-4 py-3 w-[150px]">Type & Specs</th>
            <th className="px-4 py-3 w-[120px]">Status</th>
            <th className="px-4 py-3 w-[90px]">On App</th>
            <th className="px-4 py-3 w-[100px]">Saves</th>
            <th className="px-4 py-3 w-[100px]">Comparisons</th>
            <th className="px-4 py-3 w-[120px]">Performance</th>
            <th className="px-4 py-3 w-[100px]">Added</th>
            <th className="px-4 py-3 w-[140px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const launchPassed =
              todayIso != null && isLaunchDatePassed(p, todayIso)
            return (
            <tr
              key={p.id}
              onClick={() => onRowClick(p.id)}
              className={cn(
                'h-16 cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                p.status === 'draft' && 'bg-yellow-50/30',
                p.status === 'sold' && 'opacity-60',
                p.isFeatured && 'border-l-4 border-l-yellow-400',
                launchPassed && 'bg-orange-50',
                selectedIds?.has(p.id) && 'bg-primary/5',
              )}
            >
              {enableBulkSelect && (
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds?.has(p.id) ?? false}
                    onChange={() => onToggleSelect?.(p.id)}
                    aria-label={`Select ${p.title}`}
                  />
                </td>
              )}
              <td className="px-4 py-2">
                <div className="flex gap-3">
                  <PropertyPhoto property={p} className="size-12 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium">{p.title}</p>
                    <Badge variant="default" className="mt-0.5">
                      {getPropertyTypeLabel(p.type)}
                    </Badge>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.isFeatured && (
                        <span className="text-[10px] text-amber-600">⭐ Featured</span>
                      )}
                      {p.isUpcoming && (
                        <span className="text-[10px] text-blue-600">🕐 Upcoming</span>
                      )}
                      {launchPassed && (
                        <span className="rounded bg-orange-100 px-1 py-0.5 text-[10px] font-medium text-orange-800">
                          Launch passed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-sm">
                <p>
                  {p.locality}, {p.city}
                </p>
                <p className="text-xs text-muted-foreground">{p.pincode}</p>
              </td>
              <td className="px-4 py-2">
                <p className="font-bold text-primary">{formatPrice(p.price)}</p>
                {p.price <= 0 && (
                  <span className="mt-0.5 inline-flex rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
                    Price not set
                  </span>
                )}
                {p.isNegotiable && (
                  <span className="text-xs text-muted-foreground">Negotiable</span>
                )}
              </td>
              <td className="px-4 py-2 text-sm">
                <p>{getPropertyTypeLabel(p.type)}</p>
                <p className="text-xs text-muted-foreground">{getKeySpec(p)}</p>
              </td>
              <td className="px-4 py-2">
                <span
                  className={cn(
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                    getStatusBadgeColor(p.status),
                  )}
                >
                  {getStatusLabel(p.status)}
                </span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {getSourceShortLabel(p.source)}
                </p>
              </td>
              <td className="px-4 py-2">
                <ShowOnAppToggle
                  property={p}
                  onToggle={onToggleApp}
                  onToast={onToast}
                  compact
                />
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Heart className="size-3.5" /> {p.savedCount}
                </span>
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">
                🔄 {p.compareCount}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                <p>👁️ {p.views}</p>
                <p>💬 {p.enquiries}</p>
                <p>📅 {p.visits}</p>
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">
                {formatTimeAgo(p.addedAt)}
              </td>
              <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap items-center gap-1">
                  {showUpcomingActions && launchPassed && onMoveToAvailable && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => onMoveToAvailable(p)}
                    >
                      Move to Available
                    </Button>
                  )}
                  <Button type="button" size="sm" onClick={() => onRowClick(p.id)}>
                    View →
                  </Button>
                  <PropertyActionsMenu
                    property={p}
                    onEdit={() => onEdit(p.id)}
                    onPatch={onPatch}
                    onRequestDelete={onRequestDelete}
                  />
                </div>
              </td>
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

const FORM_STATUSES: PropertyStatus[] = [
  'available',
  'reserved',
  'under_construction',
  'draft',
]

const MASTER_SHEET_AMENITIES: Partial<Record<PropertyType, string[]>> = {
  apartment: [
    'Pooja Room',
    'Store Room',
    'Lift',
    'Covered Parking',
    'Power Backup',
    '24Hr Security',
    'CCTV',
    'Intercom',
    'Gym',
    'Swimming Pool',
    'Clubhouse',
    'Children Play Area',
    'Visitor Parking',
  ],
  plot: [
    'Gated Community',
    'Black Top Road',
    'Street Lights',
    'Drainage',
    'Water Connection',
    'EB Connection',
    'Park/Green Area',
    'Security',
    'Avenue Trees',
    'Compound Wall',
    'CCTV at Entry',
    'Underground Drainage',
    'Children Play Area',
    '24Hr Security',
  ],
  residential: [
    'Covered Car Parking',
    'Two-Wheeler Parking',
    'Garden/Lawn',
    'Terrace Access',
    'Borewell',
    'Municipal Water',
    'Overhead Tank',
    'Compound Wall',
    'CCTV',
    'Security Cabin',
    'Power Backup',
    'Solar Power',
    'Piped Gas',
    'Rainwater Harvesting',
    'Servant Room',
    'Store Room',
  ],
  commercial: [
    'Lift/Freight Elevator',
    'Dedicated Parking',
    'Power Backup',
    '24Hr Security',
    'CCTV',
    'Access Control',
    'Reception/Lobby',
    'Fire Safety/NOC',
    'Internet Ready',
    'Central AC Provision',
    'Loading Bay',
    'Signage Provision',
    'Conference Room',
    'Generator Backup',
    'EV Charging',
  ],
}

function generatePropertyId() {
  return `PROP-${String(Date.now()).slice(-6)}`
}

function countFilled(values: (string | boolean | undefined)[]) {
  const total = values.length
  const filled = values.filter((v) =>
    typeof v === 'boolean' ? v : String(v ?? '').trim() !== '',
  ).length
  return { filled, total }
}

const inputClass =
  'h-9 w-full rounded-md border border-border bg-input px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
const labelClass = 'text-sm font-medium text-foreground'

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelClass}>
        {label}
        {required ? ' *' : ''}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function FormInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  onBlur,
  hasError,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  onBlur?: () => void
  hasError?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={cn(inputClass, hasError && 'border-red-500 ring-1 ring-red-500')}
    />
  )
}

function FormSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function FormTextarea({
  value,
  onChange,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

function SpecGrid({
  fields,
  specs,
  setSpec,
}: {
  fields: {
    key: string
    label: string
    required?: boolean
    type?: 'select'
    options?: string[]
    placeholder?: string
    inputType?: string
  }[]
  specs: Record<string, string>
  setSpec: (key: string, value: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <FormField key={f.key} label={f.label} required={f.required}>
          {f.type === 'select' && f.options ? (
            <FormSelect
              value={specs[f.key] ?? ''}
              onChange={(v) => setSpec(f.key, v)}
              options={f.options}
            />
          ) : (
            <FormInput
              type={f.inputType ?? 'text'}
              value={specs[f.key] ?? ''}
              onChange={(v) => setSpec(f.key, v)}
              placeholder={f.placeholder}
            />
          )}
        </FormField>
      ))}
    </div>
  )
}

function FormAccordion({
  title,
  completion,
  defaultOpen = false,
  children,
}: {
  title: string
  completion: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/40"
      >
        <span className="text-sm font-semibold text-foreground">
          {title}{' '}
          <span className="font-normal text-muted-foreground">({completion})</span>
        </span>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-4 border-t border-border px-4 py-4">{children}</div>}
    </div>
  )
}

const YES_NO = ['Yes', 'No']
const YES_NO_PARTIAL = ['Yes', 'No', 'Partially']
const FACING = ['North', 'South', 'East', 'West']
const FURNISHING = ['Full', 'Semi', 'Unfurnished']
const BHK_APT = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK']
const BHK_RES = ['2 BHK', '3 BHK', '4 BHK', '5 BHK']
const OC_CC = ['Received', 'Applied', 'No']
const PARKING_APT = ['Covered', 'Stilt', 'Open']
const TRANSACTION = ['New', 'Resale', 'Ready to Move']
const APPROVAL_PLOT = ['CMDA', 'DTCP', 'TNHB', 'Panchayat']
const TITLE_PLOT = ['Freehold', 'Patta', 'Leasehold']
const COMM_SUB = ['Shop', 'Office', 'Showroom', 'Clinic']
const COMM_PARKING = ['Dedicated', 'Shared', 'None']
const INTERIOR_STYLE = ['Modern', 'Classic', 'Contemporary']
const BUDGET_RANGE = ['Budget', 'Standard', 'Premium', 'Luxury']

type PropertyOptionConfig = NonNullable<NonNullable<DashboardOptions['properties']>['options']>

function configuredOptions(
  options: PropertyOptionConfig | undefined,
  key: string,
  fallback: string[],
) {
  const configured = options?.[key]
  return configured?.length ? configured : fallback
}

function getTypeSpecFields(type: PropertyType, optionConfig?: PropertyOptionConfig) {
  const yesNo = configuredOptions(optionConfig, 'yesNo', YES_NO)
  const yesNoPartial = configuredOptions(optionConfig, 'yesNoPartial', YES_NO_PARTIAL)
  const facing = configuredOptions(optionConfig, 'facing', FACING)
  const furnishing = configuredOptions(optionConfig, 'furnishing', FURNISHING)
  const apartmentBhk = configuredOptions(optionConfig, 'apartmentBhk', BHK_APT)
  const residentialBhk = configuredOptions(optionConfig, 'residentialBhk', BHK_RES)
  const apartmentParking = configuredOptions(optionConfig, 'apartmentParking', PARKING_APT)
  const ocCcStatus = configuredOptions(optionConfig, 'ocCcStatus', OC_CC)
  const plotApproval = configuredOptions(optionConfig, 'plotApproval', APPROVAL_PLOT)
  const plotTitle = configuredOptions(optionConfig, 'plotTitle', TITLE_PLOT)
  const commercialSubType = configuredOptions(optionConfig, 'commercialSubType', COMM_SUB)
  const commercialParking = configuredOptions(optionConfig, 'commercialParking', COMM_PARKING)
  const interiorStyle = configuredOptions(optionConfig, 'interiorStyle', INTERIOR_STYLE)
  const budgetRange = configuredOptions(optionConfig, 'budgetRange', BUDGET_RANGE)

  switch (type) {
    case 'apartment':
      return [
        { key: 'builderName', label: 'Builder Name' },
        { key: 'towerName', label: 'Tower Name' },
        { key: 'unitNumber', label: 'Unit Number' },
        { key: 'bhk', label: 'BHK Type', type: 'select' as const, options: apartmentBhk },
        { key: 'superBuiltUp', label: 'Super Built-up Area (sqft)', inputType: 'number' },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'carpetArea', label: 'Carpet Area (sqft)', inputType: 'number' },
        { key: 'uds', label: 'UDS (sqft)', inputType: 'number' },
        { key: 'bedrooms', label: 'Bedrooms count', inputType: 'number' },
        { key: 'bathrooms', label: 'Bathrooms count', inputType: 'number' },
        { key: 'balcony', label: 'Balcony count', inputType: 'number' },
        { key: 'floor', label: 'Floor Number' },
        { key: 'totalFloors', label: 'Total Floors', inputType: 'number' },
        { key: 'flatsOnFloor', label: 'Flats on Floor', inputType: 'number' },
        { key: 'facing', label: 'Facing', type: 'select' as const, options: facing },
        { key: 'vastuCompliant', label: 'Vastu Compliant', type: 'select' as const, options: yesNo },
        { key: 'age', label: 'Age of Property (years)' },
        { key: 'furnishing', label: 'Furnishing', type: 'select' as const, options: furnishing },
        { key: 'parkingType', label: 'Parking Type', type: 'select' as const, options: apartmentParking },
        { key: 'parkingSlots', label: 'Parking Slots count', inputType: 'number' },
        { key: 'ocStatus', label: 'OC/CC Status', type: 'select' as const, options: ocCcStatus },
        { key: 'reraNumber', label: 'RERA Number' },
      ]
    case 'plot':
      return [
        { key: 'layoutName', label: 'Layout Name' },
        { key: 'totalPlotsInLayout', label: 'Total Plots in Layout', inputType: 'number' },
        { key: 'plotNumber', label: 'Plot Number' },
        { key: 'plotArea', label: 'Plot Area (sqft)', required: true, inputType: 'number' },
        { key: 'plotDimension', label: 'Plot Dimension (L×W)', placeholder: 'e.g. 30×40' },
        { key: 'facing', label: 'Facing Direction', type: 'select' as const, options: facing },
        { key: 'roadWidth', label: 'Road Width (ft)', inputType: 'number' },
        { key: 'approvalType', label: 'Approval Type', type: 'select' as const, options: plotApproval },
        { key: 'reraNumber', label: 'RERA Number' },
        { key: 'cornerPlot', label: 'Corner Plot', type: 'select' as const, options: yesNo },
        { key: 'loanApproved', label: 'Loan Approved', type: 'select' as const, options: yesNo },
        { key: 'titleType', label: 'Title Type', type: 'select' as const, options: plotTitle },
        { key: 'pattaAvailable', label: 'Patta Available', type: 'select' as const, options: yesNo },
        { key: 'boundaryMarked', label: 'Boundary Marked', type: 'select' as const, options: yesNo },
        { key: 'vastuCompliant', label: 'Vastu Compliant', type: 'select' as const, options: yesNo },
      ]
    case 'residential':
      return [
        { key: 'bhk', label: 'BHK Configuration', type: 'select' as const, options: residentialBhk },
        { key: 'landArea', label: 'Land Area (sqft)', inputType: 'number' },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'carpetArea', label: 'Carpet Area (sqft)', inputType: 'number' },
        { key: 'totalFloors', label: 'Number of Floors', inputType: 'number' },
        { key: 'bedrooms', label: 'Bedrooms count', inputType: 'number' },
        { key: 'bathrooms', label: 'Bathrooms count', inputType: 'number' },
        { key: 'balconyTerrace', label: 'Balcony/Terrace', type: 'select' as const, options: ['Balcony', 'Terrace', 'Both'] },
        { key: 'facing', label: 'Facing Direction', type: 'select' as const, options: facing },
        { key: 'vastuCompliant', label: 'Vastu Compliant', type: 'select' as const, options: yesNoPartial },
        { key: 'parkingType', label: 'Parking Type', type: 'select' as const, options: ['Covered', 'Open', 'Stilt'] },
        { key: 'parkingCount', label: 'Parking Count', inputType: 'number' },
        { key: 'age', label: 'Age of Property (years)' },
        { key: 'furnishing', label: 'Furnishing', type: 'select' as const, options: furnishing },
        { key: 'poojaRoom', label: 'Pooja Room', type: 'select' as const, options: yesNo },
        { key: 'titleType', label: 'Title Type', type: 'select' as const, options: ['Freehold', 'Patta'] },
        { key: 'approvalType', label: 'Approval', type: 'select' as const, options: ['CMDA', 'DTCP', 'Panchayat'] },
        { key: 'ocStatus', label: 'OC/CC Status', type: 'select' as const, options: ocCcStatus },
      ]
    case 'commercial':
      return [
        { key: 'subType', label: 'Property Sub-Type', type: 'select' as const, options: commercialSubType },
        { key: 'suitableFor', label: 'Suitable For' },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'carpetArea', label: 'Carpet Area (sqft)', inputType: 'number' },
        { key: 'floor', label: 'Floor Number' },
        { key: 'frontageWidth', label: 'Frontage Width (ft)', inputType: 'number' },
        { key: 'ceilingHeight', label: 'Ceiling Height (ft)', inputType: 'number' },
        { key: 'powerLoad', label: 'Power Load', placeholder: 'e.g. 10kW / 3-phase' },
        { key: 'washroomsCount', label: 'Washrooms Count', inputType: 'number' },
        { key: 'liftCount', label: 'Lift Count', inputType: 'number' },
        { key: 'parking', label: 'Parking', type: 'select' as const, options: commercialParking },
        { key: 'reraNumber', label: 'RERA Number' },
        { key: 'ocStatus', label: 'OC/CC Status', type: 'select' as const, options: ocCcStatus },
      ]
    case 'ceo_mansion':
      return [
        { key: 'bhk', label: 'BHK Configuration', type: 'select' as const, options: residentialBhk },
        { key: 'landArea', label: 'Land Area (sqft)', inputType: 'number' },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'bedrooms', label: 'Bedrooms count', inputType: 'number' },
        { key: 'bathrooms', label: 'Bathrooms count', inputType: 'number' },
        { key: 'totalFloors', label: 'Floors count', inputType: 'number' },
        { key: 'facing', label: 'Facing Direction', type: 'select' as const, options: facing },
        { key: 'age', label: 'Age of Property' },
        { key: 'furnishing', label: 'Furnishing Status', type: 'select' as const, options: furnishing },
        { key: 'parkingCount', label: 'Parking count', inputType: 'number' },
        { key: 'privatePool', label: 'Private Pool', type: 'select' as const, options: yesNo },
        { key: 'homeTheatre', label: 'Home Theatre', type: 'select' as const, options: yesNo },
        { key: 'staffQuarters', label: 'Staff Quarters', type: 'select' as const, options: yesNo },
        { key: 'smartHome', label: 'Smart Home', type: 'select' as const, options: yesNo },
        { key: 'reraNumber', label: 'RERA Number' },
      ]
    case 'holiday_home':
      return [
        { key: 'bhk', label: 'BHK Configuration', type: 'select' as const, options: residentialBhk },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'totalFloors', label: 'Floors', inputType: 'number' },
        { key: 'facing', label: 'Facing', type: 'select' as const, options: facing },
        { key: 'furnishing', label: 'Furnishing', type: 'select' as const, options: furnishing },
        { key: 'parkingCount', label: 'Parking', inputType: 'number' },
        { key: 'privatePool', label: 'Private Pool', type: 'select' as const, options: yesNo },
        { key: 'distanceBeachHills', label: 'Distance from Beach/Hills' },
        { key: 'nearestCity', label: 'Nearest City' },
        { key: 'rentalYield', label: 'Rental Yield % (optional)', inputType: 'number' },
      ]
    case 'farmhouse':
      return [
        { key: 'landAreaAcres', label: 'Land Area (acres)', inputType: 'number' },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'bedrooms', label: 'Bedrooms', inputType: 'number' },
        { key: 'bathrooms', label: 'Bathrooms', inputType: 'number' },
        { key: 'borewell', label: 'Borewell', type: 'select' as const, options: yesNo },
        { key: 'farmLand', label: 'Farm Land', type: 'select' as const, options: yesNo },
        { key: 'fruitTrees', label: 'Fruit Trees', type: 'select' as const, options: yesNo },
        { key: 'distanceFromCity', label: 'Distance from City (km)', inputType: 'number' },
      ]
    case 'organic_home':
      return [
        { key: 'bhk', label: 'BHK Configuration', type: 'select' as const, options: residentialBhk },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'solarPanels', label: 'Solar Panels', type: 'select' as const, options: yesNo },
        { key: 'rainwaterHarvesting', label: 'Rainwater Harvesting', type: 'select' as const, options: yesNo },
        { key: 'organicGarden', label: 'Organic Garden', type: 'select' as const, options: yesNo },
        { key: 'compostPit', label: 'Compost Pit', type: 'select' as const, options: yesNo },
        { key: 'naturalVentilation', label: 'Natural Ventilation', type: 'select' as const, options: yesNo },
      ]
    case '3d_printing':
      return [
        { key: 'bhk', label: 'BHK Configuration', type: 'select' as const, options: residentialBhk },
        { key: 'builtUpArea', label: 'Built-up Area (sqft)', inputType: 'number' },
        { key: 'printTechnology', label: 'Print Technology' },
        { key: 'estimatedCompletion', label: 'Estimated Completion' },
        { key: 'structuralWarranty', label: 'Structural Warranty' },
      ]
    case 'fractional':
      return [
        { key: 'totalPropertyValue', label: 'Total Property Value (₹)', inputType: 'number' },
        { key: 'fractionSize', label: 'Fraction Size %', placeholder: 'e.g. 10%' },
        { key: 'minInvestment', label: 'Min Investment (₹)', inputType: 'number' },
        { key: 'expectedReturns', label: 'Expected Returns %', inputType: 'number' },
        { key: 'lockInPeriod', label: 'Lock-in Period (months)', inputType: 'number' },
        { key: 'propertyManager', label: 'Property Manager' },
      ]
    case 'land':
      return [
        { key: 'totalArea', label: 'Total Area (acres/sqft)' },
        { key: 'surveyNumber', label: 'Survey Number' },
        { key: 'zoneType', label: 'Zone Type', type: 'select' as const, options: ['Residential', 'Commercial', 'Agricultural'] },
        { key: 'approval', label: 'Approval', type: 'select' as const, options: yesNo },
        { key: 'roadAccess', label: 'Road Access', type: 'select' as const, options: yesNo },
        { key: 'waterSource', label: 'Water Source' },
      ]
    case 'nri':
      return [
        { key: 'nriPropertyType', label: 'Property Type (sub)' },
        { key: 'nriFriendly', label: 'NRI Friendly', type: 'select' as const, options: yesNo },
        { key: 'femaCompliant', label: 'FEMA Compliant', type: 'select' as const, options: yesNo },
        { key: 'powerOfAttorney', label: 'Power of Attorney', type: 'select' as const, options: yesNo },
        { key: 'nriLoanAvailable', label: 'NRI Loan Available', type: 'select' as const, options: yesNo },
      ]
    case 'interior':
      return [
        { key: 'roomArea', label: 'Room/Area' },
        { key: 'style', label: 'Style', type: 'select' as const, options: interiorStyle },
        { key: 'budgetRange', label: 'Budget Range', type: 'select' as const, options: budgetRange },
        { key: 'timelineWeeks', label: 'Timeline (weeks)', inputType: 'number' },
      ]
    default:
      return []
  }
}

function getAmenityList(type: PropertyType): string[] {
  return MASTER_SHEET_AMENITIES[type] ?? AMENITIES_BY_TYPE[type] ?? []
}

type AddFormFieldKey =
  | 'price'
  | 'propertyId'
  | 'title'
  | 'latitude'
  | 'longitude'
  | 'locality'
  | 'city'
  | 'address'

type AddFormState = {
  setSelectedType: (type: PropertyType | null) => void
  setPropertyId: (value: string) => void
  setTitle: (value: string) => void
  setPrice: (value: string) => void
  setDescription: (value: string) => void
  setStatus: (value: PropertyStatus) => void
  setPossessionMode: (value: 'ready' | 'date') => void
  setPossessionDate: (value: string) => void
  setTransactionType: (value: string) => void
  setAddress: (value: string) => void
  setLocality: (value: string) => void
  setCity: (value: string) => void
  setStateVal: (value: string) => void
  setPincode: (value: string) => void
  setLatitude: (value: string) => void
  setLongitude: (value: string) => void
  setAmenities: (value: string[]) => void
  setPhotoUrls: (value: string[]) => void
  setVideoUrl: (value: string) => void
  setDroneImageUrl: (value: string) => void
  setTour3dUrl: (value: string) => void
  setFloorPlanUrl: (value: string) => void
  setIsFeatured: (value: boolean) => void
  setIsUpcoming: (value: boolean) => void
  setLaunchDate: (value: string) => void
  setIsNegotiable: (value: boolean) => void
  setSpecs: (value: Record<string, string>) => void
  setPricing: (value: {
    salePricePerSqft: string
    maintenancePerMonth: string
    monthlyMaintenance: string
    saleLeasePrice: string
  }) => void
}

function applyPropertyToAddForm(property: Property, form: AddFormState) {
  const possession = String(property.specs.possession ?? '')
  const photoList = [...property.photos]
  if (property.coverPhoto && !photoList.includes(property.coverPhoto)) {
    photoList.unshift(property.coverPhoto)
  }
  const specEntries = Object.entries(property.specs).filter(
    ([key, value]) =>
      value != null &&
      value !== '' &&
      key !== 'transactionType' &&
      key !== 'possession' &&
      key !== 'pricePerSqft' &&
      key !== 'maintenancePerMonth',
  )

  form.setSelectedType(normalizePropertyTypeKey(property.type) ?? property.type)
  form.setPropertyId(property.referenceId)
  form.setTitle(property.title)
  form.setPrice(String(property.price))
  form.setDescription(property.description)
  form.setStatus(property.status)
  if (property.possessionDate) {
    form.setPossessionMode('date')
    form.setPossessionDate(property.possessionDate.slice(0, 10))
  } else if (possession === 'Ready to Move') {
    form.setPossessionMode('ready')
    form.setPossessionDate('')
  } else {
    form.setPossessionMode('ready')
    form.setPossessionDate('')
  }
  form.setTransactionType(String(property.specs.transactionType ?? ''))
  form.setAddress(property.address)
  form.setLocality(property.locality)
  form.setCity(property.city)
  form.setStateVal(property.state)
  form.setPincode(property.pincode)
  form.setLatitude(property.latitude != null ? String(property.latitude) : '')
  form.setLongitude(property.longitude != null ? String(property.longitude) : '')
  form.setAmenities(property.amenities)
  form.setPhotoUrls([...photoList, ...Array(10).fill('')].slice(0, 10) as string[])
  form.setVideoUrl(property.videoUrl ?? '')
  form.setDroneImageUrl(property.droneImageUrl ?? '')
  form.setTour3dUrl(property.tour3dUrl ?? '')
  form.setFloorPlanUrl(property.floorPlanUrl ?? '')
  form.setIsFeatured(property.isFeatured)
  form.setIsUpcoming(property.isUpcoming)
  form.setLaunchDate(property.launchDate?.slice(0, 10) ?? '')
  form.setIsNegotiable(property.isNegotiable)
  form.setSpecs(Object.fromEntries(specEntries.map(([key, value]) => [key, String(value)])))
  form.setPricing({
    salePricePerSqft:
      property.specs.pricePerSqft != null ? String(property.specs.pricePerSqft) : '',
    maintenancePerMonth:
      property.specs.maintenancePerMonth != null
        ? String(property.specs.maintenancePerMonth)
        : '',
    monthlyMaintenance: '',
    saleLeasePrice: '',
  })
}

function AddPropertyForm({
  existingProperties,
  editPropertyId,
  onCreated,
  onSuccess,
}: {
  existingProperties: PropertyRow[]
  editPropertyId?: string | null
  onCreated: (property: Property) => void
  onSuccess: (message: string) => void
}) {
  const navigate = useNavigate()
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [selectedType, setSelectedType] = useState<PropertyType | null>(null)
  const [propertyId, setPropertyId] = useState(generatePropertyId)
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AddFormFieldKey, string>>>({})
  const [similarTitle, setSimilarTitle] = useState<{ title: string; id: string } | null>(null)
  const [duplicateIdMatch, setDuplicateIdMatch] = useState<{ id: string } | null>(null)
  const fieldRefs = useRef<Partial<Record<AddFormFieldKey, HTMLDivElement | null>>>({})
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<PropertyStatus>('available')
  const [possessionMode, setPossessionMode] = useState<'ready' | 'date'>('ready')
  const [possessionDate, setPossessionDate] = useState('')
  const [transactionType, setTransactionType] = useState('')
  const [address, setAddress] = useState('')
  const [locality, setLocality] = useState('')
  const [city, setCity] = useState('Bangalore')
  const [stateVal, setStateVal] = useState('Karnataka')
  const [pincode, setPincode] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [amenities, setAmenities] = useState<string[]>([])
  const [photoUrls, setPhotoUrls] = useState(() => Array(10).fill(''))
  const [videoUrl, setVideoUrl] = useState('')
  const [droneImageUrl, setDroneImageUrl] = useState('')
  const [tour3dUrl, setTour3dUrl] = useState('')
  const [floorPlanUrl, setFloorPlanUrl] = useState('')
  const [isFeatured, setIsFeatured] = useState(false)
  const [isUpcoming, setIsUpcoming] = useState(false)
  const [launchDate, setLaunchDate] = useState('')
  const [isNegotiable, setIsNegotiable] = useState(false)
  const [propertyOptionConfig, setPropertyOptionConfig] = useState<PropertyOptionConfig | undefined>()
  const [specs, setSpecs] = useState<Record<string, string>>({})
  const [pricing, setPricing] = useState({
    salePricePerSqft: '',
    maintenancePerMonth: '',
    monthlyMaintenance: '',
    saleLeasePrice: '',
  })

  const setSpec = useCallback((key: string, value: string) => {
    setSpecs((s) => ({ ...s, [key]: value }))
  }, [])

  const resetTypeFields = useCallback((type: PropertyType) => {
    setSelectedType(type)
    setSpecs({})
    setAmenities([])
    setPricing({
      salePricePerSqft: '',
      maintenancePerMonth: '',
      monthlyMaintenance: '',
      saleLeasePrice: '',
    })
  }, [])

  const possessionValue =
    possessionMode === 'ready' ? 'Ready to Move' : possessionDate.trim()

  const basicCompletion = useMemo(
    () =>
      countFilled([
        propertyId,
        title,
        price,
        description,
        transactionType,
      ]),
    [propertyId, title, price, description, transactionType],
  )

  const locationCompletion = useMemo(
    () =>
      countFilled([locality, city, stateVal, pincode, address]),
    [locality, city, stateVal, pincode, address],
  )

  useEffect(() => {
    let cancelled = false
    void getDashboardOptions().then((options) => {
      if (!cancelled) setPropertyOptionConfig(options?.properties?.options)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!editPropertyId) {
      setEditingRecordId(null)
      setLoadingEdit(false)
      return
    }
    const session = readAdminSession()
    if (!session?.accessToken) {
      onSuccess('Login required to edit property')
      return
    }
    let cancelled = false
    setLoadingEdit(true)
    getAdminProperty(session.accessToken, editPropertyId)
      .then((property) => {
        if (cancelled) return
        setEditingRecordId(property.id)
        applyPropertyToAddForm(property, {
          setSelectedType,
          setPropertyId,
          setTitle,
          setPrice,
          setDescription,
          setStatus,
          setPossessionMode,
          setPossessionDate,
          setTransactionType,
          setAddress,
          setLocality,
          setCity,
          setStateVal,
          setPincode,
          setLatitude,
          setLongitude,
          setAmenities,
          setPhotoUrls,
          setVideoUrl,
          setDroneImageUrl,
          setTour3dUrl,
          setFloorPlanUrl,
          setIsFeatured,
          setIsUpcoming,
          setLaunchDate,
          setIsNegotiable,
          setSpecs,
          setPricing,
        })
      })
      .catch((error) => {
        if (!cancelled) {
          onSuccess(error instanceof Error ? error.message : 'Failed to load property for editing')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false)
      })
    return () => {
      cancelled = true
    }
  }, [editPropertyId, onSuccess])

  const specFields = selectedType ? getTypeSpecFields(selectedType, propertyOptionConfig) : []
  const specCompletion = useMemo(() => {
    if (!specFields.length) return { filled: 0, total: 0 }
    const vals = specFields.map((f) => specs[f.key] ?? '')
    return countFilled(vals)
  }, [specFields, specs])

  const amenityList = selectedType ? getAmenityList(selectedType) : []
  const amenityCompletionLabel = `${amenities.length}/${amenityList.length} selected`

  const mediaCompletion = useMemo(
    () => countFilled([...photoUrls, videoUrl, droneImageUrl, tour3dUrl, floorPlanUrl]),
    [photoUrls, videoUrl, droneImageUrl, tour3dUrl, floorPlanUrl],
  )

  const pricingCompletion = useMemo(() => {
    const keys: (keyof typeof pricing)[] = ['salePricePerSqft']
    if (selectedType === 'apartment') keys.push('maintenancePerMonth')
    if (selectedType === 'commercial') {
      keys.push('monthlyMaintenance', 'saleLeasePrice')
    }
    return countFilled(keys.map((k) => pricing[k]))
  }, [pricing, selectedType])

  const settingsCompletion = useMemo(
    () =>
      countFilled([
        status,
        isFeatured,
        isUpcoming,
        isUpcoming ? launchDate : true,
      ]),
    [status, isFeatured, isUpcoming, launchDate],
  )

  const plotAreaRequired =
    selectedType === 'plot' && !(specs.plotArea ?? '').trim()

  const priceNum = Number(price)
  const hasBlockingErrors = !!(
    fieldErrors.price ||
    fieldErrors.propertyId ||
    fieldErrors.latitude ||
    fieldErrors.longitude
  )

  const setFieldError = (key: AddFormFieldKey, message?: string) => {
    setFieldErrors((prev) => {
      const next = { ...prev }
      if (message) next[key] = message
      else delete next[key]
      return next
    })
  }

  const validatePrice = () => {
    const n = Number(price)
    if (!price.trim() || !Number.isFinite(n) || n <= 0) {
      setFieldError('price', 'Price cannot be 0 or negative')
      return false
    }
    setFieldError('price')
    return true
  }

  const validatePropertyId = () => {
    const entered = propertyId.trim()
    if (!entered) {
      setDuplicateIdMatch(null)
      setFieldError('propertyId')
      return true
    }
    const exists = existingProperties.find(
      (p) => p.referenceId === entered && p.id !== editingRecordId,
    )
    if (exists) {
      setDuplicateIdMatch({ id: exists.id })
      setFieldError('propertyId', 'ID already exists')
      return false
    }
    setDuplicateIdMatch(null)
    setFieldError('propertyId')
    return true
  }

  const validateTitleSimilar = () => {
    const entered = title.trim()
    if (!entered) {
      setSimilarTitle(null)
      return
    }
    const similar = existingProperties.find(
      (p) => p.title.toLowerCase() === entered.toLowerCase(),
    )
    setSimilarTitle(similar ? { title: similar.title, id: similar.id } : null)
  }

  const validateLatitude = () => {
    if (!latitude.trim()) {
      setFieldError('latitude')
      return true
    }
    const lat = Number(latitude)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setFieldError('latitude', 'Latitude must be between -90 and 90')
      return false
    }
    setFieldError('latitude')
    return true
  }

  const validateLongitude = () => {
    if (!longitude.trim()) {
      setFieldError('longitude')
      return true
    }
    const lng = Number(longitude)
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setFieldError('longitude', 'Longitude must be between -180 and 180')
      return false
    }
    setFieldError('longitude')
    return true
  }

  const validateRequiredForSave = (): boolean => {
    const missing: AddFormFieldKey[] = []
    if (!title.trim()) {
      setFieldError('title', 'Required')
      missing.push('title')
    } else setFieldError('title')
    if (!validatePrice()) missing.push('price')
    if (!locality.trim()) {
      setFieldError('locality', 'Required')
      missing.push('locality')
    } else setFieldError('locality')
    if (!city.trim()) {
      setFieldError('city', 'Required')
      missing.push('city')
    } else setFieldError('city')
    if (!validatePropertyId()) missing.push('propertyId')
    if (!validateLatitude()) missing.push('latitude')
    if (!validateLongitude()) missing.push('longitude')
    if (missing.length > 0) {
      onSuccess('Please fill required fields')
      const first = missing[0]
      fieldRefs.current[first]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  const canSave =
    selectedType != null &&
    !hasBlockingErrors &&
    !duplicateIdMatch &&
    title.trim() &&
    priceNum > 0 &&
    locality.trim() &&
    city.trim() &&
    stateVal.trim() &&
    pincode.trim() &&
    !plotAreaRequired

  const toggleAmenity = (name: string) => {
    setAmenities((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name],
    )
  }

  const handleSave = async (asDraft: boolean) => {
    if (!selectedType) return
    if (!validateRequiredForSave() || hasBlockingErrors || duplicateIdMatch) return
    if (!canSave) return
    const finalStatus: PropertyStatus = asDraft ? 'draft' : status
    const session = readAdminSession()
    if (!session?.accessToken) {
      onSuccess('Login required to save property')
      return
    }

    const numericSpecs = Object.fromEntries(
      Object.entries({ ...specs, transactionType, possession: possessionValue })
        .filter(([, value]) => value !== '')
        .map(([key, value]) => {
          const numericKeys = new Set([
            'builtUpArea',
            'carpetArea',
            'plotArea',
            'totalFloors',
            'roadWidth',
            'superBuiltUp',
            'uds',
            'bedrooms',
            'bathrooms',
            'balcony',
            'maintenancePerMonth',
            'pricePerSqft',
            'frontageWidth',
            'ceilingHeight',
            'timelineWeeks',
            'expectedReturns',
            'lockInPeriod',
          ])
          return [key, numericKeys.has(key) ? Number(value) : value]
        }),
    )
    const resolvedType = resolvePropertyTypeForSave(selectedType, specs)
    const payload: AdminPropertyPayload = {
      title: title.trim(),
      description,
      type: resolvedType,
      status: finalStatus,
      source: 'manual',
      isFeatured,
      isUpcoming,
      launchDate: isUpcoming && launchDate ? launchDate : null,
      possessionDate: possessionMode === 'date' && possessionDate ? possessionDate : null,
      address: {
        line1: address,
        locality,
        city,
        state: stateVal,
        pincode,
        latitude: latitude.trim() ? Number(latitude) : undefined,
        longitude: longitude.trim() ? Number(longitude) : undefined,
      },
      price: priceNum,
      isNegotiable,
      specs: {
        ...numericSpecs,
        pricePerSqft: pricing.salePricePerSqft ? Number(pricing.salePricePerSqft) : undefined,
        maintenancePerMonth: pricing.maintenancePerMonth ? Number(pricing.maintenancePerMonth) : undefined,
      },
      amenities,
      media: {
        photos: photoUrls.map((url) => url.trim()).filter(Boolean),
        coverPhoto: photoUrls.map((url) => url.trim()).find(Boolean) ?? undefined,
        videoUrl: videoUrl.trim() || undefined,
        droneImageUrl: droneImageUrl.trim() || undefined,
        tour3dUrl: tour3dUrl.trim() || undefined,
        floorPlanUrl: floorPlanUrl.trim() || undefined,
      },
      highlights: [],
    }

    try {
      if (editingRecordId) {
        const updated = await updateAdminProperty(session.accessToken, editingRecordId, payload)
        onCreated(updated)
        onSuccess(asDraft ? 'Property saved as draft' : 'Property updated')
        navigate(`/admin/properties/${editingRecordId}`)
        return
      }
      const created = await createAdminProperty(session.accessToken, payload)
      onCreated(created)
      onSuccess(asDraft ? 'Property saved as draft' : 'Property saved')
      navigate('/admin/properties/all')
    } catch (error) {
      onSuccess(error instanceof Error ? error.message : 'Failed to save property')
    }
  }

  const showMaintenancePricing =
    selectedType === 'apartment' || selectedType === 'residential' || selectedType === 'plot'
  const showCommercialPricing = selectedType === 'commercial'

  return (
    <div className="mx-auto max-w-[800px] space-y-6">
      {loadingEdit ? (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          Loading property…
        </div>
      ) : (
        <>
      <div>
        <h2 className="text-lg font-semibold">
          {editingRecordId ? 'Edit Property' : 'Property Type'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {editingRecordId
            ? 'Update the property details below and save your changes.'
            : 'Select a type — the form shows master sheet fields for that type'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map(({ type, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => resetTypeFields(type)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-colors',
                selectedType === type
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50',
              )}
            >
              <Icon className="size-6 text-primary" />
              {getPropertyTypeLabel(type)}
            </button>
          ))}
        </div>
      </div>

      {selectedType && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Selected type:</span>
            <Badge variant="default">{getPropertyTypeLabel(selectedType)}</Badge>
          </div>
          <FormAccordion
            title="Section 1: Basic Info"
            completion={`${basicCompletion.filled}/${basicCompletion.total} filled`}
            defaultOpen
          >
            <div ref={(el) => { fieldRefs.current.propertyId = el }}>
            <FormField label="Property ID">
              <FormInput
                value={propertyId}
                onChange={setPropertyId}
                onBlur={validatePropertyId}
                hasError={!!fieldErrors.propertyId}
              />
              {fieldErrors.propertyId && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.propertyId}</p>
              )}
              {duplicateIdMatch && (
                <p className="mt-1 text-xs text-red-600">
                  ID already exists{' '}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => navigate(`/admin/properties/${duplicateIdMatch.id}`)}
                  >
                    View existing →
                  </button>
                </p>
              )}
            </FormField>
            </div>
            <div ref={(el) => { fieldRefs.current.title = el }}>
            <FormField label="Property Title" required>
              <FormInput
                value={title}
                onChange={setTitle}
                onBlur={validateTitleSimilar}
                hasError={!!fieldErrors.title}
              />
              {similarTitle && (
                <p className="mt-1 text-xs text-amber-700">
                  ⚠️ Similar title exists: {similarTitle.title}{' '}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => navigate(`/admin/properties/${similarTitle.id}`)}
                  >
                    View →
                  </button>
                </p>
              )}
            </FormField>
            </div>
            <div ref={(el) => { fieldRefs.current.price = el }}>
            <FormField label="Price (₹)" required>
              <FormInput
                type="number"
                value={price}
                onChange={setPrice}
                onBlur={validatePrice}
                hasError={!!fieldErrors.price}
              />
              {fieldErrors.price && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.price}</p>
              )}
            </FormField>
            </div>
            <FormField label="Description">
              <FormTextarea value={description} onChange={setDescription} />
            </FormField>
            <FormField label="Transaction Type">
              <FormSelect
                value={transactionType}
                onChange={setTransactionType}
                options={TRANSACTION}
              />
            </FormField>
            <FormField label="Possession">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="possession"
                      checked={possessionMode === 'ready'}
                      onChange={() => setPossessionMode('ready')}
                    />
                    Ready to Move
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="possession"
                      checked={possessionMode === 'date'}
                      onChange={() => setPossessionMode('date')}
                    />
                    Specific date
                  </label>
                </div>
                {possessionMode === 'date' && (
                  <FormInput
                    value={possessionDate}
                    onChange={setPossessionDate}
                    placeholder="e.g. December 2026"
                  />
                )}
              </div>
            </FormField>
          </FormAccordion>

          <FormAccordion
            title="Section 2: Location"
            completion={`${locationCompletion.filled}/${locationCompletion.total} filled`}
            defaultOpen
          >
            <div ref={(el) => { fieldRefs.current.address = el }}>
            <FormField label="Address">
              <FormInput value={address} onChange={setAddress} hasError={!!fieldErrors.address} />
            </FormField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div ref={(el) => { fieldRefs.current.locality = el }}>
              <FormField label="Locality" required>
                <FormInput value={locality} onChange={setLocality} hasError={!!fieldErrors.locality} />
              </FormField>
              </div>
              <div ref={(el) => { fieldRefs.current.city = el }}>
              <FormField label="City" required>
                <FormInput value={city} onChange={setCity} hasError={!!fieldErrors.city} />
              </FormField>
              </div>
              <FormField label="State" required>
                <FormInput value={stateVal} onChange={setStateVal} />
              </FormField>
              <FormField label="Pincode" required>
                <FormInput value={pincode} onChange={setPincode} />
              </FormField>
              <div ref={(el) => { fieldRefs.current.latitude = el }}>
              <FormField label="Latitude (optional)">
                <FormInput
                  value={latitude}
                  onChange={setLatitude}
                  type="number"
                  onBlur={validateLatitude}
                  hasError={!!fieldErrors.latitude}
                />
                {fieldErrors.latitude && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.latitude}</p>
                )}
              </FormField>
              </div>
              <div ref={(el) => { fieldRefs.current.longitude = el }}>
              <FormField label="Longitude (optional)">
                <FormInput
                  value={longitude}
                  onChange={setLongitude}
                  type="number"
                  onBlur={validateLongitude}
                  hasError={!!fieldErrors.longitude}
                />
                {fieldErrors.longitude && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.longitude}</p>
                )}
              </FormField>
              </div>
            </div>
          </FormAccordion>

          <FormAccordion
            title="Section 3: Specifications"
            completion={
              specFields.length
                ? `${specCompletion.filled}/${specCompletion.total} filled`
                : 'N/A'
            }
          >
            {specFields.length > 0 ? (
              <SpecGrid fields={specFields} specs={specs} setSpec={setSpec} />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No additional specification fields for this type.
              </p>
            )}
          </FormAccordion>

          {amenityList.length > 0 && (
            <FormAccordion
              title="Section 4: Amenities"
              completion={amenityCompletionLabel}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {amenityList.map((a) => (
                  <label
                    key={a}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30"
                  >
                    <input
                      type="checkbox"
                      checked={amenities.includes(a)}
                      onChange={() => toggleAmenity(a)}
                    />
                    {a}
                  </label>
                ))}
              </div>
            </FormAccordion>
          )}

          <FormAccordion
            title="Media & Virtual Tour"
            completion={`${mediaCompletion.filled}/${mediaCompletion.total} filled`}
          >
            <p className="text-sm text-muted-foreground">
              Optional for all types; recommended for NRI properties.
            </p>
            <p className="text-sm font-medium">
              Photos ({photoUrls.filter((u) => u.trim()).length}/10)
            </p>
            {photoUrls.map((url, i) => (
              <FormField key={i} label={`Photo ${i + 1}`}>
                <div className="flex gap-2">
                  <FormInput
                    value={url}
                    onChange={(v) => {
                      const next = [...photoUrls]
                      next[i] = v
                      setPhotoUrls(next)
                    }}
                    placeholder="https://…"
                  />
                  {url.trim() && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = [...photoUrls]
                        next[i] = ''
                        setPhotoUrls(next)
                      }}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </FormField>
            ))}
            <FormField label="Video Walkthrough URL">
              <FormInput value={videoUrl} onChange={setVideoUrl} placeholder="📱 B-04" />
            </FormField>
            <FormField label="Drone View URL">
              <FormInput value={droneImageUrl} onChange={setDroneImageUrl} placeholder="📱 B-08" />
            </FormField>
            <FormField label="3D Tour URL">
              <FormInput value={tour3dUrl} onChange={setTour3dUrl} placeholder="📱 B-07 — NRI essential" />
            </FormField>
            <FormField label="Floor Plan URL">
              <FormInput value={floorPlanUrl} onChange={setFloorPlanUrl} placeholder="📱 B-05" />
            </FormField>
          </FormAccordion>

          <FormAccordion
            title="Section 6: Pricing Details"
            completion={`${pricingCompletion.filled}/${pricingCompletion.total} filled`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Sale Price per sqft">
                <FormInput
                  type="number"
                  value={pricing.salePricePerSqft}
                  onChange={(v) =>
                    setPricing((p) => ({ ...p, salePricePerSqft: v }))
                  }
                />
              </FormField>
              {showMaintenancePricing && (
                <FormField label="Maintenance ₹/month">
                  <FormInput
                    type="number"
                    value={pricing.maintenancePerMonth}
                    onChange={(v) =>
                      setPricing((p) => ({ ...p, maintenancePerMonth: v }))
                    }
                  />
                </FormField>
              )}
              {showCommercialPricing && (
                <>
                  <FormField label="Monthly Maintenance ₹">
                    <FormInput
                      type="number"
                      value={pricing.monthlyMaintenance}
                      onChange={(v) =>
                        setPricing((p) => ({ ...p, monthlyMaintenance: v }))
                      }
                    />
                  </FormField>
                  <FormField label="Sale/Lease Price">
                    <FormInput
                      type="number"
                      value={pricing.saleLeasePrice}
                      onChange={(v) =>
                        setPricing((p) => ({ ...p, saleLeasePrice: v }))
                      }
                    />
                  </FormField>
                </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isNegotiable}
                onChange={(e) => setIsNegotiable(e.target.checked)}
              />
              Price is negotiable
            </label>
          </FormAccordion>

          <FormAccordion
            title="Section 7: Settings"
            completion={`${settingsCompletion.filled}/${settingsCompletion.total} filled`}
          >
            <FormField label="Property Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PropertyStatus)}
                className={inputClass}
              >
                {FORM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {getStatusLabel(s)}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="space-y-3 rounded-lg border border-border p-4">
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>⭐ Mark as Featured</span>
                <input
                  type="checkbox"
                  checked={isFeatured}
                  onChange={(e) => setIsFeatured(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>🕐 Mark as Upcoming</span>
                <input
                  type="checkbox"
                  checked={isUpcoming}
                  onChange={(e) => setIsUpcoming(e.target.checked)}
                />
              </label>
              {isUpcoming && (
                <FormField label="Launch Date">
                  <FormInput
                    type="date"
                    value={launchDate}
                    onChange={setLaunchDate}
                  />
                </FormField>
              )}
            </div>
            {isFeatured && isUpcoming && (
              <p className="text-sm text-orange-600">
                Cannot be featured AND upcoming — pick one before saving.
              </p>
            )}
          </FormAccordion>

          {plotAreaRequired && (
            <p className="text-sm text-destructive">Plot area (sqft) is required for plots.</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              className="flex-1"
              disabled={!canSave || (isFeatured && isUpcoming)}
              onClick={() => handleSave(false)}
            >
              {editingRecordId ? 'Update Property' : 'Save Property'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={!canSave}
              onClick={() => handleSave(true)}
            >
              Save as Draft
            </Button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

const SHEETS = [
  'Plot',
  'Apartment',
  'Residential',
  'Commercial',
  'Organic Home',
  '3D Printing Home',
  'Fractional Ownership',
  'CEO Mansion',
  'Holiday Home',
  'Land & Landbank',
  'Farm House',
  'NRI Services',
  'Interior',
] as const

const SHEET_TYPE: Record<string, PropertyType> = {
  Plot: 'plot',
  Apartment: 'apartment',
  Residential: 'residential',
  Commercial: 'commercial',
  'Organic Home': 'organic_home',
  '3D Printing Home': '3d_printing',
  'Fractional Ownership': 'fractional',
  'CEO Mansion': 'ceo_mansion',
  'Holiday Home': 'holiday_home',
  'Land & Landbank': 'land',
  'Farm House': 'farmhouse',
  'NRI Services': 'nri',
  Interior: 'interior',
}

const BULK_UPLOAD_REQUIRED_FIELDS = ['title', 'type', 'city', 'locality', 'pincode', 'price']
const BULK_UPLOAD_PROPERTY_TYPES = new Set<PropertyType>(Object.values(SHEET_TYPE))
const BULK_UPLOAD_TYPE_ALIASES: Record<string, PropertyType> = {
  flat: 'apartment',
  apartments: 'apartment',
  villa: 'villa',
  villas: 'villa',
  plot: 'plot',
  plots: 'plot',
  land: 'land',
  commercial: 'commercial',
  residential: 'residential',
  interior: 'interior',
}

const PLOT_SPEC_SIGNAL_KEYS = [
  'plotArea',
  'layoutName',
  'plotNumber',
  'plotDimension',
  'totalPlotsInLayout',
  'roadWidth',
  'approvalType',
  'cornerPlot',
  'titleType',
  'boundaryMarked',
  'pattaAvailable',
] as const

function hasPlotSpecSignals(specs: Record<string, string>) {
  return PLOT_SPEC_SIGNAL_KEYS.some((key) => (specs[key] ?? '').trim() !== '')
}

function resolvePropertyTypeForSave(
  selectedType: PropertyType,
  specs: Record<string, string>,
): PropertyType {
  if (hasPlotSpecSignals(specs)) return 'plot'
  return normalizePropertyTypeKey(selectedType) ?? selectedType
}

const CORE_BULK_UPLOAD_TEMPLATE_HEADERS = [
  'referenceId',
  'title',
  'type',
  'city',
  'locality',
  'pincode',
  'price',
  'description',
  'status',
  'source',
  'address',
  'line2',
  'state',
  'landmark',
  'latitude',
  'longitude',
  'isNegotiable',
  'isFeatured',
  'isUpcoming',
  'isVisibleOnApp',
  'launchDate',
  'possessionDate',
  'amenities',
  'highlights',
  'photos',
  'coverPhoto',
  'videoUrl',
  'droneImageUrl',
  'tour3dUrl',
  'floorPlanUrl',
  'advantagesInvestment',
  'advantagesLocation',
  'advantagesConnectivity',
  'nearbyPlaces',
] as const

const PROPERTY_SPEC_TEMPLATE_HEADERS = [
  'transactionType', 'possession', 'bhk', 'bhkConfig', 'subType', 'actualPropertyType', 'propertyType',
  'builtUpArea', 'builtUp', 'superBuiltUp', 'carpetArea', 'plotArea', 'landArea', 'landAreaAcres', 'totalArea', 'totalLandArea', 'mainHouseArea', 'roomArea',
  'areaUnit', 'plotType', 'landType', 'commercialType', 'holidayHomeType', 'underlyingPropertyType', 'nriPropertyType', 'nriSellerType',
  'layoutName', 'plotNumber', 'surveyNumber', 'dimensions', 'plotDimension', 'totalPlotsInLayout', 'roadWidth', 'roadType', 'roadAccess', 'accessibility',
  'facing', 'cornerPlot', 'approvalType', 'approval', 'approvalNumber', 'dtcpApproved', 'cmdaApproved', 'reraNumber', 'pattaAvailable', 'pattaNumber', 'ecAvailable', 'titleType', 'boundaryMarked', 'loanApproved', 'legalIssues', 'legalIssueDetails',
  'waterConnection', 'waterSource', 'ebConnection', 'electricity', 'powerLoad', 'powerBackup', 'solarPanels', 'solarCapacity', 'solarType', 'rainwaterHarvesting', 'evCharging',
  'floor', 'floorNumber', 'floors', 'totalFloors', 'flatsOnFloor', 'unitNumber', 'towerName', 'builderName', 'projectName', 'societyName',
  'bedrooms', 'bathrooms', 'balcony', 'balconies', 'balconyTerrace', 'washrooms', 'washroomsCount', 'cabins', 'meetingRooms', 'pantry', 'servantRoom', 'staffQuarters', 'homeOffice', 'homeTheatre', 'gym', 'wineCellar', 'bar', 'poojaRoom', 'pujaRoom', 'terrace', 'terraceArea',
  'furnishing', 'parking', 'parkingType', 'parkingSlots', 'parkingCount', 'parkingCapacity', 'carParking', 'dedicatedParking', 'lift', 'liftCount', 'liftCapacity', 'elevator', 'loadingBay',
  'age', 'propertyAge', 'possessionStatus', 'ocStatus', 'ocReceived', 'ocCcStatus', 'maintenanceCharges', 'maintenancePerMonth', 'monthlyMaintenance', 'saleLeasePrice', 'pricePerSqft',
  'vastuCompliant', 'compoundWall', 'garden', 'gardenArea', 'swimmingPool', 'privatePool', 'poolType', 'jacuzzi', 'generator', 'generatorBackup', 'security', 'securitySystem',
  'ownershipType', 'khataType', 'khataNumber', 'loanOnProperty', 'revenueVillage', 'taluk', 'naConversion', 'naOrderNumber', 'fencing', 'soilType', 'topography', 'plantation', 'plantationType', 'govtAcquisitionThreat',
  'constructionMaterial', 'greenCertification', 'certificationNumber', 'ventilationType', 'naturalLighting', 'organicGarden', 'compostPit', 'composting', 'constructionYear', 'printTechnology', 'estimatedCompletion', 'structuralWarranty', 'seismicZone', 'energyRating',
  'smartHome', 'smartHomeSystem', 'smartHomeBrand', 'voiceControl', 'autoLighting', 'smartSecurity', 'automationLevel',
  'suitableFor', 'frontageWidth', 'ceilingHeight', 'floorType', 'falseCeiling', 'currentlyLeased', 'tenantName', 'rentalIncome', 'monthlyRentalIncome', 'leaseExpiry', 'rentalYield',
  'propertyLocation', 'totalPropertyValue', 'fractionSize', 'sharePercentage', 'shareValue', 'minInvestment', 'minimumInvestment', 'expectedReturns', 'expectedROI', 'rentalIncomeShare', 'lockInPeriod', 'exitOption', 'buybackGuarantee', 'propertyManager', 'totalUnits', 'unitsAvailable', 'legalStructure',
  'viewType', 'distanceBeachHills', 'distanceFromBangalore', 'distanceFromCity', 'nearestCity', 'nearestAirport', 'rentalPlatform', 'occupancyRate', 'managedProperty', 'managementFee',
  'mainHouseBHK', 'numberOfBuildings', 'borewell', 'borewellDepth', 'borewellYield', 'farmLand', 'fruitTrees', 'cultivated', 'cropType', 'numberOfTrees', 'annualCropIncome', 'caretaker', 'animalHusbandry',
  'countryOfResidence', 'cityOfResidence', 'femaCompliant', 'femaCompliance', 'nriFriendly', 'powerOfAttorney', 'poaHolderName', 'poaHolderPhone', 'poaRegistered', 'tdsAcknowledged', 'taxAdvisor', 'nriLoanAvailable', 'preferredContactTime', 'timeZone', 'inspectionMode', 'virtualTourAvailable', 'currencyPreference', 'paymentMode', 'docsInIndia',
  'expectedStartDate', 'scopeOfWork', 'designStyle', 'style', 'budgetRange', 'colorPreference', 'flooringRequired', 'modularKitchen', 'kitchenStyle', 'timeline', 'timelineWeeks', 'existingFurniture', 'brandPreferences', 'specialRequirements',
] as const

const uniqueTemplateHeaders = (headers: readonly string[]) => [...new Set(headers)]

const BULK_UPLOAD_TEMPLATE_HEADERS = uniqueTemplateHeaders([
  ...CORE_BULK_UPLOAD_TEMPLATE_HEADERS,
  ...PROPERTY_SPEC_TEMPLATE_HEADERS,
]) as readonly string[]

const TEMPLATE_GRID_COLUMNS = [
  'propertyId',
  ...BULK_UPLOAD_TEMPLATE_HEADERS,
] as const

const EDITABLE_TEMPLATE_COLUMNS = new Set(BULK_UPLOAD_TEMPLATE_HEADERS.filter((key) => key !== 'source'))

function buildBulkTemplateSampleRows(): PropertyTemplateRow[] {
  return SHEETS.map((label, index) => {
    const type = SHEET_TYPE[label]
    const amenities = (MASTER_SHEET_AMENITIES[type] ?? AMENITIES_BY_TYPE[type] ?? []).slice(0, 3)
    return {
      referenceId: `PROP-TEMPLATE-${String(index + 1).padStart(2, '0')}`,
      title: `${label} Sample Property`,
      type,
      city: 'Bengaluru',
      locality: 'Central',
      pincode: '560001',
      price: 1000000 + index * 100000,
      description: 'Replace this sample row with real property details',
      status: 'available',
      address: '123 Sample Street',
      line2: '',
      state: 'Karnataka',
      landmark: '',
      latitude: '',
      longitude: '',
      isNegotiable: 'false',
      bhk: type === 'apartment' || type === 'residential' ? '3' : '',
      builtUpArea: type === 'plot' || type === 'land' ? '' : '1200',
      carpetArea: '',
      plotArea: type === 'plot' || type === 'land' ? '2400' : '',
      facing: 'East',
      furnishing: '',
      possession: 'Ready to move',
      transactionType: 'Sale',
      amenities: amenities.join(', '),
      highlights: 'Verified, Prime location',
    }
  })
}

function downloadWorkbook(
  filename: string,
  headers: readonly string[],
  rows: PropertyTemplateRow[],
) {
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: [...headers],
  })
  XLSX.utils.sheet_add_aoa(worksheet, [[...headers]], { origin: 'A1' })
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.max(header.length + 4, 14),
  }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Properties')
  XLSX.writeFile(workbook, filename)
}

function downloadBulkUploadTemplate() {
  downloadWorkbook(
    'builtglory-property-bulk-upload-template.xlsx',
    BULK_UPLOAD_TEMPLATE_HEADERS,
    buildBulkTemplateSampleRows(),
  )
}

type SheetPreviewRow = {
  id: string
  title: string
  price: string
  location: string
  status: string
  type: PropertyType | ''
  hasError: boolean
}

type ImportSheetConfig = {
  label: string
  type: PropertyType
}

type BulkUploadPreview = {
  rows: SheetPreviewRow[]
  countsByType: Partial<Record<PropertyType, number>>
  total: number
  valid: number
  warnings: number
  errors: number
}

type BulkUploadWorkbookRow = Record<string, unknown>

const EMPTY_BULK_UPLOAD_PREVIEW: BulkUploadPreview = {
  rows: [],
  countsByType: {},
  total: 0,
  valid: 0,
  warnings: 0,
  errors: 0,
}

function bulkCellText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeBulkUploadType(value: unknown): PropertyType | '' {
  const normalized = bulkCellText(value).toLowerCase().replace(/[\s-]+/g, '_')
  return (
    normalizePropertyTypeKey(normalized) ??
    BULK_UPLOAD_TYPE_ALIASES[normalized] ??
    (BULK_UPLOAD_PROPERTY_TYPES.has(normalized as PropertyType) ? (normalized as PropertyType) : '')
  )
}

function validateBulkUploadPreviewRow(row: BulkUploadWorkbookRow) {
  const errors: string[] = []
  BULK_UPLOAD_REQUIRED_FIELDS.forEach((field) => {
    if (!bulkCellText(row[field])) errors.push(`${field} is required`)
  })
  if (bulkCellText(row.type) && !normalizeBulkUploadType(row.type)) {
    errors.push('property type is not supported')
  }
  if (bulkCellText(row.pincode) && !/^\d{6}$/.test(bulkCellText(row.pincode))) {
    errors.push('pincode must contain 6 digits')
  }
  if (bulkCellText(row.price) && !(Number(row.price) > 0)) {
    errors.push('price must be positive')
  }
  return errors
}

function workbookRowToPreviewRow(row: BulkUploadWorkbookRow, index: number): SheetPreviewRow {
  const type = normalizeBulkUploadType(row.type)
  const price = Number(row.price)
  const location = [bulkCellText(row.locality), bulkCellText(row.city)].filter(Boolean).join(', ')
  const status = bulkCellText(row.status) || 'available'
  return {
    id: bulkCellText(row.referenceId || row.propertyId || row.id) || `ROW-${index + 2}`,
    title: bulkCellText(row.title) || 'Untitled property',
    price: Number.isFinite(price) && price > 0 ? formatPrice(price) : '-',
    location: location || '-',
    status,
    type,
    hasError: validateBulkUploadPreviewRow(row).length > 0,
  }
}

async function readBulkUploadPreview(file: File): Promise<BulkUploadPreview> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
  if (!worksheet) throw new Error('Uploaded workbook does not contain a worksheet')

  const workbookRows = XLSX.utils
    .sheet_to_json<BulkUploadWorkbookRow>(worksheet, { defval: '', raw: true })
    .filter((row) => Object.values(row).some((value) => bulkCellText(value)))
  const rows = workbookRows.map(workbookRowToPreviewRow)
  const countsByType = rows.reduce<Partial<Record<PropertyType, number>>>((counts, row) => {
    if (!row.type) return counts
    counts[row.type] = (counts[row.type] ?? 0) + 1
    return counts
  }, {})
  const errors = rows.filter((row) => row.hasError).length

  return {
    rows,
    countsByType,
    total: rows.length,
    valid: rows.length - errors,
    warnings: 0,
    errors,
  }
}

function templateValue(row: PropertyTemplateRow, key: string) {
  return String(row[key] ?? '')
}

function templateNumber(row: PropertyTemplateRow, key: string) {
  const value = templateValue(row, key).trim()
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function templateBoolean(row: PropertyTemplateRow, key: string) {
  const value = templateValue(row, key).trim().toLowerCase()
  return value === 'true' || value === 'yes' || value === '1'
}

function templateOptionalBoolean(row: PropertyTemplateRow, key: string) {
  const value = templateValue(row, key).trim()
  return value ? templateBoolean(row, key) : undefined
}

function templateList(row: PropertyTemplateRow, key: string) {
  return templateValue(row, key)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function templateJsonArray(row: PropertyTemplateRow, key: string) {
  const value = templateValue(row, key).trim()
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return value
      .split(';')
      .map((entry) => {
        const [name, type, distance] = entry.split('|').map((part) => part?.trim() ?? '')
        return { name, type, distance }
      })
      .filter((place) => place.name)
  }
}

const TEMPLATE_NUMBER_KEYS = new Set([
  'builtUpArea', 'builtUp', 'superBuiltUp', 'carpetArea', 'plotArea', 'landArea', 'landAreaAcres', 'totalArea', 'totalLandArea', 'mainHouseArea', 'roomArea', 'roadWidth', 'totalPlotsInLayout', 'floorNumber', 'floors', 'totalFloors', 'flatsOnFloor', 'bedrooms', 'bathrooms', 'balcony', 'balconies', 'washrooms', 'washroomsCount', 'cabins', 'meetingRooms', 'parkingSlots', 'parkingCount', 'parkingCapacity', 'liftCount', 'liftCapacity', 'maintenanceCharges', 'maintenancePerMonth', 'monthlyMaintenance', 'saleLeasePrice', 'pricePerSqft', 'gardenArea', 'terraceArea', 'solarCapacity', 'constructionYear', 'frontageWidth', 'ceilingHeight', 'rentalIncome', 'monthlyRentalIncome', 'rentalYield', 'totalPropertyValue', 'sharePercentage', 'shareValue', 'minInvestment', 'minimumInvestment', 'expectedReturns', 'expectedROI', 'lockInPeriod', 'totalUnits', 'unitsAvailable', 'occupancyRate', 'managementFee', 'distanceFromBangalore', 'distanceFromCity', 'numberOfBuildings', 'borewellDepth', 'borewellYield', 'numberOfTrees', 'annualCropIncome', 'timelineWeeks',
])

function templateSpecValue(row: PropertyTemplateRow, key: string) {
  if (!templateValue(row, key).trim()) return undefined
  return TEMPLATE_NUMBER_KEYS.has(key) ? templateNumber(row, key) : templateValue(row, key)
}

function templateSpecs(row: PropertyTemplateRow) {
  return Object.fromEntries(
    PROPERTY_SPEC_TEMPLATE_HEADERS.map((key) => [key, templateSpecValue(row, key)]).filter(
      ([, value]) => value !== undefined,
    ),
  )
}

function propertyToTemplateRow(property: Property): PropertyTemplateRow {
  return {
    propertyId: property.id,
    referenceId: property.referenceId,
    title: property.title,
    type: property.type,
    source: property.source,
    city: property.city,
    locality: property.locality,
    pincode: property.pincode,
    price: property.price,
    description: property.description,
    status: property.status,
    address: property.address,
    line2: '',
    state: property.state,
    landmark: '',
    latitude: property.latitude ?? '',
    longitude: property.longitude ?? '',
    isNegotiable: property.isNegotiable,
    isFeatured: property.isFeatured,
    isUpcoming: property.isUpcoming,
    isVisibleOnApp: property.isVisibleOnApp ?? true,
    launchDate: property.launchDate ?? '',
    possessionDate: property.possessionDate ?? '',
    amenities: property.amenities.join(', '),
    highlights: property.highlights.join(', '),
    photos: property.photos.join(', '),
    coverPhoto: property.coverPhoto ?? '',
    videoUrl: property.videoUrl ?? '',
    droneImageUrl: property.droneImageUrl ?? '',
    tour3dUrl: property.tour3dUrl ?? '',
    floorPlanUrl: property.floorPlanUrl ?? '',
    advantagesInvestment: property.advantages?.investment.join(', ') ?? '',
    advantagesLocation: property.advantages?.location.join(', ') ?? '',
    advantagesConnectivity: property.advantages?.connectivity.join(', ') ?? '',
    nearbyPlaces: property.nearbyPlaces.length ? JSON.stringify(property.nearbyPlaces) : '',
    ...Object.fromEntries(
      PROPERTY_SPEC_TEMPLATE_HEADERS.map((key) => [key, String(property.specs[key] ?? '')]),
    ),
  }
}

function templateRowToPayload(row: PropertyTemplateRow): Partial<AdminPropertyPayload> {
  const rawType = templateValue(row, 'type').trim()
  const type = normalizePropertyTypeKey(rawType) ?? (rawType as PropertyType)
  return {
    title: templateValue(row, 'title').trim(),
    type,
    description: templateValue(row, 'description'),
    address: {
      line1: templateValue(row, 'address'),
      line2: templateValue(row, 'line2'),
      locality: templateValue(row, 'locality'),
      city: templateValue(row, 'city'),
      state: templateValue(row, 'state'),
      pincode: templateValue(row, 'pincode'),
      landmark: templateValue(row, 'landmark'),
      latitude: templateNumber(row, 'latitude'),
      longitude: templateNumber(row, 'longitude'),
    },
    price: Number(templateValue(row, 'price')),
    isNegotiable: templateBoolean(row, 'isNegotiable'),
    isFeatured: templateOptionalBoolean(row, 'isFeatured'),
    isUpcoming: templateOptionalBoolean(row, 'isUpcoming'),
    isVisibleOnApp: templateOptionalBoolean(row, 'isVisibleOnApp'),
    launchDate: templateValue(row, 'launchDate').trim() || null,
    possessionDate: templateValue(row, 'possessionDate').trim() || null,
    specs: templateSpecs(row),
    amenities: templateList(row, 'amenities'),
    highlights: templateList(row, 'highlights'),
    media: {
      photos: templateList(row, 'photos'),
      coverPhoto: templateValue(row, 'coverPhoto').trim() || undefined,
      videoUrl: templateValue(row, 'videoUrl').trim() || undefined,
      droneImageUrl: templateValue(row, 'droneImageUrl').trim() || undefined,
      tour3dUrl: templateValue(row, 'tour3dUrl').trim() || undefined,
      floorPlanUrl: templateValue(row, 'floorPlanUrl').trim() || undefined,
    },
    advantages: {
      investment: templateList(row, 'advantagesInvestment'),
      location: templateList(row, 'advantagesLocation'),
      connectivity: templateList(row, 'advantagesConnectivity'),
    },
    nearbyPlaces: templateJsonArray(row, 'nearbyPlaces') as AdminPropertyPayload['nearbyPlaces'],
  }
}

function validateTemplateRow(row: PropertyTemplateRow) {
  const required = ['title', 'type', 'city', 'locality', 'pincode', 'price']
  for (const key of required) {
    if (!templateValue(row, key).trim()) return `${key} is required`
  }
  if (!/^\d{6}$/.test(templateValue(row, 'pincode'))) return 'pincode must contain 6 digits'
  if (!(Number(templateValue(row, 'price')) > 0)) return 'price must be positive'
  return ''
}

function fieldLabel(fields: PropertyTemplateField[], key: string) {
  return fields.find((field) => field.key === key)?.label ?? key
}

function excelColumnLabel(index: number) {
  let label = ''
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function PropertyTemplateSection({
  onToast,
  onSaved,
}: {
  onToast: (message: string) => void
  onSaved: (property: Property) => void
}) {
  const [mode, setMode] = useState<PropertyTemplateMode>('empty')
  const [fields, setFields] = useState<PropertyTemplateField[]>([])
  const [rows, setRows] = useState<PropertyTemplateRow[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({})
  const [dirtyRowIds, setDirtyRowIds] = useState<Set<string>>(() => new Set())
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateTypeFilter, setTemplateTypeFilter] = useState<PropertyType | ''>('')
  const [templateStatusFilter, setTemplateStatusFilter] = useState<PropertyStatus | ''>('')

  const loadTemplate = useCallback(async (nextMode = mode) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      onToast('Login required to view property templates')
      return
    }
    setLoading(true)
    try {
      const result = await getAdminPropertyTemplate(session.accessToken, nextMode, 500)
      setFields(result.fields)
      setRows(nextMode === 'empty' ? [{}] : result.rows)
      setRowMessages({})
      setDirtyRowIds(new Set())
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Could not load property template')
    } finally {
      setLoading(false)
    }
  }, [mode, onToast])

  useEffect(() => {
    void loadTemplate(mode)
  }, [loadTemplate, mode])

  const updateCell = (
    row: PropertyTemplateRow,
    fallbackIndex: number,
    key: string,
    value: string | boolean,
  ) => {
    const propertyId = templateValue(row, 'propertyId')
    setRows((prev) =>
      prev.map((item, index) =>
        (propertyId && templateValue(item, 'propertyId') === propertyId) ||
        (!propertyId && index === fallbackIndex)
          ? { ...item, [key]: value }
          : item,
      ),
    )
    if (propertyId) {
      setDirtyRowIds((prev) => new Set(prev).add(propertyId))
      setRowMessages((prev) => ({ ...prev, [propertyId]: 'Unsaved' }))
    }
  }

  const saveRow = async (row: PropertyTemplateRow) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      onToast('Login required to save template changes')
      return
    }
    const propertyId = templateValue(row, 'propertyId')
    if (!propertyId) return
    const validation = validateTemplateRow(row)
    if (validation) {
      setRowMessages((prev) => ({ ...prev, [propertyId]: validation }))
      return
    }
    setSavingId(propertyId)
    setRowMessages((prev) => ({ ...prev, [propertyId]: '' }))
    try {
      let saved = await updateAdminProperty(session.accessToken, propertyId, templateRowToPayload(row))
      const status = templateValue(row, 'status') as PropertyStatus
      if (status && status !== saved.status) {
        saved = await updateAdminPropertyStatus(session.accessToken, propertyId, status)
      }
      const refreshedRow = propertyToTemplateRow(saved)
      setRows((prev) =>
        prev.map((item) =>
          templateValue(item, 'propertyId') === propertyId ? { ...item, ...refreshedRow } : item,
        ),
      )
      setDirtyRowIds((prev) => {
        const next = new Set(prev)
        next.delete(propertyId)
        return next
      })
      onSaved(saved)
      setRowMessages((prev) => ({ ...prev, [propertyId]: 'Saved' }))
      onToast(`${saved.title} updated`)
    } catch (error) {
      setRowMessages((prev) => ({
        ...prev,
        [propertyId]: error instanceof Error ? error.message : 'Could not save row',
      }))
    } finally {
      setSavingId(null)
    }
  }

  const downloadCurrentTemplate = () => {
    if (mode === 'empty') {
      downloadWorkbook('builtglory-empty-property-template.xlsx', BULK_UPLOAD_TEMPLATE_HEADERS, [])
      onToast('Empty property template downloaded')
      return
    }
    downloadWorkbook('builtglory-valued-property-template.xlsx', TEMPLATE_GRID_COLUMNS, rows)
    onToast('Valued property template downloaded')
  }

  const columns = mode === 'empty' ? BULK_UPLOAD_TEMPLATE_HEADERS : TEMPLATE_GRID_COLUMNS
  const displayRows = useMemo(() => {
    if (mode === 'empty') return rows
    const query = templateSearch.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesSearch =
        !query ||
        ['referenceId', 'title', 'city', 'locality', 'pincode'].some((key) =>
          templateValue(row, key).toLowerCase().includes(query),
        )
      const matchesType = !templateTypeFilter || templateValue(row, 'type') === templateTypeFilter
      const matchesStatus = !templateStatusFilter || templateValue(row, 'status') === templateStatusFilter
      return matchesSearch && matchesType && matchesStatus
    })
  }, [mode, rows, templateSearch, templateStatusFilter, templateTypeFilter])

  const saveChangedRows = async () => {
    const changedRows = rows.filter((row) => dirtyRowIds.has(templateValue(row, 'propertyId')))
    if (!changedRows.length) {
      onToast('No template changes to save')
      return
    }
    for (const row of changedRows) {
      await saveRow(row)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-100 px-3 py-2">
        <div className="mr-2 flex overflow-hidden rounded border border-slate-300 bg-white">
          {(['empty', 'valued'] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={cn(
                'h-8 border-r border-slate-300 px-3 text-xs font-medium last:border-r-0',
                mode === item ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50',
              )}
              onClick={() => setMode(item)}
            >
              {item === 'empty' ? 'Empty' : 'Valued'}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={templateSearch}
          onChange={(e) => setTemplateSearch(e.target.value)}
          placeholder="Filter sheet..."
          disabled={mode === 'empty'}
          className="h-8 w-44 rounded border border-slate-300 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
        />
        <select
          value={templateTypeFilter}
          onChange={(e) => setTemplateTypeFilter(e.target.value as PropertyType | '')}
          disabled={mode === 'empty'}
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
        >
          {ALL_TYPES.map((type) => (
            <option key={type.label} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <select
          value={templateStatusFilter}
          onChange={(e) => setTemplateStatusFilter(e.target.value as PropertyStatus | '')}
          disabled={mode === 'empty'}
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs disabled:bg-slate-100"
        >
          {ALL_STATUSES.map((status) => (
            <option key={status.label} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">
            {loading
              ? 'Loading...'
              : mode === 'empty'
                ? 'Empty template'
                : `${displayRows.length}/${rows.length} rows · ${dirtyRowIds.size} unsaved`}
          </span>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => void loadTemplate(mode)}>
            Refresh
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={downloadCurrentTemplate}>
            Download
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={mode === 'empty' || dirtyRowIds.size === 0}
            onClick={() => void saveChangedRows()}
          >
            Save Changes
          </Button>
          <select
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
            aria-label="More template actions"
            onChange={(e) => {
              if (e.target.value === 'clear') {
                setTemplateSearch('')
                setTemplateTypeFilter('')
                setTemplateStatusFilter('')
              }
              e.target.value = ''
            }}
          >
            <option value="">More</option>
            <option value="clear">Clear filters</option>
          </select>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
        {mode === 'empty'
          ? 'Download this blank workbook and fill it for bulk upload.'
          : 'Edit cells below and use Save Changes or the row Save button to update the database.'}
      </div>

      <div className="h-[calc(100vh-260px)] min-h-[520px] overflow-auto bg-white">
          <table className="w-full min-w-max border-collapse text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-100 text-slate-600">
                <th className="sticky left-0 z-30 h-7 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100 text-center text-xs font-semibold">
                  #
                </th>
                {columns.map((key, columnIndex) => (
                  <th
                    key={`${key}-letter`}
                    className="h-7 border-b border-r border-slate-300 px-2 text-center text-xs font-semibold last:border-r-0"
                  >
                    {excelColumnLabel(columnIndex)}
                  </th>
                ))}
                {mode === 'valued' && (
                  <th className="sticky right-0 z-30 h-7 border-b border-l border-slate-300 bg-slate-100 px-3 text-center text-xs font-semibold">
                    {excelColumnLabel(columns.length)}
                  </th>
                )}
              </tr>
              <tr className="bg-emerald-50">
                <th className="sticky left-0 z-30 h-8 w-12 min-w-12 border-b border-r border-slate-300 bg-slate-100 text-center text-xs font-semibold text-slate-600">
                  1
                </th>
                {columns.map((key) => (
                  <th
                    key={key}
                    className="h-8 border-b border-r border-slate-300 px-2 text-left text-xs font-semibold uppercase tracking-wide text-emerald-900 last:border-r-0"
                  >
                    {fieldLabel(fields, key)}
                  </th>
                ))}
                {mode === 'valued' && (
                  <th className="sticky right-0 z-30 h-8 border-b border-l border-slate-300 bg-emerald-50 px-3 text-left text-xs font-semibold uppercase tracking-wide text-emerald-900">
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1 + (mode === 'valued' ? 1 : 0)}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No properties found for the valued template.
                  </td>
                </tr>
              ) : (
                displayRows.map((row, rowIndex) => {
                  const propertyId = templateValue(row, 'propertyId')
                  return (
                    <tr
                      key={propertyId || `empty-${rowIndex}`}
                      className="group border-b border-slate-200 hover:bg-emerald-50/40"
                    >
                      <td className="sticky left-0 z-10 h-8 border-r border-slate-300 bg-slate-50 px-2 text-center text-xs font-medium text-slate-500 group-hover:bg-emerald-50">
                        {rowIndex + 2}
                      </td>
                      {columns.map((key) => {
                        const isEditable = mode === 'valued' && EDITABLE_TEMPLATE_COLUMNS.has(key)
                        const value = row[key]
                        return (
                          <td key={key} className="h-8 border-r border-slate-200 p-0 last:border-r-0">
                            {isEditable ? (
                              key === 'type' ? (
                                <select
                                  value={templateValue(row, key)}
                                  onChange={(e) => updateCell(row, rowIndex, key, e.target.value)}
                                  className="h-8 w-full min-w-36 border-0 bg-transparent px-2 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                                >
                                  {ALL_TYPES.filter((type) => type.value).map((type) => (
                                    <option key={type.value} value={type.value}>
                                      {type.label}
                                    </option>
                                  ))}
                                </select>
                              ) : key === 'status' ? (
                                <select
                                  value={templateValue(row, key)}
                                  onChange={(e) => updateCell(row, rowIndex, key, e.target.value)}
                                  className="h-8 w-full min-w-40 border-0 bg-transparent px-2 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                                >
                                  {ALL_STATUSES.filter((status) => status.value).map((status) => (
                                    <option key={status.value} value={status.value}>
                                      {status.label}
                                    </option>
                                  ))}
                                </select>
                              ) : key === 'isNegotiable' ? (
                                <select
                                  value={templateValue(row, key)}
                                  onChange={(e) => updateCell(row, rowIndex, key, e.target.value)}
                                  className="h-8 w-full min-w-28 border-0 bg-transparent px-2 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                                >
                                  <option value="false">false</option>
                                  <option value="true">true</option>
                                </select>
                              ) : (
                                <input
                                  value={templateValue(row, key)}
                                  onChange={(e) => updateCell(row, rowIndex, key, e.target.value)}
                                  className="h-8 w-full min-w-36 border-0 bg-transparent px-2 text-[13px] outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500"
                                />
                              )
                            ) : (
                              <span className="block h-8 min-w-28 truncate px-2 py-1.5 text-slate-600">
                                {String(value ?? '')}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      {mode === 'valued' && (
                        <td className="sticky right-0 z-10 border-l border-slate-300 bg-white p-1 group-hover:bg-emerald-50">
                          <div className="flex min-w-36 flex-col gap-1">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={savingId === propertyId}
                              onClick={() => void saveRow(row)}
                            >
                              {savingId === propertyId ? 'Saving...' : 'Save'}
                            </Button>
                            {rowMessages[propertyId] && (
                              <span className="text-xs text-muted-foreground">
                                {rowMessages[propertyId]}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
  )
}

function BulkUploadSection({
  onReload,
  navigate,
  onToast,
}: {
  onReload: () => Promise<void>
  navigate: ReturnType<typeof useNavigate>
  onToast: (message: string) => void
}) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadStep, setUploadStep] = useState<1 | 2>(1)
  const [activeTab, setActiveTab] = useState('Plot')
  const [uploadPreview, setUploadPreview] = useState<BulkUploadPreview>(EMPTY_BULK_UPLOAD_PREVIEW)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [importSheets, setImportSheets] = useState<ImportSheetConfig[]>(() =>
    SHEETS.map((label) => ({ label, type: SHEET_TYPE[label] })),
  )
  const [importDone, setImportDone] = useState(false)
  const [importedList, setImportedList] = useState<StoredImportProperty[]>([])
  const [importedAt, setImportedAt] = useState<string | null>(null)
  const [latestImportJob, setLatestImportJob] = useState<PropertyImportJob | null>(null)
  const [tableExpanded, setTableExpanded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const session = readAdminSession()
    if (session?.accessToken) {
      listAdminPropertyImportJobs(session.accessToken, 1)
        .then((result) => {
          const job = result.data[0]
          if (!job) return
          setLatestImportJob(job)
          setImportDone(job.status === 'validated' || job.status === 'completed')
          setImportedAt(job.completedAt ?? job.createdAt)
          setImportedList([importJobToStoredProperty(job)])
        })
        .catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getDashboardOptions().then((options) => {
      if (cancelled) return
      const configured = options?.properties?.importSheets
        ?.map((sheet) => {
          const label = sheet.label?.trim()
          if (!label) return null
          const expectedType = SHEET_TYPE[label]
          const parsedType = normalizePropertyTypeKey(sheet.type)
          const type = expectedType ?? parsedType
          if (!type) return null
          return { label, type }
        })
        .filter((sheet): sheet is ImportSheetConfig => Boolean(sheet))
      if (!configured?.length) return
      setImportSheets(configured)
      setActiveTab((current) =>
        configured.some((sheet) => sheet.label === current) ? current : configured[0].label,
      )
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!uploadedFile) {
      setUploadPreview(EMPTY_BULK_UPLOAD_PREVIEW)
      setPreviewError(null)
      setPreviewLoading(false)
      return () => {
        cancelled = true
      }
    }

    setPreviewLoading(true)
    setPreviewError(null)
    void readBulkUploadPreview(uploadedFile)
      .then((preview) => {
        if (cancelled) return
        setUploadPreview(preview)
      })
      .catch((error) => {
        if (cancelled) return
        setUploadPreview(EMPTY_BULK_UPLOAD_PREVIEW)
        setPreviewError(error instanceof Error ? error.message : 'Could not read workbook preview')
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [uploadedFile])

  const clearImportHistory = () => {
    setImportDone(false)
    setImportedList([])
    setImportedAt(null)
    setLatestImportJob(null)
    setTableExpanded(false)
    setUploadStep(1)
    setUploadedFile(null)
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  const resetUploadFlow = () => {
    setUploadedFile(null)
    setUploadStep(1)
    setActiveTab(importSheets[0]?.label ?? 'Plot')
    setImportDone(false)
    setImportedList([])
    setImportedAt(null)
    setLatestImportJob(null)
    setTableExpanded(false)
    if (fileRef.current) {
      fileRef.current.value = ''
    }
  }

  const handleImport = async () => {
    if (!uploadedFile) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      onToast('Login required to upload properties')
      return
    }

    try {
      const result = await bulkUploadAdminProperties(session.accessToken, uploadedFile)
      setLatestImportJob(result.job ?? null)
      if (!result.valid) {
        onToast(
          `Upload rejected: ${result.rowsRejected} rows have errors. Fix the file and upload again.`,
        )
        return
      }
      const activeSheetType = importSheets.find((sheet) => sheet.label === activeTab)?.type ?? SHEET_TYPE[activeTab]
      const stored: StoredImportProperty[] = [
        result.job
          ? importJobToStoredProperty(result.job, activeSheetType)
          : {
              id: uploadedFile.name,
              title: `${result.rowsAccepted} accepted rows from ${uploadedFile.name}`,
              type: activeSheetType,
              price: 0,
              status: 'available',
            },
      ]
      const at = result.job?.completedAt ?? result.job?.createdAt ?? new Date().toISOString()
      setImportedList(stored)
      setImportedAt(at)
      setImportDone(true)
      setTableExpanded(false)
      await onReload()
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Bulk upload failed')
    }
  }

  const importCount = latestImportJob?.rowsAccepted ?? importedList.length
  const rejectedCount = latestImportJob?.rowsRejected ?? 0
  const availableCount = latestImportJob?.rowsAccepted ?? importedList.filter((p) => p.status === 'available').length
  const typeCount = new Set(importedList.map((p) => p.type)).size
  const importWhen = importedAt ? formatImportDateTime(importedAt) : null
  const activeSheetType =
    importSheets.find((sheet) => sheet.label === activeTab)?.type ?? SHEET_TYPE[activeTab]
  const activePreviewRows = uploadPreview.rows.filter((row) => row.type === activeSheetType)

  return (
    <div className="mx-auto max-w-[1100px]">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          if (!f.name.toLowerCase().endsWith('.xlsx')) {
            window.alert('Please upload .xlsx file only')
            return
          }
          if (f.size > 10485760) {
            window.alert('File too large. Max 10MB')
            return
          }
          setUploadedFile(f)
          setUploadStep(2)
        }}
      />

      {importDone && (
        <div className="space-y-6">
          <div className="text-center">
            <CheckCircle className="mx-auto size-12 text-green-600" />
            <p className="mt-3 text-xl font-semibold text-foreground">
              ✅ {importCount} Rows Validated Successfully!
            </p>
            {importWhen && (
              <p className="mt-1 text-sm text-muted-foreground">
                Imported on {importWhen.date} at {importWhen.time}
              </p>
            )}
            {latestImportJob && (
              <p className="mt-1 text-xs text-muted-foreground">
                Job {latestImportJob.referenceId} · {latestImportJob.rowsAccepted} accepted /{' '}
                {latestImportJob.rowsRejected} rejected
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Accepted Rows', value: String(importCount) },
              { label: 'Ready to Import', value: String(availableCount) },
              { label: 'Property Types', value: String(typeCount) },
              { label: 'Rejected Rows', value: String(rejectedCount) },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-border bg-card p-4 text-center"
              >
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border border-border text-left">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/50"
              onClick={() => setTableExpanded((e) => !e)}
            >
              <span className="text-sm font-medium text-foreground">
                View Import Summary
                <span className="ml-2 font-normal text-muted-foreground">
                  ({importCount} accepted rows)
                </span>
              </span>
              {tableExpanded ? (
                <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
            {tableExpanded && (
              <div className="max-h-[400px] overflow-y-auto border-t border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-muted shadow-sm">
                    <tr className="border-b border-border">
                      <th className="w-10 p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        #
                      </th>
                      <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        Import Job
                      </th>
                      <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        Title
                      </th>
                      <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        Type
                      </th>
                      <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        Accepted
                      </th>
                      <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {importedList.map((row, idx) => (
                      <tr
                        key={row.id}
                        className="border-b border-border last:border-0 hover:bg-sidebar-accent"
                      >
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-mono text-xs">{row.id}</td>
                        <td className="p-3 font-medium">{row.title}</td>
                        <td className="p-3">{getPropertyTypeLabel(row.type)}</td>
                        <td className="p-3 font-bold text-primary">{latestImportJob?.rowsAccepted ?? row.price}</td>
                        <td className="p-3">
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                            {getStatusLabel(row.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button type="button" onClick={() => navigate('/admin/properties/all')}>
                View All Properties
              </Button>
              <Button type="button" variant="outline" onClick={resetUploadFlow}>
                Upload Another File
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-red-500 hover:underline"
              onClick={clearImportHistory}
            >
              Hide Summary
            </button>
          </div>
        </div>
      )}

      {!importDone && uploadStep === 1 && (
        <div
          role="button"
          tabIndex={0}
          className="cursor-pointer rounded-xl border-2 border-dashed border-border p-16 text-center transition-colors hover:border-primary hover:bg-sidebar-accent"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileRef.current?.click()
            }
          }}
        >
          <Upload className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="font-medium">Drop your Builtglory Master Sheet</p>
          <p className="text-sm text-muted-foreground">All 13 property types in one file</p>
          <p className="mt-1 text-xs text-muted-foreground">Accepts .xlsx · Max 10MB</p>
          <Button
            type="button"
            className="mt-4"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              fileRef.current?.click()
            }}
          >
            Browse File
          </Button>
          <Button
            type="button"
            className="mt-3"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              downloadBulkUploadTemplate()
              onToast('Builtglory Master Sheet template downloaded')
            }}
          >
            Download Template
          </Button>
        </div>
      )}

      {!importDone && uploadStep === 2 && uploadedFile && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2">
              <FileUp className="size-5 text-green-600" />
              <span className="text-sm font-medium">{uploadedFile.name}</span>
              <span className="text-xs text-muted-foreground">
                ({(uploadedFile.size / 1024).toFixed(1)} KB)
              </span>
            </div>
            <button
              type="button"
              className="text-sm text-red-500 hover:underline"
              onClick={() => {
                setUploadedFile(null)
                setUploadStep(1)
                setActiveTab(importSheets[0]?.label ?? 'Plot')
                if (fileRef.current) {
                  fileRef.current.value = ''
                }
              }}
            >
              Remove
            </button>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-1 border-b border-border">
              {importSheets.map((sheet) => (
                <button
                  key={sheet.label}
                  type="button"
                  onClick={() => setActiveTab(sheet.label)}
                  className={cn(
                    'whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                    activeTab === sheet.label
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {sheet.label} ({uploadPreview.countsByType[sheet.type] ?? 0})
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border">
            <div className="border-b border-border bg-muted p-3">
              <span className="text-sm font-medium">{activeTab} Sheet Preview</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {previewLoading
                  ? 'Reading workbook...'
                  : `${activePreviewRows.length} ${
                      activePreviewRows.length === 1 ? 'property' : 'properties'
                    } found`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Property ID
                    </th>
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Title
                    </th>
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Price
                    </th>
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Location
                    </th>
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Status
                    </th>
                    <th className="p-3 text-left text-xs font-medium uppercase text-muted-foreground">
                      Validation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activePreviewRows.length === 0 ? (
                    <tr>
                      <td className="p-3 text-sm text-muted-foreground" colSpan={6}>
                        {previewLoading
                          ? 'Reading workbook preview...'
                          : 'No properties found for this type in the selected workbook.'}
                      </td>
                    </tr>
                  ) : (
                    activePreviewRows.map((row, i) => (
                      <tr
                        key={`${row.id}-${i}`}
                        className="border-b border-border last:border-0 hover:bg-sidebar-accent"
                      >
                        <td className="p-3 font-mono text-xs">{row.id}</td>
                        <td className="p-3 font-medium">{row.title}</td>
                        <td className="p-3 font-bold text-primary">{row.price}</td>
                        <td className="p-3 text-muted-foreground">{row.location}</td>
                        <td className="p-3">
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                            {row.status}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'text-xs',
                              row.hasError ? 'text-red-600' : 'text-green-600',
                            )}
                          >
                            {row.hasError ? 'Needs Fix' : 'Ready'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Validation Summary</p>
            <div className="flex flex-wrap gap-6 text-sm">
              <span className="text-green-600">
                Valid: {previewLoading ? '...' : uploadPreview.valid} properties
              </span>
              <span className="text-amber-600">Warnings: {uploadPreview.warnings}</span>
              <span className="text-red-600">Errors: {uploadPreview.errors}</span>
            </div>
            {previewError && <p className="text-xs text-red-600">{previewError}</p>}
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={previewLoading || !!previewError}
            onClick={handleImport}
          >
            Validate And Import
          </Button>
        </div>
      )}
    </div>
  )
}

function TabEmptyFeatured() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <Star className="size-16 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No featured properties</p>
      <p className="text-sm text-muted-foreground">
        Mark properties as featured from their detail page
      </p>
    </div>
  )
}

function TabEmptyUpcoming() {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
      <Clock className="size-16 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No upcoming properties</p>
    </div>
  )
}

function DeletedPropertiesSection({
  items,
  onRestore,
  onPermanentDelete,
}: {
  items: PropertyRow[]
  onRestore: (id: string) => void
  onPermanentDelete: (property: PropertyRow) => void
}) {
  const [expanded, setExpanded] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((open) => !open)}
      >
        <div>
          <p className="font-medium text-foreground">Deleted Properties</p>
          <p className="text-xs text-muted-foreground">
            {items.length} {items.length === 1 ? 'property' : 'properties'} in trash
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="size-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          <div className="space-y-2">
            {items.map((property) => (
              <div
                key={property.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-muted-foreground line-through">
                    {property.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {property.locality} · Deleted{' '}
                    {property.deletedAt
                      ? formatTimeAgo(property.deletedAt)
                      : 'recently'}
                    {property.deletedBy ? ` by ${property.deletedBy}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-green-300 text-green-800 hover:bg-green-50"
                    onClick={() => onRestore(property.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => onPermanentDelete(property)}
                  >
                    Permanent Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PropertiesPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const pageTab = ROUTE_TAB_MAP[pathname] ?? 'all'
  const editPropertyId = pageTab === 'add' ? searchParams.get('edit') : null

  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<PropertyType | ''>('')
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | ''>('')
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredView)
  const [properties, setProperties] = useState<PropertyRow[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] =
    useState<PropertyRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [listPageSize, setListPageSize] = useState<number>(20)
  const [listVisibleCount, setListVisibleCount] = useState(20)
  const [gridVisibleCount, setGridVisibleCount] = useState(GRID_LOAD_CHUNK)

  const handleViewChange = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    persistView(mode)
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const loadProperties = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setProperties([])
      setLoading(false)
      showToast('Login required to load properties')
      return
    }
    setLoading(true)
    try {
      const listQuery = {
        limit: 100,
        sort: 'newest' as const,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(pageTab === 'featured' ? { featured: true } : {}),
        ...(pageTab === 'upcoming' ? { upcoming: true } : {}),
      }
      const [activeResult, deletedResult] = await Promise.all([
        listAdminProperties(session.accessToken, listQuery),
        listAdminProperties(session.accessToken, { limit: 100, sort: 'newest', deletedOnly: true }),
      ])
      setProperties([...activeResult.data, ...deletedResult.data].map(enrichProperty))
    } catch (error) {
      setProperties([])
      showToast(error instanceof Error ? error.message : 'Failed to load properties')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, pageTab, showToast, statusFilter, typeFilter])

  const patchProperty = useCallback(
    async (id: string, patch: Partial<PropertyRow>) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        showToast('Login required to update property')
        return
      }

      const target = properties.find((p) => p.id === id)
      if (!target) return

      if (patch.isFeatured === true && !target.isFeatured) {
        const featuredCount = properties.filter((p) => p.isFeatured).length
        if (featuredCount >= FEATURED_MAX) {
          showToast('Maximum 20 featured properties reached. Remove one first.')
          return
        }
      }

      const snapshot = target
      setProperties((prev) =>
        prev.map((p) =>
          p.id === id ? enrichProperty({ ...p, ...patch } as Property) : p,
        ),
      )

      try {
        let updated: Property = snapshot
        if (patch.status !== undefined && patch.status !== snapshot.status) {
          updated = await updateAdminPropertyStatus(
            session.accessToken,
            id,
            patch.status,
          )
        }
        const hasPatchFields = Object.keys(patch).some(
          (key) => key !== 'status' && key !== 'soldAt',
        )
        if (hasPatchFields) {
          updated = await updateAdminProperty(session.accessToken, id, {
            title: patch.title,
            description: patch.description,
            isFeatured: patch.isFeatured,
            isUpcoming: patch.isUpcoming,
            isVisibleOnApp: patch.isVisibleOnApp,
            launchDate: patch.launchDate,
            price: patch.price,
            media:
              patch.photos ||
              patch.coverPhoto !== undefined ||
              patch.videoUrl !== undefined ||
              patch.droneImageUrl !== undefined ||
              patch.tour3dUrl !== undefined ||
              patch.floorPlanUrl !== undefined
                ? {
                    photos: patch.photos,
                    coverPhoto: patch.coverPhoto,
                    videoUrl: patch.videoUrl,
                    droneImageUrl: patch.droneImageUrl,
                    tour3dUrl: patch.tour3dUrl,
                    floorPlanUrl: patch.floorPlanUrl,
                  }
                : undefined,
          })
        }
        const final = enrichProperty({
          ...updated,
          ...(patch.soldAt !== undefined ? { soldAt: patch.soldAt } : {}),
        })
        setProperties((prev) => prev.map((p) => (p.id === id ? final : p)))
      } catch (error) {
        setProperties((prev) => prev.map((p) => (p.id === id ? snapshot : p)))
        showToast(error instanceof Error ? error.message : 'Failed to update property')
      }
    },
    [properties, showToast],
  )

  const handleToggleApp = useCallback(
    (id: string, visible: boolean) => {
      void patchProperty(id, { isVisibleOnApp: visible })
    },
    [patchProperty],
  )

  const requestDeleteProperty = useCallback((property: PropertyRow) => {
    let mode: 'default' | 'sold' | 'active_deals' = 'default'
    if (property.status === 'sold') mode = 'sold'
    else if (hasActiveDeals(property)) mode = 'active_deals'
    setDeleteConfirm({ property, mode })
  }, [])

  const softDeleteProperty = useCallback(
    async (id: string) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        showToast('Login required to delete property')
        return
      }
      try {
        const deleted = await deleteAdminProperty(session.accessToken, id)
        setProperties((prev) => prev.map((p) => (p.id === id ? enrichProperty(deleted) : p)))
        setSelectedIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
        showToast('Property moved to trash')
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not delete property')
      }
    },
    [showToast],
  )

  const confirmDeleteProperty = useCallback(() => {
    if (!deleteConfirm) return
    void softDeleteProperty(deleteConfirm.property.id)
    setDeleteConfirm(null)
  }, [deleteConfirm, softDeleteProperty])

  const confirmBulkDelete = useCallback(() => {
    const ids = [...selectedIds]
    ids.forEach((id) => void softDeleteProperty(id))
    setSelectedIds(new Set())
    setBulkDeleteConfirm(false)
  }, [selectedIds, softDeleteProperty])

  const restoreProperty = useCallback(
    async (id: string) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        showToast('Login required to restore property')
        return
      }
      try {
        const restored = await restoreAdminProperty(session.accessToken, id)
        setProperties((prev) => prev.map((p) => (p.id === id ? enrichProperty(restored) : p)))
        showToast('Property restored')
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Could not restore property')
      }
    },
    [showToast],
  )

  const confirmPermanentDelete = useCallback(() => {
    if (!permanentDeleteConfirm) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      showToast('Login required to delete permanently')
      return
    }
    const id = permanentDeleteConfirm.id
    void permanentlyDeleteAdminProperty(session.accessToken, id)
      .then(() => {
        setProperties((prev) => prev.filter((p) => p.id !== id))
        setPermanentDeleteConfirm(null)
        showToast('Property permanently deleted')
      })
      .catch((error) => showToast(error instanceof Error ? error.message : 'Could not delete permanently'))
  }, [permanentDeleteConfirm, showToast])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleEditProperty = useCallback(
    (id: string) => {
      navigate(`/admin/properties/add?edit=${id}`)
    },
    [navigate],
  )

  useEffect(() => {
    void loadProperties()
  }, [loadProperties])

  const activeProperties = useMemo(
    () => properties.filter((property) => !property.isDeleted),
    [properties],
  )

  const deletedProperties = useMemo(
    () => properties.filter((property) => property.isDeleted),
    [properties],
  )

  const tabBase = useMemo(() => {
    if (pageTab === 'featured') return activeProperties.filter((p) => p.isFeatured)
    if (pageTab === 'upcoming') return activeProperties.filter((p) => p.isUpcoming)
    return activeProperties
  }, [activeProperties, pageTab])

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const featuredCount = useMemo(
    () => activeProperties.filter((p) => p.isFeatured).length,
    [activeProperties],
  )
  const passedLaunchCount = useMemo(
    () => activeProperties.filter((p) => isLaunchDatePassed(p, todayIso)).length,
    [activeProperties, todayIso],
  )

  useEffect(() => {
    if (pageTab !== 'upcoming') return
    console.log(
      `[upcoming] ${passedLaunchCount} properties have passed launch date`,
    )
  }, [pageTab, passedLaunchCount])

  const handleMoveToAvailable = useCallback(
    (p: PropertyRow) => {
      patchProperty(p.id, { isUpcoming: false, status: 'available' })
      showToast(`${p.title} moved to Available`)
    },
    [patchProperty, showToast],
  )

  const filtered = useMemo(() => {
    let list = tabBase
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.locality.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          p.referenceId.toLowerCase().includes(q),
      )
    }
    if (typeFilter) list = list.filter((p) => p.type === typeFilter)
    if (statusFilter) list = list.filter((p) => p.status === statusFilter)
    return sortProperties(list)
  }, [tabBase, debouncedSearch, typeFilter, statusFilter])

  const visibleList = useMemo(
    () => filtered.slice(0, listVisibleCount),
    [filtered, listVisibleCount],
  )

  const visibleGrid = useMemo(
    () => filtered.slice(0, gridVisibleCount),
    [filtered, gridVisibleCount],
  )

  const selectedProperties = useMemo(
    () => activeProperties.filter((p) => selectedIds.has(p.id)),
    [activeProperties, selectedIds],
  )

  const bulkSoldCount = useMemo(
    () => selectedProperties.filter((p) => p.status === 'sold').length,
    [selectedProperties],
  )

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allInView =
        visibleList.length > 0 && visibleList.every((p) => prev.has(p.id))
      if (allInView) {
        const next = new Set(prev)
        visibleList.forEach((p) => next.delete(p.id))
        return next
      }
      const next = new Set(prev)
      visibleList.forEach((p) => next.add(p.id))
      return next
    })
  }, [visibleList])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const bulkPauseSelected = useCallback(() => {
    void Promise.all(
      selectedProperties
        .filter((p) => p.status === 'available')
        .map((p) => patchProperty(p.id, { status: 'reserved' })),
    )
    showToast('Selected listings paused')
  }, [patchProperty, selectedProperties, showToast])

  const bulkFeatureSelected = useCallback(() => {
    void Promise.all(selectedProperties.map((p) => patchProperty(p.id, { isFeatured: true })))
    showToast('Selected properties marked as featured')
  }, [patchProperty, selectedProperties, showToast])

  const bulkExportSelected = useCallback(() => {
    showToast(`Exporting ${selectedIds.size} properties (coming soon)`)
  }, [selectedIds.size, showToast])

  useEffect(() => {
    setListVisibleCount(listPageSize)
    setGridVisibleCount(GRID_LOAD_CHUNK)
  }, [debouncedSearch, typeFilter, statusFilter, pageTab, listPageSize])

  useEffect(() => {
    if (filtered.length === 0) {
      setListVisibleCount(listPageSize)
      setGridVisibleCount(GRID_LOAD_CHUNK)
      return
    }
    if (listVisibleCount > filtered.length) {
      setListVisibleCount(filtered.length)
    }
    if (gridVisibleCount > filtered.length) {
      setGridVisibleCount(filtered.length)
    }
  }, [filtered.length, listVisibleCount, gridVisibleCount, listPageSize])

  const showListChrome = pageTab === 'all' || pageTab === 'featured' || pageTab === 'upcoming'
  const enableBulkSelect = pageTab === 'all' && viewMode === 'list'

  const listRemaining = Math.max(0, filtered.length - listVisibleCount)
  const gridRemaining = Math.max(0, filtered.length - gridVisibleCount)
  const listShowingEnd = Math.min(listVisibleCount, filtered.length)
  const gridShowingEnd = Math.min(gridVisibleCount, filtered.length)

  const emptyKind = useMemo(() => {
    if (!showListChrome) return null
    if (search.trim()) return 'search' as const
    if (typeFilter || statusFilter) return 'filter' as const
    if (pageTab === 'featured' && tabBase.length === 0) return 'featured' as const
    if (pageTab === 'upcoming' && tabBase.length === 0) return 'upcoming' as const
    if (activeProperties.length === 0) return 'none' as const
    return 'filter' as const
  }, [showListChrome, search, typeFilter, statusFilter, pageTab, tabBase.length, activeProperties.length])

  const handleView = useCallback(
    (id: string) => {
      navigate(`/admin/properties/${id}`)
    },
    [navigate],
  )

  const filterLabel =
    typeFilter && statusFilter
      ? `${getPropertyTypeLabel(typeFilter)} / ${getStatusLabel(statusFilter)}`
      : typeFilter
        ? getPropertyTypeLabel(typeFilter)
        : statusFilter
          ? getStatusLabel(statusFilter)
          : ''

  return (
    <div className="space-y-6 p-6">
      <PropertyDeleteDialog
        state={deleteConfirm}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => confirmDeleteProperty()}
      />
      {bulkDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBulkDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              Delete {selectedIds.size} properties?
            </h3>
            <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto text-sm text-foreground">
              {selectedProperties.slice(0, 8).map((p) => (
                <li key={p.id} className="truncate">
                  · {p.title}
                </li>
              ))}
              {selectedProperties.length > 8 && (
                <li className="text-muted-foreground">
                  …and {selectedProperties.length - 8} more
                </li>
              )}
            </ul>
            {bulkSoldCount > 0 && (
              <p className="mt-3 text-sm font-medium text-amber-600">
                {bulkSoldCount} sold{' '}
                {bulkSoldCount === 1 ? 'property' : 'properties'} included — delete
                records?
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Properties will move to Deleted Properties and can be restored later.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmBulkDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
      {permanentDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPermanentDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Permanently delete?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This will permanently remove{' '}
              <span className="font-medium text-foreground">
                {permanentDeleteConfirm.title}
              </span>{' '}
              from the dashboard. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPermanentDeleteConfirm(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmPermanentDelete}
              >
                Permanent Delete
              </Button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm whitespace-pre-line rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Properties</h1>
          {showListChrome && (
            <Badge variant="default" className="bg-muted text-muted-foreground">
              {loading ? activeProperties.length : filtered.length}
            </Badge>
          )}
        </div>
        {showListChrome && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search title, locality, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-input py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as PropertyType | '')}
              className="h-9 rounded-md border border-border bg-input px-2 text-sm"
            >
              {ALL_TYPES.map((t) => (
                <option key={t.label} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | '')}
              className="h-9 rounded-md border border-border bg-input px-2 text-sm"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s.label} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
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
            {viewMode === 'list' && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span>Show:</span>
                <select
                  value={listPageSize}
                  onChange={(e) => setListPageSize(Number(e.target.value))}
                  className="h-9 rounded-md border border-border bg-input px-2 text-sm text-foreground"
                  aria-label="Properties per page"
                >
                  {LIST_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <span>per page</span>
              </div>
            )}
          </div>
        )}
      </div>

      {pageTab === 'add' && (
        <AddPropertyForm
          existingProperties={activeProperties}
          editPropertyId={editPropertyId}
          onCreated={(property) => {
            setProperties((prev) => {
              const index = prev.findIndex((item) => item.id === property.id)
              if (index === -1) return [enrichProperty(property), ...prev]
              return prev.map((item) => (item.id === property.id ? enrichProperty(property) : item))
            })
          }}
          onSuccess={(msg) => setToast(msg)}
        />
      )}

      {pageTab === 'upload' && (
        <BulkUploadSection
          onReload={loadProperties}
          navigate={navigate}
          onToast={showToast}
        />
      )}

      {pageTab === 'templates' && (
        <PropertyTemplateSection
          onToast={showToast}
          onSaved={(property) => {
            setProperties((prev) =>
              prev.map((item) => (item.id === property.id ? enrichProperty(property) : item)),
            )
          }}
        />
      )}

      {pageTab === 'featured' && featuredCount >= FEATURED_MAX && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          ⚠️ {featuredCount} featured properties. Too many may slow app loading. Consider
          removing some.
        </div>
      )}

      {pageTab === 'upcoming' && passedLaunchCount > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          {passedLaunchCount} properties have passed launch date. Review them.
        </div>
      )}

      {showListChrome && (
        <>
          {loading ? (
            viewMode === 'grid' ? (
              <GridSkeleton />
            ) : (
              <ListSkeleton />
            )
          ) : filtered.length === 0 ? (
            emptyKind === 'search' ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
                <SearchX className="size-16 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No results for &apos;{search.trim()}&apos;
                </p>
              </div>
            ) : emptyKind === 'featured' ? (
              <TabEmptyFeatured />
            ) : emptyKind === 'upcoming' ? (
              <TabEmptyUpcoming />
            ) : emptyKind === 'none' ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
                <Building2 className="size-16 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No properties yet</p>
                <Button type="button" onClick={() => navigate('/admin/properties/add')}>
                  Add Property
                </Button>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
                <FilterX className="size-16 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  No {filterLabel || 'matching'} properties
                </p>
              </div>
            )
          ) : viewMode === 'grid' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleGrid.map((p) => (
                  <PropertyCard
                    key={p.id}
                    property={p}
                    onView={() => handleView(p.id)}
                    onToggleApp={handleToggleApp}
                    onToast={showToast}
                    onEdit={() => handleEditProperty(p.id)}
                    onPatch={patchProperty}
                    onRequestDelete={requestDeleteProperty}
                  />
                ))}
              </div>
              {filtered.length > 0 && (
                <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing 1–{gridShowingEnd} of {filtered.length} properties
                  </p>
                  {gridRemaining > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setGridVisibleCount((c) =>
                          Math.min(c + GRID_LOAD_CHUNK, filtered.length),
                        )
                      }
                    >
                      Load {Math.min(GRID_LOAD_CHUNK, gridRemaining)} more (
                      {gridRemaining} remaining)
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <PropertyListTable
                items={visibleList}
                onRowClick={handleView}
                onToggleApp={handleToggleApp}
                onToast={showToast}
                onEdit={handleEditProperty}
                onPatch={patchProperty}
                onRequestDelete={requestDeleteProperty}
                enableBulkSelect={enableBulkSelect}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                showUpcomingActions={pageTab === 'upcoming'}
                onMoveToAvailable={handleMoveToAvailable}
                todayIso={todayIso}
              />
              {filtered.length > 0 && (
                <div className="flex flex-col items-center gap-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing 1–{listShowingEnd} of {filtered.length} properties
                  </p>
                  {listRemaining > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setListVisibleCount((c) =>
                          Math.min(c + listPageSize, filtered.length),
                        )
                      }
                    >
                      Load More Properties — load{' '}
                      {Math.min(listPageSize, listRemaining)} more ({listRemaining}{' '}
                      remaining)
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {pageTab === 'all' && !loading && deletedProperties.length > 0 && (
        <DeletedPropertiesSection
          items={deletedProperties}
          onRestore={restoreProperty}
          onPermanentDelete={setPermanentDeleteConfirm}
        />
      )}

      {enableBulkSelect && (
        <div
          className={cn(
            'fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ease-out',
            selectedIds.size > 0
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-6 opacity-0',
          )}
          aria-hidden={selectedIds.size === 0}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-6 py-3 shadow-lg dark:bg-card sm:gap-4">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setBulkDeleteConfirm(true)}
              >
                Delete
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={bulkPauseSelected}>
                Pause
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={bulkFeatureSelected}>
                Feature
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={bulkExportSelected}>
                Export
              </Button>
            </div>
            <button
              type="button"
              className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              Clear selection
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
