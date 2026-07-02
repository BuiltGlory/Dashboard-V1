import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FilterX,
  LayoutGrid,
  List,
  Minus,
  MoreVertical,
  Search,
  SearchX,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { readAdminSession } from '@/api/admin'
import {
  getFemaBadgeLabel,
  getKycStatusColor,
  getKycStatusLabel,
  getRoleLabel,
  getUserTypeBadgeColor,
  listAdminUsers,
  shouldShowFemaWarning,
  type KycStatus,
  type User,
  type UserRole,
  type UserType,
  updateAdminUserBlock,
} from '@/api/adminUsers'
import { formatPrice } from '@/api/adminSales'
import { cn } from '@/lib/utils'

function phoneDigits(phone: string) {
  return phone.replace(/\D/g, '')
}

function openWhatsApp(phone: string) {
  window.open(`https://wa.me/${phoneDigits(phone)}`, '_blank')
}

type PageTab = 'all' | 'kyc' | 'buyers' | 'sellers'
type ViewMode = 'table' | 'card'
type RoleFilter = 'all' | UserRole
type KycFilter = 'all' | KycStatus
type BuyersChipFilter = 'all' | 'active' | 'past' | 'high_value'
type SellersChipFilter = 'all' | 'active' | 'kyc_verified' | 'not_verified'

const VIEW_STORAGE_KEY = 'builtglory-users-view'
const HOURS_48_MS = 48 * 60 * 60 * 1000
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000
const AVG_DEAL_VALUE = 4_500_000
const HIGH_VALUE_DEAL_THRESHOLD = 2

const USER_TYPE_LABELS: Record<UserType, string> = {
  resident: 'Resident',
  nri: 'NRI',
  pio: 'PIO',
}

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  buyer: 'bg-green-100 text-green-700',
  seller: 'bg-yellow-100 text-yellow-800',
  both: 'bg-blue-100 text-blue-700',
}

const COUNTRY_FLAGS: Record<string, string> = {
  India: '🇮🇳',
  UAE: '🇦🇪',
  UK: '🇬🇧',
  Singapore: '🇸🇬',
}

function getPageTab(pathname: string): PageTab {
  if (pathname.includes('/users/kyc')) return 'kyc'
  if (pathname.includes('/users/buyers')) return 'buyers'
  if (pathname.includes('/users/sellers')) return 'sellers'
  return 'all'
}

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY)
    if (v === 'card' || v === 'table') return v
  } catch {
    /* ignore */
  }
  return 'table'
}

function persistViewMode(mode: ViewMode) {
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

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
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

function isKycOverdue(user: User) {
  if (user.kycStatus !== 'pending' || !user.kycSubmittedAt) return false
  return Date.now() - new Date(user.kycSubmittedAt).getTime() > HOURS_48_MS
}

function getTotalSpent(user: User) {
  return user.totalDeals * AVG_DEAL_VALUE
}

function isLastLoginOlderThan90Days(user: User) {
  return Date.now() - new Date(user.lastLoginAt).getTime() > DAYS_90_MS
}

function matchesBuyersChip(user: User, chip: BuyersChipFilter) {
  if (chip === 'all') return true
  if (chip === 'active') {
    return user.totalDeals > 0
  }
  if (chip === 'past') {
    return user.totalDeals > 0 && isLastLoginOlderThan90Days(user)
  }
  if (chip === 'high_value') {
    return user.totalDeals >= HIGH_VALUE_DEAL_THRESHOLD
  }
  return true
}

function matchesSellersChip(user: User, chip: SellersChipFilter) {
  if (chip === 'all') return true
  if (chip === 'active') return user.totalListings > 0
  if (chip === 'kyc_verified') return user.kycStatus === 'verified'
  if (chip === 'not_verified') return user.kycStatus !== 'verified'
  return true
}

function performBlockUser(
  user: User,
  onPatch: (id: string, patch: Partial<User>) => void | Promise<void>,
  onToast: (msg: string) => void,
) {
  void onPatch(user.id, {
    isBlocked: true,
    isActive: false,
    blockedReason: 'Blocked by admin',
  })
  onToast(`${user.name} blocked`)
}

function matchesSearch(user: User, q: string) {
  if (!q) return true
  const hay = [
    user.name,
    user.phone,
    user.email ?? '',
    user.city,
    user.referenceId,
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function matchesRoleFilter(user: User, role: RoleFilter) {
  if (role === 'all') return true
  return user.role === role
}

function matchesKycFilter(user: User, kyc: KycFilter) {
  if (kyc === 'all') return true
  return user.kycStatus === kyc
}

function tabBaseFilter(user: User, tab: PageTab) {
  if (tab === 'buyers') return user.role === 'buyer' || user.role === 'both'
  if (tab === 'sellers') return user.role === 'seller' || user.role === 'both'
  return true
}

function countryFlag(country: string) {
  return COUNTRY_FLAGS[country] ?? '🌍'
}

function UserAvatar({ user }: { user: User }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white"
      aria-hidden
    >
      {getInitials(user.name)}
    </div>
  )
}

function FemaBadge({ user }: { user: User }) {
  if (user.userType !== 'nri' && user.userType !== 'pio') return null
  const status = user.femaCompliance?.status ?? 'not_checked'
  const warn = shouldShowFemaWarning(status)
  return (
    <span
      title="FEMA compliance status"
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
        warn ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800',
      )}
    >
      {getFemaBadgeLabel(status)}
    </span>
  )
}

