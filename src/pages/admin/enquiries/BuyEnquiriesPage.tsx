import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Calendar,
  Copy,
  AlertCircle,
  FilterX,
  Inbox,
  LayoutGrid,
  List,
  Mail,
  Phone,
  Search,
  SearchX,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  findDuplicateEnquiryId,
  formatPreferredVisitTimeDisplay,
  getAdminSalesTeam,
  getSalesPersonById,
  INTEREST_TYPE_BADGES,
  listAdminBuyEnquiries,
  preferredContactIcon,
  type SalesPerson,
  type BuyEnquiry,
  type EnquiryStatus,
  type InterestType,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { getPropertyTypeLabel } from '@/domain/properties'
import { cn } from '@/lib/utils'
import { hoursSince } from '@/utils/timer'

type ViewMode = 'table' | 'card'
type StatusFilter = 'all' | EnquiryStatus

const VIEW_STORAGE_KEY = 'builtglory-enquiries-view'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'responded', label: 'Responded' },
  { key: 'visit_scheduled', label: 'Visit Scheduled' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'closed', label: 'Closed' },
]

const STATUS_LABELS: Record<EnquiryStatus, string> = {
  new: 'New',
  responded: 'Responded',
  visit_scheduled: 'Visit Scheduled',
  negotiating: 'Negotiating',
  closed: 'Closed',
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

function phoneForWhatsApp(phone: string) {
  return phone.replace(/\D/g, '')
}

function getEnquiryRowFlags(enquiry: BuyEnquiry, all: BuyEnquiry[]) {
  const days = hoursSince(enquiry.submittedAt) / 24
  const noResponse7d = days > 7 && enquiry.status === 'new'
  const duplicateOf = findDuplicateEnquiryId(enquiry, all)
  return { noResponse7d, duplicateOf }
}

function InterestBadge({ interestType }: { interestType: InterestType }) {
  const { label, className } = INTEREST_TYPE_BADGES[interestType]
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', className)}>
      {label}
    </span>
  )
}

function StatusBadge({ status }: { status: EnquiryStatus }) {
  const config: Record<EnquiryStatus, { variant?: 'new' | 'responded' | 'pending' | 'default'; className?: string; label: string }> = {
    new: { variant: 'new', label: STATUS_LABELS.new },
    responded: { variant: 'responded', label: STATUS_LABELS.responded },
    visit_scheduled: { className: 'bg-purple-100 text-purple-700', label: STATUS_LABELS.visit_scheduled },
    negotiating: { variant: 'pending', label: STATUS_LABELS.negotiating },
    closed: { variant: 'default', label: STATUS_LABELS.closed },
  }
  const { variant, className, label } = config[status]
  return (
    <Badge variant={variant} className={className}>
      {label}
    </Badge>
  )
}

