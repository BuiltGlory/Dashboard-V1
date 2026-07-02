import { Navigate, useLocation, type RouteObject } from 'react-router'
import type { ReactNode } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ALL_NAV_TABS, OVERVIEW_PATH } from '@/config/adminNavigation'
import { isPathAllowed } from '@/config/adminPermissions'
import { readAdminSession } from '@/api/admin'
import { BuyEnquiriesPage } from '@/pages/admin/enquiries/BuyEnquiriesPage'
import { EnquiryDetailPage } from '@/pages/admin/enquiries/EnquiryDetailPage'
import { SellRequestDetailPage } from '@/pages/admin/enquiries/SellRequestDetailPage'
import { SellRequestsPage } from '@/pages/admin/enquiries/SellRequestsPage'
import { CallbackDetailPage } from '@/pages/admin/enquiries/CallbackDetailPage'
import { CallbacksPage } from '@/pages/admin/enquiries/CallbacksPage'
import { ChatPage } from '@/pages/admin/enquiries/ChatPage'
import { InteriorLeadDetailPage } from '@/pages/admin/enquiries/InteriorLeadDetailPage'
import { InteriorLeadsPage } from '@/pages/admin/enquiries/InteriorLeadsPage'
import { VisitDetailPage } from '@/pages/admin/enquiries/VisitDetailPage'
import { VisitsPage } from '@/pages/admin/enquiries/VisitsPage'
import { AcquisitionDetailPage } from '@/pages/admin/acquisition/AcquisitionDetailPage'
import { AcquisitionPipelinePage } from '@/pages/admin/acquisition/AcquisitionPipelinePage'
import { SalesDealDetailPage } from '@/pages/admin/sales/SalesDealDetailPage'
import { SalesPipelinePage } from '@/pages/admin/sales/SalesPipelinePage'
import { PropertiesPage } from '@/pages/admin/properties/PropertiesPage'
import { PropertyDetailPage } from '@/pages/admin/properties/PropertyDetailPage'
import { OverviewPage } from '@/pages/admin/OverviewPage'
import { PlaceholderPage } from '@/pages/admin/PlaceholderPage'
import { UserDetailPage } from '@/pages/admin/users/UserDetailPage'
import { UsersPage } from '@/pages/admin/users/UsersPage'
import { ReportsPage } from '@/pages/admin/reports/ReportsPage'
import { ToolsPage } from '@/pages/admin/tools/ToolsPage'
import { AdminPage } from '@/pages/admin/settings/AdminPage'
import { SupportTicketDetailPage } from '@/pages/admin/settings/SupportTicketDetailPage'
import { LoginPage } from '@/pages/auth/LoginPage'

const BUY_ENQUIRIES_PATH = '/admin/enquiries/buy'
const SELL_REQUESTS_PATH = '/admin/enquiries/sell'
const VISITS_PATH = '/admin/enquiries/visits'
const CALLBACKS_PATH = '/admin/enquiries/callbacks'
const CHAT_PATH = '/admin/enquiries/chat'
const INTERIOR_PATH = '/admin/enquiries/interior'
const ACQUISITION_PREFIX = '/admin/acquisition/'
const SALES_PREFIX = '/admin/sales/'
const PROPERTIES_PREFIX = '/admin/properties/'
const USERS_PREFIX = '/admin/users/'
const REPORTS_PREFIX = '/admin/reports/'
const TOOLS_PREFIX = '/admin/tools/'
const SETTINGS_PREFIX = '/admin/settings/'

function GuardedAdminRoute({ path, children }: { path: string; children: ReactNode }) {
  const location = useLocation()
  const session = readAdminSession()

  if (!session) {
    const redirectTo = `${location.pathname}${location.search}`
    const loginSearch = new URLSearchParams({ redirect: redirectTo })
    return <Navigate to={`/login?${loginSearch.toString()}`} replace />
  }

  return isPathAllowed(session, path) ? <>{children}</> : <Navigate to={OVERVIEW_PATH} replace />
}

function guarded(path: string, element: ReactNode) {
  return <GuardedAdminRoute path={path}>{element}</GuardedAdminRoute>
}

