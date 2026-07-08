import { ADMIN_API_BASE_URL, adminApiRequest, adminApiRequestEnvelope } from './admin'

type ApiMeta = {
  requestId?: string
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  [key: string]: unknown
}

export type AdminListResult<T> = {
  data: T[]
  meta?: ApiMeta
}

type RawEntity = Record<string, unknown>

function idOf(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object') {
    const entity = value as RawEntity
    return String(entity.id ?? entity._id ?? '')
  }
  return String(value)
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function numberOf(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function booleanOf(value: unknown, fallback = false) {
  if (value === null || value === undefined) return fallback
  return Boolean(value)
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawEntity) : {}
}

function withQuery(path: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export interface ReportProperty {
  id: string
  referenceId: string
  title: string
  type: string
  status: string
  locality: string
  city: string
  price: number
  views: number
  enquiries: number
  visits: number
  compareCount: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface ReportUser {
  id: string
  referenceId: string
  name: string
  phone: string
  email: string
  role: string
  userType: string
  kycStatus: string
  registeredAt: string
  createdAt: string
}

export interface ReportExportRequest {
  id?: string
  referenceId: string
  status: string
  format: string
  exportTypes: string[]
  storageKey: string
  filters: Record<string, unknown>
  requestedAt: string
  expiresAt: string
  completedAt?: string
  failedAt?: string
  failureReason?: string
  fileName?: string
  mimeType?: string
  sizeBytes?: number
  rowCount?: number
}

export interface ReportExportDownload {
  status: string
  downloadUrl: string | null
  expiresAt: string
  storageKey: string
  fileName?: string
  sizeBytes?: number
  rowCount?: number
}

export interface SalesAnalytics {
  stats: {
    count: number
    revenue: number
    averageDealValue: number
    conversion: number
    pipelineCount?: number
    pipelineValue?: number
  }
  monthlyClosedDeals: Array<{ month: string; deals: number; revenue: number }>
  monthlyDealActivity?: Array<{ month: string; deals: number }>
  revenueByType: Array<{ type: string; revenue: number; deals: number }>
  revenueByTypeAll?: Array<{ type: string; revenue: number; deals: number }>
  pipelineByStage?: Array<{ stage: string; count: number }>
  propertyComparison: ReportProperty[]
}

export interface AcquisitionAnalytics {
  stats: {
    count: number
    cost: number
    averageCost: number
    pipelineActive: number
    incomingSellRequests?: number
  }
  stageCounts: Array<{ stage: string; count: number }>
  acquisitionByType: Array<{ type: string; value: number; count: number }>
  sellRequestsByStatus?: Array<{ status: string; count: number }>
}

export interface RevenueAnalytics {
  stats: {
    revenue: number
    cost: number
    profit: number
    margin: number
  }
  revenueVsCost: Array<{ month: string; revenue: number; cost: number }>
  profitTrend: Array<{ month: string; profit: number }>
  pendingPayments: Array<{
    id: string
    referenceId: string
    buyer: string
    property: string
    stage: string
    amount: number
    paid: number
    balance: number
    lastActivityAt: string
  }>
}

export interface ReportSchedule {
  id?: string
  referenceId: string
  name: string
  status: 'active' | 'paused' | string
  reportType: 'overview' | 'sales' | 'acquisition' | 'revenue' | 'users' | 'properties' | string
  format: 'csv' | 'xlsx' | 'pdf' | string
  frequency: 'daily' | 'weekly' | 'monthly' | string
  timezone: string
  filters: Record<string, unknown>
  recipients: string[]
  lastRunAt?: string
  nextRunAt: string
  createdAt?: string
}

export type CreateReportScheduleInput = {
  name: string
  reportType: ReportSchedule['reportType']
  format?: ReportSchedule['format']
  frequency: ReportSchedule['frequency']
  timezone?: string
  filters?: Record<string, unknown>
  recipients: string[]
  nextRunAt?: string
}

export { getPropertyTypeLabel } from '@/domain/properties'

function mapReportProperty(raw: RawEntity): ReportProperty {
  const address = objectOf(raw.address)
  const metrics = objectOf(raw.metrics)
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    title: stringOf(raw.title, 'Untitled property'),
    type: stringOf(raw.type, 'property'),
    status: stringOf(raw.status),
    locality: stringOf(address.locality),
    city: stringOf(address.city),
    price: numberOf(raw.price),
    views: numberOf(metrics.views),
    enquiries: numberOf(metrics.enquiries),
    visits: numberOf(metrics.visits),
    compareCount: numberOf(metrics.compareCount),
    isDeleted: booleanOf(raw.isDeleted),
    createdAt: isoOf(raw.createdAt),
    updatedAt: isoOf(raw.updatedAt ?? raw.createdAt),
  }
}

function mapReportUser(raw: RawEntity): ReportUser {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    name: stringOf(raw.name, 'Unnamed user'),
    phone: stringOf(raw.phone ?? raw.mobileNumber ?? raw.phoneNormalized),
    email: stringOf(raw.email),
    role: stringOf(raw.role, 'buyer'),
    userType: stringOf(raw.userType, 'resident'),
    kycStatus: stringOf(raw.kycStatus, 'not_submitted'),
    registeredAt: isoOf(raw.registeredAt ?? raw.createdAt),
    createdAt: isoOf(raw.createdAt ?? raw.registeredAt),
  }
}

