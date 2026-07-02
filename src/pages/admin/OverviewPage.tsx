import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertCircle, Building2, CheckCircle, Clock, CreditCard, Handshake, Loader2, MessageSquare, RefreshCw, TrendingUp } from 'lucide-react'
import { ActivityFeed } from '@/components/admin/overview/ActivityFeed'
import { EnquiriesChart } from '@/components/admin/overview/EnquiriesChart'
import { PendingApprovalsTable } from '@/components/admin/overview/PendingApprovalsTable'
import { PropertiesPieChart } from '@/components/admin/overview/PropertiesPieChart'
import { RecentEnquiriesTable } from '@/components/admin/overview/RecentEnquiriesTable'
import { StatCard } from '@/components/admin/overview/StatCard'
import { TodaySchedule } from '@/components/admin/overview/TodaySchedule'
import { formatPrice } from '@/domain/properties'
import { cn } from '@/lib/utils'
import { getAdminOverview, readAdminSession, type AdminOverview, type AdminOverviewSlaItem } from '@/api/admin'

type SlaTone = 'green' | 'orange' | 'red'

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function getOverviewSlaLabel(item: AdminOverviewSlaItem): { text: string; tone: SlaTone } {
  const remaining = item.remainingHours
  if (remaining <= 0) {
    const overdue = Math.abs(remaining)
    if (overdue < 1) return { text: 'OVERDUE just now', tone: 'red' }
    const hrs = Math.max(1, Math.round(overdue))
    return { text: `OVERDUE ${hrs}hrs ago`, tone: 'red' }
  }
  const hrs = Math.max(1, Math.round(remaining))
  if (item.status === 'warning') return { text: `${hrs}hr remaining`, tone: 'orange' }
  return { text: `${hrs}hr remaining`, tone: 'green' }
}

function progressBarColor(percent: number) {
  if (percent >= 100) return 'bg-red-500'
  if (percent >= 80) return 'bg-amber-500'
  return 'bg-green-500'
}

function pipelineCount(items: Array<{ value?: string; count?: number }> | undefined, values?: string[]) {
  if (!items?.length) return 0
  if (!values?.length) return items.reduce((sum, item) => sum + (item.count ?? 0), 0)
  return items
    .filter((item) => item.value && values.includes(item.value))
    .reduce((sum, item) => sum + (item.count ?? 0), 0)
}

const toneTextClass: Record<SlaTone, string> = {
  green: 'text-green-600',
  orange: 'text-amber-600',
  red: 'text-red-600',
}

interface SlaOverviewCardProps {
  title: string
  subtitle: string
  icon: ReactNode
  pendingCount: number
  progressPercent: number
  items: {
    id: string
    name: string
    property: string
    label: { text: string; tone: SlaTone }
    phone?: string
    viewPath: string
  }[]
  moreCount: number
  viewAllPath: string
  viewAllLabel: string
  actionLabel: 'Call' | 'View'
}

