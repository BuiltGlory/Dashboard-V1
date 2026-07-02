import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, Search, Sofa } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  BUDGET_LABELS,
  BUDGET_STYLES,
  INTERIOR_STATUS_LABELS as STATUS_LABELS,
  INTERIOR_STATUS_STYLES as STATUS_STYLES,
  STYLE_LABELS,
  getInteriorLeadCounts,
  getSLALabel,
  getSLAStatus,
  listAdminInteriorLeads,
  type InteriorLead,
  type InteriorLeadStatus,
} from '@/api/adminEnquiries'
import { readAdminSession } from '@/api/admin'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | InteriorLeadStatus

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'quote_sent', label: 'Quote Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'declined', label: 'Declined' },
  { key: 'completed', label: 'Completed' },
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

function phoneForTel(phone: string) {
  return phone.replace(/\D/g, '')
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex h-[72px] items-center gap-4 border-b border-border px-4">
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

export function InteriorLeadsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [leads, setLeads] = useState<InteriorLead[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const loadLeads = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setLoadError('Your admin session has expired. Please log in again.')
      setLeads([])
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminInteriorLeads(session.accessToken)
      setLeads(result.data)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load interior leads.')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      void loadLeads()
    }, 0)
    return () => clearTimeout(t)
  }, [loadLeads])

  const counts = useMemo(() => getInteriorLeadCounts(leads), [leads])

  const breachedLeads = useMemo(
    () => leads.filter((l) => getSLAStatus(l) === 'breached'),
    [leads],
  )
  const warningLeads = useMemo(
    () => leads.filter((l) => getSLAStatus(l) === 'warning'),
    [leads],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false
      if (!q) return true
      return (
        l.buyerName.toLowerCase().includes(q) ||
        l.referenceId.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.propertyTitle.toLowerCase().includes(q)
      )
    })
  }, [leads, search, statusFilter])

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <TableSkeleton />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
          <AlertCircle className="mb-4 size-12 text-destructive/70" />
          <h2 className="text-lg font-semibold">Could not load interior leads</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{loadError}</p>
          <Button className="mt-4" onClick={() => void loadLeads()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Interior Leads</h1>
          <Badge variant="default" className="bg-muted text-muted-foreground">
            {filtered.length}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads..."
              className="h-9 w-56 rounded-md border border-border bg-input py-1 pl-8 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm"
          >
            {STATUS_TABS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {breachedLeads.length > 0 && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            🔴 {breachedLeads.length} lead{breachedLeads.length > 1 ? 's' : ''} SLA breached — respond now
          </p>
          <div className="flex flex-wrap gap-2">
            {breachedLeads.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{l.buyerName}</span>
                <Badge variant="red">OVERDUE</Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`tel:${phoneForTel(l.phone)}`)}
                >
                  Call
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {warningLeads.length > 0 && breachedLeads.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ {warningLeads.length} lead{warningLeads.length > 1 ? 's' : ''} need response soon
        </div>
      )}

      {warningLeads.length > 0 && breachedLeads.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ {warningLeads.length} lead{warningLeads.length > 1 ? 's' : ''} need response soon
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn(
              'rounded-full px-3 py-1.5 text-sm font-medium',
              statusFilter === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Sofa className="mb-4 size-16 text-muted-foreground/40" strokeWidth={1.25} />
          <p className="text-lg font-medium">No interior leads yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Interior design requests from app appear here (INT-04)
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-[1000px] w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Requirements</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const sla = getSLAStatus(l)
                  const slaLabel = getSLALabel(l)
                  const isDone = l.status === 'completed' || l.status === 'declined'
                  return (
                    <tr
                      key={l.id}
                      className={cn(
                        'cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                        sla === 'breached' && 'border-l-4 border-l-red-500 bg-red-50',
                        sla === 'warning' && 'bg-amber-50',
                        isDone && 'opacity-60',
                      )}
                      onClick={() => navigate(`/admin/enquiries/interior/${l.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-xs font-semibold text-white">
                            {getInitials(l.buyerName)}
                          </div>
                          <div>
                            <p className="font-medium">{l.buyerName}</p>
                            <p className="text-xs text-muted-foreground">{l.phone}</p>
                            <p className="font-mono text-xs text-muted-foreground">{l.referenceId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{l.propertyTitle}</p>
                        <p className="text-xs text-muted-foreground">{l.propertyLocation}</p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {l.selectedRooms.slice(0, 2).map((room) => (
                            <span
                              key={room}
                              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                            >
                              {room}
                            </span>
                          ))}
                          {l.selectedRooms.length > 2 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              +{l.selectedRooms.length - 2} more
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              'bg-slate-100 text-slate-700',
                            )}
                          >
                            {STYLE_LABELS[l.designStyle]}
                          </span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              BUDGET_STYLES[l.budgetRange],
                            )}
                          >
                            {BUDGET_LABELS[l.budgetRange]}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'text-sm font-medium',
                            slaLabel.tone === 'green' && 'text-green-600',
                            slaLabel.tone === 'orange' && 'text-amber-600',
                            slaLabel.tone === 'red' && 'font-bold text-red-600',
                          )}
                        >
                          {slaLabel.text}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_STYLES[l.status],
                          )}
                        >
                          {STATUS_LABELS[l.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {l.assignedDesigner ?? '—'}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`tel:${phoneForTel(l.phone)}`)}
                          >
                            📞 Call
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navigate(`/admin/enquiries/interior/${l.id}`)}
                          >
                            View →
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
