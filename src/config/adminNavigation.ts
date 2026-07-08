import type { LucideIcon } from 'lucide-react'
import {
  BarChart2,
  Building,
  Building2,
  LayoutDashboard,
  MessageSquare,
  Shield,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'

export type NavBadgeVariant = 'red' | 'blue' | 'orange'

export interface NavBadge {
  variant: NavBadgeVariant
  value: string
}

export interface NavTab {
  id: string
  label: string
  path: string
}

export interface NavSection {
  id: string
  label: string
  icon: LucideIcon
  defaultPath: string
  badge?: NavBadge
  tabs: NavTab[]
}

export interface NavOverviewLink {
  id: string
  label: string
  path: string
  icon: LucideIcon
}

export const OVERVIEW_PATH = '/admin/overview'

export const ADMIN_OVERVIEW: NavOverviewLink = {
  id: 'overview',
  label: 'Overview',
  path: OVERVIEW_PATH,
  icon: LayoutDashboard,
}

export const ADMIN_NAV_SECTIONS: NavSection[] = [
  {
    id: 'enquiries',
    label: 'Enquiries',
    icon: MessageSquare,
    defaultPath: '/admin/enquiries/buy',
    tabs: [
      { id: 'buy', label: 'Buy Enquiries', path: '/admin/enquiries/buy' },
      { id: 'sell', label: 'Sell Requests', path: '/admin/enquiries/sell' },
      { id: 'visits', label: 'Visits', path: '/admin/enquiries/visits' },
      { id: 'callbacks', label: 'Callbacks', path: '/admin/enquiries/callbacks' },
      { id: 'interior', label: 'Interior Leads', path: '/admin/enquiries/interior' },
      { id: 'chat', label: 'Chat', path: '/admin/enquiries/chat' },
    ],
  },
  {
    id: 'acquisition',
    label: 'Acquisition Pipeline',
    icon: Building2,
    defaultPath: '/admin/acquisition/all',
    tabs: [
      { id: 'all', label: 'All', path: '/admin/acquisition/all' },
      { id: 'pending', label: 'Pending Review', path: '/admin/acquisition/pending' },
      { id: 'inspection', label: 'Site Inspection', path: '/admin/acquisition/inspection' },
      { id: 'valuation', label: 'Valuation', path: '/admin/acquisition/valuation' },
      { id: 'negotiation', label: 'Negotiation', path: '/admin/acquisition/negotiation' },
      { id: 'token', label: 'Token to Seller', path: '/admin/acquisition/token' },
      { id: 'documentation', label: 'Documentation', path: '/admin/acquisition/documentation' },
      { id: 'payout', label: 'Seller Payout', path: '/admin/acquisition/payout' },
      { id: 'acquired', label: 'Acquired', path: '/admin/acquisition/acquired' },
      { id: 'rejected', label: 'Rejected', path: '/admin/acquisition/rejected' },
      { id: 'onhold', label: 'On Hold', path: '/admin/acquisition/on-hold' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales Pipeline',
    icon: TrendingUp,
    defaultPath: '/admin/sales/all',
    tabs: [
      { id: 'all', label: 'All', path: '/admin/sales/all' },
      { id: 'leads', label: 'Active Leads', path: '/admin/sales/leads' },
      { id: 'visits', label: 'Site Visits', path: '/admin/sales/visits' },
      { id: 'negotiation', label: 'Negotiation', path: '/admin/sales/negotiation' },
      { id: 'token', label: 'Token Payment', path: '/admin/sales/token' },
      { id: 'fullpayment', label: 'Full Payment', path: '/admin/sales/fullpayment' },
      { id: 'stagepayment', label: 'Stage Payment', path: '/admin/sales/stagepayment' },
      { id: 'interior', label: 'Interior Design', path: '/admin/sales/interior' },
      { id: 'documentation', label: 'Documentation', path: '/admin/sales/documentation' },
      { id: 'closed', label: 'Closed', path: '/admin/sales/closed' },
      { id: 'lost', label: 'Lost', path: '/admin/sales/lost' },
      { id: 'reengagement', label: 'Re-engagement', path: '/admin/sales/reengagement' },
    ],
  },
  {
    id: 'properties',
    label: 'Properties',
    icon: Building,
    defaultPath: '/admin/properties/all',
    tabs: [
      { id: 'all', label: 'All Properties', path: '/admin/properties/all' },
      { id: 'add', label: 'Add Property', path: '/admin/properties/add' },
      { id: 'upload', label: 'Bulk Upload', path: '/admin/properties/upload' },
      { id: 'featured', label: 'Featured', path: '/admin/properties/featured' },
      { id: 'upcoming', label: 'Upcoming', path: '/admin/properties/upcoming' },
      { id: 'templates', label: 'Templates', path: '/admin/properties/templates' },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    icon: Users,
    defaultPath: '/admin/users/all',
    tabs: [
      { id: 'all', label: 'All Users', path: '/admin/users/all' },
      { id: 'buyers', label: 'Buyers', path: '/admin/users/buyers' },
      { id: 'sellers', label: 'Sellers', path: '/admin/users/sellers' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart2,
    defaultPath: '/admin/reports/sales',
    tabs: [
      { id: 'sales', label: 'Sales Report', path: '/admin/reports/sales' },
      { id: 'acquisition', label: 'Acquisition Report', path: '/admin/reports/acquisition' },
      { id: 'revenue', label: 'Revenue', path: '/admin/reports/revenue' },
      { id: 'export', label: 'Export', path: '/admin/reports/export' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: Wrench,
    defaultPath: '/admin/tools/content',
    tabs: [
      { id: 'content', label: 'App Content', path: '/admin/tools/content' },
      { id: 'mastersheet', label: 'Master Sheet', path: '/admin/tools/mastersheet' },
      { id: 'locations', label: 'Locations', path: '/admin/tools/locations' },
      { id: 'pricing', label: 'Pricing', path: '/admin/tools/pricing' },
      { id: 'templates', label: 'Message Templates', path: '/admin/tools/templates' },
      { id: 'bulkmessage', label: 'Bulk Message', path: '/admin/tools/bulkmessage' },
      { id: 'push', label: 'Push Notifications', path: '/admin/tools/push' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: Shield,
    defaultPath: '/admin/settings/support',
    tabs: [
      { id: 'support', label: 'Support Tickets', path: '/admin/settings/support' },
      { id: 'feedback', label: 'Feedback', path: '/admin/settings/feedback' },
      { id: 'access', label: 'Access Control', path: '/admin/settings/access' },
      { id: 'general', label: 'Settings', path: '/admin/settings/general' },
      { id: 'legal', label: 'Legal Content', path: '/admin/settings/legal' },
      { id: 'audit', label: 'Audit Trail', path: '/admin/settings/audit' },
    ],
  },
]

export const ALL_NAV_TABS: NavTab[] = ADMIN_NAV_SECTIONS.flatMap((section) => section.tabs)

/** @deprecated Kept for PlaceholderPage compatibility */
export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
  badge?: NavBadge
}

export const ALL_NAV_ITEMS: NavItem[] = [
  {
    id: ADMIN_OVERVIEW.id,
    label: ADMIN_OVERVIEW.label,
    path: ADMIN_OVERVIEW.path,
    icon: ADMIN_OVERVIEW.icon,
  },
  ...ALL_NAV_TABS.map((tab) => {
    const section = ADMIN_NAV_SECTIONS.find((s) => s.tabs.some((t) => t.path === tab.path))!
    return {
      id: tab.id,
      label: tab.label,
      path: tab.path,
      icon: section.icon,
    }
  }),
]

const STORAGE_COLLAPSED = 'builtglory-sidebar-collapsed'

export function getStoredSidebarCollapsed(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_COLLAPSED)
    if (v === 'true') return true
    if (v === 'false') return false
    return null
  } catch {
    return null
  }
}

export function setStoredSidebarCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_COLLAPSED, String(collapsed))
  } catch {
    /* ignore */
  }
}

export function findNavTabByPath(path: string): (NavTab & { sectionIcon: LucideIcon; sectionLabel: string }) | null {
  for (const section of ADMIN_NAV_SECTIONS) {
    const tab = section.tabs.find((t) => t.path === path)
    if (tab) {
      return { ...tab, sectionIcon: section.icon, sectionLabel: section.label }
    }
  }
  return null
}

export function findSectionByPath(path: string): NavSection | undefined {
  return ADMIN_NAV_SECTIONS.find((section) => section.tabs.some((tab) => tab.path === path))
}

export function isSectionActive(section: NavSection, pathname: string): boolean {
  return section.tabs.some((tab) => tab.path === pathname)
}

export function findNavItemByPath(path: string): NavItem | undefined {
  if (path === ADMIN_OVERVIEW.path) {
    return {
      id: ADMIN_OVERVIEW.id,
      label: ADMIN_OVERVIEW.label,
      path: ADMIN_OVERVIEW.path,
      icon: ADMIN_OVERVIEW.icon,
    }
  }
  const tab = findNavTabByPath(path)
  if (!tab) return undefined
  return {
    id: tab.id,
    label: tab.label,
    path: tab.path,
    icon: tab.sectionIcon,
  }
}
