import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { Bell, ChevronRight, Menu, Search, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useAdminLayout } from '@/context/AdminLayoutContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { readAdminSession } from '@/api/admin'
import {
  listAdminNotifications,
  markAdminNotificationRead,
  type AdminNotification,
} from '@/api/adminNotifications'
import { searchAdminDashboard, type AdminSearchResult } from '@/api/adminSearch'
import { hasPermission } from '@/config/adminPermissions'

const SEARCH_TYPE_ORDER: AdminSearchResult['type'][] = [
  'property',
  'user',
  'enquiry',
  'acquisition',
  'deal',
]

const SEARCH_TYPE_LABELS: Record<AdminSearchResult['type'], string> = {
  property: 'Properties',
  user: 'Users',
  enquiry: 'Enquiries',
  acquisition: 'Acquisitions',
  deal: 'Sales Deals',
}

interface AdminHeaderProps {
  title: string
  sidebarOffsetClass: string
  showBrand: boolean
}

export function AdminHeader({ title, sidebarOffsetClass, showBrand }: AdminHeaderProps) {
  const navigate = useNavigate()
  const { sidebarMode, setMobileOpen } = useAdminLayout()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<AdminSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [notifOpen, setNotifOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)

  const groupedSearchResults = useMemo(
    () =>
      SEARCH_TYPE_ORDER.map((type) => ({
        type,
        label: SEARCH_TYPE_LABELS[type],
        items: searchResults.filter((r) => r.type === type),
      })).filter((g) => g.items.length > 0),
    [searchResults],
  )

  const unreadCount = notifications.filter((n) => !n.read).length

  const refreshNotifications = useCallback(() => {
    const session = readAdminSession()
    if (!session?.accessToken || !hasPermission(session, 'support.read')) {
      setNotifications([])
      return
    }
    setNotificationsLoading(true)
    setNotificationsError(null)
    listAdminNotifications(session.accessToken)
      .then((result) => setNotifications(result.data))
      .catch((err) => {
        setNotifications([])
        setNotificationsError(err instanceof Error ? err.message : 'Could not load notifications.')
      })
      .finally(() => setNotificationsLoading(false))
  }, [])

  useEffect(() => {
    refreshNotifications()
  }, [])

  useEffect(() => {
    const query = searchQuery.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    const session = readAdminSession()
    if (!session?.accessToken) {
      setSearchResults([])
      return
    }
    let cancelled = false
    setSearchLoading(true)
    const timer = window.setTimeout(() => {
      searchAdminDashboard(session.accessToken, query)
        .then((results) => {
          if (cancelled) return
          setSearchResults(results)
        })
        .catch(() => {
          if (!cancelled) setSearchResults([])
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [searchQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSearchSelect = (route: string) => {
    navigate(route)
    setSearchOpen(false)
    setSearchQuery('')
  }

  const markNotificationRead = (id: string) => {
    const session = readAdminSession()
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    if (session?.accessToken) {
      void markAdminNotificationRead(session.accessToken, id).catch(() => undefined)
    }
  }

  return (
    <header
      className={cn(
        'fixed right-0 top-0 z-30 flex h-[var(--header-height)] items-center gap-4 border-b border-border bg-card px-4 transition-all duration-200 md:px-6',
        sidebarOffsetClass,
      )}
    >
      {sidebarMode === 'hidden' && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </Button>
      )}

      {showBrand && (
        <button
          type="button"
          onClick={() => navigate('/admin/overview')}
          className="cursor-pointer shrink-0 text-lg font-bold tracking-tight text-brand-600 hover:opacity-90"
        >
          BUILTGLORY
        </button>
      )}

      <h1 className="shrink-0 text-lg font-semibold tracking-tight md:text-xl">{title}</h1>

      <div className="mx-auto hidden max-w-md flex-1 md:flex">
        <div ref={searchRef} className="relative w-full">
          <Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setSearchOpen(e.target.value.length >= 2)
            }}
            onFocus={() => {
              if (searchQuery.length >= 2) setSearchOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false)
                setSearchQuery('')
              }
              if (e.key === 'Enter' && searchResults.length > 0) {
                handleSearchSelect(searchResults[0].route)
              }
            }}
            placeholder="Search properties, users, enquiries..."
            className="h-10 w-full rounded-lg border border-border bg-input pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />

          {searchOpen && searchQuery.length >= 2 && (
            <div
              className="absolute left-1/2 top-[calc(100%+8px)] z-[100] w-[500px] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
              role="listbox"
            >
              {searchLoading ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Searching live records...
                </div>
              ) : searchResults.length > 0 ? (
                <>
                  <div className="max-h-[min(420px,70vh)] overflow-y-auto">
                    {groupedSearchResults.map((group) => (
                      <div key={group.type}>
                        <p className="bg-muted/50 px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
                          {group.label}
                        </p>
                        {group.items.map((result) => (
                          <button
                            key={`${result.type}-${result.id}`}
                            type="button"
                            role="option"
                            className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-sidebar-accent"
                            onClick={() => handleSearchSelect(result.route)}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-base">
                              {result.emoji}
                            </span>
                            <span className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{result.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {result.subtitle}
                              </p>
                            </span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="border-t border-border px-4 py-2 text-center text-xs text-muted-foreground">
                    Press Enter for first result • Esc to close
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center py-8">
                  <SearchX className="size-10 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No results for &apos;{searchQuery}&apos;
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative md:hidden" aria-label="Search">
          <Search className="size-5" />
        </Button>

        <div ref={notifRef} className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
            aria-expanded={notifOpen}
            onClick={() => setNotifOpen((o) => !o)}
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>

          {notifOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-[100] w-[380px] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                <span className="font-semibold">Notifications</span>
                {unreadCount > 0 && (
                  <Badge variant="red" className="bg-destructive text-white">
                    {unreadCount} unread
                  </Badge>
                )}
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="ml-auto text-xs text-primary hover:underline"
                    onClick={() => {
                      notifications.filter((n) => !n.read).forEach((n) => markNotificationRead(n.id))
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              {notificationsLoading ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading notifications...
                </div>
              ) : notificationsError ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-destructive">{notificationsError}</p>
                  <button
                    type="button"
                    className="mt-2 text-sm text-primary hover:underline"
                    onClick={refreshNotifications}
                  >
                    Retry
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center py-8">
                  <Bell className="size-10 text-muted-foreground/50" />
                  <p className="mt-2 font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No new notifications</p>
                </div>
              ) : (
                <ul className="max-h-[400px] overflow-y-auto">
                  {notifications.map((notif) => (
                    <li key={notif.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-sidebar-accent',
                          !notif.read && 'bg-blue-50/40 dark:bg-blue-950/20',
                        )}
                        onClick={() => {
                          markNotificationRead(notif.id)
                          navigate(notif.route)
                          setNotifOpen(false)
                        }}
                      >
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-lg',
                            notif.read ? 'bg-muted' : 'bg-primary/10',
                          )}
                        >
                          {notif.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm',
                              notif.read ? 'font-medium' : 'font-semibold',
                            )}
                          >
                            {notif.title}
                          </p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {notif.message}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{notif.time}</p>
                        </span>
                        {!notif.read && (
                          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t border-border px-4 py-3 text-center">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => {
                    navigate('/admin/settings/audit')
                    setNotifOpen(false)
                  }}
                >
                  View notification history
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  )
}
