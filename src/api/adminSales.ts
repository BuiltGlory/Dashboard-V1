import { adminApiRequest, adminApiRequestEnvelope } from './admin'

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

function nullableNumberOf(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function booleanOf(value: unknown, fallback = false) {
  if (value === null || value === undefined) return fallback
  return Boolean(value)
}

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawEntity) : {}
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

export type SalesStage =
  | 'active_leads'
  | 'site_visits'
  | 'negotiation'
  | 'token_payment'
  | 'full_payment'
  | 'stage_payment'
  | 'interior_design'
  | 'documentation'
  | 'closed'
  | 'lost'
  | 're_engagement'

export type DealPriority = 'normal' | 'high' | 'urgent'

export interface SalesDeal {
  id: string
  referenceId: string
  stage: SalesStage
  priority: DealPriority
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  buyerUserId: string
  buyerType: 'resident' | 'nri' | 'pio'
  propertyTitle: string
  propertyId: string
  propertyType: string
  propertyLocation: string
  propertyPrice: number
  offeredPrice: number | null
  agreedPrice: number | null
  tokenAmount: number | null
  tokenPaid: boolean
  tokenPayment?: Record<string, unknown> | null
  paymentType: 'full' | 'stage' | null
  totalPaid: number
  fullPayment?: Record<string, unknown> | null
  stagePayment?: Record<string, unknown> | null
  interiorDesign?: Record<string, unknown> | null
  daysInStage: number
  lastActivityAt: string
  createdAt: string
  assignedTo: string
  assignedToId: string | null
  sourceEnquiryId: string | null
  lostReason: string | null
  closedAt: string | null
  reengagementFollowUpAt?: string | null
  reengagementLastContactAt?: string | null
  reengagementAttempts?: number
  documentation?: Record<string, unknown>
  photos: string[]
  stageHistory?: Array<Record<string, unknown>>
}

export interface SalesDealRecommendation {
  id: string
  referenceId: string
  title: string
  price: number
  type: string
  location: string
  city: string
  locality: string
  coverPhoto: string
  photos: string[]
  score: number
  reason: string
}

export type CreateSalesDealInput = {
  buyerId: string
  propertyId: string
  sourceEnquiryId?: string
  stage?: SalesStage
  priority?: DealPriority
  assignedTo?: string | null
  buyerSnapshot?: {
    name?: string
    phone?: string
    email?: string
    userType?: string
  }
  propertySnapshot?: {
    title?: string
    type?: string
    location?: string
    price?: number
  }
  financials?: {
    offeredPrice?: number | null
    agreedPrice?: number | null
  }
}

const STAGE_LABELS: Record<SalesStage, string> = {
  active_leads: 'Active Leads',
  site_visits: 'Site Visits',
  negotiation: 'Negotiation',
  token_payment: 'Token Payment',
  full_payment: 'Full Payment',
  stage_payment: 'Stage Payment',
  interior_design: 'Interior Design',
  documentation: 'Documentation',
  closed: 'Closed',
  lost: 'Lost',
  re_engagement: 'Re-engagement',
}

const STAGE_COLORS: Record<SalesStage, string> = {
  active_leads: 'bg-blue-500',
  site_visits: 'bg-purple-500',
  negotiation: 'bg-yellow-500',
  token_payment: 'bg-emerald-500',
  full_payment: 'bg-green-500',
  stage_payment: 'bg-teal-500',
  interior_design: 'bg-pink-500',
  documentation: 'bg-indigo-500',
  closed: 'bg-gray-500',
  lost: 'bg-red-500',
  re_engagement: 'bg-orange-500',
}

export function getSalesStageLabel(stage: SalesStage): string {
  return STAGE_LABELS[stage] ?? stage
}

export function getSalesStageColor(stage: SalesStage): string {
  return STAGE_COLORS[stage] ?? 'bg-muted-foreground'
}

export function formatPrice(amount: number): string {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2)} Cr`
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(2)} L`
  }
  return `₹${amount.toLocaleString('en-IN')}`
}