function UserTypeBadge({ type }: { type: UserType }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
        getUserTypeBadgeColor(type),
      )}
    >
      {USER_TYPE_LABELS[type]}
    </span>
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  if (role === 'both') {
    return (
      <div className="flex flex-wrap gap-1">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', ROLE_BADGE_CLASSES.buyer)}>
          Buyer
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', ROLE_BADGE_CLASSES.seller)}>
          Seller
        </span>
      </div>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium',
        ROLE_BADGE_CLASSES[role],
      )}
    >
      {getRoleLabel(role)}
    </span>
  )
}

function KycStatusBadge({ user }: { user: User }) {
  const color = getKycStatusColor(user.kycStatus)
  const Icon =
    user.kycStatus === 'verified'
      ? ShieldCheck
      : user.kycStatus === 'pending'
        ? Clock
        : user.kycStatus === 'rejected'
          ? XCircle
          : Minus

  return (
    <div className="flex flex-col gap-1">
      <span
        className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: `${color}22`, color }}
      >
        <Icon className="size-3" />
        {getKycStatusLabel(user.kycStatus)}
      </span>
      {isKycOverdue(user) && (
        <span className="text-[10px] font-semibold text-orange-600">Overdue</span>
      )}
      {user.kycSubmittedAt && user.kycStatus !== 'not_submitted' && (
        <span className="text-[10px] text-muted-foreground">
          {formatShortDate(user.kycSubmittedAt)}
        </span>
      )}
    </div>
  )
}

function ActivityCell({ user }: { user: User }) {
  const items: string[] = []
  if (user.totalEnquiries > 0) items.push(`💬 ${user.totalEnquiries} enquiries`)
  if (user.totalVisits > 0) items.push(`📅 ${user.totalVisits} visits`)
  if (user.totalDeals > 0) items.push(`🤝 ${user.totalDeals} deals`)
  if (user.totalListings > 0) items.push(`🏠 ${user.totalListings} listings`)

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">No activity yet</span>
  }

  return (
    <div className="space-y-0.5 text-xs text-foreground">
      {items.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  )
}

function EmailCell({
  user,
  onToast,
}: {
  user: User
  onToast: (msg: string) => void
}) {
  if (!user.email) {
    return <span className="text-sm italic text-muted-foreground">Not provided</span>
  }
  return (
    <button
      type="button"
      className="max-w-[140px] truncate text-left text-sm text-foreground hover:text-primary"
      onClick={(e) => {
        e.stopPropagation()
        void navigator.clipboard.writeText(user.email!)
        onToast('Copied!')
      }}
    >
      {user.email}
    </button>
  )
}