function SlaOverviewCard({
  title,
  subtitle,
  icon,
  pendingCount,
  progressPercent,
  items,
  moreCount,
  viewAllPath,
  viewAllLabel,
  actionLabel,
}: SlaOverviewCardProps) {
  const navigate = useNavigate()

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-muted">
            {icon}
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {pendingCount === 0 ? (
        <div className="flex flex-col items-center py-8 text-center">
          <CheckCircle className="mb-2 size-10 text-green-600" strokeWidth={1.5} />
          <p className="font-medium text-green-600">All clear! No pending inquiries</p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>SLA usage</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', progressBarColor(progressPercent))}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  onClick={() => navigate(item.viewPath)}
                >
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                    {getInitials(item.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.property}</p>
                  </div>
                </div>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('text-xs font-medium', toneTextClass[item.label.tone])}>
                    {item.label.text}
                  </span>
                  {actionLabel === 'Call' && item.phone ? (
                    <button
                      type="button"
                      className="h-7 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
                      onClick={() => window.open(`tel:${phoneForTel(item.phone!)}`)}
                    >
                      Call
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="h-7 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
                      onClick={() => navigate(item.viewPath)}
                    >
                      View
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {moreCount > 0 && (
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary hover:underline"
              onClick={() => navigate(viewAllPath)}
            >
              + {moreCount} more
            </button>
          )}
        </>
      )}

      <Link
        to={viewAllPath}
        className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-muted"
      >
        {viewAllLabel}
      </Link>
    </div>
  )
}

export function OverviewPage() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [overviewError, setOverviewError] = useState('')

  const loadOverview = async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setOverviewError('Your admin session is missing. Please sign in again.')
      setLoadingOverview(false)
      return
    }
    setLoadingOverview(true)
    setOverviewError('')
    try {
      const nextOverview = await getAdminOverview(session.accessToken)
      setOverview(nextOverview)
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Could not load dashboard overview.')
    } finally {
      setLoadingOverview(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const kpis = overview?.kpis
  const salesPipeline = overview?.pipelineCounts?.sales
  const activeDeals = pipelineCount(salesPipeline, [
    'active_leads',
    'site_visits',
    'negotiation',
    'token_payment',
    'documentation',
    'interior_design',
    're_engagement',
  ])
  const negotiationDeals = pipelineCount(salesPipeline, ['negotiation'])
  const revenueValue = kpis?.revenue ?? 0
  const interiorPending = overview?.slaQueues?.interiorLeads ?? []
  const stagePending = overview?.slaQueues?.stagePayments ?? []
  const enquiryPending = overview?.slaQueues?.enquiries ?? []
  const interiorTop3 = interiorPending.slice(0, 3)
  const stageTop3 = stagePending.slice(0, 3)
  const enquiryTop3 = enquiryPending.slice(0, 3)
  const interiorProgress = interiorTop3[0]?.progressPercent ?? 0
  const stageProgress = stageTop3[0]?.progressPercent ?? 0
  const enquiryProgress = enquiryTop3[0]?.progressPercent ?? 0

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative p-6 md:p-7">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-muted/50" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium text-primary">Admin Command Center</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
                BuiltGlory Overview
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Monitor enquiries, sales movement, acquisition health, revenue, and SLA response risk from one workspace.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {loadingOverview && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" />
                    Loading backend overview
                  </span>
                )}
                {!loadingOverview && !overviewError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 font-medium text-green-700">
                    <CheckCircle className="size-3" />
                    Live backend overview
                  </span>
                )}
                {overviewError && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">
                    <AlertCircle className="size-3" />
                    {overviewError}
                  </span>
                )}
                {overviewError && (
                  <button
                    type="button"
                    onClick={() => void loadOverview()}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 font-medium hover:bg-muted"
                  >
                    <RefreshCw className="size-3" />
                    Retry
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-background/80 p-2 shadow-sm backdrop-blur">
              <button
                type="button"
                onClick={() => navigate('/admin/enquiries/buy')}
                className="rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <p className="text-lg font-bold text-foreground">{kpis?.newEnquiries ?? enquiryPending.length}</p>
                <p className="text-xs text-muted-foreground">New enquiries</p>
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/sales/stagepayment')}
                className="rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <p className="text-lg font-bold text-foreground">{kpis?.tokenPaidDeals ?? stagePending.length}</p>
                <p className="text-xs text-muted-foreground">Stage payments</p>
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/enquiries/interior')}
                className="rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted"
              >
                <p className="text-lg font-bold text-foreground">{interiorPending.length}</p>
                <p className="text-xs text-muted-foreground">Interior SLAs</p>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/properties/all')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/properties/all')}
          className="group h-full cursor-pointer rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            title="Total Properties"
            value={String(kpis?.activeProperties ?? 0)}
            subtitle={`${kpis?.featuredProperties ?? 0} featured · ${kpis?.upcomingProperties ?? 0} upcoming`}
            icon={Building2}
            gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/enquiries/buy')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/enquiries/buy')}
          className="group h-full cursor-pointer rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            title="Total Enquiries"
            value={String(kpis?.newEnquiries ?? enquiryPending.length)}
            subtitle={`${kpis?.overdueCallbacks ?? 0} overdue callbacks · ${kpis?.openSupportTickets ?? 0} open tickets`}
            icon={MessageSquare}
            gradient="bg-gradient-to-br from-green-500 to-green-600"
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/sales/all')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/sales/all')}
          className="group h-full cursor-pointer rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            title="Active Deals"
            value={String(activeDeals)}
            subtitle={`${negotiationDeals} in negotiation · ${kpis?.closedDeals ?? 0} closed`}
            icon={Handshake}
            gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          />
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/admin/reports/revenue')}
          onKeyDown={(e) => e.key === 'Enter' && navigate('/admin/reports/revenue')}
          className="group h-full cursor-pointer rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <StatCard
            title="Revenue This Month"
            value={formatPrice(revenueValue)}
            subtitle="Backend reported revenue"
            subtitleClassName="text-muted-foreground"
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-purple-500 to-purple-600"
          />
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-semibold text-foreground">Performance Snapshot</h2>
            <p className="text-sm text-muted-foreground">Demand trends and portfolio distribution</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/reports/sales')}
            className="text-sm font-medium text-primary hover:underline"
          >
            Open reports →
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EnquiriesChart data={overview?.chartSeries?.enquiriesLast7Days ?? []} />
          <PropertiesPieChart data={overview?.chartSeries?.propertiesByType ?? []} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">Operational Queue</h2>
          <p className="text-sm text-muted-foreground">New enquiries and approvals waiting for action</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <RecentEnquiriesTable enquiries={overview?.recentEnquiries ?? []} />
          <PendingApprovalsTable approvals={overview?.pendingApprovals ?? []} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-foreground">Live Workspace</h2>
          <p className="text-sm text-muted-foreground">Real-time activity and today&apos;s schedule</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityFeed activities={overview?.recentActivities ?? []} />
          <TodaySchedule visits={overview?.schedule ?? []} loading={loadingOverview} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="mb-4">
          <h2 className="font-semibold text-foreground">SLA Tracker</h2>
          <p className="text-sm text-muted-foreground">Response time monitoring</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <SlaOverviewCard
            title="Interior Inquiries"
            subtitle="24hr response SLA"
            icon={<Clock className="size-5 text-orange-500" />}
            pendingCount={interiorPending.length}
            progressPercent={interiorProgress}
            items={interiorTop3.map((l) => ({
              id: l.id,
              name: l.name,
              property: l.property,
              label: getOverviewSlaLabel(l),
              phone: l.phone,
              viewPath: l.viewPath,
            }))}
            moreCount={Math.max(0, interiorPending.length - 3)}
            viewAllPath="/admin/enquiries/interior"
            viewAllLabel="View All Interior Leads →"
            actionLabel="Call"
          />
          <SlaOverviewCard
            title="Stage Payment Requests"
            subtitle="4hr response SLA"
            icon={<CreditCard className="size-5 text-blue-500" />}
            pendingCount={stagePending.length}
            progressPercent={stageProgress}
            items={stageTop3.map((d) => ({
              id: d.id,
              name: d.name,
              property: d.property,
              label: getOverviewSlaLabel(d),
              viewPath: d.viewPath,
            }))}
            moreCount={Math.max(0, stagePending.length - 3)}
            viewAllPath="/admin/sales/stagepayment"
            viewAllLabel="View All Stage Payments →"
            actionLabel="View"
          />
          <SlaOverviewCard
            title="Enquiry Response SLA"
            subtitle="2hr response SLA"
            icon={<MessageSquare className="size-5 text-green-500" />}
            pendingCount={enquiryPending.length}
            progressPercent={enquiryProgress}
            items={enquiryTop3.map((e) => ({
              id: e.id,
              name: e.name,
              property: e.property,
              label: getOverviewSlaLabel(e),
              phone: e.phone,
              viewPath: e.viewPath,
            }))}
            moreCount={Math.max(0, enquiryPending.length - 3)}
            viewAllPath="/admin/enquiries/buy"
            viewAllLabel="Enquiries → Buy Enquiries"
            actionLabel="View"
          />
        </div>
      </section>
    </div>
  )
}