function ContactActions({
  enquiry,
  size = 'sm',
}: {
  enquiry: BuyEnquiry
  size?: 'sm' | 'icon'
}) {
  const hasEmail = Boolean(enquiry.email)
  const iconSize = size === 'icon' ? 'icon' : 'sm'

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size={iconSize}
        aria-label="Call buyer"
        onClick={() => window.open(`tel:${phoneForWhatsApp(enquiry.phone)}`)}
      >
        <Phone className="size-4" />
      </Button>
      <Button
        variant="outline"
        size={iconSize}
        className="text-green-600 hover:bg-green-50 hover:text-green-700"
        aria-label="WhatsApp buyer"
        onClick={() => window.open(`https://wa.me/${phoneForWhatsApp(enquiry.phone)}`, '_blank')}
      >
        <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </Button>
      <Button
        variant="outline"
        size={iconSize}
        disabled={!hasEmail}
        title={hasEmail ? 'Send email' : 'No email provided'}
        aria-label={hasEmail ? 'Email buyer' : 'No email provided'}
        onClick={() => hasEmail && window.open(`mailto:${enquiry.email}`)}
      >
        <Mail className="size-4" />
      </Button>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-[72px] items-center gap-4 border-b border-border px-4">
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="space-y-4 p-5">
            <div className="flex gap-3">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function EnquiryTableView({
  enquiries,
  salesTeam,
  onViewDetails,
  onCopyPhone,
  onBuyerClick,
}: {
  enquiries: BuyEnquiry[]
  salesTeam: SalesPerson[]
  onViewDetails: (e: BuyEnquiry) => void
  onCopyPhone: (phone: string) => void
  onBuyerClick: (enquiry: BuyEnquiry) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[900px] w-full border-collapse">
          <thead className="bg-muted">
            <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Preferred Visit</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => {
              const { noResponse7d, duplicateOf } = getEnquiryRowFlags(enquiry, enquiries)
              return (
              <tr
                key={enquiry.id}
                className={cn(
                  'h-[72px] cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                  noResponse7d && 'bg-orange-50',
                )}
                onClick={() => onViewDetails(enquiry)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onBuyerClick(enquiry)}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      aria-label={`View ${enquiry.buyerName}`}
                    >
                      {getInitials(enquiry.buyerName)}
                    </button>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onBuyerClick(enquiry)}
                        className="flex items-center gap-1 font-medium text-left hover:text-primary hover:underline"
                      >
                        <span aria-hidden className="text-sm">
                          {preferredContactIcon(enquiry.preferredContact)}
                        </span>
                        {enquiry.buyerName}
                      </button>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
                        onClick={() => onCopyPhone(enquiry.phone)}
                      >
                        {enquiry.phone}
                        <Copy className="size-3" />
                      </button>
                      <p className="text-xs text-muted-foreground">{enquiry.referenceId}</p>
                    </div>
                  </div>
                </td>
                <td className="max-w-[200px] px-4 py-3">
                  <p className="line-clamp-2 font-medium" title={enquiry.propertyTitle}>
                    {enquiry.propertyTitle}
                  </p>
                  <p className="font-semibold text-brand-600">{enquiry.propertyPrice}</p>
                  <Badge variant="default" className="mt-1">
                    {getPropertyTypeLabel(enquiry.propertyType)}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <InterestBadge interestType={enquiry.interestType} />
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatPreferredVisitTimeDisplay(enquiry) ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    <StatusBadge status={enquiry.status} />
                    {noResponse7d && (
                      <span className="text-xs font-medium text-orange-700">No response 7d+</span>
                    )}
                    {duplicateOf && (
                      <span className="text-xs font-medium text-orange-700">
                        Duplicate{' '}
                        <button
                          type="button"
                          className="underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            const orig = enquiries.find((x) => x.id === duplicateOf)
                            if (orig) onViewDetails(orig)
                          }}
                        >
                          View original →
                        </button>
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const assignee = getSalesPersonById(enquiry.assignedTo, salesTeam)
                    if (assignee) {
                      return (
                        <span className="text-sm font-medium">{assignee.name}</span>
                      )
                    }
                    return (
                      <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                        ⚠️ Unassigned
                      </Badge>
                    )
                  })()}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-muted-foreground" title={formatFullDate(enquiry.submittedAt)}>
                    {formatTimeAgo(enquiry.submittedAt)}
                  </span>
                </td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <ContactActions enquiry={enquiry} size="icon" />
                    <Button variant="default" size="sm" onClick={() => onViewDetails(enquiry)}>
                      View →
                    </Button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
    </div>
  )
}

function EnquiryCardView({
  enquiries,
  onViewDetails,
  onBuyerClick,
}: {
  enquiries: BuyEnquiry[]
  onViewDetails: (e: BuyEnquiry) => void
  onBuyerClick: (enquiry: BuyEnquiry) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {enquiries.map((enquiry) => {
        const { noResponse7d, duplicateOf } = getEnquiryRowFlags(enquiry, enquiries)
        return (
        <Card
          key={enquiry.id}
          className={cn(
            'cursor-pointer transition-shadow hover:shadow-md',
            noResponse7d && 'border-orange-200 bg-orange-50/50',
          )}
          onClick={() => onViewDetails(enquiry)}
        >
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onBuyerClick(enquiry)
                  }}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  aria-label={`View ${enquiry.buyerName}`}
                >
                  {getInitials(enquiry.buyerName)}
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onBuyerClick(enquiry)
                    }}
                    className="flex items-center gap-1 truncate font-medium text-left hover:text-primary hover:underline"
                  >
                    <span aria-hidden className="shrink-0 text-sm">
                      {preferredContactIcon(enquiry.preferredContact)}
                    </span>
                    {enquiry.buyerName}
                  </button>
                  <p className="text-xs text-muted-foreground">{enquiry.referenceId}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusBadge status={enquiry.status} />
                {noResponse7d && (
                  <span className="text-xs font-medium text-orange-700">No response 7d+</span>
                )}
                {duplicateOf && (
                  <button
                    type="button"
                    className="text-xs font-medium text-orange-700 underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      const orig = enquiries.find((x) => x.id === duplicateOf)
                      if (orig) onViewDetails(orig)
                    }}
                  >
                    Duplicate · View original →
                  </button>
                )}
                <span className="text-xs text-muted-foreground">{formatTimeAgo(enquiry.submittedAt)}</span>
              </div>
            </div>

            <div>
              <p className="line-clamp-2 font-medium" title={enquiry.propertyTitle}>
                {enquiry.propertyTitle}
              </p>
              <p className="text-lg font-bold text-primary">{enquiry.propertyPrice}</p>
              <Badge variant="default" className="mt-1">
                {getPropertyTypeLabel(enquiry.propertyType)}
              </Badge>
            </div>

            <InterestBadge interestType={enquiry.interestType} />

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="size-4 shrink-0" />
              <span>
                {formatPreferredVisitTimeDisplay(enquiry) ?? 'No visit preference'}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-4">
              <ContactActions enquiry={enquiry} />
              <Button variant="default" size="sm" onClick={() => onViewDetails(enquiry)}>
                View Details →
              </Button>
            </div>
          </CardContent>
        </Card>
      )})}
    </div>
  )
}