function SellerListingStats({ user }: { user: User }) {
  const approved = user.totalListings
  const pending = 0
  const rejected = 0
  return (
    <p className="mt-0.5 text-xs text-muted-foreground">
      🏠 {user.totalListings} listed • ✅ {approved} approved • ⏳ {pending} pending • ❌{' '}
      {rejected} rejected
    </p>
  )
}

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[]
  value: T
  onChange: (key: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            value === opt.key
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function LocationCell({ user }: { user: User }) {
  const isIndia = user.country === 'India'
  return (
    <div className="text-sm">
      <div className="text-foreground">
        {user.userType === 'nri' && (
          <span className="mr-1" aria-hidden>
            {countryFlag(user.country)}
          </span>
        )}
        {user.city}, {user.state}
      </div>
      {!isIndia && (
        <div className="text-xs text-muted-foreground">{user.country}</div>
      )}
    </div>
  )
}

function UserActionsMenu({
  user,
  onPatch,
  onToast,
  onRequestBlock,
}: {
  user: User
  onPatch: (id: string, patch: Partial<User>) => void | Promise<void>
  onToast: (msg: string) => void
  onRequestBlock?: (user: User) => void
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

  const run = (fn: () => void | Promise<void>) => {
    void fn()
    setOpen(false)
  }

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
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-border bg-card py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() =>
              run(() => {
                if (user.isBlocked) {
                  void onPatch(user.id, {
                    isBlocked: false,
                    isActive: true,
                    blockedReason: null,
                  })
                  onToast(`${user.name} unblocked`)
                } else if (user.totalDeals > 0 && onRequestBlock) {
                  onRequestBlock(user)
                } else {
                  performBlockUser(user, onPatch, onToast)
                }
              })
            }
          >
            {user.isBlocked ? 'Unblock' : 'Block'}
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => run(() => openWhatsApp(user.phone))}
          >
            Send WhatsApp
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() =>
              run(() =>
                onToast(
                  user.email
                    ? `Email sent to ${user.email}`
                    : 'No email on file',
                ),
              )
            }
          >
            Send Email
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => run(() => onToast('Open user detail to assign with backend persistence.'))}
          >
            Assign To
          </button>
        </div>
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex h-16 items-center gap-4 border-b border-border px-4 last:border-0"
        >
          <div className="size-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-48 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  )
}