export function getSalesStageCounts(items: SalesDeal[]): Record<string, number> {
  const counts: Record<string, number> = { all: items.length }
  for (const stage of Object.keys(STAGE_LABELS) as SalesStage[]) {
    counts[stage] = 0
  }
  for (const item of items) {
    counts[item.stage] = (counts[item.stage] ?? 0) + 1
  }
  return counts
}

function mapStage(value: unknown): SalesStage {
  const stage = stringOf(value, 'active_leads') as SalesStage
  return stage in STAGE_LABELS ? stage : 'active_leads'
}

function mapPriority(value: unknown): DealPriority {
  return value === 'urgent' || value === 'high' ? value : 'normal'
}

function mapBuyerType(value: unknown): SalesDeal['buyerType'] {
  const normalized = stringOf(value, 'resident').toLowerCase()
  if (normalized === 'nri' || normalized === 'pio') return normalized
  return 'resident'
}

function mapPaymentType(value: unknown): SalesDeal['paymentType'] {
  return value === 'full' || value === 'stage' ? value : null
}

function withQuery(path: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function mapSalesDeal(raw: RawEntity): SalesDeal {
  const buyer = objectOf(raw.buyerSnapshot)
  const property = objectOf(raw.propertySnapshot)
  const financials = objectOf(raw.financials)
  const assigned = objectOf(raw.assignedTo)
  const reengagement = objectOf(raw.reengagement)
  const createdAt = isoOf(raw.createdAt)
  const lastActivityAt = isoOf(raw.lastActivityAt ?? raw.updatedAt ?? raw.createdAt, createdAt)
  const stageUpdatedAt = (() => {
    const history = Array.isArray(raw.stageHistory) ? raw.stageHistory : []
    const latest = [...history].reverse().find((entry) => objectOf(entry).to === raw.stage)
    return latest ? isoOf(objectOf(latest).changedAt, lastActivityAt) : lastActivityAt
  })()
  const daysInStage =
    raw.daysInStage === undefined || raw.daysInStage === null
      ? Math.max(0, Math.floor((Date.now() - new Date(stageUpdatedAt).getTime()) / 86400000))
      : numberOf(raw.daysInStage)

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    stage: mapStage(raw.stage),
    priority: mapPriority(raw.priority),
    buyerName: stringOf(buyer.name ?? buyer.fullName, 'Unknown buyer'),
    buyerPhone: stringOf(buyer.phone ?? buyer.mobile),
    buyerEmail: stringOf(buyer.email),
    buyerUserId: idOf(raw.buyerId ?? buyer.id ?? buyer._id),
    buyerType: mapBuyerType(buyer.userType ?? buyer.type ?? buyer.buyerType),
    propertyTitle: stringOf(property.title ?? raw.propertyTitle, 'Untitled property'),
    propertyId: idOf(raw.propertyId ?? property.id ?? property._id),
    propertyType: stringOf(property.type ?? raw.propertyType, 'property'),
    propertyLocation: stringOf(property.location ?? raw.propertyLocation),
    propertyPrice: numberOf(property.price ?? raw.propertyPrice),
    offeredPrice: nullableNumberOf(financials.offeredPrice ?? raw.offeredPrice),
    agreedPrice: nullableNumberOf(financials.agreedPrice ?? raw.agreedPrice),
    tokenAmount: nullableNumberOf(financials.tokenAmount ?? raw.tokenAmount),
    tokenPaid: booleanOf(financials.tokenPaid ?? raw.tokenPaid),
    tokenPayment: objectOf(financials.tokenPayment ?? raw.tokenPayment),
    paymentType: mapPaymentType(financials.paymentType ?? raw.paymentType),
    totalPaid: numberOf(financials.totalPaid ?? raw.totalPaid),
    fullPayment: objectOf(financials.fullPayment ?? raw.fullPayment),
    stagePayment: objectOf(financials.stagePayment ?? raw.stagePayment),
    interiorDesign: objectOf(financials.interiorDesign ?? raw.interiorDesign),
    daysInStage,
    lastActivityAt,
    createdAt,
    assignedTo: stringOf(assigned.name, 'Unassigned'),
    assignedToId: raw.assignedTo ? idOf(raw.assignedTo) : null,
    sourceEnquiryId: raw.sourceEnquiryId ? idOf(raw.sourceEnquiryId) : null,
    lostReason: stringOf(raw.lostReason) || null,
    closedAt: raw.closedAt ? isoOf(raw.closedAt) : null,
    reengagementFollowUpAt: reengagement.followUpAt ? isoOf(reengagement.followUpAt) : null,
    reengagementLastContactAt: reengagement.lastContactAt ? isoOf(reengagement.lastContactAt) : null,
    reengagementAttempts: numberOf(reengagement.attempts),
    documentation: objectOf(raw.documentation),
    photos: arrayOfStrings(raw.photos ?? property.photos),
    stageHistory: Array.isArray(raw.stageHistory) ? raw.stageHistory.map(objectOf) : [],
  }
}