export function BuyEnquiriesPage() {
  const navigate = useNavigate()
  const [enquiries, setEnquiries] = useState<BuyEnquiry[]>([])
  const [salesTeam, setSalesTeam] = useState<SalesPerson[]>([])
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
  const [toast, setToast] = useState<string | null>(null)

  const loadEnquiries = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setEnquiries([])
      setSalesTeam([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const [enquiryResult, teamResult] = await Promise.all([
        listAdminBuyEnquiries(session.accessToken),
        getAdminSalesTeam(session.accessToken),
      ])
      setEnquiries(enquiryResult.data)
      setSalesTeam(teamResult)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load buy enquiries.')
      setEnquiries([])
      setSalesTeam([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadEnquiries()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadEnquiries])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: enquiries.length,
      new: 0,
      responded: 0,
      visit_scheduled: 0,
      negotiating: 0,
      closed: 0,
    }
    enquiries.forEach((e) => {
      counts[e.status] += 1
    })
    return counts
  }, [enquiries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enquiries.filter((e) => {
      const matchesStatus = statusFilter === 'all' || e.status === statusFilter
      const matchesSearch =
        !q ||
        e.buyerName.toLowerCase().includes(q) ||
        e.phone.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      return matchesStatus && matchesSearch
    })
  }, [enquiries, search, statusFilter])

  const handleCopyPhone = useCallback((phone: string) => {
    void navigator.clipboard.writeText(phone)
    setToast('Copied!')
  }, [])

  const handleViewDetails = useCallback(
    (enquiry: BuyEnquiry) => {
      navigate(`/admin/enquiries/buy/${enquiry.id}`)
    },
    [navigate],
  )

  const handleViewChange = (mode: ViewMode) => {
    setView(mode)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  const handleBuyerClick = useCallback(
    (enquiry: BuyEnquiry) => {
      if (enquiry.buyerId) {
        navigate(`/admin/users/${enquiry.buyerId}`)
      } else {
        navigate(`/admin/enquiries/buy/${enquiry.id}`)
      }
    },
    [navigate],
  )

  const showEmptyAll = !loading && enquiries.length === 0
  const showEmptySearch = !loading && enquiries.length > 0 && filtered.length === 0 && search.trim()
  const showEmptyFilter = !loading && enquiries.length > 0 && filtered.length === 0 && !search.trim()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Buy Enquiries</h2>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {enquiries.length} enquiries
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs lg:w-64 lg:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search name or phone..."
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
            aria-pressed={view === 'table'}
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === 'card' ? 'default' : 'outline'}
            size="sm"
            className={cn(view === 'card' && 'bg-primary text-primary-foreground hover:bg-brand-700')}
            onClick={() => handleViewChange('card')}
            aria-label="Card view"
            aria-pressed={view === 'card'}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label} ({statusCounts[f.key]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter tabs */}
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

      {/* Content */}
      {loading && (view === 'table' ? <TableSkeleton /> : <CardSkeleton />)}

      {!loading && loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-destructive/70" />
            <h3 className="text-lg font-semibold">Could not load buy enquiries</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadEnquiries()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyAll && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No enquiries yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Buyer enquiries from the app will appear here</p>
          </CardContent>
        </Card>
      )}

      {showEmptySearch && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <SearchX className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No results for &apos;{search}&apos;</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try a different name or phone number</p>
            <Button variant="outline" className="mt-4" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyFilter && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FilterX className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">
              No {statusFilter === 'all' ? '' : STATUS_LABELS[statusFilter as EnquiryStatus].toLowerCase()}{' '}
              enquiries
            </h3>
            <Button variant="outline" className="mt-4" onClick={() => setStatusFilter('all')}>
              Clear filter
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <>
          {view === 'table' ? (
            <EnquiryTableView
              enquiries={filtered}
              salesTeam={salesTeam}
              onViewDetails={handleViewDetails}
              onCopyPhone={handleCopyPhone}
              onBuyerClick={handleBuyerClick}
            />
          ) : (
            <EnquiryCardView
              enquiries={filtered}
              onViewDetails={handleViewDetails}
              onBuyerClick={handleBuyerClick}
            />
          )}
        </>
      )}
    </div>
  )
}
