import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertCircle,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FilterX,
  List,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  SearchX,
  Video,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  findVisitConflicts,
  formatDateKey,
  getWeekStart,
  isVisitPast,
  isVisitToday,
  getVisitMeetingLink,
  listAdminVisits,
  updateAdminVisitStatus,
  VIRTUAL_PLATFORM_LABELS,
  VISITS_TODAY,
  type Visit,
  type VisitStatus,
  type VisitType,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { handleCall } from '@/utils/adminActions'
import { cn } from '@/lib/utils'

type ViewMode = 'list' | 'calendar'
type StatusFilter = 'all' | VisitStatus
type TypeFilter = 'all' | VisitType
type DateFilter = 'today' | 'tomorrow' | 'this_week' | 'upcoming' | 'past' | 'all'

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'physical', label: 'Physical' },
  { key: 'virtual', label: 'Virtual' },
]

const VIEW_STORAGE_KEY = 'builtglory-visits-view'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'missed', label: 'Missed' },
]

const STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
}

const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'this_week', label: 'This Week' },
  { key: 'upcoming', label: 'All Upcoming' },
  { key: 'past', label: 'Past Visits' },
  { key: 'all', label: 'All' },
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

function phoneForWhatsApp(phone: string) {
  return phone.replace(/\D/g, '')
}

function StatusBadge({ status }: { status: VisitStatus }) {
  const config: Record<VisitStatus, { variant?: 'new' | 'responded' | 'default' | 'red' | 'pending'; className?: string }> = {
    scheduled: { variant: 'new' },
    confirmed: { variant: 'responded' },
    completed: { className: 'bg-muted text-muted-foreground' },
    cancelled: { variant: 'red' },
    missed: { variant: 'pending' },
    rescheduled: { className: 'bg-purple-100 text-purple-700' },
  }
  const { variant, className } = config[status]
  return (
    <Badge variant={variant} className={className}>
      {status === 'completed' && <Check className="mr-1 size-3" />}
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function VisitTypeCell({ visit }: { visit: Visit }) {
  if (visit.visitType === 'physical') {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        <span>Physical</span>
      </div>
    )
  }
  const platform = visit.virtualPlatform
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-sm text-blue-700">
        <Video className="size-4 shrink-0" />
        <span className="font-medium">Virtual</span>
      </div>
      {platform && (
        <Badge variant="default" className="w-fit bg-blue-100 text-blue-800 text-[10px]">
          {VIRTUAL_PLATFORM_LABELS[platform]}
        </Badge>
      )}
    </div>
  )
}

function getTomorrow(today: string) {
  const d = new Date(today)
  d.setDate(d.getDate() + 1)
  return formatDateKey(d)
}

function matchesDateFilter(visit: Visit, filter: DateFilter, today: string, tomorrow: string): boolean {
  if (filter === 'all') return true
  if (filter === 'today') return visit.visitDate === today
  if (filter === 'tomorrow') return visit.visitDate === tomorrow
  if (filter === 'past') return visit.visitDate < today
  if (filter === 'upcoming') return visit.visitDate >= today
  if (filter === 'this_week') {
    const weekStart = getWeekStart(new Date(today))
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const vd = new Date(visit.visitDate)
    return vd >= weekStart && vd <= weekEnd
  }
  return true
}

function visitHasConflict(visit: Visit, all: Visit[]): boolean {
  if (visit.status === 'cancelled') return false
  return findVisitConflicts(all, visit.propertyId, visit.visitDate, visit.visitTime, visit.id).length > 0
}

function isVisitOverdue(visit: Visit): boolean {
  if (visit.status === 'completed' || visit.status === 'cancelled') return false
  return isVisitPast(visit)
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex h-[88px] items-center gap-4 border-b border-border px-4">
          <div className="h-10 w-24 animate-pulse rounded bg-muted" />
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="min-h-[200px] animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  )
}