function UsersTable({
  users,
  pageTab,
  onRowClick,
  onPatch,
  onToast,
  onRequestBlock,
  sectionAction,
}: {
  users: User[]
  pageTab: PageTab
  onRowClick: (id: string) => void
  onPatch: (id: string, patch: Partial<User>) => void | Promise<void>
  onToast: (msg: string) => void
  onRequestBlock?: (user: User) => void
  sectionAction?: SectionAction
}) {
  if (users.length === 0) return null

  const showTotalSpent = pageTab === 'buyers'
  const showSellerStats = pageTab === 'sellers'

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-[1060px] w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr className="border-b border-border">
            <th className="w-[220px] px-4 py-3">User</th>
            <th className="w-[140px] px-4 py-3">Type & Role</th>
            <th className="w-[160px] px-4 py-3">Email</th>
            {showTotalSpent && (
              <th className="w-[120px] px-4 py-3">Total Spent</th>
            )}
            <th className="w-[140px] px-4 py-3">KYC Status</th>
            <th className="w-[160px] px-4 py-3">Activity</th>
            <th className="w-[120px] px-4 py-3">Location</th>
            <th className="w-[100px] px-4 py-3">Registered</th>
            <th className="w-[80px] px-4 py-3">Status</th>
            <th className="w-[140px] px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              onClick={() => onRowClick(user.id)}
              className={cn(
                'h-16 cursor-pointer border-b border-border transition-colors hover:bg-sidebar-accent',
                user.isBlocked && 'bg-red-50/20 opacity-70',
                user.userType === 'nri' && 'border-l-4 border-l-purple-300',
              )}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-3">
                  <UserAvatar user={user} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-medium text-foreground">{user.name}</p>
                      {user.userType === 'pio' && (
                        <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          PIO
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        void navigator.clipboard.writeText(user.phone)
                        onToast('Copied!')
                      }}
                    >
                      {user.phone}
                    </button>
                    <p className="text-xs text-muted-foreground">{user.referenceId}</p>
                    {showSellerStats && <SellerListingStats user={user} />}
                  </div>
                </div>
              </td>
              <td className="px-4 py-2">
                <div className="flex flex-col gap-1">
                  <UserTypeBadge type={user.userType} />
                  <RoleBadge role={user.role} />
                  <FemaBadge user={user} />
                </div>
              </td>
              <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <EmailCell user={user} onToast={onToast} />
              </td>
              {showTotalSpent && (
                <td className="px-4 py-2">
                  <span className="text-sm font-semibold text-primary">
                    {user.totalDeals > 0
                      ? formatPrice(getTotalSpent(user))
                      : '—'}
                  </span>
                </td>
              )}
              <td className="px-4 py-2">
                <KycStatusBadge user={user} />
              </td>
              <td className="px-4 py-2">
                <ActivityCell user={user} />
              </td>
              <td className="px-4 py-2">
                <LocationCell user={user} />
              </td>
              <td className="px-4 py-2">
                <p className="text-sm text-foreground">{formatTimeAgo(user.registeredAt)}</p>
                <p className="text-xs text-muted-foreground">
                  Login {formatTimeAgo(user.lastLoginAt)}
                </p>
              </td>
              <td className="px-4 py-2">
                {user.isBlocked ? (
                  <Badge variant="red">Blocked</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                    <span className="size-2 rounded-full bg-green-500" />
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  {sectionAction && (
                    <Button
                      type="button"
                      size="sm"
                      variant={sectionAction.variant ?? 'default'}
                      onClick={() => sectionAction.onClick(user)}
                    >
                      {sectionAction.label}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onRowClick(user.id)}
                  >
                    View →
                  </Button>
                  <UserActionsMenu
                    user={user}
                    onPatch={onPatch}
                    onToast={onToast}
                    onRequestBlock={onRequestBlock}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UserCard({
  user,
  pageTab,
  onView,
  onToast,
}: {
  user: User
  pageTab: PageTab
  onView: () => void
  onToast: (msg: string) => void
}) {
  const showSellerStats = pageTab === 'sellers'
  const showTotalSpent = pageTab === 'buyers'
  const activityStats = [
    { label: 'Enquiries', value: user.totalEnquiries },
    { label: 'Visits', value: user.totalVisits },
    { label: 'Deals', value: user.totalDeals },
    { label: 'Listings', value: user.totalListings },
  ].filter((item) => item.value > 0)

  return (
    <div
      className={cn(
        'group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-lg',
        user.isBlocked && 'bg-red-50/20 opacity-70',
        user.userType === 'nri' && 'border-l-4 border-l-purple-300',
      )}
    >
      <div className="bg-gradient-to-br from-primary/10 via-background to-muted/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar user={user} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate font-semibold text-foreground">{user.name}</p>
                {user.isBlocked ? (
                  <Badge variant="red">Blocked</Badge>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                    <span className="size-1.5 rounded-full bg-green-500" />
                    Active
                  </span>
                )}
                {user.userType === 'pio' && (
                  <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    PIO
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{user.referenceId}</p>
              {showSellerStats && <SellerListingStats user={user} />}
            </div>
          </div>
          <KycStatusBadge user={user} />
        </div>
      </div>

      <div className="p-4">
        <div onClick={(e) => e.stopPropagation()}>
          <EmailCell user={user} onToast={onToast} />
        </div>

        {showTotalSpent && user.totalDeals > 0 && (
          <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
            Total spent: {formatPrice(getTotalSpent(user))}
          </p>
        )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <UserTypeBadge type={user.userType} />
        <RoleBadge role={user.role} />
        <FemaBadge user={user} />
        {user.userType === 'nri' && (
          <span className="text-sm" aria-label={user.country}>
            {countryFlag(user.country)}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {activityStats.length > 0 ? (
          activityStats.slice(0, 4).map((item) => (
            <div key={item.label} className="rounded-xl bg-muted/50 px-3 py-2">
              <p className="text-sm font-semibold text-foreground">{item.value}</p>
              <p className="text-[11px] text-muted-foreground">{item.label}</p>
            </div>
          ))
        ) : (
          <div className="col-span-2 rounded-xl bg-muted/50 px-3 py-3 text-center text-xs text-muted-foreground">
            No activity yet
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {user.city}
        {user.country !== 'India' ? `, ${user.country}` : ''} • Joined{' '}
        {formatTimeAgo(user.registeredAt)}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">Last login</span>
        <span className="text-xs text-muted-foreground">
          {formatTimeAgo(user.lastLoginAt)}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
        <Button type="button" size="sm" className="rounded-full" onClick={onView}>
          View Profile →
        </Button>
      </div>
      </div>
    </div>
  )
}

type SectionAction = {
  label: string
  variant?: 'default' | 'outline'
  onClick: (user: User) => void
}

function KycTabLayout({
  users,
  viewMode,
  onRowClick,
  onPatch,
  onToast,
  onRequestBlock,
}: {
  users: User[]
  viewMode: ViewMode
  onRowClick: (id: string) => void
  onPatch: (id: string, patch: Partial<User>) => void | Promise<void>
  onToast: (msg: string) => void
  onRequestBlock?: (user: User) => void
}) {
  const [verifiedOpen, setVerifiedOpen] = useState(false)

  const pending = useMemo(
    () =>
      [...users.filter((u) => u.kycStatus === 'pending')].sort((a, b) => {
        const ta = a.kycSubmittedAt ? new Date(a.kycSubmittedAt).getTime() : 0
        const tb = b.kycSubmittedAt ? new Date(b.kycSubmittedAt).getTime() : 0
        return ta - tb
      }),
    [users],
  )
  const rejected = useMemo(
    () => users.filter((u) => u.kycStatus === 'rejected'),
    [users],
  )
  const notSubmitted = useMemo(
    () => users.filter((u) => u.kycStatus === 'not_submitted'),
    [users],
  )
  const verified = useMemo(
    () => users.filter((u) => u.kycStatus === 'verified'),
    [users],
  )

  const kycAllVerifiedCelebration =
    users.length > 0 && users.every((u) => u.kycStatus === 'verified')

  if (kycAllVerifiedCelebration) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
        <CheckCircle className="size-16 text-green-600" />
        <p className="text-sm font-medium text-foreground">
          All KYC verifications complete! 🎉
        </p>
      </div>
    )
  }

  const renderList = (list: User[], sectionAction?: SectionAction) => {
    if (list.length === 0) return null
    if (viewMode === 'card') {
      return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              pageTab="kyc"
              onView={() => onRowClick(u.id)}
              onToast={onToast}
            />
          ))}
        </div>
      )
    }
    return (
      <UsersTable
        users={list}
        pageTab="kyc"
        onRowClick={onRowClick}
        onPatch={onPatch}
        onToast={onToast}
        onRequestBlock={onRequestBlock}
        sectionAction={sectionAction}
      />
    )
  }

  return (
    <div className="space-y-8">
      {pending.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-orange-600">
            Pending Review ({pending.length})
          </h2>
          {renderList(pending, {
            label: 'Review KYC',
            variant: 'default',
            onClick: (u) => onRowClick(u.id),
          })}
        </section>
      )}

      {rejected.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-red-600">
            Rejected ({rejected.length})
          </h2>
          {renderList(rejected, {
            label: 'Re-review',
            variant: 'outline',
            onClick: (u) => {
              onToast(`Re-review started for ${u.name}`)
              onRowClick(u.id)
            },
          })}
        </section>
      )}

      {notSubmitted.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Not Submitted ({notSubmitted.length})
          </h2>
          {renderList(notSubmitted, {
            label: 'Send Reminder',
            variant: 'outline',
            onClick: (u) => openWhatsApp(u.phone),
          })}
        </section>
      )}

      {verified.length > 0 && (
        <section>
          <button
            type="button"
            className="mb-3 flex w-full items-center justify-between rounded-lg bg-green-50 px-4 py-2 text-left text-sm font-semibold text-green-800 dark:bg-green-950/40 dark:text-green-300"
            onClick={() => setVerifiedOpen((o) => !o)}
          >
            <span>Verified ({verified.length})</span>
            {verifiedOpen ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
          {verifiedOpen && renderList(verified)}
        </section>
      )}
    </div>
  )
}

export function UsersPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pageTab = getPageTab(pathname)

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [kycFilter, setKycFilter] = useState<KycFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode())
  const [toast, setToast] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [buyersChip, setBuyersChip] = useState<BuyersChipFilter>('all')
  const [sellersChip, setSellersChip] = useState<SellersChipFilter>('all')
  const [blockConfirm, setBlockConfirm] = useState<User | null>(null)

  const showToast = useCallback((msg: string) => setToast(msg), [])

  const loadUsers = useCallback(async () => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setUsers([])
      setLoadError('Admin session expired. Please sign in again.')
      setLoading(false)
      return
    }

    setLoading(true)
    setLoadError(null)
    try {
      const result = await listAdminUsers(session.accessToken)
      setUsers(result.data)
    } catch (error) {
      setUsers([])
      setLoadError(error instanceof Error ? error.message : 'Unable to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    setBuyersChip('all')
    setSellersChip('all')
  }, [pageTab])

  const patchUser = useCallback(
    async (id: string, patch: Partial<User>) => {
      const session = readAdminSession()
      if (!session?.accessToken) {
        showToast('Admin session expired. Please sign in again.')
        return
      }

      setSavingUserId(id)
      try {
        if ('isBlocked' in patch) {
          const updated = await updateAdminUserBlock(session.accessToken, id, {
            isBlocked: patch.isBlocked === true,
            blockedReason: patch.isBlocked ? patch.blockedReason ?? 'Blocked by admin' : null,
          })
          setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)))
          return
        }

        setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'Unable to update user.')
      } finally {
        setSavingUserId(null)
      }
    },
    [showToast],
  )

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode)
    persistViewMode(mode)
  }

  const handleView = (id: string) => {
    navigate(`/admin/users/${id}`)
  }

  const handleRequestBlock = useCallback((user: User) => {
    setBlockConfirm(user)
  }, [])

  const confirmBlockUser = useCallback(() => {
    if (!blockConfirm) return
    performBlockUser(blockConfirm, patchUser, showToast)
    setBlockConfirm(null)
  }, [blockConfirm, patchUser, showToast])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (!tabBaseFilter(u, pageTab)) return false
      if (!matchesSearch(u, q)) return false
      if (!matchesRoleFilter(u, roleFilter)) return false
      if (!matchesKycFilter(u, kycFilter)) return false
      if (pageTab === 'buyers' && !matchesBuyersChip(u, buyersChip)) return false
      if (pageTab === 'sellers' && !matchesSellersChip(u, sellersChip)) return false
      return true
    })
  }, [users, pageTab, search, roleFilter, kycFilter, buyersChip, sellersChip])

  const emptyKind = useMemo(() => {
    if (users.length === 0) return 'none' as const
    const q = search.trim()
    if (q && filtered.length === 0) return 'search' as const
    if (filtered.length === 0) return 'filter' as const
    return null
  }, [users.length, search, filtered.length])

  const filterEmptyLabel = useMemo(() => {
    if (roleFilter !== 'all') return getRoleLabel(roleFilter).toLowerCase()
    if (kycFilter !== 'all') return getKycStatusLabel(kycFilter).toLowerCase()
    if (pageTab === 'buyers') return 'buyer'
    if (pageTab === 'sellers') return 'seller'
    return 'matching'
  }, [roleFilter, kycFilter, pageTab])

  const buyersChipOptions: { key: BuyersChipFilter; label: string }[] = [
    { key: 'all', label: 'All Buyers' },
    { key: 'active', label: 'Active Buyers' },
    { key: 'past', label: 'Past Buyers' },
    { key: 'high_value', label: 'High Value (>₹50L)' },
  ]

  const sellersChipOptions: { key: SellersChipFilter; label: string }[] = [
    { key: 'all', label: 'All Sellers' },
    { key: 'active', label: 'Active Sellers' },
    { key: 'kyc_verified', label: 'KYC Verified' },
    { key: 'not_verified', label: 'Not Verified' },
  ]

  return (
    <div className="space-y-6 p-6">
      {blockConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBlockConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">
              ⚠️ This user has {blockConfirm.totalDeals} active{' '}
              {blockConfirm.totalDeals === 1 ? 'deal' : 'deals'}.
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Blocking will prevent app access. Active deals will not be affected.
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">Block anyway?</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setBlockConfirm(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={confirmBlockUser}
              >
                Block anyway
              </Button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
          {toast}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Users className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold text-foreground">Users</h1>
                <p className="text-sm text-muted-foreground">
                  Manage buyers, sellers, KYC and access status
                </p>
              </div>
            </div>
            <Badge
              variant="default"
              className={cn(
                'w-fit rounded-full px-3 py-1',
                savingUserId ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground',
              )}
            >
              {savingUserId ? 'Saving user...' : (
                <>
                {loading ? users.length : filtered.length}
              users
                </>
              )}
            </Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-center">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search name, phone, email, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-full border border-border bg-input py-2 pl-9 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                className="h-10 rounded-full border border-border bg-input px-3 text-sm"
                aria-label="Role filter"
              >
                <option value="all">All Roles</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="both">Buyer & Seller</option>
              </select>
              <select
                value={kycFilter}
                onChange={(e) => setKycFilter(e.target.value as KycFilter)}
                className="h-10 rounded-full border border-border bg-input px-3 text-sm"
                aria-label="KYC filter"
              >
                <option value="all">All KYC</option>
                <option value="verified">Verified</option>
                <option value="pending">Pending</option>
                <option value="rejected">Rejected</option>
                <option value="not_submitted">Not Submitted</option>
              </select>
              <div className="flex rounded-full border border-border bg-muted/40 p-0.5">
                <Button
                  type="button"
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="icon"
                  className="rounded-full"
                  onClick={() => handleViewChange('table')}
                  aria-label="Table view"
                >
                  <List className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'card' ? 'default' : 'ghost'}
                  size="icon"
                  className="rounded-full"
                  onClick={() => handleViewChange('card')}
                  aria-label="Card view"
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {pageTab === 'buyers' && !loading && (
        <FilterChips
          options={buyersChipOptions}
          value={buyersChip}
          onChange={setBuyersChip}
        />
      )}

      {pageTab === 'sellers' && !loading && (
        <FilterChips
          options={sellersChipOptions}
          value={sellersChip}
          onChange={setSellersChip}
        />
      )}

      {loadError ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
          <XCircle className="size-14 text-destructive" />
          <p className="max-w-md text-sm font-medium text-foreground">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void loadUsers()}>
            Retry
          </Button>
        </div>
      ) : loading ? (
        viewMode === 'card' ? (
          <CardSkeleton />
        ) : (
          <TableSkeleton />
        )
      ) : emptyKind === 'none' ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
          <Users className="size-16 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No users yet</p>
        </div>
      ) : emptyKind === 'search' ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
          <SearchX className="size-16 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            No results for &apos;{search.trim()}&apos;
          </p>
        </div>
      ) : emptyKind === 'filter' ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
          <FilterX className="size-16 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            No {filterEmptyLabel} users
          </p>
        </div>
      ) : pageTab === 'kyc' ? (
        <KycTabLayout
          users={filtered}
          viewMode={viewMode}
          onRowClick={handleView}
          onPatch={patchUser}
          onToast={showToast}
          onRequestBlock={handleRequestBlock}
        />
      ) : viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              pageTab={pageTab}
              onView={() => handleView(user.id)}
              onToast={showToast}
            />
          ))}
        </div>
      ) : (
        <UsersTable
          users={filtered}
          pageTab={pageTab}
          onRowClick={handleView}
          onPatch={patchUser}
          onToast={showToast}
          onRequestBlock={handleRequestBlock}
        />
      )}
    </div>
  )
}
