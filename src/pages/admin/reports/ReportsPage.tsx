import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { Link, useLocation } from 'react-router'
import {
  BarChart2,
  Building,
  Building2,
  Handshake,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  absoluteAdminDownloadUrl,
  createAdminReportExport,
  getAcquisitionAnalytics,
  getAdminReportExport,
  getAdminReportExportDownloadUrl,
  getPropertyTypeLabel,
  getRevenueAnalytics,
  getSalesAnalytics,
  listAdminReportExports,
  listAdminReportProperties,
  listAdminReportUsers,
  type AcquisitionAnalytics,
  type ReportExportRequest,
  type ReportProperty,
  type ReportUser,
  type RevenueAnalytics,
  type SalesAnalytics,
} from '@/api/adminReports'
import {
  formatPrice,
  getSalesStageLabel,
  listAdminSalesDeals,
  type SalesDeal,
} from '@/api/adminSales'
import {
  formatPrice as formatAcqPrice,
  getStageLabel,
  listAdminAcquisitions,
  type Acquisition,
  type AcquisitionStage,
} from '@/api/adminAcquisitions'
import { cn } from '@/lib/utils'
import { chartHasNumericData } from '@/utils/edgeCases'
import { readAdminSession } from '@/api/admin'

type ReportTab = 'sales' | 'acquisition' | 'revenue' | 'export'
type DateRangeKey = 'week' | 'month' | 'quarter' | 'year' | 'custom'
type PropertyTypeFilter =
  | 'all'
  | 'plot'
  | 'apartment'
  | 'residential'
  | 'commercial'
  | 'villa'
  | 'other'

const DATE_RANGES: { key: DateRangeKey; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
]

const PROPERTY_TYPE_OPTIONS: { value: PropertyTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'plot', label: 'Plot' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'villa', label: 'Villa' },
  { value: 'other', label: 'Other' },
]

const STAGE_CHART_COLORS: Record<AcquisitionStage, string> = {
  pending_review: '#3b82f6',
  site_inspection: '#8b5cf6',
  valuation: '#f97316',
  negotiation: '#eab308',
  token_to_seller: '#22c55e',
  documentation: '#14b8a6',
  seller_payout: '#6366f1',
  acquired: '#15803d',
  rejected: '#ef4444',
  on_hold: '#94a3b8',
}

const PROPERTY_TYPE_CHART_COLORS: Record<PropertyTypeFilter, string> = {
  all: '#64748b',
  apartment: '#3b82f6',
  villa: '#22c55e',
  plot: '#f59e0b',
  commercial: '#8b5cf6',
  residential: '#14b8a6',
  other: '#64748b',
}

const CHART_TOOLTIP = {
  borderRadius: '8px',
  border: '1px solid var(--border)',
  fontSize: '12px',
}

const EXPORT_FIELD_OPTIONS: Record<string, string[]> = {
  properties: [
    'ID',
    'Title',
    'Type',
    'Price',
    'Status',
    'Location',
    'Added Date',
  ],
  users: ['ID', 'Name', 'Phone', 'Email', 'Type', 'KYC Status', 'Registered'],
  sales: ['Deal ID', 'Buyer', 'Property', 'Stage', 'Amount', 'Date'],
  acquisitions: ['ID', 'Property', 'Seller', 'Stage', 'Price', 'Date'],
}

function getReportTab(pathname: string): ReportTab {
  if (pathname.includes('/reports/acquisition')) return 'acquisition'
  if (pathname.includes('/reports/revenue')) return 'revenue'
  if (pathname.includes('/reports/export')) return 'export'
  return 'sales'
}

function normalizePropertyType(type: string): PropertyTypeFilter {
  const t = type.toLowerCase()
  if (t.includes('villa')) return 'villa'
  if (t.includes('plot') || t === 'land') return 'plot'
  if (t.includes('apartment')) return 'apartment'
  if (t.includes('commercial') || t.includes('office') || t.includes('shop'))
    return 'commercial'
  if (t.includes('residential') || t.includes('house')) return 'residential'
  return 'other'
}

function matchesPropertyType(type: string, filter: PropertyTypeFilter) {
  if (filter === 'all') return true
  return normalizePropertyType(type) === filter
}

function monthInput(date: Date) {
  return date.toISOString().slice(0, 7)
}

function defaultMonthStart() {
  const now = new Date()
  return `${monthInput(now)}-01`
}

function defaultMonthEnd() {
  return new Date().toISOString().slice(0, 10)
}

function isInDateRange(iso: string | null, range: DateRangeKey, customFrom: string, customTo: string) {
  if (!iso) return range !== 'custom'
  const d = new Date(iso)
  const now = new Date()
  if (range === 'custom') {
    if (customFrom && d < new Date(customFrom)) return false
    if (customTo && d > new Date(`${customTo}T23:59:59`)) return false
    return true
  }
  if (range === 'week') {
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    return d >= weekAgo
  }
  if (range === 'month') {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }
  if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3)
    const dq = Math.floor(d.getMonth() / 3)
    return dq === q && d.getFullYear() === now.getFullYear()
  }
  return d.getFullYear() === now.getFullYear()
}

