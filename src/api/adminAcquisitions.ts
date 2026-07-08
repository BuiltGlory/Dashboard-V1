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

export type AcquisitionStage =
  | 'pending_review'
  | 'site_inspection'
  | 'valuation'
  | 'negotiation'
  | 'token_to_seller'
  | 'documentation'
  | 'seller_payout'
  | 'acquired'
  | 'rejected'
  | 'on_hold'

export type AcquisitionPriority = 'normal' | 'high' | 'urgent'

export interface Acquisition {
  id: string
  referenceId: string
  stage: AcquisitionStage
  createdFrom: 'sell_request' | 'manual'
  sellRequestId: string | null
  sellerName: string
  sellerPhone: string
  sellerEmail: string
  sellerUserId: string
  sellerKycStatus: 'verified' | 'pending' | 'rejected'
  propertyTitle: string
  propertyType: string
  propertyLocation: string
  propertyCity: string
  askingPrice: number
  builtgloryOffer: number | null
  agreedPrice: number | null
  finalPurchasePrice: number | null
  assignedTo: string
  assignedToId: string | null
  priority: AcquisitionPriority
  daysInStage: number
  lastActivityAt: string
  createdAt: string
  photos: string[]
  rejectionReason: string | null
  onHoldReason: string | null
  propertyDetails?: Record<string, unknown>
  videoUrl?: string | null
  droneVideoUrl?: string | null
  tourUrl3D?: string | null
  floorPlanUrl?: string | null
  userType?: 'nri' | 'local'
  valuation?: Record<string, unknown>
  negotiation?: Record<string, unknown>
  token?: Record<string, unknown>
  documentation?: Record<string, unknown>
  payout?: Record<string, unknown>
  stageHistory?: Array<Record<string, unknown>>
}

const STAGE_LABELS: Record<AcquisitionStage, string> = {
  pending_review: 'Pending Review',
  site_inspection: 'Site Inspection',
  valuation: 'Valuation',
  negotiation: 'Negotiation',
  token_to_seller: 'Token to Seller',
  documentation: 'Documentation',
  seller_payout: 'Seller Payout',
  acquired: 'Acquired',
  rejected: 'Rejected',
  on_hold: 'On Hold',
}

const STAGE_COLORS: Record<AcquisitionStage, string> = {
  pending_review: 'bg-blue-500',
  site_inspection: 'bg-purple-500',
  valuation: 'bg-orange-500',
  negotiation: 'bg-yellow-500',
  token_to_seller: 'bg-green-500',
  documentation: 'bg-teal-500',
  seller_payout: 'bg-indigo-500',
  acquired: 'bg-green-700',
  rejected: 'bg-red-500',
  on_hold: 'bg-muted-foreground',
}

export function getStageLabel(stage: AcquisitionStage): string {
  return STAGE_LABELS[stage] ?? stage
}