const placeholderRoutes: RouteObject[] = ALL_NAV_TABS.filter(
  (tab) =>
    tab.path !== BUY_ENQUIRIES_PATH &&
    tab.path !== SELL_REQUESTS_PATH &&
    tab.path !== VISITS_PATH &&
    tab.path !== CALLBACKS_PATH &&
    tab.path !== CHAT_PATH &&
    tab.path !== INTERIOR_PATH &&
    !tab.path.startsWith(ACQUISITION_PREFIX) &&
    !tab.path.startsWith(SALES_PREFIX) &&
    !tab.path.startsWith(PROPERTIES_PREFIX) &&
    !tab.path.startsWith(USERS_PREFIX) &&
    !tab.path.startsWith(REPORTS_PREFIX) &&
    !tab.path.startsWith(TOOLS_PREFIX) &&
    !tab.path.startsWith(SETTINGS_PREFIX),
).map(
  (tab) => ({
    path: tab.path.replace(/^\/admin\//, ''),
    element: <PlaceholderPage />,
  }),
)

export const adminRoutes: RouteObject[] = [
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to={OVERVIEW_PATH} replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'enquiries/buy/:id', element: guarded('/admin/enquiries/buy', <EnquiryDetailPage />) },
      { path: 'enquiries/buy', element: guarded('/admin/enquiries/buy', <BuyEnquiriesPage />) },
      { path: 'enquiries/sell/:id', element: guarded('/admin/enquiries/sell', <SellRequestDetailPage />) },
      { path: 'enquiries/sell', element: guarded('/admin/enquiries/sell', <SellRequestsPage />) },
      { path: 'visits/:id', element: guarded('/admin/visits', <VisitDetailPage />) },
      { path: 'callbacks/:id', element: guarded('/admin/callbacks', <CallbackDetailPage />) },
      { path: 'enquiries/visits', element: guarded('/admin/enquiries/visits', <VisitsPage />) },
      { path: 'enquiries/callbacks', element: guarded('/admin/enquiries/callbacks', <CallbacksPage />) },
      { path: 'enquiries/interior/:id', element: guarded('/admin/enquiries/interior', <InteriorLeadDetailPage />) },
      { path: 'enquiries/interior', element: guarded('/admin/enquiries/interior', <InteriorLeadsPage />) },
      { path: 'enquiries/chat', element: guarded('/admin/enquiries/chat', <ChatPage />) },
      { path: 'acquisition/all', element: guarded('/admin/acquisition/all', <AcquisitionPipelinePage />) },
      { path: 'acquisition/pending', element: guarded('/admin/acquisition/pending', <AcquisitionPipelinePage />) },
      { path: 'acquisition/inspection', element: guarded('/admin/acquisition/inspection', <AcquisitionPipelinePage />) },
      { path: 'acquisition/valuation', element: guarded('/admin/acquisition/valuation', <AcquisitionPipelinePage />) },
      { path: 'acquisition/negotiation', element: guarded('/admin/acquisition/negotiation', <AcquisitionPipelinePage />) },
      { path: 'acquisition/token', element: guarded('/admin/acquisition/token', <AcquisitionPipelinePage />) },
      { path: 'acquisition/documentation', element: guarded('/admin/acquisition/documentation', <AcquisitionPipelinePage />) },
      { path: 'acquisition/payout', element: guarded('/admin/acquisition/payout', <AcquisitionPipelinePage />) },
      { path: 'acquisition/acquired', element: guarded('/admin/acquisition/acquired', <AcquisitionPipelinePage />) },
      { path: 'acquisition/rejected', element: guarded('/admin/acquisition/rejected', <AcquisitionPipelinePage />) },
      { path: 'acquisition/on-hold', element: guarded('/admin/acquisition/on-hold', <AcquisitionPipelinePage />) },
      { path: 'acquisition/:id', element: guarded('/admin/acquisition/all', <AcquisitionDetailPage />) },
      { path: 'sales/:id', element: guarded('/admin/sales/all', <SalesDealDetailPage />) },
      { path: 'sales/all', element: guarded('/admin/sales/all', <SalesPipelinePage />) },
      { path: 'sales/leads', element: guarded('/admin/sales/leads', <SalesPipelinePage />) },
      { path: 'sales/visits', element: guarded('/admin/sales/visits', <SalesPipelinePage />) },
      { path: 'sales/negotiation', element: guarded('/admin/sales/negotiation', <SalesPipelinePage />) },
      { path: 'sales/token', element: guarded('/admin/sales/token', <SalesPipelinePage />) },
      { path: 'sales/fullpayment', element: guarded('/admin/sales/fullpayment', <SalesPipelinePage />) },
      { path: 'sales/stagepayment', element: guarded('/admin/sales/stagepayment', <SalesPipelinePage />) },
      { path: 'sales/interior', element: guarded('/admin/sales/interior', <SalesPipelinePage />) },
      { path: 'sales/documentation', element: guarded('/admin/sales/documentation', <SalesPipelinePage />) },
      { path: 'sales/closed', element: guarded('/admin/sales/closed', <SalesPipelinePage />) },
      { path: 'sales/lost', element: guarded('/admin/sales/lost', <SalesPipelinePage />) },
      { path: 'sales/reengagement', element: guarded('/admin/sales/reengagement', <SalesPipelinePage />) },
      { path: 'properties/:id', element: guarded('/admin/properties/all', <PropertyDetailPage />) },
      { path: 'properties/all', element: guarded('/admin/properties/all', <PropertiesPage />) },
      { path: 'properties/add', element: guarded('/admin/properties/add', <PropertiesPage />) },
      { path: 'properties/upload', element: guarded('/admin/properties/upload', <PropertiesPage />) },
      { path: 'properties/featured', element: guarded('/admin/properties/featured', <PropertiesPage />) },
      { path: 'properties/upcoming', element: guarded('/admin/properties/upcoming', <PropertiesPage />) },
      { path: 'properties/templates', element: guarded('/admin/properties/templates', <PropertiesPage />) },
      { path: 'users/:id', element: guarded('/admin/users/all', <UserDetailPage />) },
      { path: 'users/all', element: guarded('/admin/users/all', <UsersPage />) },
      { path: 'users/kyc', element: guarded('/admin/users/kyc', <UsersPage />) },
      { path: 'users/buyers', element: guarded('/admin/users/buyers', <UsersPage />) },
      { path: 'users/sellers', element: guarded('/admin/users/sellers', <UsersPage />) },
      { path: 'reports/sales', element: guarded('/admin/reports/sales', <ReportsPage />) },
      { path: 'reports/acquisition', element: guarded('/admin/reports/acquisition', <ReportsPage />) },
      { path: 'reports/revenue', element: guarded('/admin/reports/revenue', <ReportsPage />) },
      { path: 'reports/export', element: guarded('/admin/reports/export', <ReportsPage />) },
      { path: 'tools/content', element: guarded('/admin/tools/content', <ToolsPage />) },
      { path: 'tools/mastersheet', element: guarded('/admin/tools/mastersheet', <ToolsPage />) },
      { path: 'tools/locations', element: guarded('/admin/tools/locations', <ToolsPage />) },
      { path: 'tools/pricing', element: guarded('/admin/tools/pricing', <ToolsPage />) },
      { path: 'tools/templates', element: guarded('/admin/tools/templates', <ToolsPage />) },
      { path: 'tools/bulkmessage', element: guarded('/admin/tools/bulkmessage', <ToolsPage />) },
      { path: 'settings/support/:id', element: guarded('/admin/settings/support', <SupportTicketDetailPage />) },
      { path: 'settings/support', element: guarded('/admin/settings/support', <AdminPage />) },
      { path: 'settings/feedback', element: guarded('/admin/settings/feedback', <AdminPage />) },
      { path: 'settings/access', element: guarded('/admin/settings/access', <AdminPage />) },
      { path: 'settings/general', element: guarded('/admin/settings/general', <AdminPage />) },
      { path: 'settings/legal', element: guarded('/admin/settings/legal', <AdminPage />) },
      { path: 'settings/audit', element: guarded('/admin/settings/audit', <AdminPage />) },
      ...placeholderRoutes,
      { path: '*', element: <Navigate to={OVERVIEW_PATH} replace /> },
    ],
  },
]
