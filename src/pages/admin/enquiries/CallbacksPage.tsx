import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  AlertCircle,
  CheckCircle,
  Phone,
  PhoneCall,
  Search,
  SearchX,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CATEGORY_LABELS,
  CATEGORY_STYLES,
  countOpenCallbacksByUser,
  formatPreferredTime,
  getAdminSalesTeam,
  getEffectiveStatus,
  getSlaRemaining,
  isPreferredTimePast,
  isSlaOverdue,
  listAdminCallbacks,
  resolveAdminCallback,
  SOURCE_LABELS,
  STATUS_LABELS,
  type Callback,
  type CallbackStatus,
  type CallbackUserType,
  type SalesPerson,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | CallbackStatus

const STATUS_FILTERS: { key: StatusFilter; label: string; red?: boolean }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'called', label: 'Called' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'missed', label: 'Missed' },
  { key: 'rescheduled', label: 'Rescheduled' },
  { key: 'overdue', label: 'Overdue', red: true },
]

const BEST_TIME_LABELS: Record<string, string> = {
  morning: '🌅 Morning',
  afternoon: '☀️ Afternoon',
  evening: '🌆 Evening',
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

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function UserTypeBadge({ type }: { type: CallbackUserType }) {
  const styles: Record<CallbackUserType, string> = {
    buyer: 'bg-blue-100 text-blue-700',
    seller: 'bg-green-100 text-green-700',
    nri: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', styles[type])}>
      {type === 'nri' ? 'NRI' : type}
    </span>
  )
}

function StatusBadge({ status }: { status: CallbackStatus }) {
  const config: Record<CallbackStatus, { variant?: 'new' | 'responded' | 'default' | 'red' | 'pending'; className?: string }> = {
    pending: { variant: 'new' },
    called: { className: 'bg-purple-100 text-purple-700' },
    resolved: { variant: 'responded' },
    missed: { variant: 'pending' },
    rescheduled: { variant: 'default' },
    overdue: { variant: 'red', className: 'animate-pulse' },
  }
  const { variant, className } = config[status]
  return (
    <Badge variant={variant} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

function AttemptsLabel({ count }: { count: number }) {
  const label = count === 1 ? '1 attempt' : `${count} attempts`
  if (count >= 5) {
    return <span className="text-xs font-medium text-red-700">{label} ⚠️</span>
  }
  if (count >= 3) {
    return <span className="text-xs font-medium text-orange-700">{label} ⚠️</span>
  }
  return <span className="text-xs text-muted-foreground">{count === 0 ? '0 attempts' : label}</span>
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-[72px] items-center gap-4 border-b border-border px-4">
          <div className="size-4 animate-pulse rounded bg-muted" />
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function CallbacksPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [callbacks, setCallbacks] = useState<Callback[]>([])
  const [assignees, setAssignees] = useState<SalesPerson[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assignFilter, setAssignFilter] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false)
  const [bulkNotes, setBulkNotes] = useState('')

  const loadCallbacks = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setCallbacks([])
      setAssignees([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const [callbackResult, team] = await Promise.all([
        listAdminCallbacks(session.accessToken),
        getAdminSalesTeam(session.accessToken),
      ])
      setCallbacks(
        callbackResult.data.map((callback) => ({
          ...callback,
          status: getEffectiveStatus(callback),
        })),
      )
      setAssignees(team)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load callbacks.')
      setCallbacks([])
      setAssignees([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadCallbacks()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadCallbacks])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const withEffectiveStatus = useCallback((list: Callback[]) => {
    return list.map((c) => ({
      ...c,
      status: getEffectiveStatus(c),
    }))
  }, [])

  const updateCallback = useCallback(
    (id: string, patch: Partial<Callback>) => {
      setCallbacks((prev) =>
        withEffectiveStatus(prev.map((c) => (c.id === id ? { ...c, ...patch } : c))),
      )
    },
    [withEffectiveStatus],
  )

  const overdueList = useMemo(
    () => callbacks.filter((c) => isSlaOverdue(c) && c.status !== 'resolved' && c.status !== 'missed'),
    [callbacks],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: callbacks.length,
      pending: 0,
      called: 0,
      resolved: 0,
      missed: 0,
      rescheduled: 0,
      overdue: 0,
    }
    callbacks.forEach((c) => {
      const eff = getEffectiveStatus(c)
      counts[eff] += 1
    })
    return counts
  }, [callbacks])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return callbacks.filter((c) => {
      const eff = getEffectiveStatus(c)
      const matchesStatus = statusFilter === 'all' || eff === statusFilter
      const matchesAssign = assignFilter === 'all' || c.assignedTo === assignFilter
      const matchesSearch =
        !q ||
        c.callerName.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
        c.reason.toLowerCase().includes(q)
      return matchesStatus && matchesAssign && matchesSearch
    })
  }, [callbacks, search, statusFilter, assignFilter])

  const allResolved =
    !loading && callbacks.length > 0 && callbacks.every((c) => getEffectiveStatus(c) === 'resolved')

  const goToDetail = (id: string) => navigate(`/admin/callbacks/${id}`)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((c) => c.id)))
    }
  }

  const bulkAssign = () => {
    setToast('Callback assignment needs a backend assignment endpoint before it can be changed here.')
  }

  const bulkResolve = async () => {
    if (!bulkNotes.trim()) return
    const session = readAdminSession()
    if (!session?.accessToken) {
      setToast('Your admin session has expired. Please log in again.')
      return
    }
    try {
      const updates = await Promise.all(
        [...selected].map((id) => resolveAdminCallback(session.accessToken, id, bulkNotes.trim())),
      )
      setCallbacks((prev) =>
        withEffectiveStatus(
          prev.map((callback) => updates.find((updated) => updated.id === callback.id) ?? callback),
        ),
      )
      setBulkResolveOpen(false)
      setBulkNotes('')
      setToast(`Resolved ${selected.size} callbacks`)
      setSelected(new Set())
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Unable to resolve callbacks')
    }
  }

  const bulkMissed = () => {
    selected.forEach((id) => updateCallback(id, { status: 'missed' }))
    setToast(`Marked ${selected.size} as missed`)
    setSelected(new Set())
  }

  const showEmptyAll = !loading && callbacks.length === 0
  const showEmptySearch = !loading && callbacks.length > 0 && filtered.length === 0 && search.trim()

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-24">
      {toast && (
        <div className="fixed bottom-24 right-6 z-[60] rounded-lg bg-foreground px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {bulkResolveOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/50"
            aria-label="Close"
            onClick={() => setBulkResolveOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="font-semibold">Resolve {selected.size} callbacks</h3>
            <textarea
              rows={4}
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              placeholder="Resolution notes (applied to all)"
              className="mt-3 w-full rounded-md border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setBulkResolveOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!bulkNotes.trim()} onClick={() => void bulkResolve()}>
                Resolve all
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Callbacks</h2>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {callbacks.length} callbacks
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs lg:w-64 lg:flex-none">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search caller, phone, reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-input pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={assignFilter}
            onChange={(e) => setAssignFilter(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm"
          >
            <option value="all">All assignees</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loading && overdueList.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <p className="font-medium">
            🔴 {overdueList.length} callback{overdueList.length > 1 ? 's are' : ' is'} overdue — respond
            immediately
          </p>
          <ul className="mt-3 space-y-2">
            {overdueList.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/80 px-3 py-2 text-sm"
              >
                <button
                  type="button"
                  className="text-left hover:underline"
                  onClick={() => goToDetail(c.id)}
                >
                  {c.callerName} — {c.reason.slice(0, 50)}
                  {c.reason.length > 50 ? '…' : ''}
                </button>
                <Button
                  size="sm"
                  disabled={!c.phone}
                  onClick={() => c.phone && window.open(`tel:${phoneForTel(c.phone)}`)}
                >
                  <Phone className="size-3" /> Call
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              statusFilter === f.key
                ? f.red
                  ? 'border-red-500 text-red-600'
                  : 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
              f.red && 'text-red-600',
            )}
          >
            {f.label} ({statusCounts[f.key]})
          </button>
        ))}
      </div>

      {loading && <TableSkeleton />}

      {!loading && loadError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="mb-4 size-12 text-destructive/70" />
            <h3 className="text-lg font-semibold">Could not load callbacks</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
            <Button className="mt-4" onClick={() => void loadCallbacks()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {showEmptyAll && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <PhoneCall className="mb-4 size-16 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold">No callbacks yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Callback requests from the app appear here
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

      {allResolved && !loadError && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle className="mb-4 size-16 text-green-500/60" />
            <h3 className="text-lg font-semibold">All callbacks resolved!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Great job staying on top of requests
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="min-w-[1100px] w-full border-collapse">
            <thead className="bg-muted">
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3">Caller</th>
                <th className="px-4 py-3">Reason & Category</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Preferred Time</th>
                <th className="px-4 py-3">SLA</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Assigned</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((cb) => {
                const eff = getEffectiveStatus(cb)
                const sla = getSlaRemaining(cb)
                const pref = formatPreferredTime(cb.preferredTime)
                const pastPref = isPreferredTimePast(cb.preferredTime)
                const openCount = countOpenCallbacksByUser(callbacks, cb.userId)

                return (
                  <tr
                    key={cb.id}
                    className={cn(
                      'h-[72px] cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                      eff === 'overdue' && 'border-l-4 border-l-red-500 bg-red-50',
                      eff === 'missed' && 'bg-orange-50',
                      eff === 'resolved' && 'opacity-60',
                    )}
                    onClick={() => goToDetail(cb.id)}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(cb.id)}
                        onChange={() => toggleSelect(cb.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-bold text-white">
                          {getInitials(cb.callerName)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1">
                            <p className="font-medium">{cb.callerName}</p>
                            <UserTypeBadge type={cb.userType} />
                            {openCount > 1 && (
                              <span className="text-[10px] text-orange-700">{openCount} open</span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-primary"
                            onClick={(e) => {
                              e.stopPropagation()
                              void navigator.clipboard.writeText(cb.phone)
                              setToast('Copied!')
                            }}
                          >
                            {cb.phone}
                          </button>
                          <p className="text-[10px] text-muted-foreground">{cb.referenceId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          CATEGORY_STYLES[cb.category],
                        )}
                      >
                        {CATEGORY_LABELS[cb.category]}
                      </span>
                      <p className="mt-1 line-clamp-2 text-sm">
                        {cb.reason.slice(0, 60)}
                        {cb.reason.length > 60 ? '…' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">via {SOURCE_LABELS[cb.source]}</p>
                    </td>
                    <td className="px-4 py-3">
                      {cb.propertyId && cb.propertyTitle ? (
                        <div className="flex items-center gap-2">
                          {cb.propertyImage && (
                            <img
                              src={cb.propertyImage}
                              alt=""
                              className="size-10 rounded object-cover"
                            />
                          )}
                          <p className="line-clamp-2 max-w-[140px] text-sm font-medium">
                            {cb.propertyTitle}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{pref.date}</p>
                      <p className="text-xs text-muted-foreground">{pref.time}</p>
                      <span className="text-xs">{BEST_TIME_LABELS[cb.bestTimePreference]}</span>
                      {(pastPref || eff === 'overdue') && eff !== 'resolved' && (
                        <Badge variant="red" className="mt-1">
                          OVERDUE
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          sla.variant === 'green' && 'text-green-700',
                          sla.variant === 'orange' && 'text-orange-700',
                          sla.variant === 'red' && 'text-red-700 animate-pulse',
                        )}
                      >
                        {sla.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={eff} />
                    </td>
                    <td className="px-4 py-3">
                      <AttemptsLabel count={cb.attemptCount} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                          {getInitials(cb.assignedTo)}
                        </div>
                        <span className="text-sm">{cb.assignedTo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          disabled={!cb.phone}
                          title={!cb.phone ? 'No phone' : undefined}
                          onClick={() => cb.phone && window.open(`tel:${phoneForTel(cb.phone)}`)}
                        >
                          <Phone className="size-3" />
                        </Button>
                        {eff !== 'resolved' && (
                          <Button variant="outline" size="sm" onClick={() => goToDetail(cb.id)}>
                            Resolve
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-6 py-3 shadow-lg">
          <span className="text-sm font-medium">{selected.size} callbacks selected</span>
          <select
            className="h-8 rounded-md border border-border bg-input px-2 text-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) bulkAssign()
              e.target.value = ''
            }}
            disabled
          >
            <option value="">Assignment endpoint pending</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setBulkResolveOpen(true)}>
            Mark Resolved
          </Button>
          <Button variant="outline" size="sm" onClick={bulkMissed}>
            Mark Missed
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