function mapReportSchedule(raw: RawEntity): ReportSchedule {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    name: stringOf(raw.name),
    status: stringOf(raw.status, 'active'),
    reportType: stringOf(raw.reportType),
    format: stringOf(raw.format, 'xlsx'),
    frequency: stringOf(raw.frequency),
    timezone: stringOf(raw.timezone, 'Asia/Kolkata'),
    filters: objectOf(raw.filters),
    recipients: Array.isArray(raw.recipients) ? raw.recipients.map(String) : [],
    lastRunAt: raw.lastRunAt ? isoOf(raw.lastRunAt) : undefined,
    nextRunAt: isoOf(raw.nextRunAt),
    createdAt: raw.createdAt ? isoOf(raw.createdAt) : undefined,
  }
}

function mapExport(raw: RawEntity): ReportExportRequest {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    status: stringOf(raw.status, 'queued'),
    format: stringOf(raw.format, 'xlsx'),
    exportTypes: Array.isArray(raw.exportTypes) ? raw.exportTypes.map(String) : [],
    storageKey: stringOf(raw.storageKey),
    filters: objectOf(raw.filters),
    requestedAt: isoOf(raw.requestedAt ?? raw.createdAt),
    expiresAt: isoOf(raw.expiresAt),
    completedAt: raw.completedAt ? isoOf(raw.completedAt) : undefined,
    failedAt: raw.failedAt ? isoOf(raw.failedAt) : undefined,
    failureReason: raw.failureReason ? stringOf(raw.failureReason) : undefined,
    fileName: raw.fileName ? stringOf(raw.fileName) : undefined,
    mimeType: raw.mimeType ? stringOf(raw.mimeType) : undefined,
    sizeBytes: raw.sizeBytes === undefined ? undefined : numberOf(raw.sizeBytes),
    rowCount: raw.rowCount === undefined ? undefined : numberOf(raw.rowCount),
  }
}

export async function listAdminReportProperties(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<ReportProperty>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/properties', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapReportProperty), meta: result.meta }
}

export async function listAdminReportUsers(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<ReportUser>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/users', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapReportUser), meta: result.meta }
}

export async function createAdminReportExport(
  accessToken: string,
  filters: Record<string, unknown> = {},
) {
  const bodyFilters = {
    ...filters,
    format: filters.format === 'excel' ? 'xlsx' : filters.format,
  }
  const data = await adminApiRequest<RawEntity>('/admin/reports/export', {
    accessToken,
    method: 'POST',
    body: { filters: bodyFilters },
  })
  return mapExport(data ?? {})
}

export async function listAdminReportExports(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<ReportExportRequest>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/reports/exports', { limit: 20, ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapExport), meta: result.meta }
}

export async function listAdminReportSchedules(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<ReportSchedule>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/reports/schedules', { limit: 20, ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapReportSchedule), meta: result.meta }
}

export async function createAdminReportSchedule(
  accessToken: string,
  body: CreateReportScheduleInput,
) {
  const data = await adminApiRequest<RawEntity>('/admin/reports/schedules', {
    accessToken,
    method: 'POST',
    body: body as Record<string, unknown>,
  })
  return mapReportSchedule(data ?? {})
}

export async function getAdminReportExport(accessToken: string, id: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/reports/exports/${id}`, {
    accessToken,
  })
  return mapExport(data ?? {})
}

export async function getAdminReportExportDownloadUrl(accessToken: string, id: string) {
  return adminApiRequest<ReportExportDownload>(`/admin/reports/exports/${id}/download-url`, {
    accessToken,
  })
}

export function absoluteAdminDownloadUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path
  return `${ADMIN_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export async function downloadAdminReportExportFile(
  accessToken: string,
  id: string,
  fileName?: string,
) {
  const download = await getAdminReportExportDownloadUrl(accessToken, id)
  if (!download.downloadUrl) {
    throw new Error('Export is not ready to download.')
  }

  const response = await fetch(absoluteAdminDownloadUrl(download.downloadUrl))
  if (!response.ok) {
    throw new Error('Unable to download export file.')
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = fileName || download.fileName || 'builtglory-export'
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function getSalesAnalytics(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
) {
  return adminApiRequest<SalesAnalytics>(withQuery('/admin/reports/sales/analytics', params), {
    accessToken,
  })
}

export async function getAcquisitionAnalytics(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
) {
  return adminApiRequest<AcquisitionAnalytics>(
    withQuery('/admin/reports/acquisition/analytics', params),
    { accessToken },
  )
}

export async function getRevenueAnalytics(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
) {
  return adminApiRequest<RevenueAnalytics>(withQuery('/admin/reports/revenue/analytics', params), {
    accessToken,
  })
}