function dateRangeParams(range: DateRangeKey, customFrom: string, customTo: string) {
  const now = new Date()
  if (range === 'custom') {
    return { from: customFrom || undefined, to: customTo || undefined }
  }
  if (range === 'week') {
    const from = new Date(now)
    from.setDate(from.getDate() - 7)
    return { from: from.toISOString(), to: now.toISOString() }
  }
  if (range === 'month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: now.toISOString(),
    }
  }
  if (range === 'quarter') {
    const quarterStart = Math.floor(now.getMonth() / 3) * 3
    return {
      from: new Date(now.getFullYear(), quarterStart, 1).toISOString(),
      to: now.toISOString(),
    }
  }
  return {
    from: new Date(now.getFullYear(), 0, 1).toISOString(),
    to: now.toISOString(),
  }
}

function monthKey(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-IN', { month: 'short' })
}

function monthSortKey(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return monthInput(date)
}

function formatMonthLabel(value: string) {
  const date = new Date(`${value}-01T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { month: 'short' })
}

function formatDealType(type: string) {
  return getPropertyTypeLabel(type)
}

function formatClosedDate(deal: SalesDeal) {
  if (!deal.closedAt) return '—'
  return new Date(deal.closedAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function paymentTypeLabel(deal: SalesDeal) {
  if (!deal.paymentType) return '—'
  if (deal.paymentType === 'full') return 'Full Payment'
  if (deal.paymentType === 'stage') return 'Stage Payment'
  return deal.paymentType
}

function formatRate(numerator: number, denominator: number) {
  if (denominator <= 0) return '—'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function percentOf(value: number, total: number) {
  if (total <= 0) return 0
  return Number(((value / total) * 100).toFixed(1))
}

function buildTypeDonut<T>(
  items: T[],
  valueOf: (item: T) => number,
  typeOf: (item: T) => string,
) {
  const totals = new Map<PropertyTypeFilter, number>()
  let total = 0
  for (const item of items) {
    const amount = valueOf(item)
    if (amount <= 0) continue
    const type = normalizePropertyType(typeOf(item))
    totals.set(type, (totals.get(type) ?? 0) + amount)
    total += amount
  }
  return Array.from(totals.entries()).map(([type, value]) => ({
    name: getPropertyTypeLabel(type),
    value: percentOf(value, total),
    color: PROPERTY_TYPE_CHART_COLORS[type],
  }))
}

function ComparedPropertyRow({ property }: { property: ReportProperty }) {
  const enquiryRate = formatRate(property.enquiries, property.views)
  const conversion = formatRate(property.visits, property.enquiries)

  return (
    <tr className="border-b border-border hover:bg-muted/30">
      <td className="px-3 py-3">
        <p className="font-medium">{property.title}</p>
        <p className="text-xs text-muted-foreground">
          {getPropertyTypeLabel(property.type)} · {property.locality}
        </p>
      </td>
      <td className="px-3 py-3 font-semibold text-orange-700">{property.compareCount}</td>
      <td className="px-3 py-3 text-muted-foreground">{enquiryRate}</td>
      <td className="px-3 py-3 text-muted-foreground">{conversion}</td>
      <td className="px-3 py-3">
        <Link
          to={`/admin/properties/${property.id}`}
          className="text-primary hover:underline"
        >
          View →
        </Link>
      </td>
    </tr>
  )
}

function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[320px] animate-pulse rounded-xl bg-muted" />
        <div className="h-[320px] animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  )
}

function EmptyChartState() {
  return (
    <div className="flex h-[300px] flex-col items-center justify-center text-muted-foreground">
      <BarChart2 className="mb-2 size-10 opacity-30" />
      <p className="text-sm">No data for selected period</p>
      <p className="mt-1 text-xs">Try a different date range</p>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  iconWrapClass,
}: {
  label: string
  value: string
  icon: ComponentType<{ className?: string }>
  iconWrapClass: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-lg',
            iconWrapClass,
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function DonutChartCard({
  title,
  data,
  empty,
}: {
  title: string
  data: { name: string; value: number; color: string }[]
  empty?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty || !chartHasNumericData(data, ['value']) ? (
          <EmptyChartState />
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="35%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${value ?? 0}%`]}
                  contentStyle={CHART_TOOLTIP}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', paddingLeft: '16px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ReportsPage() {
  const { pathname } = useLocation()
  const tab = getReportTab(pathname)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [salesDeals, setSalesDeals] = useState<SalesDeal[]>([])
  const [acquisitions, setAcquisitions] = useState<Acquisition[]>([])
  const [properties, setProperties] = useState<ReportProperty[]>([])
  const [users, setUsers] = useState<ReportUser[]>([])
  const [exportJobs, setExportJobs] = useState<ReportExportRequest[]>([])
  const [salesAnalytics, setSalesAnalytics] = useState<SalesAnalytics | null>(null)
  const [acquisitionAnalytics, setAcquisitionAnalytics] = useState<AcquisitionAnalytics | null>(null)
  const [revenueAnalytics, setRevenueAnalytics] = useState<RevenueAnalytics | null>(null)
  const [dateRange, setDateRange] = useState<DateRangeKey>('month')
  const [customFrom, setCustomFrom] = useState(defaultMonthStart)
  const [customTo, setCustomTo] = useState(defaultMonthEnd)
  const [propertyType, setPropertyType] = useState<PropertyTypeFilter>('all')
  const [toast, setToast] = useState<string | null>(null)

  const [customExportType, setCustomExportType] = useState('properties')
  const [exportFields, setExportFields] = useState<Set<string>>(
    () => new Set(EXPORT_FIELD_OPTIONS.properties),
  )
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'pdf'>('csv')
  const [exportEmail, setExportEmail] = useState(
    () => readAdminSession()?.admin.email ?? 'admin@builtglory.com',
  )
  const [exporting, setExporting] = useState(false)

  const estimatedExportRows = useMemo(() => {
    const estimates: Record<string, number> = {
      properties: properties.length,
      users: users.length,
      sales: salesDeals.length,
      acquisitions: acquisitions.length,
    }
    return estimates[customExportType] ?? 0
  }, [customExportType, properties.length, users.length, salesDeals.length, acquisitions.length])

  const isLargeExport = estimatedExportRows > 10000
  const [exportFrom, setExportFrom] = useState(defaultMonthStart)
  const [exportTo, setExportTo] = useState(defaultMonthEnd)
  const showToast = useCallback((msg: string) => setToast(msg), [])

  const loadReports = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const [salesResult, acquisitionResult, propertyResult, userResult, exportResult] = await Promise.all([
        listAdminSalesDeals(session.accessToken, { limit: 100, sort: 'newest' }),
        listAdminAcquisitions(session.accessToken, { limit: 100, sort: 'newest' }),
        listAdminReportProperties(session.accessToken, { limit: 100, sort: 'newest' }),
        listAdminReportUsers(session.accessToken, { limit: 100, sort: 'newest' }),
        listAdminReportExports(session.accessToken).catch(() => ({ data: [] as ReportExportRequest[] })),
      ])
      setSalesDeals(salesResult.data)
      setAcquisitions(acquisitionResult.data)
      setProperties(propertyResult.data)
      setUsers(userResult.data)
      setExportJobs(exportResult.data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load report data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const loadAnalytics = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) return

    const range = dateRangeParams(dateRange, customFrom, customTo)
    const params = {
      ...range,
      propertyType: propertyType === 'all' ? undefined : propertyType,
    }
    try {
      const [sales, acquisition, revenue] = await Promise.all([
        getSalesAnalytics(session.accessToken, params),
        getAcquisitionAnalytics(session.accessToken, params),
        getRevenueAnalytics(session.accessToken, params),
      ])
      setSalesAnalytics(sales)
      setAcquisitionAnalytics(acquisition)
      setRevenueAnalytics(revenue)
    } catch (error) {
      setSalesAnalytics(null)
      setAcquisitionAnalytics(null)
      setRevenueAnalytics(null)
      showToast(error instanceof Error ? error.message : 'Unable to load backend report aggregates.')
    }
  }, [dateRange, customFrom, customTo, propertyType, showToast])

  useEffect(() => {
    void loadAnalytics()
  }, [loadAnalytics])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const closedDeals = useMemo(() => {
    return salesDeals.filter((d) => {
      if (d.stage !== 'closed') return false
      if (!matchesPropertyType(d.propertyType, propertyType)) return false
      return isInDateRange(d.closedAt, dateRange, customFrom, customTo)
    })
  }, [salesDeals, propertyType, dateRange, customFrom, customTo])

  const allDealsFiltered = useMemo(() => {
    return salesDeals.filter((d) => matchesPropertyType(d.propertyType, propertyType))
  }, [salesDeals, propertyType])

  const acquisitionsFiltered = useMemo(() => {
    return acquisitions.filter((a) => {
      if (!matchesPropertyType(a.propertyType, propertyType)) return false
      return isInDateRange(a.lastActivityAt, dateRange, customFrom, customTo)
    })
  }, [acquisitions, propertyType, dateRange, customFrom, customTo])

  const acquiredList = useMemo(
    () => acquisitionsFiltered.filter((a) => a.stage === 'acquired'),
    [acquisitionsFiltered],
  )

  const pipelineList = useMemo(
    () =>
      acquisitionsFiltered.filter(
        (a) => a.stage !== 'acquired' && a.stage !== 'rejected',
      ),
    [acquisitionsFiltered],
  )

  const pipelineChartData = useMemo(() => {
    if (acquisitionAnalytics) {
      const counts = new Map(acquisitionAnalytics.stageCounts.map((item) => [item.stage, item.count]))
      return (Object.keys(STAGE_CHART_COLORS) as AcquisitionStage[])
        .filter((s) => s !== 'rejected')
        .map((stage) => ({
          stage: getStageLabel(stage),
          count: counts.get(stage) ?? 0,
          fill: STAGE_CHART_COLORS[stage],
          key: stage,
        }))
    }
    const counts: Partial<Record<AcquisitionStage, number>> = {}
    for (const a of acquisitions) {
      if (!matchesPropertyType(a.propertyType, propertyType)) continue
      counts[a.stage] = (counts[a.stage] ?? 0) + 1
    }
    return (Object.keys(STAGE_CHART_COLORS) as AcquisitionStage[])
      .filter((s) => s !== 'rejected')
      .map((stage) => ({
        stage: getStageLabel(stage),
        count: counts[stage] ?? 0,
        fill: STAGE_CHART_COLORS[stage],
        key: stage,
      }))
  }, [acquisitions, propertyType, acquisitionAnalytics])

  const pendingPayments = useMemo(() => {
    return salesDeals.filter((d) => {
      if (d.stage === 'closed' || d.stage === 'lost') return false
      if (!matchesPropertyType(d.propertyType, propertyType)) return false
      return [
        'token_payment',
        'full_payment',
        'stage_payment',
        'documentation',
        'negotiation',
      ].includes(d.stage)
    })
  }, [salesDeals, propertyType])

  const mostComparedProperties = useMemo(() => {
    return [...properties]
      .filter((property) => !property.isDeleted)
      .sort((a, b) => b.compareCount - a.compareCount)
      .slice(0, 5)
  }, [properties])

  const salesStats = useMemo(() => {
    if (salesAnalytics) {
      return {
        count: salesAnalytics.stats.count,
        revenue: salesAnalytics.stats.revenue,
        avg: salesAnalytics.stats.averageDealValue,
        conversion: Math.round(salesAnalytics.stats.conversion),
      }
    }
    const revenue = closedDeals.reduce((s, d) => s + (d.agreedPrice ?? 0), 0)
    const count = closedDeals.length
    const total = allDealsFiltered.length
    const conversion = total > 0 ? Math.round((count / total) * 100) : 0
    return {
      count,
      revenue,
      avg: count > 0 ? revenue / count : 0,
      conversion,
    }
  }, [closedDeals, allDealsFiltered, salesAnalytics])

  const acquisitionStats = useMemo(() => {
    if (acquisitionAnalytics) {
      return {
        count: acquisitionAnalytics.stats.count,
        cost: acquisitionAnalytics.stats.cost,
        avg: acquisitionAnalytics.stats.averageCost,
        pipelineActive: acquisitionAnalytics.stats.pipelineActive,
      }
    }
    const acquired = acquiredList
    const cost = acquired.reduce((s, a) => s + (a.finalPurchasePrice ?? 0), 0)
    const count = acquired.length
    const pipelineActive = pipelineList.length
    return {
      count,
      cost,
      avg: count > 0 ? cost / count : 0,
      pipelineActive,
    }
  }, [acquiredList, pipelineList, acquisitionAnalytics])

  const revenueStats = useMemo(() => {
    if (revenueAnalytics) return revenueAnalytics.stats
    const revenue = closedDeals.reduce((s, d) => s + (d.agreedPrice ?? 0), 0)
    const cost = acquiredList.reduce((s, a) => s + (a.finalPurchasePrice ?? 0), 0)
    const profit = revenue - cost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    return { revenue, cost, profit, margin }
  }, [closedDeals, acquiredList, revenueAnalytics])

  const dealsByMonth = useMemo(() => {
    if (salesAnalytics) {
      return salesAnalytics.monthlyClosedDeals.map((item) => ({
        month: formatMonthLabel(item.month),
        deals: item.deals,
      }))
    }
    const counts = new Map<string, { sort: string; month: string; deals: number }>()
    for (const deal of closedDeals) {
      const month = monthKey(deal.closedAt)
      if (!month) continue
      const sort = monthSortKey(deal.closedAt)
      const current = counts.get(sort) ?? { sort, month, deals: 0 }
      current.deals += 1
      counts.set(sort, current)
    }
    return Array.from(counts.values())
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ month, deals }) => ({ month, deals }))
  }, [closedDeals, salesAnalytics])

  const revenueByType = useMemo(
    () => {
      if (salesAnalytics) {
        const total = salesAnalytics.revenueByType.reduce((sum, item) => sum + item.revenue, 0)
        return salesAnalytics.revenueByType.map((item) => {
          const type = normalizePropertyType(item.type)
          return {
            name: getPropertyTypeLabel(item.type),
            value: percentOf(item.revenue, total),
            color: PROPERTY_TYPE_CHART_COLORS[type],
          }
        })
      }
      return buildTypeDonut(closedDeals, (deal) => deal.agreedPrice ?? 0, (deal) => deal.propertyType)
    },
    [closedDeals, salesAnalytics],
  )

  const acquisitionByType = useMemo(
    () => {
      if (acquisitionAnalytics) {
        const total = acquisitionAnalytics.acquisitionByType.reduce((sum, item) => sum + item.value, 0)
        return acquisitionAnalytics.acquisitionByType.map((item) => {
          const type = normalizePropertyType(item.type)
          return {
            name: getPropertyTypeLabel(item.type),
            value: percentOf(item.value, total),
            color: PROPERTY_TYPE_CHART_COLORS[type],
          }
        })
      }
      return buildTypeDonut(
        acquisitionsFiltered,
        (acquisition) => acquisition.finalPurchasePrice ?? acquisition.agreedPrice ?? acquisition.askingPrice,
        (acquisition) => acquisition.propertyType,
      )
    },
    [acquisitionsFiltered, acquisitionAnalytics],
  )

  const revenueVsCost = useMemo(() => {
    if (revenueAnalytics) {
      return revenueAnalytics.revenueVsCost.map((item) => ({
        month: formatMonthLabel(item.month),
        revenue: Number((item.revenue / 100000).toFixed(2)),
        cost: Number((item.cost / 100000).toFixed(2)),
      }))
    }
    const buckets = new Map<string, { sort: string; month: string; revenue: number; cost: number }>()
    for (const deal of closedDeals) {
      const month = monthKey(deal.closedAt)
      if (!month) continue
      const sort = monthSortKey(deal.closedAt)
      const current = buckets.get(sort) ?? { sort, month, revenue: 0, cost: 0 }
      current.revenue += (deal.agreedPrice ?? 0) / 100000
      buckets.set(sort, current)
    }
    for (const acquisition of acquiredList) {
      const month = monthKey(acquisition.lastActivityAt)
      if (!month) continue
      const sort = monthSortKey(acquisition.lastActivityAt)
      const current = buckets.get(sort) ?? { sort, month, revenue: 0, cost: 0 }
      current.cost += (acquisition.finalPurchasePrice ?? 0) / 100000
      buckets.set(sort, current)
    }
    return Array.from(buckets.values())
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ month, revenue, cost }) => ({
        month,
        revenue: Number(revenue.toFixed(2)),
        cost: Number(cost.toFixed(2)),
      }))
  }, [closedDeals, acquiredList, revenueAnalytics])

  const profitTrend = useMemo(
    () => {
      if (revenueAnalytics) {
        return revenueAnalytics.profitTrend.map((item) => ({
          month: formatMonthLabel(item.month),
          profit: Number((item.profit / 100000).toFixed(2)),
        }))
      }
      return revenueVsCost.map((row) => ({
        month: row.month,
        profit: Number((row.revenue - row.cost).toFixed(2)),
      }))
    },
    [revenueVsCost, revenueAnalytics],
  )

  const showEmptyData =
    !loading &&
    ((tab === 'sales' && closedDeals.length === 0) ||
      (tab === 'acquisition' &&
        acquiredList.length === 0 &&
        pipelineList.length === 0))

  const buildExportRows = (type: string): Array<Record<string, unknown>> => {
    const inExportRange = (iso: string | null) =>
      isInDateRange(iso, 'custom', exportFrom, exportTo)

    if (type === 'properties') {
      return properties
        .filter((property) => inExportRange(property.createdAt))
        .map((property) => ({
          ID: property.referenceId || property.id,
          Title: property.title,
          Type: getPropertyTypeLabel(property.type),
          Price: property.price,
          Status: property.status,
          Location: [property.locality, property.city].filter(Boolean).join(', '),
          'Added Date': property.createdAt,
        }))
    }

    if (type === 'users') {
      return users
        .filter((user) => inExportRange(user.registeredAt))
        .map((user) => ({
          ID: user.referenceId || user.id,
          Name: user.name,
          Phone: user.phone,
          Email: user.email,
          Type: user.userType,
          'KYC Status': user.kycStatus,
          Registered: user.registeredAt,
        }))
    }

    if (type === 'sales') {
      return salesDeals
        .filter((deal) => inExportRange(deal.closedAt ?? deal.lastActivityAt))
        .map((deal) => ({
          'Deal ID': deal.referenceId || deal.id,
          Buyer: deal.buyerName,
          Property: deal.propertyTitle,
          Stage: getSalesStageLabel(deal.stage),
          Amount: deal.agreedPrice ?? deal.offeredPrice ?? deal.propertyPrice,
          Date: deal.closedAt ?? deal.lastActivityAt,
        }))
    }

    if (type === 'acquisitions') {
      return acquisitions
        .filter((acquisition) => inExportRange(acquisition.lastActivityAt))
        .map((acquisition) => ({
          ID: acquisition.referenceId || acquisition.id,
          Property: acquisition.propertyTitle,
          Seller: acquisition.sellerName,
          Stage: getStageLabel(acquisition.stage),
          Price:
            acquisition.finalPurchasePrice ??
            acquisition.agreedPrice ??
            acquisition.builtgloryOffer ??
            acquisition.askingPrice,
          Date: acquisition.lastActivityAt,
        }))
    }

    return []
  }

  const handleExport = async (type: string, format: 'csv' | 'xlsx' | 'pdf' = 'csv') => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      showToast('Admin session expired. Please sign in again.')
      return
    }

    setExporting(true)
    try {
      const queued = await createAdminReportExport(session.accessToken, {
        reportType: type,
        format,
        fields: Array.from(exportFields),
        from: exportFrom,
        to: exportTo,
        estimatedRows: buildExportRows(type).length,
        deliveryEmail: exportEmail,
      })
      setExportJobs((prev) => [queued, ...prev.filter((job) => job.referenceId !== queued.referenceId)].slice(0, 20))
      showToast(
        queued.status === 'completed'
          ? `Export ${queued.referenceId} generated with ${(queued.rowCount ?? 0).toLocaleString('en-IN')} rows.`
          : `Export ${queued.referenceId} is ${queued.status}.`,
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to queue export.')
    } finally {
      setExporting(false)
    }
  }

  const handleDownloadExport = async (job: ReportExportRequest) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      showToast('Admin session expired. Please sign in again.')
      return
    }

    try {
      const latest = await getAdminReportExport(session.accessToken, job.id ?? job.referenceId)
      setExportJobs((prev) =>
        prev.map((item) =>
          (item.id ?? item.referenceId) === (job.id ?? job.referenceId) ? latest : item,
        ),
      )
      if (latest.status !== 'completed') {
        showToast(`Export ${latest.referenceId} is ${latest.status}.`)
        return
      }
      const download = await getAdminReportExportDownloadUrl(
        session.accessToken,
        latest.id ?? latest.referenceId,
      )
      if (!download.downloadUrl) {
        showToast(`Export ${latest.referenceId} is not ready to download.`)
        return
      }
      window.open(absoluteAdminDownloadUrl(download.downloadUrl), '_blank', 'noopener,noreferrer')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to download export.')
    }
  }

  const toggleExportField = (field: string) => {
    setExportFields((prev) => {
      const next = new Set(prev)
      if (next.has(field)) next.delete(field)
      else next.add(field)
      return next
    })
  }

  useEffect(() => {
    setExportFields(new Set(EXPORT_FIELD_OPTIONS[customExportType] ?? []))
  }, [customExportType])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <ReportsSkeleton />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <BarChart2 className="size-10 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Unable to load reports</p>
              <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
            </div>
            <Button type="button" onClick={() => void loadReports()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {DATE_RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  dateRange === r.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
                onClick={() => setDateRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value as PropertyTypeFilter)}
            className="h-9 rounded-md border border-border bg-input px-2 text-sm"
            aria-label="Property type filter"
          >
            {PROPERTY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dateRange === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">From</span>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 rounded-md border border-border bg-input px-2"
          />
          <span className="text-muted-foreground">To</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 rounded-md border border-border bg-input px-2"
          />
        </div>
      )}

      {tab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Deals Closed"
              value={String(salesStats.count)}
              icon={Handshake}
              iconWrapClass="bg-blue-100 text-blue-600"
            />
            <StatCard
              label="Total Revenue"
              value={formatPrice(salesStats.revenue)}
              icon={TrendingUp}
              iconWrapClass="bg-green-100 text-green-600"
            />
            <StatCard
              label="Average Deal Size"
              value={salesStats.count > 0 ? formatPrice(salesStats.avg) : '—'}
              icon={BarChart2}
              iconWrapClass="bg-purple-100 text-purple-600"
            />
            <StatCard
              label="Conversion Rate"
              value={`${salesStats.conversion}%`}
              icon={Target}
              iconWrapClass="bg-orange-100 text-orange-600"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Deals Closed by Month</CardTitle>
              </CardHeader>
              <CardContent>
                {!chartHasNumericData(dealsByMonth, ['deals']) ? (
                  <EmptyChartState />
                ) : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dealsByMonth} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP} />
                        <Bar dataKey="deals" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <DonutChartCard title="Revenue by Property Type" data={revenueByType} empty={showEmptyData} />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Properties</CardTitle>
              <p className="text-sm text-muted-foreground">Comparison analytics from app (B-15)</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Most Compared Properties
              </h3>
              {mostComparedProperties.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No comparison data available
                </p>
              ) : (
                <table className="min-w-[720px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Compare Count</th>
                      <th className="px-3 py-2">Enquiry Rate</th>
                      <th className="px-3 py-2">Conversion</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mostComparedProperties.map((property) => (
                      <ComparedPropertyRow key={property.id} property={property} />
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Closed Deals</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {closedDeals.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No closed deals in this period
                </p>
              ) : (
                <table className="min-w-[720px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Buyer</th>
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2">Agreed Price</th>
                      <th className="px-3 py-2">Closed Date</th>
                      <th className="px-3 py-2">Payment Type</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedDeals.map((deal) => (
                      <tr key={deal.id} className="border-b border-border hover:bg-muted/30">
                        <td className="px-3 py-3 font-medium">{deal.buyerName}</td>
                        <td className="px-3 py-3">{deal.propertyTitle}</td>
                        <td className="px-3 py-3">
                          <Badge variant="default">{formatDealType(deal.propertyType)}</Badge>
                        </td>
                        <td className="px-3 py-3 font-semibold text-primary">
                          {deal.agreedPrice ? formatPrice(deal.agreedPrice) : '—'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatClosedDate(deal)}
                        </td>
                        <td className="px-3 py-3">{paymentTypeLabel(deal)}</td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/admin/sales/${deal.id}`}
                            className="text-primary hover:underline"
                          >
                            View Deal →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'acquisition' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Acquired"
              value={String(acquisitionStats.count)}
              icon={Building2}
              iconWrapClass="bg-blue-100 text-blue-600"
            />
            <StatCard
              label="Total Acquisition Cost"
              value={formatAcqPrice(acquisitionStats.cost)}
              icon={Wallet}
              iconWrapClass="bg-green-100 text-green-600"
            />
            <StatCard
              label="Avg Acquisition Price"
              value={
                acquisitionStats.count > 0
                  ? formatAcqPrice(acquisitionStats.avg)
                  : '—'
              }
              icon={BarChart2}
              iconWrapClass="bg-purple-100 text-purple-600"
            />
            <StatCard
              label="Pipeline Active"
              value={String(acquisitionStats.pipelineActive)}
              icon={TrendingUp}
              iconWrapClass="bg-orange-100 text-orange-600"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Acquisition Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                {!chartHasNumericData(pipelineChartData, ['count']) ? (
                  <EmptyChartState />
                ) : (
                  <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={pipelineChartData}
                        margin={{ top: 8, right: 8, left: -12, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="stage"
                          tick={{ fontSize: 10 }}
                          stroke="#94a3b8"
                          angle={-35}
                          textAnchor="end"
                          height={70}
                        />
                        <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                        <Tooltip contentStyle={CHART_TOOLTIP} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                          {pipelineChartData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <DonutChartCard
              title="By Property Type"
              data={acquisitionByType}
              empty={showEmptyData}
            />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Active Acquisitions</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {pipelineList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No active acquisitions in this period
                </p>
              ) : (
                <table className="min-w-[800px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Seller</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Asking Price</th>
                      <th className="px-3 py-2">BG Offer</th>
                      <th className="px-3 py-2">Days in Stage</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelineList.map((a) => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/30">
                        <td className="px-3 py-3 font-medium">{a.propertyTitle}</td>
                        <td className="px-3 py-3">{a.sellerName}</td>
                        <td className="px-3 py-3">
                          <Badge variant="pending">{getStageLabel(a.stage)}</Badge>
                        </td>
                        <td className="px-3 py-3">{formatAcqPrice(a.askingPrice)}</td>
                        <td className="px-3 py-3">
                          {a.builtgloryOffer ? formatAcqPrice(a.builtgloryOffer) : '—'}
                        </td>
                        <td className="px-3 py-3">{a.daysInStage}d</td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/admin/acquisition/${a.id}`}
                            className="text-primary hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Acquired Properties</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {acquiredList.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No acquired properties in this period
                </p>
              ) : (
                <table className="min-w-[640px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Final Price</th>
                      <th className="px-3 py-2">Acquired Date</th>
                      <th className="px-3 py-2">Listed</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acquiredList.map((a) => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/30">
                        <td className="px-3 py-3 font-medium">{a.propertyTitle}</td>
                        <td className="px-3 py-3 font-semibold text-primary">
                          {a.finalPurchasePrice
                            ? formatAcqPrice(a.finalPurchasePrice)
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {new Date(a.lastActivityAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="responded">Yes</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            to={`/admin/acquisition/${a.id}`}
                            className="text-primary hover:underline"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total Revenue"
              value={formatPrice(revenueStats.revenue)}
              icon={TrendingUp}
              iconWrapClass="bg-green-100 text-green-600"
            />
            <StatCard
              label="Total Acquisition Cost"
              value={formatAcqPrice(revenueStats.cost)}
              icon={Wallet}
              iconWrapClass="bg-red-100 text-red-600"
            />
            <StatCard
              label="Gross Profit"
              value={formatPrice(revenueStats.profit)}
              icon={revenueStats.profit >= 0 ? TrendingUp : TrendingDown}
              iconWrapClass={
                revenueStats.profit >= 0
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600'
              }
            />
            <StatCard
              label="Profit Margin"
              value={`${revenueStats.margin.toFixed(1)}%`}
              icon={revenueStats.margin >= 0 ? TrendingUp : TrendingDown}
              iconWrapClass={
                revenueStats.margin >= 0
                  ? 'bg-green-100 text-green-600'
                  : 'bg-red-100 text-red-600'
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue vs Acquisition Cost</CardTitle>
              </CardHeader>
              <CardContent>
                {!chartHasNumericData(revenueVsCost, ['revenue', 'cost']) ? (
                  <EmptyChartState />
                ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueVsCost} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" unit="L" />
                      <Tooltip
                        formatter={(v, name) => [
                          `₹${v}L`,
                          name === 'revenue' ? 'Revenue' : 'Cost',
                        ]}
                        contentStyle={CHART_TOOLTIP}
                      />
                      <Legend />
                      <Bar dataKey="revenue" fill="#3B82F6" name="Revenue" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" fill="#EF4444" name="Cost" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Monthly Profit Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {!chartHasNumericData(profitTrend, ['profit']) ? (
                  <EmptyChartState />
                ) : (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={profitTrend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" unit="L" />
                      <Tooltip
                        formatter={(v) => [`₹${v}L`, 'Profit']}
                        contentStyle={CHART_TOOLTIP}
                      />
                      <Line
                        type="monotone"
                        dataKey="profit"
                        stroke="#22c55e"
                        strokeWidth={2.5}
                        dot={{ fill: '#22c55e', r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pending Payments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {pendingPayments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No pending payments
                </p>
              ) : (
                <table className="min-w-[800px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2">Buyer</th>
                      <th className="px-3 py-2">Property</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Deal Value</th>
                      <th className="px-3 py-2">Paid So Far</th>
                      <th className="px-3 py-2">Balance Due</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingPayments.map((d) => {
                      const value = d.agreedPrice ?? d.offeredPrice ?? d.propertyPrice
                      const balance = Math.max(0, value - d.totalPaid)
                      return (
                        <tr key={d.id} className="border-b border-border hover:bg-muted/30">
                          <td className="px-3 py-3 font-medium">{d.buyerName}</td>
                          <td className="px-3 py-3">{d.propertyTitle}</td>
                          <td className="px-3 py-3">
                            <Badge variant="pending">{d.stage.replace(/_/g, ' ')}</Badge>
                          </td>
                          <td className="px-3 py-3">{formatPrice(value)}</td>
                          <td className="px-3 py-3">{formatPrice(d.totalPaid)}</td>
                          <td className="px-3 py-3 font-medium text-orange-700">
                            {formatPrice(balance)}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              to={`/admin/sales/${d.id}`}
                              className="text-primary hover:underline"
                            >
                              View →
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'export' && (
        <div className="mx-auto max-w-[700px] space-y-8">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Export Data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Download reports as CSV, Excel, or PDF from backend-generated export jobs
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                type: 'properties',
                icon: Building2,
                iconClass: 'bg-blue-100 text-blue-600',
                title: 'All Properties',
                desc: 'Export all property listings with specs and status',
                fields:
                  'ID, Title, Type, Price, Status, Location, Added Date…',
                count: properties.length,
              },
              {
                type: 'users',
                icon: Users,
                iconClass: 'bg-green-100 text-green-600',
                title: 'All Users',
                desc: 'Export user database with KYC status and activity',
                fields: 'ID, Name, Phone, Email, Type, KYC Status, Registered…',
                count: users.length,
              },
              {
                type: 'sales',
                icon: TrendingUp,
                iconClass: 'bg-purple-100 text-purple-600',
                title: 'Sales & Deals',
                desc: 'Export all deals with payment details',
                fields: 'Deal ID, Buyer, Property, Stage, Amount, Date…',
                count: salesDeals.length,
              },
              {
                type: 'acquisitions',
                icon: Building,
                iconClass: 'bg-orange-100 text-orange-600',
                title: 'Acquisitions',
                desc: 'Export acquisition pipeline and completed acquisitions',
                fields: 'ID, Property, Seller, Stage, Price, Date…',
                count: acquisitions.length,
              },
            ].map((card) => (
              <Card key={card.title}>
                <CardContent className="space-y-3 p-4">
                  <div
                    className={cn(
                      'flex size-10 items-center justify-center rounded-lg',
                      card.iconClass,
                    )}
                  >
                    <card.icon className="size-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{card.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.desc}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{card.fields}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={exporting}
                      onClick={() => handleExport(card.type, 'csv')}
                    >
                      Export CSV
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={exporting}
                      onClick={() => handleExport(card.type, 'xlsx')}
                    >
                      Export Excel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Custom Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="block text-sm">
                <span className="text-muted-foreground">Data type</span>
                <select
                  value={customExportType}
                  onChange={(e) => setCustomExportType(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-input px-2 text-sm"
                >
                  <option value="properties">Properties</option>
                  <option value="users">Users</option>
                  <option value="sales">Sales</option>
                  <option value="acquisitions">Acquisitions</option>
                </select>
              </label>
              <div>
                <p className="text-sm text-muted-foreground">Select fields</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(EXPORT_FIELD_OPTIONS[customExportType] ?? []).map((field) => (
                    <label key={field} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={exportFields.has(field)}
                        onChange={() => toggleExportField(field)}
                      />
                      {field}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="text-sm">
                  <span className="text-muted-foreground">From</span>
                  <input
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="mt-1 block h-9 rounded-md border border-border bg-input px-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted-foreground">To</span>
                  <input
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="mt-1 block h-9 rounded-md border border-border bg-input px-2"
                  />
                </label>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Format</p>
                <div className="mt-2 flex gap-2">
                  {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium uppercase',
                        exportFormat === f
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                      onClick={() => setExportFormat(f)}
                    >
                      {f === 'xlsx' ? 'excel' : f}
                    </button>
                  ))}
                </div>
              </div>
              {isLargeExport && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    Large Export ({estimatedExportRows.toLocaleString()} rows)
                  </p>
                  <p className="mt-1 text-xs text-blue-800">
                    This will be processed in background and emailed to you when ready.
                  </p>
                  <label className="mt-3 block text-sm">
                    <span className="text-muted-foreground">Email</span>
                    <input
                      type="email"
                      value={exportEmail}
                      onChange={(e) => setExportEmail(e.target.value)}
                      className="mt-1 h-9 w-full rounded-md border border-border bg-input px-3 text-sm"
                    />
                  </label>
                </div>
              )}
              <Button
                type="button"
                className="w-full"
                disabled={exporting}
                onClick={() => handleExport(customExportType, exportFormat)}
              >
                {exporting
                  ? 'Queueing Export...'
                  : isLargeExport
                    ? 'Queue Server Export'
                    : 'Generate Export'}
              </Button>
            </CardContent>
          </Card>

          <div>
            <h3 className="mb-3 text-base font-semibold text-foreground">Recent Exports</h3>
            {exportJobs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No export jobs have been queued yet. New CSV, Excel, and PDF requests will appear
                here after the backend accepts them.
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Requested</th>
                      <th className="px-4 py-3">Rows</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportJobs.map((job) => (
                      <tr key={job.id ?? job.referenceId} className="border-t border-border">
                        <td className="px-4 py-3 font-medium">{job.referenceId}</td>
                        <td className="px-4 py-3 uppercase text-muted-foreground">{job.format}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              job.status === 'completed'
                                ? 'responded'
                                : job.status === 'failed'
                                  ? 'red'
                                  : 'pending'
                            }
                          >
                            {job.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(job.requestedAt).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {(job.rowCount ?? 0).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(job.expiresAt).toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadExport(job)}
                          >
                            {job.status === 'completed' ? 'Download' : 'Refresh'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
