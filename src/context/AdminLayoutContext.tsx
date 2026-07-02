import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type SidebarMode = 'expanded' | 'collapsed' | 'hidden'

interface AdminLayoutContextValue {
  sidebarMode: SidebarMode
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  toggleSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
  isCollapsed: boolean
}

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null)

export function AdminLayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('expanded')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const mqTablet = window.matchMedia('(max-width: 1024px)')
    const mqMobile = window.matchMedia('(max-width: 768px)')

    const apply = () => {
      if (mqMobile.matches) {
        setSidebarMode('hidden')
        setMobileOpen(false)
      } else if (mqTablet.matches) {
        setSidebarMode('collapsed')
      } else {
        setSidebarMode('expanded')
      }
    }

    apply()
    mqTablet.addEventListener('change', apply)
    mqMobile.addEventListener('change', apply)
    return () => {
      mqTablet.removeEventListener('change', apply)
      mqMobile.removeEventListener('change', apply)
    }
  }, [])

  const toggleSidebar = useCallback(() => {
    if (sidebarMode === 'hidden') {
      setMobileOpen((open) => !open)
      return
    }
    setSidebarMode((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'))
  }, [sidebarMode])

  const collapseSidebar = useCallback(() => setSidebarMode('collapsed'), [])
  const expandSidebar = useCallback(() => setSidebarMode('expanded'), [])

  const value = useMemo(
    () => ({
      sidebarMode,
      mobileOpen,
      setMobileOpen,
      toggleSidebar,
      collapseSidebar,
      expandSidebar,
      isCollapsed: sidebarMode === 'collapsed',
    }),
    [sidebarMode, mobileOpen, toggleSidebar, collapseSidebar, expandSidebar],
  )

  return <AdminLayoutContext.Provider value={value}>{children}</AdminLayoutContext.Provider>
}

export function useAdminLayout() {
  const ctx = useContext(AdminLayoutContext)
  if (!ctx) throw new Error('useAdminLayout must be used within AdminLayoutProvider')
  return ctx
}
