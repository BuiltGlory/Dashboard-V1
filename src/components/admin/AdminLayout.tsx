import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import {
  clearAdminSession,
  ensureFreshAdminSession,
  readAdminSession,
  REDIRECT_AFTER_LOGIN_KEY,
} from '@/api/admin'
import {
  ADMIN_NAV_SECTIONS,
  findNavTabByPath,
  findSectionByPath,
  OVERVIEW_PATH,
} from '@/config/adminNavigation'
import {
  filterNavTabs,
  firstAllowedAdminPath,
  isPathAllowed,
} from '@/config/adminPermissions'
import { AdminLayoutProvider, useAdminLayout } from '@/context/AdminLayoutContext'
import { cn } from '@/lib/utils'
import { AdminHeader } from './AdminHeader'
import { AdminSidebar } from './AdminSidebar'

function saveRedirectPath() {
  const currentPath = window.location.pathname + window.location.search
  if (!currentPath.includes('/login')) {
    localStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, currentPath)
  }
  return currentPath
}

function loginPathForRedirect(reason?: string) {
  const redirectTo = saveRedirectPath()
  const params = new URLSearchParams()

  if (reason) params.set('reason', reason)
  if (redirectTo.startsWith('/admin')) params.set('redirect', redirectTo)

  const search = params.toString()
  return search ? `/login?${search}` : '/login'
}

const SESSION_REFRESH_INTERVAL_MS = 60_000
const SESSION_REFRESH_BUFFER_MS = 2 * 60_000

function AdminSectionTabs() {
  const location = useLocation()
  const session = readAdminSession()
  const section = findSectionByPath(location.pathname)
  const allowedTabs = section ? filterNavTabs(session, section.tabs) : []

  if (!section || allowedTabs.length === 0) return null

  return (
    <nav
      className="flex h-12 items-start overflow-x-auto scroll-smooth pb-1 [scrollbar-color:hsl(var(--muted-foreground))_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-track]:bg-transparent"
      aria-label={`${section.label} tabs`}
    >
      {allowedTabs.map((tab) => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) =>
            cn(
              'inline-flex h-11 shrink-0 items-center border-b-2 px-5 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

function AdminLayoutInner() {
  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarMode } = useAdminLayout()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('builtglory-sidebar-collapsed') === 'true',
  )
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showOnlineBanner, setShowOnlineBanner] = useState(false)

  useEffect(() => {
    let cancelled = false
    let interval: ReturnType<typeof setInterval>

    const redirectToLogin = (reason?: string) => {
      const loginPath = loginPathForRedirect(reason)
      if (!cancelled) navigate(loginPath)
    }

    const ensureSession = async () => {
      const session = readAdminSession()
      if (!session) {
        redirectToLogin()
        return
      }

      try {
        await ensureFreshAdminSession(SESSION_REFRESH_BUFFER_MS)
      } catch {
        clearAdminSession()
        redirectToLogin('timeout')
      }
    }

    const ensureVisibleSession = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void ensureSession()
    }

    void ensureSession()
    interval = setInterval(ensureVisibleSession, SESSION_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', ensureVisibleSession)
    window.addEventListener('online', ensureVisibleSession)
    document.addEventListener('visibilitychange', ensureVisibleSession)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', ensureVisibleSession)
      window.removeEventListener('online', ensureVisibleSession)
      document.removeEventListener('visibilitychange', ensureVisibleSession)
    }
  }, [navigate])

  useEffect(() => {
    const auth = readAdminSession()
    if (!auth) {
      navigate(loginPathForRedirect())
      return
    }
    if (!isPathAllowed(auth, location.pathname)) {
      navigate(firstAllowedAdminPath(auth, ADMIN_NAV_SECTIONS), { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    const handler = () => {
      setSidebarCollapsed(
        localStorage.getItem('builtglory-sidebar-collapsed') === 'true',
      )
    }
    window.addEventListener('storage', handler)
    const interval = setInterval(handler, 100)
    return () => {
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true)
      setShowOnlineBanner(true)
      setTimeout(() => setShowOnlineBanner(false), 3000)
    }
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    const TIMEOUT = 30 * 60 * 1000
    let timer: ReturnType<typeof setTimeout>

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        clearAdminSession()
        navigate(loginPathForRedirect('timeout'))
      }, TIMEOUT)
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, reset))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [navigate])

  const isOverview = location.pathname === OVERVIEW_PATH
  const navTab = findNavTabByPath(location.pathname)
  const pageTitle = isOverview ? 'Overview' : (navTab?.label ?? 'Admin')
  const showTabs = !isOverview && Boolean(findSectionByPath(location.pathname))

  const mainMargin =
    sidebarMode === 'hidden'
      ? 'ml-0'
      : sidebarCollapsed
        ? 'ml-16'
        : 'ml-60'
  const headerOffset =
    sidebarMode === 'hidden'
      ? 'left-0'
      : sidebarCollapsed
        ? 'left-16'
        : 'left-60'
  const showHeaderBrand = sidebarMode === 'hidden' || sidebarCollapsed

  return (
    <div className="min-h-screen bg-muted">
      <AdminSidebar />
      <div
        className={cn(
          'flex min-h-screen flex-1 flex-col transition-all duration-200',
          mainMargin,
        )}
      >
        <AdminHeader
          title={pageTitle}
          sidebarOffsetClass={headerOffset}
          showBrand={showHeaderBrand}
        />

        <div
          className="flex flex-1 flex-col"
          style={{ marginTop: 'var(--header-height)' }}
        >
          {!isOnline && (
            <div className="bg-red-500 py-2 text-center text-sm text-white">
              ⚠️ You are offline. Changes may not be saved.
            </div>
          )}
          {showOnlineBanner && isOnline && (
            <div className="bg-green-500 py-2 text-center text-sm text-white">
              ✅ Back online!
            </div>
          )}

          {showTabs && (
            <div className="border-b border-border bg-card">
              <AdminSectionTabs />
            </div>
          )}

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export function AdminLayout() {
  return (
    <AdminLayoutProvider>
      <AdminLayoutInner />
    </AdminLayoutProvider>
  )
}
