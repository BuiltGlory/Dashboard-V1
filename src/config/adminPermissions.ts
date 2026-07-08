import type { StoredAdminSession } from '@/api/admin'
import type { NavSection, NavTab } from './adminNavigation'

export type AdminPermission =
  | 'properties.read'
  | 'properties.write'
  | 'properties.publish'
  | 'users.read'
  | 'users.write'
  | 'users.kyc.review'
  | 'users.fema.review'
  | 'enquiries.read'
  | 'enquiries.write'
  | 'acquisitions.read'
  | 'acquisitions.write'
  | 'sales.read'
  | 'sales.write'
  | 'support.read'
  | 'support.write'
  | 'admin.access.manage'
  | 'audit.read'
  | 'visits.read'
  | 'visits.write'

const ALL_PERMISSIONS: AdminPermission[] = [
  'properties.read',
  'properties.write',
  'properties.publish',
  'users.read',
  'users.write',
  'users.kyc.review',
  'users.fema.review',
  'enquiries.read',
  'enquiries.write',
  'acquisitions.read',
  'acquisitions.write',
  'sales.read',
  'sales.write',
  'support.read',
  'support.write',
  'admin.access.manage',
  'audit.read',
  'visits.read',
  'visits.write',
]

export const DEFAULT_ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  super_admin: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => permission !== 'admin.access.manage'),
  operations: [
    'properties.read',
    'properties.write',
    'enquiries.read',
    'enquiries.write',
    'acquisitions.read',
    'acquisitions.write',
    'support.read',
    'support.write',
  ],
  support: ['users.read', 'support.read', 'support.write'],
  sales_manager: [
    'properties.read',
    'enquiries.read',
    'enquiries.write',
    'sales.read',
    'sales.write',
    'visits.read',
    'visits.write',
  ],
  sales_executive: [
    'properties.read',
    'enquiries.read',
    'enquiries.write',
    'sales.read',
    'sales.write',
  ],
  relationship_manager: [
    'users.read',
    'users.write',
    'users.kyc.review',
    'users.fema.review',
    'support.read',
    'support.write',
    'sales.read',
  ],
  designer: ['support.read', 'support.write'],
}

export const SECTION_PERMISSIONS: Record<string, AdminPermission[]> = {
  enquiries: ['enquiries.read'],
  acquisition: ['acquisitions.read'],
  sales: ['sales.read'],
  properties: ['properties.read'],
  users: ['users.read'],
  reports: ['sales.read', 'audit.read'],
  tools: ['properties.write', 'support.write', 'admin.access.manage'],
  admin: ['support.read', 'admin.access.manage', 'audit.read'],
}

const PATH_PERMISSION_RULES: Array<{ pattern: RegExp; permissions: AdminPermission[] }> = [
  { pattern: /^\/admin\/overview$/, permissions: [] },
  { pattern: /^\/admin\/enquiries/, permissions: ['enquiries.read'] },
  { pattern: /^\/admin\/visits/, permissions: ['enquiries.read'] },
  { pattern: /^\/admin\/callbacks/, permissions: ['enquiries.read'] },
  { pattern: /^\/admin\/acquisition/, permissions: ['acquisitions.read'] },
  { pattern: /^\/admin\/sales/, permissions: ['sales.read'] },
  { pattern: /^\/admin\/properties\/(?:add|upload)/, permissions: ['properties.write'] },
  { pattern: /^\/admin\/properties/, permissions: ['properties.read'] },
  { pattern: /^\/admin\/users/, permissions: ['users.read'] },
  { pattern: /^\/admin\/reports\/export/, permissions: ['audit.read'] },
  { pattern: /^\/admin\/reports/, permissions: ['sales.read'] },
  { pattern: /^\/admin\/tools/, permissions: ['properties.write', 'support.write', 'admin.access.manage'] },
  { pattern: /^\/admin\/settings\/access/, permissions: ['admin.access.manage'] },
  { pattern: /^\/admin\/settings\/audit/, permissions: ['audit.read'] },
  { pattern: /^\/admin\/settings\/feedback/, permissions: ['support.read'] },
  { pattern: /^\/admin\/settings\/legal/, permissions: ['support.write'] },
  { pattern: /^\/admin\/settings\/support/, permissions: ['support.read'] },
  { pattern: /^\/admin\/settings\/general/, permissions: ['admin.access.manage'] },
]

export function getSessionPermissions(session: StoredAdminSession | null): Set<string> {
  if (!session) return new Set()
  if (session.admin.role === 'super_admin') return new Set(ALL_PERMISSIONS)
  const explicit = session.admin.permissions ?? []
  const fallback = DEFAULT_ROLE_PERMISSIONS[session.admin.role] ?? []
  return new Set(explicit.length > 0 ? explicit : fallback)
}

export function hasAnyPermission(
  session: StoredAdminSession | null,
  permissions: AdminPermission[] = [],
) {
  if (permissions.length === 0) return true
  if (session?.admin.role === 'super_admin') return true
  const granted = getSessionPermissions(session)
  return permissions.some((permission) => granted.has(permission))
}

export function hasPermission(session: StoredAdminSession | null, permission: AdminPermission) {
  return hasAnyPermission(session, [permission])
}

export function permissionsForPath(pathname: string): AdminPermission[] {
  return PATH_PERMISSION_RULES.find((rule) => rule.pattern.test(pathname))?.permissions ?? []
}

export function isPathAllowed(session: StoredAdminSession | null, pathname: string) {
  return hasAnyPermission(session, permissionsForPath(pathname))
}

export function filterNavTabs(session: StoredAdminSession | null, tabs: NavTab[]) {
  return tabs.filter((tab) => isPathAllowed(session, tab.path))
}

export function filterNavSections(session: StoredAdminSession | null, sections: NavSection[]) {
  return sections
    .filter((section) => hasAnyPermission(session, SECTION_PERMISSIONS[section.id] ?? []))
    .map((section) => ({
      ...section,
      tabs: filterNavTabs(session, section.tabs),
    }))
    .filter((section) => section.tabs.length > 0)
}

export function firstAllowedAdminPath(session: StoredAdminSession | null, sections: NavSection[]) {
  const firstSection = filterNavSections(session, sections)[0]
  return firstSection?.tabs[0]?.path ?? '/admin/overview'
}