function mapSalesDealRecommendation(raw: RawEntity): SalesDealRecommendation {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    title: stringOf(raw.title, 'Untitled property'),
    price: numberOf(raw.price),
    type: stringOf(raw.type, 'property'),
    location: stringOf(raw.location),
    city: stringOf(raw.city),
    locality: stringOf(raw.locality),
    coverPhoto: stringOf(raw.coverPhoto),
    photos: arrayOfStrings(raw.photos),
    score: numberOf(raw.score),
    reason: stringOf(raw.reason, 'Recommended alternate property'),
  }
}

export async function listAdminSalesDeals(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<SalesDeal>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/sales/deals', { limit: 100, ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapSalesDeal), meta: result.meta }
}

export async function getAdminSalesDeal(accessToken: string, dealId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}`, { accessToken })
  return mapSalesDeal(data)
}

export async function createAdminSalesDeal(accessToken: string, body: CreateSalesDealInput) {
  const data = await adminApiRequest<RawEntity>('/admin/sales/deals', {
    accessToken,
    method: 'POST',
    body: body as Record<string, unknown>,
  })
  return mapSalesDeal(data)
}

export async function listAdminSalesDealRecommendations(
  accessToken: string,
  dealId: string,
  params: { search?: string; limit?: number } = {},
): Promise<AdminListResult<SalesDealRecommendation>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery(`/admin/sales/deals/${dealId}/recommendations`, { limit: 6, ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapSalesDealRecommendation), meta: result.meta }
}

export async function updateAdminSalesDealStage(
  accessToken: string,
  dealId: string,
  stage: SalesStage,
  body: Record<string, unknown> = {},
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/stage`, {
    accessToken,
    method: 'PATCH',
    body: { ...body, stage },
  })
  return mapSalesDeal(data)
}

export async function updateAdminSalesDealOffer(
  accessToken: string,
  dealId: string,
  body: { offeredPrice?: number | null; agreedPrice?: number | null },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/offer`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}

export async function updateAdminSalesDealTokenPayment(
  accessToken: string,
  dealId: string,
  body: { tokenAmount?: number | null; tokenPaid?: boolean; tokenPayment?: Record<string, unknown> | null },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/token-payment`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}

export async function updateAdminSalesDealPaymentPlan(
  accessToken: string,
  dealId: string,
  body: {
    paymentType?: 'full' | 'stage' | null
    totalPaid?: number
    fullPayment?: Record<string, unknown> | null
    stagePayment?: Record<string, unknown> | null
    interiorDesign?: Record<string, unknown> | null
  },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/payment-plan`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}

export async function updateAdminSalesDealDocumentation(
  accessToken: string,
  dealId: string,
  body: Record<string, unknown>,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/documentation`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}

export async function closeAdminSalesDeal(
  accessToken: string,
  dealId: string,
  body: Record<string, unknown> = {},
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/close`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}

export async function markAdminSalesDealLost(
  accessToken: string,
  dealId: string,
  body: Record<string, unknown>,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales/deals/${dealId}/lost`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapSalesDeal(data)
}
