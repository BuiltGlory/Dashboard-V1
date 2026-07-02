import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { CalendarOff, Loader2, MapPin, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AdminOverviewScheduleItem } from '@/api/admin'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  completed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-red-100 text-red-800',
  missed: 'bg-orange-100 text-orange-800',
  rescheduled: 'bg-purple-100 text-purple-800',
}

type TodayScheduleProps = {
  visits?: AdminOverviewScheduleItem[]
  loading?: boolean
}

function formatTodayHeader(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function parseVisitTimeMinutes(value: string) {
  const normalized = value.trim()
  const date = new Date(`1970-01-01 ${normalized}`)
  if (!Number.isNaN(date.getTime())) return date.getHours() * 60 + date.getMinutes()
  const [hh = '0', mm = '0'] = normalized.split(':')
  return Number(hh) * 60 + Number(mm)
}

function visitDateTimeMs(visit: AdminOverviewScheduleItem) {
  const [year, month, day] = visit.visitDate.split('-').map(Number)
  const minutes = parseVisitTimeMinutes(visit.visitTime || '00:00')
  return new Date(year, (month || 1) - 1, day || 1, Math.floor(minutes / 60), minutes % 60).getTime()
}

function conflictVisitIds(visits: AdminOverviewScheduleItem[]): Set<string> {
  const byTime = new Map<string, AdminOverviewScheduleItem[]>()
  for (const v of visits) {
    const key = v.visitTime
    const list = byTime.get(key) ?? []
    list.push(v)
    byTime.set(key, list)
  }
  const ids = new Set<string>()
  for (const group of byTime.values()) {
    if (group.length > 1) {
      for (const v of group) ids.add(v.id)
    }
  }
  return ids
}

export function TodaySchedule({ visits = [], loading = false }: TodayScheduleProps) {
  const navigate = useNavigate()
  const todayStr = new Date().toISOString().slice(0, 10)
  const tomorrowStr = addDaysIso(todayStr, 1)

  const todayVisits = useMemo(
    () =>
      visits.filter((v) => v.visitDate === todayStr && v.status !== 'cancelled').sort(
        (a, b) => a.visitTime.localeCompare(b.visitTime),
      ),
    [todayStr, visits],
  )

  const tomorrowVisits = useMemo(
    () =>
      visits.filter(
        (v) => v.visitDate === tomorrowStr && v.status !== 'cancelled',
      ),
    [tomorrowStr, visits],
  )

  const conflicts = useMemo(() => conflictVisitIds(todayVisits), [todayVisits])
  const headerDate = formatTodayHeader(todayStr)
  const nowMins = parseVisitTimeMinutes(
    new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
  )

  return (
    <Card className="flex h-full flex-col rounded-2xl border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Today&apos;s Schedule</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{headerDate}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default">{todayVisits.length} visits</Badge>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => navigate('/admin/enquiries/visits')}
            >
              View All →
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {todayVisits.length > 0 ? (
          <ul className="space-y-3">
            {todayVisits.map((visit) => {
              const visitMins = parseVisitTimeMinutes(visit.visitTime)
              const isPast =
                visitDateTimeMs(visit) < Date.now() || visitMins < nowMins
              const isOverdue =
                isPast &&
                (visit.status === 'scheduled' || visit.status === 'confirmed')
              const hasConflict = conflicts.has(visit.id)

              return (
                <li
                  key={visit.id}
                  className="flex cursor-pointer flex-wrap items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:border-primary/20 hover:bg-sidebar-accent"
                  onClick={() => navigate(visit.viewPath)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(visit.viewPath)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-xs font-semibold',
                      isPast
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-blue-100 text-blue-800',
                    )}
                  >
                    {visit.visitTime}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{visit.buyerName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {visit.propertyTitle}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="default" className="text-xs font-normal">
                        {visit.visitType === 'virtual' ? (
                          <span className="inline-flex items-center gap-1">
                            <Video className="size-3" /> Virtual
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" /> Physical
                          </span>
                        )}
                      </Badge>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                          STATUS_STYLES[visit.status],
                        )}
                      >
                        {visit.status}
                      </span>
                      {hasConflict && (
                        <Badge variant="orange" className="text-xs">
                          Conflict
                        </Badge>
                      )}
                      {isOverdue && (
                        <span className="text-xs font-medium text-orange-700">
                          Overdue{' '}
                          <button
                            type="button"
                            className="underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(visit.viewPath)
                            }}
                          >
                            Mark
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-medium text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(visit.viewPath)
                    }}
                  >
                    View →
                  </button>
                </li>
              )
            })}
          </ul>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading schedule
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No visits today</p>
            {tomorrowVisits.length > 0 && (
              <div className="mt-4 text-left">
                <p className="text-sm font-medium">
                  Tomorrow: {tomorrowVisits.length} visit
                  {tomorrowVisits.length > 1 ? 's' : ''}
                </p>
                <ul className="mt-2 space-y-2">
                  {tomorrowVisits.slice(0, 3).map((v) => (
                    <li key={v.id} className="text-sm text-muted-foreground">
                      {v.visitTime} — {v.buyerName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tomorrowVisits.length === 0 && (
              <div className="mt-6 flex flex-col items-center text-muted-foreground">
                <CalendarOff className="mb-2 size-10 opacity-40" />
                <p className="text-sm">No upcoming visits scheduled</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
