import { useEffect, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { clearAdminSession, getAdminOverview, logoutAdminSession, readAdminSession } from '@/api/admin'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import {
  ADMIN_NAV_SECTIONS,
  ADMIN_OVERVIEW,
  isSectionActive,
  type NavBadge,
  type NavSection,
} from '@/config/adminNavigation'
import { filterNavSections, hasPermission } from '@/config/adminPermissions'
import { useAdminLayout } from '@/context/AdminLayoutContext'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface StoredAuth {
  name: string
  role: string
  email?: string
  accessToken: string
  refreshToken: string
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

function readStoredAuth(): StoredAuth | null {
  const session = readAdminSession()
  if (!session) return null
  return {
    name: session.admin.name || session.admin.email,
    email: session.admin.email,
    role: session.admin.role,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  }
}

function CountBadge({ badge, className }: { badge: NavBadge; className?: string }) {
  const variant = badge.variant === 'red' ? 'red' : badge.variant === 'blue' ? 'blue' : 'orange'
  return (
    <Badge
      variant={variant}
      className={cn('min-w-[20px] justify-center rounded-full px-1.5 py-0 text-[10px] font-semibold', className)}
    >
      {badge.value}
    </Badge>
  )
}

function applyNavBadges(sections: NavSection[], badges?: Record<string, number>): NavSection[] {
  if (!badges) return sections.map((section) => ({ ...section, badge: undefined }))
  return sections.map((section) => {
    const count = badges[section.id] ?? 0
    if (count <= 0) return { ...section, badge: undefined }
    return {
      ...section,
      badge: {
        variant: section.id === 'enquiries' || section.id === 'users' ? 'red' : section.id === 'sales' ? 'blue' : 'orange',
        value: count > 99 ? '99+' : String(count),
      },
    }
  })
}

function SidebarNavLink({
  to,
  label,
  icon: Icon,
  badge,
  collapsed,
  isActive,
}: {
  to: string
  label: string
  icon: NavSection['icon']
  badge?: NavBadge
  collapsed: boolean
  isActive: boolean
}) {
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number
    left: number
  } | null>(null)

  const showTooltip = (
    event: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>,
  ) => {
    if (!collapsed) return

    const rect = event.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    })
  }

  const hideTooltip = () => setTooltipPosition(null)

  return (
    <>
      <NavLink
        to={to}
        aria-label={collapsed ? label : undefined}
        onMouseEnter={showTooltip}
        onFocus={showTooltip}
        onMouseLeave={hideTooltip}
        onBlur={hideTooltip}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary',
          collapsed && 'justify-center px-2',
        )}
      >
        <Icon className="size-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">{label}</span>
            {badge && <CountBadge badge={badge} className="ml-auto shrink-0" />}
          </>
        )}
      </NavLink>

      {collapsed &&
        tooltipPosition &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] -translate-y-1/2 rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white shadow-md"
            style={{
              top: tooltipPosition.top,
              left: tooltipPosition.left,
            }}
          >
            {label}
          </div>,
          document.body,
      )}
    </>
  )
}