function VisitsTable({
  visits,
  allVisits,
  onView,
  onConfirm,
  onCopyPhone,
  onMarkCompleted,
  onMarkMissed,
}: {
  visits: Visit[]
  allVisits: Visit[]
  onView: (v: Visit) => void
  onConfirm: (v: Visit) => void
  onCopyPhone: (phone: string) => void
  onMarkCompleted: (v: Visit) => void
  onMarkMissed: (v: Visit) => void
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[900px] w-full border-collapse">
        <thead className="bg-muted">
          <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Visit</th>
            <th className="px-4 py-3">Buyer</th>
            <th className="px-4 py-3">Property</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Assigned To</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit) => {
            const conflict = visitHasConflict(visit, allVisits)
            const overdue = isVisitOverdue(visit)
            return (
            <tr
              key={visit.id}
              className={cn(
                'h-[88px] cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                visit.visitType === 'virtual' && !conflict && 'bg-blue-50/60',
                conflict && 'bg-red-50',
              )}
              onClick={() => onView(visit)}
            >
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <p className="font-medium">{visit.visitDate}</p>
                <p className="text-sm text-muted-foreground">{visit.visitTime}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {visit.rescheduleCount > 0 && (
                    <span className="text-xs font-medium text-orange-700">
                      Rescheduled {visit.rescheduleCount}x
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                    {getInitials(visit.buyerName)}
                  </div>
                  <div>
                    <p className="font-medium">{visit.buyerName}</p>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary"
                      onClick={() => onCopyPhone(visit.buyerPhone)}
                    >
                      {visit.buyerPhone}
                    </button>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-3">
                  <img
                    src={visit.propertyImage}
                    alt=""
                    className="size-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{visit.propertyTitle}</p>
                    <Badge variant="default" className="mt-1">
                      {visit.propertyType}
                    </Badge>
                    <p className="mt-1 text-sm font-bold text-primary">{visit.propertyPrice}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <VisitTypeCell visit={visit} />
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={visit.status} />
                  {conflict && (
                    <span className="text-xs font-medium text-red-700">⚠️ Conflict</span>
                  )}
                  {overdue && (
                    <span className="text-xs font-medium text-orange-700">Overdue</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {getInitials(visit.assignedAdmin)}
                  </div>
                  <span className="text-sm">{visit.assignedAdmin}</span>
                </div>
              </td>
              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap items-center gap-1">
                  {visit.status === 'scheduled' && (
                    <Button variant="outline" size="sm" onClick={() => onConfirm(visit)}>
                      <Check className="size-3" /> Confirm
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCall(visit.buyerPhone)}
                  >
                    <Phone className="size-3" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => onView(visit)} title="Reschedule">
                    <RotateCcw className="size-3" />
                  </Button>
                  {overdue && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => onMarkCompleted(visit)}>
                        Complete
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => onMarkMissed(visit)}>
                        Missed
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="sm" onClick={() => onView(visit)}>
                    View
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

function WeekCalendar({
  visits,
  allVisits,
  weekStart,
  today,
  onView,
}: {
  visits: Visit[]
  allVisits: Visit[]
  weekStart: Date
  today: string
  onView: (v: Visit) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[800px] grid-cols-7 gap-2">
        {days.map((day, i) => {
          const key = formatDateKey(day)
          const dayVisits = visits.filter((v) => v.visitDate === key)
          const isToday = key === today

          return (
            <div
              key={key}
              className={cn(
                'min-h-[180px] rounded-lg border border-border bg-card',
                isToday && 'ring-2 ring-primary',
              )}
            >
              <div
                className={cn(
                  'rounded-t-lg px-2 py-2 text-center text-sm font-medium',
                  isToday ? 'bg-blue-100 text-blue-800' : 'bg-muted text-muted-foreground',
                )}
              >
                {dayNames[i]} {day.getDate()}
              </div>
              <div className="space-y-2 p-2">
                {dayVisits.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground/60">No visits</p>
                ) : (
                  dayVisits.map((v) => {
                    const conflict = visitHasConflict(v, allVisits)
                    const eventColor =
                      v.visitType === 'virtual'
                        ? 'border-l-blue-500 bg-blue-50'
                        : 'border-l-purple-500 bg-purple-50/50'

                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => onView(v)}
                        className={cn(
                          'w-full rounded border border-border border-l-4 p-2 text-left text-xs transition-shadow hover:shadow-md',
                          eventColor,
                        )}
                      >
                        <p className="flex items-center gap-1 font-medium">
                          {v.visitType === 'virtual' && (
                            <Video className="size-3 shrink-0 text-blue-600" />
                          )}
                          {v.visitTime}
                        </p>
                        <p className="truncate">{v.buyerName}</p>
                        <p className="truncate text-muted-foreground">{v.propertyTitle}</p>
                        {conflict && (
                          <Badge variant="pending" className="mt-1 text-[10px]">
                            Conflict
                          </Badge>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function VisitsPage() {
  const navigate = useNavigate()
  const tomorrow = getTomorrow(VISITS_TODAY)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [view, setView] = useState<ViewMode>('list')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date(VISITS_TODAY)))
  const [toast, setToast] = useState<string | null>(null)

  const loadVisits = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setVisits([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminVisits(session.accessToken)
      setVisits(result.data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load visits.')
      setVisits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadVisits()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadVisits])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY)
      if (stored === 'list' || stored === 'calendar') setView(stored)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: visits.length,
      scheduled: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      missed: 0,
      rescheduled: 0,
    }
    visits.forEach((v) => {
      counts[v.status] += 1
    })
    return counts
  }, [visits])

  const todayVisits = useMemo(
    () =>
      visits
        .filter((v) => isVisitToday(v) && v.status !== 'cancelled' && v.status !== 'completed')
        .sort((a, b) => a.visitTime.localeCompare(b.visitTime)),
    [visits],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return visits.filter((v) => {
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter
      const matchesType = typeFilter === 'all' || v.visitType === typeFilter
      const matchesDate = matchesDateFilter(v, dateFilter, VISITS_TODAY, tomorrow)
      const matchesSearch =
        !q ||
        v.buyerName.toLowerCase().includes(q) ||
        v.buyerPhone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        v.propertyTitle.toLowerCase().includes(q)
      return matchesStatus && matchesType && matchesDate && matchesSearch
    })
  }, [visits, search, statusFilter, typeFilter, dateFilter, tomorrow])

  const handleViewChange = (mode: ViewMode) => {
    setView(mode)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }

  const handleConfirm = useCallback(async (visit: Visit) => {
    if (visit.visitType === 'virtual' && !getVisitMeetingLink(visit)) {
      setToast('Add meeting link first')
      return
    }
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updated = await updateAdminVisitStatus(session.accessToken, visit.id, { status: 'confirmed' })
      setVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)))
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to confirm visit')
      return
    }
    const link = getVisitMeetingLink(visit)
    const msg = encodeURIComponent(
      visit.visitType === 'virtual' && link
        ? `Your virtual visit for ${visit.propertyTitle} is confirmed. Join here: ${link}`
        : `Hi ${visit.buyerName}, your visit for ${visit.propertyTitle} is confirmed for ${visit.visitDate} at ${visit.visitTime}`,
    )
    window.open(`https://wa.me/${phoneForWhatsApp(visit.buyerPhone)}?text=${msg}`, '_blank')
    setToast('Visit confirmed')
  }, [])

  const handleCopyPhone = useCallback((phone: string) => {
    void navigator.clipboard.writeText(phone)
    setToast('Copied!')
  }, [])

  const conflictCount = useMemo(
    () => visits.filter((v) => visitHasConflict(v, visits)).length,
    [visits],
  )

  const handleMarkCompleted = useCallback(async (visit: Visit) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updated = await updateAdminVisitStatus(session.accessToken, visit.id, {
        status: 'completed',
        feedback: {
          buyerInterest: 'interested',
          notes: 'Marked completed from visit list.',
          nextAction: 'follow_up',
        },
      })
      setVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)))
      setToast('Visit marked completed')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to mark visit completed')
    }
  }, [])

  const handleMarkMissed = useCallback(async (visit: Visit) => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updated = await updateAdminVisitStatus(session.accessToken, visit.id, {
        status: 'missed',
        reason: 'Marked missed from visit list.',
      })
      setVisits((prev) => prev.map((v) => (v.id === visit.id ? updated : v)))
      setToast('Visit marked as missed (no show)')
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to mark visit missed')
    }
  }, [])

  const showEmptyAll = !loading && visits.length === 0
  const showEmptySearch = !loading && visits.length > 0 && filtered.length === 0 && search.trim()
  const showEmptyFilter = !loading && visits.length > 0 && filtered.length === 0 && !search.trim()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {conflictCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠️ {conflictCount} visit{conflictCount > 1 ? 's have' : ' has'} scheduling conflicts (same
          property, date & time). Resolve before confirming.
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Visits</h2>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {visits.length} visits
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs lg:w-64 lg:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search buyer, phone, property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <Button
            variant={view === 'list' ? 'default' : 'outline'}
            size="sm"
            className={cn(view === 'list' && 'bg-primary text-primary-foreground hover:bg-brand-700')}
            onClick={() => handleViewChange('list')}
            aria-label="List view"
          >
            <List className="size-4" />
          </Button>
          <Button
            variant={view === 'calendar' ? 'default' : 'outline'}
            size="sm"
            className={cn(view === 'calendar' && 'bg-primary text-primary-foreground hover:bg-brand-700')}
            onClick={() => handleViewChange('calendar')}
            aria-label="Calendar view"
          >
            <Calendar className="size-4" />
          </Button>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
          >
            {DATE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
                {f.key === 'today' && todayVisits.length > 0 ? ` (${todayVisits.length})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && (
        <div
          className={cn(
            'rounded-lg border px-4 py-3',
            todayVisits.length > 0
              ? 'border-blue-200 bg-blue-50 text-blue-900'
              : 'border-border bg-muted/50 text-muted-foreground',
          )}
        >
          {todayVisits.length > 0 ? (
            <>
              <p className="font-medium">
                📅 {todayVisits.length} visit{todayVisits.length > 1 ? 's' : ''} scheduled today
              </p>
              <ul className="mt-3 space-y-2">
                {todayVisits.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/80 px-3 py-2 text-sm"
                  >
                    <span>
                      {v.visitTime} — {v.buyerName} — {v.propertyTitle.split(',')[0]}
                    </span>
                    <div className="flex gap-1">
                      {v.status === 'scheduled' && (
                        <Button variant="outline" size="sm" onClick={() => handleConfirm(v)}>
                          Confirm
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCall(v.buyerPhone)}
                      >
                        Call
                      </Button>
                      {v.visitType === 'physical' && v.googleMapsLink && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(v.googleMapsLink!, '_blank')}
                        >
                          <MapPin className="size-3" /> Directions
                        </Button>
                      )}
                      {v.visitType === 'virtual' && getVisitMeetingLink(v) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(getVisitMeetingLink(v)!, '_blank')}
                        >
                          <Video className="size-3" /> Join
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm">No visits today</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTypeFilter(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-sm font-medium transition-colors',
              typeFilter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {f.label}
          </button>
        ))}
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

      {view === 'calendar' && !loading && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const d = new Date(weekStart)
                d.setDate(d.getDate() - 7)
                setWeekStart(d)
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const d = new Date(weekStart)
                d.setDate(d.getDate() + 7)
                setWeekStart(d)
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="text-sm font-medium">
              Week of {weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getWeekStart(new Date(VISITS_TODAY)))}>
            Today
          </Button>
        </div>
      )}

      {loading && (view === 'list' ? <TableSkeleton /> : <CalendarSkeleton />)}

      {!loading && loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-destructive/70" />
            <h3 className="text-lg font-semibold">Could not load visits</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadVisits()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyAll && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CalendarDays className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No visits scheduled</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Property visits from the app appear here
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
            <h3 className="text-lg font-semibold">No visits match filters</h3>
            <Button variant="outline" className="mt-4" onClick={() => setStatusFilter('all')}>
              Clear filter
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && filtered.length > 0 && view === 'list' && (
        <VisitsTable
          visits={filtered}
          allVisits={visits}
          onView={(v) => navigate(`/admin/visits/${v.id}`)}
          onConfirm={handleConfirm}
          onCopyPhone={handleCopyPhone}
          onMarkCompleted={handleMarkCompleted}
          onMarkMissed={handleMarkMissed}
        />
      )}

      {!loading && !loadError && filtered.length > 0 && view === 'calendar' && (
        <WeekCalendar
          visits={filtered}
          allVisits={visits}
          weekStart={weekStart}
          today={VISITS_TODAY}
          onView={(v) => navigate(`/admin/visits/${v.id}`)}
        />
      )}
    </div>
  )
}