export function getStageColor(stage: AcquisitionStage): string {
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

export function getStageCounts(items: Acquisition[]): Record<string, number> {
  const counts: Record<string, number> = { all: items.length }
  for (const stage of Object.keys(STAGE_LABELS) as AcquisitionStage[]) {
    counts[stage] = 0
  }
  for (const item of items) {
    counts[item.stage] = (counts[item.stage] ?? 0) + 1
  }
  return counts
}

function mapStage(value: unknown): AcquisitionStage {
  const stage = stringOf(value, 'pending_review') as AcquisitionStage
  return stage in STAGE_LABELS ? stage : 'pending_review'
}

function mapPriority(value: unknown): AcquisitionPriority {
  return value === 'urgent' || value === 'high' ? value : 'normal'
}

function mapKycStatus(value: unknown): Acquisition['sellerKycStatus'] {
  return value === 'verified' || value === 'rejected' ? value : 'pending'
}

function mapMedia(raw: RawEntity): Pick<
  Acquisition,
  'videoUrl' | 'droneVideoUrl' | 'tourUrl3D' | 'floorPlanUrl'
> {
  const media = objectOf(raw.media)
  const documents = objectOf(media.documents)
  return {
    videoUrl: stringOf(media.videoUrl ?? media.video ?? raw.videoUrl) || null,
    droneVideoUrl: stringOf(media.droneVideoUrl ?? media.droneVideo ?? raw.droneVideoUrl) || null,
    tourUrl3D: stringOf(media.tourUrl3D ?? media.virtualTourUrl ?? raw.tourUrl3D) || null,
    floorPlanUrl:
      stringOf(media.floorPlanUrl ?? documents.floorPlanUrl ?? documents.floorPlan ?? raw.floorPlanUrl) ||
      null,
  }
}

export function mapAcquisition(raw: RawEntity): Acquisition {
  const seller = objectOf(raw.sellerSnapshot)
  const assigned = objectOf(raw.assignedTo)
  const propertyDetails = objectOf(raw.propertyDetails)
  const specifications = objectOf(propertyDetails.specifications)
  const address = objectOf(propertyDetails.address)
  const mappedPropertyDetails =
    Object.keys(specifications).length > 0
      ? {
          ...specifications,
          address,
          amenities: propertyDetails.amenities,
          description: propertyDetails.description,
          previousListings: propertyDetails.previousListings,
          hadPreviousRejection: propertyDetails.hadPreviousRejection,
        }
      : propertyDetails
  const sellerId = raw.sellerId ?? seller.id ?? seller._id
  const media = mapMedia(raw)
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
    createdFrom: raw.createdFrom === 'manual' ? 'manual' : 'sell_request',
    sellRequestId: raw.sellRequestId ? idOf(raw.sellRequestId) : null,
    sellerName: stringOf(seller.name ?? seller.fullName, 'Unknown seller'),
    sellerPhone: stringOf(seller.phone ?? seller.mobile),
    sellerEmail: stringOf(seller.email),
    sellerUserId: idOf(sellerId),
    sellerKycStatus: mapKycStatus(seller.kycStatus ?? seller.kyc),
    propertyTitle: stringOf(raw.propertyTitle, 'Untitled property'),
    propertyType: stringOf(raw.propertyType, 'property'),
    propertyLocation:
      stringOf(raw.propertyLocation) ||
      [address.locality, address.city].map((part) => stringOf(part)).filter(Boolean).join(', '),
    propertyCity: stringOf(raw.propertyCity ?? address.city),
    askingPrice: numberOf(raw.askingPrice),
    builtgloryOffer: nullableNumberOf(raw.builtgloryOffer),
    agreedPrice: nullableNumberOf(raw.agreedPrice),
    finalPurchasePrice: nullableNumberOf(raw.finalPurchasePrice),
    assignedTo: stringOf(assigned.name, 'Unassigned'),
    assignedToId: raw.assignedTo ? idOf(raw.assignedTo) : null,
    priority: mapPriority(raw.priority),
    daysInStage,
    lastActivityAt,
    createdAt,
    photos: arrayOfStrings(raw.photos ?? objectOf(raw.media).photos),
    rejectionReason: stringOf(raw.rejectionReason) || null,
    onHoldReason: stringOf(raw.onHoldReason) || null,
    propertyDetails: Object.keys(mappedPropertyDetails).length > 0 ? mappedPropertyDetails : undefined,
    userType: stringOf(seller.userType).toLowerCase() === 'nri' ? 'nri' : 'local',
    valuation: objectOf(raw.valuation),
    negotiation: objectOf(raw.negotiation),
    token: objectOf(raw.token),
    documentation: objectOf(raw.documentation),
    payout: objectOf(raw.payout),
    stageHistory: Array.isArray(raw.stageHistory) ? raw.stageHistory.map(objectOf) : [],
    ...media,
  }
}

function withQuery(path: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

export async function listAdminAcquisitions(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
): Promise<AdminListResult<Acquisition>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/acquisitions', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  const rows = Array.isArray(result.data) ? result.data : []
  return { data: rows.map(mapAcquisition), meta: result.meta }
}

export async function getAdminAcquisition(accessToken: string, acquisitionId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/acquisitions/${acquisitionId}`, { accessToken })
  return mapAcquisition(data)
}

export async function updateAdminAcquisitionStage(
  accessToken: string,
  acquisitionId: string,
  stage: AcquisitionStage,
  body: Record<string, unknown> = {},
) {
  const data = await adminApiRequest<RawEntity>(`/admin/acquisitions/${acquisitionId}/stage`, {
    accessToken,
    method: 'PATCH',
    body: { ...body, stage },
  })
  return mapAcquisition(data)
}

export type AcquisitionUpdateSection = 'valuation' | 'negotiation' | 'token' | 'documentation' | 'payout'

export async function updateAdminAcquisitionSection(
  accessToken: string,
  acquisitionId: string,
  section: AcquisitionUpdateSection,
  body: Record<string, unknown>,
  wrapSection = true,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/acquisitions/${acquisitionId}/${section}`, {
    accessToken,
    method: 'PATCH',
    body: wrapSection ? { [section]: body } : body,
  })
  return mapAcquisition(data)
}

export async function convertAdminAcquisitionToProperty(
  accessToken: string,
  acquisitionId: string,
  body: Record<string, unknown>,
) {
  return adminApiRequest<RawEntity>(`/admin/acquisitions/${acquisitionId}/convert-to-property`, {
    accessToken,
    method: 'POST',
    body,
  })
}

export async function createAdminAcquisitionFromSellRequest(
  accessToken: string,
  sellRequestId: string,
  body: Record<string, unknown> = {},
) {
  const data = await adminApiRequest<RawEntity>(
    `/admin/sell-requests/${sellRequestId}/create-acquisition`,
    {
      accessToken,
      method: 'POST',
      body,
    },
  )
  return mapAcquisition(data)
}