export function AdminSidebar() {
  const navigate = useNavigate()
  const { sidebarMode, mobileOpen, setMobileOpen } = useAdminLayout()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('builtglory-sidebar-collapsed') === 'true',
  )
  const auth = readStoredAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const [navBadges, setNavBadges] = useState<Record<string, number> | undefined>()
  const [accountTooltipPosition, setAccountTooltipPosition] = useState<{
    top: number
    left: number
  } | null>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setProfileOpen(false), 0)
    return () => window.clearTimeout(timer)
  }, [location.pathname])

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, setMobileOpen])

  useEffect(() => {
    const session = readAdminSession()
    if (!session?.accessToken) {
      setNavBadges(undefined)
      return
    }
    let cancelled = false
    getAdminOverview(session.accessToken)
      .then((data) => {
        if (!cancelled) setNavBadges(data.navBadges)
      })
      .catch(() => {
        if (!cancelled) setNavBadges(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = () => {
    if (sidebarMode === 'hidden') {
      setMobileOpen(!mobileOpen)
      return
    }
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('builtglory-sidebar-collapsed', String(next))
      return next
    })
  }

  const isHidden = sidebarMode === 'hidden' && !mobileOpen
  const isOverviewActive = location.pathname === ADMIN_OVERVIEW.path
  const accountName = auth?.name ?? 'Admin'
  const allowedSections = filterNavSections(readAdminSession(), applyNavBadges(ADMIN_NAV_SECTIONS, navBadges))
  const canManageAccess = hasPermission(readAdminSession(), 'admin.access.manage')

  const showAccountTooltip = (
    event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>,
  ) => {
    if (!collapsed || profileOpen) return

    const rect = event.currentTarget.getBoundingClientRect()
    setAccountTooltipPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 8,
    })
  }

  const hideAccountTooltip = () => setAccountTooltipPosition(null)

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-svh flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 ease-in-out',
          collapsed ? 'w-16' : 'w-60',
          isHidden && '-translate-x-full',
          !isHidden && 'translate-x-0',
          mobileOpen && 'shadow-2xl',
        )}
      >
        <div
          className={cn(
            'flex h-[var(--header-height)] shrink-0 items-center gap-2 border-b border-sidebar-border px-4',
            collapsed && 'justify-center px-2',
          )}
        >
          {!collapsed && (
            <button
              type="button"
              onClick={() => navigate('/admin/overview')}
              className="min-w-0 flex-1 cursor-pointer text-left"
            >
              <p className="text-lg font-bold tracking-tight text-brand-600">BUILTGLORY</p>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </Button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <SidebarNavLink
            to={ADMIN_OVERVIEW.path}
            label={ADMIN_OVERVIEW.label}
            icon={ADMIN_OVERVIEW.icon}
            collapsed={collapsed}
            isActive={isOverviewActive}
          />

          {allowedSections.map((section) => (
            <SidebarNavLink
              key={section.id}
              to={section.tabs[0]?.path ?? section.defaultPath}
              label={section.label}
              icon={section.icon}
              badge={section.badge}
              collapsed={collapsed}
              isActive={isSectionActive(section, location.pathname)}
            />
          ))}
        </nav>

        <div
          ref={profileRef}
          className={cn('relative shrink-0 border-t border-sidebar-border p-4', collapsed && 'p-2')}
        >
          <button
            type="button"
            onClick={() => {
              hideAccountTooltip()
              setProfileOpen((open) => !open)
            }}
            onMouseEnter={showAccountTooltip}
            onFocus={showAccountTooltip}
            onMouseLeave={hideAccountTooltip}
            onBlur={hideAccountTooltip}
            className={cn(
              'flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent',
              collapsed && 'justify-center',
            )}
            aria-label={collapsed ? accountName : 'Account menu'}
            aria-expanded={profileOpen}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white">
              {auth ? getInitials(auth.name) : 'AK'}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {accountName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{auth?.role ?? '—'}</p>
                </div>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    profileOpen && 'rotate-180',
                  )}
                />
              </>
            )}
          </button>

          {collapsed &&
            accountTooltipPosition &&
            !profileOpen &&
            createPortal(
              <div
                className="pointer-events-none fixed z-[100] -translate-y-1/2 rounded-md bg-black px-2.5 py-1.5 text-xs font-medium text-white shadow-md"
                style={{
                  top: accountTooltipPosition.top,
                  left: accountTooltipPosition.left,
                }}
              >
                {accountName}
              </div>,
              document.body,
            )}

          {profileOpen && (
            <div
              className={cn(
                'absolute z-[100] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl',
                collapsed ? 'bottom-2 left-full ml-2 w-56' : 'bottom-[calc(100%+8px)] left-4 right-4',
              )}
            >
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-sidebar-accent"
                onClick={() => {
                  navigate('/admin/settings/general')
                  setProfileOpen(false)
                }}
              >
                <UserRound className="size-4 text-muted-foreground" />
                My Profile
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-sidebar-accent"
                onClick={() => {
                  navigate('/admin/settings/general')
                  setProfileOpen(false)
                }}
              >
                <Settings className="size-4 text-muted-foreground" />
                Settings
              </button>
              {canManageAccess && (
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-sidebar-accent"
                  onClick={() => {
                    navigate('/admin/settings/access')
                    setProfileOpen(false)
                  }}
                >
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Access Control
                </button>
              )}
              <hr className="my-1 border-border" />
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-500 hover:bg-sidebar-accent"
                onClick={() => {
                  if (auth?.refreshToken) {
                    void logoutAdminSession(auth.accessToken, auth.refreshToken).catch(() => undefined)
                  }
                  clearAdminSession()
                  setProfileOpen(false)
                  navigate('/login')
                }}
              >
                <LogOut className="size-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
