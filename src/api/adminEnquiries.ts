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

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

export function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatINRShort(amount: number) {
  if (amount >= 10000000) {
    const cr = amount / 10000000
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`
  }
  const lakhs = amount / 100000
  return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`
}

export type SalesPerson = {
  id: string
  name: string
  phone: string
  email: string
  role: 'sales_manager' | 'sales_executive' | 'relationship_manager' | string
  assignedArea: string[]
  activeEnquiries: number
  isAvailable: boolean
}

export const getRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    sales_manager: 'Sales Manager',
    sales_executive: 'Sales Executive',
    relationship_manager: 'Relationship Manager',
    designer: 'Designer',
    support: 'Support',
    super_admin: 'Super Admin',
    admin: 'Admin',
  }
  return labels[role] || role
}

export function getSalesPersonById(
  id: string | null | undefined,
  salesTeam: SalesPerson[],
): SalesPerson | undefined {
  if (!id) return undefined
  return salesTeam.find((sp) => sp.id === id)
}

function mapSalesPerson(raw: RawEntity): SalesPerson {
  return {
    id: idOf(raw),
    name: stringOf(raw.name, 'Unassigned admin'),
    phone: stringOf(raw.phone),
    email: stringOf(raw.email),
    role: stringOf(raw.role),
    assignedArea: Array.isArray(raw.assignedArea) ? raw.assignedArea.map(String) : [],
    activeEnquiries: numberOf(raw.activeWorkload),
    isAvailable: raw.isAvailable !== false && raw.isActive !== false,
  }
}

export async function getAdminSalesTeam(accessToken: string) {
  const data = await adminApiRequest<RawEntity[]>('/admin/sales-team', { accessToken })
  return (data ?? []).map(mapSalesPerson)
}

export async function createAdminSalesTeamMember(
  accessToken: string,
  body: Pick<SalesPerson, 'name' | 'phone' | 'email' | 'role'> & { assignedArea: string[] },
) {
  const data = await adminApiRequest<RawEntity>('/admin/sales-team', {
    accessToken,
    method: 'POST',
    body,
  })
  return mapSalesPerson(data ?? {})
}

export async function updateAdminSalesTeamMember(
  accessToken: string,
  id: string,
  body: Partial<Pick<SalesPerson, 'name' | 'phone' | 'email' | 'role' | 'assignedArea' | 'isAvailable'>>,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales-team/${id}`, {
    accessToken,
    method: 'PATCH',
    body: body as Record<string, unknown>,
  })
  return mapSalesPerson(data ?? {})
}

export async function removeAdminSalesTeamMember(accessToken: string, id: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/sales-team/${id}`, {
    accessToken,
    method: 'DELETE',
  })
  return mapSalesPerson(data ?? {})
}

export type EnquiryStatus = 'new' | 'responded' | 'visit_scheduled' | 'negotiating' | 'closed'
export type UserType = 'Resident' | 'NRI' | 'PIO' | string
export type PreferredContact = 'phone' | 'whatsapp' | 'email'
export type InterestType = 'schedule_visit' | 'price_negotiation' | 'more_details'
export type PreferredVisitTimeKey =
  | 'tomorrow_morning'
  | 'tomorrow_afternoon'
  | 'this_weekend_morning'
  | 'this_weekend_afternoon'
  | 'custom'
  | null

export interface BuyEnquiry {
  id: string
  buyerId: string
  buyerName: string
  phone: string
  email?: string
  userType: UserType
  propertyTitle: string
  propertyId: string
  propertyPrice: string
  propertyType: string
  propertyLocation: string
  enquiryTypes: string[]
  preferredContact: PreferredContact
  interestType: InterestType
  preferredVisitTime: PreferredVisitTimeKey
  preferredVisitDate: string | null
  preferredVisitTimeSlot: string | null
  additionalMessage: string | null
  status: EnquiryStatus
  submittedAt: string
  referenceId: string
  source: string
  assignedTo: string | null
  duplicateOf: string | null
}

export const PREFERRED_VISIT_TIME_LABELS: Record<Exclude<PreferredVisitTimeKey, null>, string> = {
  tomorrow_morning: 'Tomorrow, 10:00 AM - 12:00 PM',
  tomorrow_afternoon: 'Tomorrow, 2:00 PM - 5:00 PM',
  this_weekend_morning: 'This Weekend, 10:00 AM - 12:00 PM',
  this_weekend_afternoon: 'This Weekend, 2:00 PM - 5:00 PM',
  custom: 'Custom date & time',
}

export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  schedule_visit: 'Schedule a Visit',
  price_negotiation: 'Price Negotiation',
  more_details: 'More Details',
}

export const INTEREST_TYPE_BADGES: Record<InterestType, { label: string; className: string }> = {
  schedule_visit: { label: 'Visit', className: 'bg-blue-100 text-blue-700' },
  price_negotiation: { label: 'Negotiate', className: 'bg-purple-100 text-purple-700' },
  more_details: { label: 'Details', className: 'bg-muted text-muted-foreground' },
}

export const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: 'Phone Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
}

export const PREFERRED_CONTACT_BADGE_CLASS: Record<PreferredContact, string> = {
  phone: 'bg-blue-100 text-blue-700',
  whatsapp: 'bg-green-100 text-green-700',
  email: 'bg-orange-100 text-orange-700',
}

export function preferredContactIcon(contact: PreferredContact): string {
  if (contact === 'phone') return 'Phone'
  if (contact === 'whatsapp') return 'WhatsApp'
  return 'Email'
}

export function formatPreferredVisitTimeDisplay(enquiry: BuyEnquiry): string | null {
  const key = enquiry.preferredVisitTime
  if (!key) return null
  if (key === 'custom') {
    if (enquiry.preferredVisitDate && enquiry.preferredVisitTimeSlot) {
      return `${new Date(enquiry.preferredVisitDate).toLocaleDateString('en-IN')} · ${enquiry.preferredVisitTimeSlot}`
    }
    if (enquiry.preferredVisitDate) return new Date(enquiry.preferredVisitDate).toLocaleDateString('en-IN')
    if (enquiry.preferredVisitTimeSlot) return enquiry.preferredVisitTimeSlot
    return 'Custom date & time'
  }
  return PREFERRED_VISIT_TIME_LABELS[key]
}

export function isPreferredVisitTimePassed(enquiry: BuyEnquiry): boolean {
  if (enquiry.interestType !== 'schedule_visit') return false
  const key = enquiry.preferredVisitTime
  if (!key || key === 'custom') return false
  const submitted = new Date(enquiry.submittedAt).getTime()
  const daysSince = (Date.now() - submitted) / 86400000
  if (key === 'tomorrow_morning' || key === 'tomorrow_afternoon') return daysSince >= 1
  if (key === 'this_weekend_morning' || key === 'this_weekend_afternoon') return daysSince >= 7
  return false
}

export function findDuplicateEnquiryId(enquiry: BuyEnquiry, all: BuyEnquiry[]): string | null {
  if (enquiry.duplicateOf) return enquiry.duplicateOf
  const phoneKey = enquiry.phone.replace(/\D/g, '')
  if (!phoneKey) return null
  const siblings = all.filter(
    (o) => o.propertyId === enquiry.propertyId && o.phone.replace(/\D/g, '') === phoneKey,
  )
  const original = [...siblings].sort(
    (a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime(),
  )[0]
  return siblings.length > 1 && original.id !== enquiry.id ? original.id : null
}

export function parseEnquiryPrice(price: string): number {
  const n = parseInt(price.replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function mapBuyEnquiry(raw: RawEntity): BuyEnquiry {
  const buyer = (raw.buyerSnapshot ?? {}) as RawEntity
  const property = (raw.propertySnapshot ?? {}) as RawEntity
  return {
    id: idOf(raw),
    buyerId: idOf(raw.buyerId),
    buyerName: stringOf(buyer.name, 'Buyer'),
    phone: stringOf(buyer.phone),
    email: stringOf(buyer.email) || undefined,
    userType: stringOf(buyer.userType, 'Resident'),
    propertyTitle: stringOf(property.title, 'Property'),
    propertyId: idOf(raw.propertyId),
    propertyPrice: formatINR(numberOf(property.price)),
    propertyType: stringOf(property.type, 'Property'),
    propertyLocation: stringOf(property.location, 'Location not available'),
    enquiryTypes: Array.isArray(raw.enquiryTypes) ? raw.enquiryTypes.map(String) : [],
    preferredContact: stringOf(raw.preferredContact, 'phone') as PreferredContact,
    interestType: stringOf(raw.interestType, 'more_details') as InterestType,
    preferredVisitTime: (raw.preferredVisitTime ?? null) as PreferredVisitTimeKey,
    preferredVisitDate: raw.preferredVisitDate ? isoOf(raw.preferredVisitDate) : null,
    preferredVisitTimeSlot: raw.preferredVisitTimeSlot ? String(raw.preferredVisitTimeSlot) : null,
    additionalMessage: raw.additionalMessage ? String(raw.additionalMessage) : null,
    status: stringOf(raw.status, 'new') as EnquiryStatus,
    submittedAt: isoOf(raw.submittedAt ?? raw.createdAt),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    source: stringOf(raw.source, 'app'),
    assignedTo: raw.assignedTo ? idOf(raw.assignedTo) : null,
    duplicateOf: raw.duplicateOf ? idOf(raw.duplicateOf) : null,
  }
}

export async function listAdminBuyEnquiries(accessToken: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  Object.entries({ limit: 100, sort: 'newest', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/buy-enquiries?${query.toString()}`, {
    accessToken,
  })
  return { data: (result.data ?? []).map(mapBuyEnquiry), meta: result.meta } satisfies AdminListResult<BuyEnquiry>
}

export async function getAdminBuyEnquiry(accessToken: string, enquiryId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/buy-enquiries/${enquiryId}`, { accessToken })
  return mapBuyEnquiry(data ?? {})
}

export async function updateAdminBuyEnquiry(
  accessToken: string,
  enquiryId: string,
  body: Partial<Pick<BuyEnquiry, 'status' | 'preferredContact'>> & { assignedTo?: string | null; notes?: string | null },
) {
  const payload = { ...body }
  if (payload.assignedTo === null) delete payload.assignedTo
  const data = await adminApiRequest<RawEntity>(`/admin/buy-enquiries/${enquiryId}`, {
    method: 'PATCH',
    accessToken,
    body: payload as Record<string, unknown>,
  })
  return mapBuyEnquiry(data ?? {})
}

export type SellRequestStatus =
  | 'draft'
  | 'new'
  | 'under_review'
  | 'accepted'
  | 'approved'
  | 'active'
  | 'negotiating'
  | 'paused'
  | 'sold'
  | 'rejected'
  | 'changes_requested'

export type KycStatus = 'verified' | 'pending' | 'rejected'
export type DocumentStatus = 'uploaded' | 'missing' | 'pending'

export interface SellDocument {
  name: string
  status: DocumentStatus
}

export interface SellSpecifications {
  bhk?: string
  builtUpArea?: string
  carpetArea?: string
  floor?: string
  facing?: string
  age?: string
  furnishing?: string
  parking?: string
  rera?: string
  plotArea?: string
  dimensions?: string
  zoning?: string
  floors?: string
  pricePerSqft?: string
}

export interface SellRequest {
  id: string
  sellerId: string
  sellerName: string
  phone: string
  email?: string
  kycStatus: KycStatus
  userType: string
  memberSince: string
  previousListings: number
  hasPreviousRejection?: boolean
  propertyTitle: string
  propertyId: string
  propertyType: string
  askingPrice: string
  street: string
  locality: string
  location: string
  city: string
  state: string
  pincode: string
  landmark?: string
  latitude?: number
  longitude?: number
  negotiable: boolean
  ownershipType: string
  possessionStatus: string
  loanOnProperty: boolean
  photos: string[]
  photosCount: number
  documentsCount: number
  completenessPercent: number
  description: string
  amenities: string[]
  specifications: SellSpecifications
  propertyDetails?: Record<string, unknown>
  address?: string
  documents: SellDocument[]
  status: SellRequestStatus
  submittedAt: string
  referenceId: string
  assignedTo: string | null
  rejectionReason?: string
  isDraft?: boolean
  draftStep?: 1 | 2 | 3 | 4 | 5 | 6 | null
  draftSavedAt?: string | null
  views?: number
  enquiryCount?: number
  visitCount?: number
  saveCount?: number
  viewsThisWeek?: number[]
  salePrice?: number | null
  saleDate?: string | null
  saleBuyerName?: string | null
  pauseReason?: string | null
}

export function parseSellAskingPrice(askingPrice: string): number {
  const n = parseInt(askingPrice.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export function formatPrice(amount: number) {
  return formatINR(amount)
}

export function getCompletenessColor(percent: number) {
  if (percent >= 90) return 'bg-green-500'
  if (percent >= 70) return 'bg-blue-500'
  if (percent >= 50) return 'bg-orange-500'
  return 'bg-red-500'
}

export function getMissingItems(request: SellRequest) {
  const missing: string[] = []
  if (!request.photosCount) missing.push('photos')
  if (!request.documentsCount) missing.push('documents')
  if (!request.description?.trim()) missing.push('description')
  if (!request.askingPrice || parseSellAskingPrice(request.askingPrice) <= 0) missing.push('asking price')
  if (!request.location?.trim()) missing.push('location')
  return missing
}

export interface SimilarProperty {
  id: string
  title: string
  price: string
  status: string
  image: string
  propertyType: string
  city: string
}

export function getSimilarProperties(_request: SellRequest): SimilarProperty[] {
  return []
}

function mapSellRequest(raw: RawEntity): SellRequest {
  const seller = (raw.sellerSnapshot ?? {}) as RawEntity
  const address = (raw.address ?? {}) as RawEntity
  const metrics = (raw.metrics ?? {}) as RawEntity
  const sale = (raw.sale ?? {}) as RawEntity
  const specs = (raw.specifications ?? {}) as RawEntity
  const locality = stringOf(address.locality)
  const city = stringOf(address.city)
  const state = stringOf(address.state)
  const location = [locality, city].filter(Boolean).join(', ') || 'Location not available'

  return {
    id: idOf(raw),
    sellerId: idOf(raw.sellerId),
    sellerName: stringOf(seller.name, 'Seller'),
    phone: stringOf(seller.phone),
    email: stringOf(seller.email) || undefined,
    kycStatus: stringOf(seller.kycStatus, 'pending') as KycStatus,
    userType: stringOf(seller.userType, 'resident'),
    memberSince: isoOf(raw.createdAt),
    previousListings: 0,
    propertyTitle: stringOf(raw.propertyTitle, 'Seller property'),
    propertyId: idOf(raw.propertyId),
    propertyType: stringOf(raw.propertyType, 'property'),
    askingPrice: formatINR(numberOf(raw.askingPrice)),
    street: stringOf(address.street),
    locality,
    location,
    city,
    state,
    pincode: stringOf(address.pincode),
    landmark: stringOf(address.landmark) || undefined,
    latitude: address.latitude === undefined ? undefined : numberOf(address.latitude),
    longitude: address.longitude === undefined ? undefined : numberOf(address.longitude),
    negotiable: Boolean(raw.negotiable),
    ownershipType: stringOf(raw.ownershipType),
    possessionStatus: stringOf(raw.possessionStatus),
    loanOnProperty: Boolean(raw.loanOnProperty),
    photos: Array.isArray(raw.photos) ? raw.photos.map(String) : [],
    photosCount: numberOf(raw.photosCount, Array.isArray(raw.photos) ? raw.photos.length : 0),
    documentsCount: numberOf(raw.documentsCount, Array.isArray(raw.documents) ? raw.documents.length : 0),
    completenessPercent: numberOf(raw.completenessPercent),
    description: stringOf(raw.description),
    amenities: Array.isArray(raw.amenities) ? raw.amenities.map(String) : [],
    specifications: Object.fromEntries(
      Object.entries(specs).map(([key, value]) => [key === 'reraNumber' ? 'rera' : key, String(value ?? '')]),
    ) as SellSpecifications,
    propertyDetails: raw.propertyDetails as Record<string, unknown> | undefined,
    address: [stringOf(address.street), locality, city, state, stringOf(address.pincode)].filter(Boolean).join(', '),
    documents: Array.isArray(raw.documents)
      ? raw.documents.map((doc) => {
          const item = doc as RawEntity
          return {
            name: stringOf(item.name, 'Document'),
            status: stringOf(item.status, 'uploaded') as DocumentStatus,
          }
        })
      : [],
    status: stringOf(raw.status, 'new') as SellRequestStatus,
    submittedAt: isoOf(raw.submittedAt ?? raw.createdAt),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    assignedTo: raw.assignedTo ? idOf(raw.assignedTo) : null,
    rejectionReason: stringOf(raw.rejectionReason) || undefined,
    isDraft: Boolean(raw.isDraft) || raw.status === 'draft',
    draftStep: raw.draftStep ? (numberOf(raw.draftStep) as 1 | 2 | 3 | 4 | 5 | 6) : null,
    draftSavedAt: raw.draftSavedAt ? isoOf(raw.draftSavedAt) : null,
    views: numberOf(metrics.views),
    enquiryCount: numberOf(metrics.enquiryCount),
    visitCount: numberOf(metrics.visitCount),
    saveCount: numberOf(metrics.saveCount),
    viewsThisWeek: Array.isArray(metrics.viewsThisWeek) ? metrics.viewsThisWeek.map((v) => numberOf(v)) : [],
    salePrice: sale.salePrice === undefined ? null : numberOf(sale.salePrice),
    saleDate: sale.saleDate ? isoOf(sale.saleDate) : null,
    saleBuyerName: stringOf(sale.buyerName) || null,
    pauseReason: stringOf(raw.pauseReason) || null,
  }
}

export async function listAdminSellRequests(accessToken: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  Object.entries({ limit: 100, sort: 'newest', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/sell-requests?${query.toString()}`, {
    accessToken,
  })
  return { data: (result.data ?? []).map(mapSellRequest), meta: result.meta } satisfies AdminListResult<SellRequest>
}

export async function getAdminSellRequest(accessToken: string, sellRequestId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/sell-requests/${sellRequestId}`, { accessToken })
  return mapSellRequest(data ?? {})
}

export async function reviewAdminSellRequest(
  accessToken: string,
  sellRequestId: string,
  decision: SellRequestStatus,
  body: Record<string, unknown> = {},
) {
  const data = await adminApiRequest<RawEntity>(`/admin/sell-requests/${sellRequestId}/review`, {
    accessToken,
    method: 'PATCH',
    body: { ...body, decision },
  })
  return mapSellRequest(data ?? {})
}

export type VisitStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'missed' | 'rescheduled'
export type VisitType = 'physical' | 'virtual'
export type VirtualPlatform = 'zoom' | 'google_meet' | 'teams' | 'whatsapp_video' | null
export type BuyerInterest = 'very_interested' | 'interested' | 'not_interested' | 'needs_time'
export type NextAction = 'move_to_negotiation' | 'schedule_another_visit' | 'mark_lost' | 'follow_up'

export const VIRTUAL_PLATFORM_LABELS: Record<NonNullable<VirtualPlatform>, string> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  whatsapp_video: 'WhatsApp Video',
}

export interface VisitFeedback {
  buyerInterest: BuyerInterest
  notes: string
  nextAction: NextAction
  completedAt: string
}

export interface RescheduleEntry {
  previousDate: string
  previousTime: string
  newDate: string
  newTime: string
  reason: string
  at: string
}

export interface VisitActivity {
  id: string
  type: 'info' | 'status' | 'call' | 'note' | 'checklist' | 'feedback'
  description: string
  timestamp: string
}

export interface VisitCallLog {
  id: string
  duration: number
  outcome: string
  notes: string
  at: string
}

export interface VisitNote {
  id: string
  text: string
  at: string
}

export interface Visit {
  id: string
  referenceId: string
  buyerName: string
  buyerPhone: string
  buyerEmail?: string
  buyerUserId: string
  buyerUserType: string
  buyerEnquiriesCount: number
  buyerVisitNumber: number
  propertyTitle: string
  propertyId: string
  propertyType: string
  propertyPrice: string
  propertyLocation: string
  propertyImage: string
  propertyBhk?: string
  propertyArea?: string
  propertyFloor?: string
  propertyVisitsTotal: number
  visitDate: string
  visitTime: string
  visitEndTime: string
  visitType: VisitType
  virtualLink: string | null
  virtualPlatform: VirtualPlatform
  virtualMeetingLink: string | null
  virtualRecordingUrl: string | null
  callDuration: number | null
  callNotes: string | null
  documentsShared: string[]
  followUpAction: string | null
  followUpDate: string | null
  completedAt: string | null
  googleMapsLink: string | null
  status: VisitStatus
  nriChecklist?: Record<string, boolean>
  nriAssistanceNotes?: string | null
  rescheduleCount: number
  rescheduleHistory: RescheduleEntry[]
  assignedAdmin: string
  feedback: VisitFeedback | null
  callLogs: VisitCallLog[]
  notes: VisitNote[]
  activities: VisitActivity[]
  createdAt: string
  updatedAt: string
  reminderSent: boolean
  sellerNotified: boolean
  cancelReason?: string
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export const VISITS_TODAY = formatDateKey(new Date())

export function getWeekStart(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getVisitMeetingLink(visit: Visit): string | null {
  return visit.virtualMeetingLink ?? visit.virtualLink ?? null
}

export function isNriBuyer(userType: string): boolean {
  const t = userType.toLowerCase()
  return t === 'nri' || t === 'pio'
}

export function isVisitToday(visit: Visit) {
  return visit.visitDate === VISITS_TODAY
}

export function isVisitPast(visit: Visit) {
  const visitTime = new Date(`${visit.visitDate}T${visit.visitTime || '00:00'}`).getTime()
  return visitTime < Date.now()
}

export function findVisitConflicts(
  visits: Visit[],
  propertyId: string,
  visitDate: string,
  visitTime: string,
  excludeId?: string,
) {
  return visits.filter(
    (visit) =>
      visit.id !== excludeId &&
      visit.propertyId === propertyId &&
      visit.visitDate === visitDate &&
      visit.visitTime === visitTime &&
      !['cancelled', 'missed'].includes(visit.status),
  )
}

function mapVisit(raw: RawEntity): Visit {
  const buyer = (raw.buyerSnapshot ?? raw.buyerId ?? {}) as RawEntity
  const property = (raw.propertySnapshot ?? raw.propertyId ?? {}) as RawEntity
  const feedback = (raw.feedback ?? {}) as RawEntity
  const visitDate = isoOf(raw.visitDate).slice(0, 10)
  const visitTime = stringOf(raw.visitTime, '10:00')
  const createdAt = isoOf(raw.createdAt)
  const updatedAt = isoOf(raw.updatedAt, createdAt)

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    buyerName: stringOf(buyer.name, 'Buyer'),
    buyerPhone: stringOf(buyer.phone),
    buyerEmail: stringOf(buyer.email) || undefined,
    buyerUserId: idOf(raw.buyerId),
    buyerUserType: stringOf(buyer.userType, 'resident'),
    buyerEnquiriesCount: 0,
    buyerVisitNumber: 1,
    propertyTitle: stringOf(property.title, 'Property'),
    propertyId: idOf(raw.propertyId),
    propertyType: stringOf(property.type, 'Property'),
    propertyPrice: property.price === undefined ? 'Price not available' : formatINR(numberOf(property.price)),
    propertyLocation: stringOf(property.location, 'Location not available'),
    propertyImage: stringOf(property.image),
    propertyVisitsTotal: 0,
    visitDate,
    visitTime,
    visitEndTime: visitTime,
    visitType: stringOf(raw.visitType, 'physical') as VisitType,
    virtualLink: stringOf(raw.meetingLink) || null,
    virtualPlatform: (raw.virtualPlatform ?? null) as VirtualPlatform,
    virtualMeetingLink: stringOf(raw.meetingLink) || null,
    virtualRecordingUrl: stringOf(raw.virtualRecordingUrl) || null,
    callDuration: raw.callDuration == null ? null : numberOf(raw.callDuration),
    callNotes: stringOf(raw.callNotes) || null,
    documentsShared: Array.isArray(raw.documentsShared) ? raw.documentsShared.map(String) : [],
    followUpAction: stringOf(raw.followUpAction) || null,
    followUpDate: raw.followUpDate ? isoOf(raw.followUpDate) : null,
    completedAt: feedback.completedAt ? isoOf(feedback.completedAt) : raw.completedAt ? isoOf(raw.completedAt) : null,
    googleMapsLink: null,
    status: stringOf(raw.status, 'scheduled') as VisitStatus,
    rescheduleCount: numberOf(raw.rescheduleCount),
    rescheduleHistory: Array.isArray(raw.rescheduleHistory)
      ? raw.rescheduleHistory.map((entry) => {
          const item = entry as RawEntity
          return {
            previousDate: isoOf(item.previousDate).slice(0, 10),
            previousTime: stringOf(item.previousTime),
            newDate: isoOf(item.newDate).slice(0, 10),
            newTime: stringOf(item.newTime),
            reason: stringOf(item.reason),
            at: isoOf(item.changedAt),
          }
        })
      : [],
    assignedAdmin: raw.assignedAdmin ? idOf(raw.assignedAdmin) : 'Unassigned',
    feedback: feedback.buyerInterest
      ? {
          buyerInterest: stringOf(feedback.buyerInterest) as BuyerInterest,
          notes: stringOf(feedback.notes),
          nextAction: stringOf(feedback.nextAction) as NextAction,
          completedAt: isoOf(feedback.completedAt),
        }
      : null,
    nriChecklist: raw.nriChecklist && typeof raw.nriChecklist === 'object' && !Array.isArray(raw.nriChecklist)
      ? raw.nriChecklist as Record<string, boolean>
      : {},
    nriAssistanceNotes: stringOf(raw.nriAssistanceNotes) || null,
    callLogs: Array.isArray(raw.callLogs)
      ? raw.callLogs.map((log) => {
          const item = log as RawEntity
          return {
            id: idOf(item) || isoOf(item.calledAt),
            duration: numberOf(item.duration),
            outcome: stringOf(item.outcome),
            notes: stringOf(item.notes),
            at: isoOf(item.calledAt),
          }
        })
      : [],
    notes: Array.isArray(raw.notes)
      ? raw.notes.map((note) => {
          const item = note as RawEntity
          return {
            id: idOf(item) || isoOf(item.createdAt),
            text: stringOf(item.text),
            at: isoOf(item.createdAt),
          }
        })
      : [],
    activities: [
      {
        id: 'created',
        type: 'info',
        description: 'Visit scheduled',
        timestamp: createdAt,
      },
    ],
    createdAt,
    updatedAt,
    reminderSent: raw.reminderSent === true,
    sellerNotified: false,
    cancelReason: stringOf(raw.cancelReason) || undefined,
  }
}

export async function listAdminVisits(accessToken: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  Object.entries({ limit: 100, sort: 'newest', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/visits?${query.toString()}`, { accessToken })
  return { data: (result.data ?? []).map(mapVisit), meta: result.meta } satisfies AdminListResult<Visit>
}

export async function getAdminVisit(accessToken: string, visitId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/visits/${visitId}`, { accessToken })
  return mapVisit(data ?? {})
}

export async function updateAdminVisitStatus(
  accessToken: string,
  visitId: string,
  body: Record<string, unknown>,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/visits/${visitId}/status`, {
    method: 'PATCH',
    accessToken,
    body,
  })
  return mapVisit(data ?? {})
}

export type CallbackStatus = 'pending' | 'called' | 'resolved' | 'missed' | 'rescheduled' | 'overdue'
export type CallbackUserType = 'buyer' | 'seller' | 'nri'
export type CallbackSource = 'help_support' | 'profile_support' | 'property_detail' | 'payment' | 'interior'
export type CallbackCategory =
  | 'property_inquiry'
  | 'pricing'
  | 'technical_issue'
  | 'complaint'
  | 'general'
  | 'stage_payment'
  | 'interior'
export type BestTimePreference = 'morning' | 'afternoon' | 'evening'
export type AttemptOutcome = 'answered' | 'no_answer' | 'busy' | 'wrong_number' | 'callback_later'

export interface CallbackAttempt {
  id: string
  attemptNumber: number
  calledAt: string
  duration: number
  outcome: AttemptOutcome
  notes: string
}

export interface Callback {
  id: string
  referenceId: string
  callerName: string
  phone: string
  email?: string
  userType: CallbackUserType
  userId: string
  source: CallbackSource
  sourceScreen: string
  category: CallbackCategory
  propertyId?: string
  propertyTitle?: string
  propertyPrice?: string
  propertyImage?: string
  reason: string
  preferredTime: string
  bestTimePreference: BestTimePreference
  assignedTo: string
  status: CallbackStatus
  attemptCount: number
  attempts: CallbackAttempt[]
  resolutionNotes: string | null
  resolvedAt?: string
  slaDeadline: string
  rescheduleCount?: number
  createdAt: string
  updatedAt: string
}

export const CATEGORY_LABELS: Record<CallbackCategory, string> = {
  property_inquiry: 'Property Inquiry',
  pricing: 'Pricing',
  technical_issue: 'Technical',
  complaint: 'Complaint',
  general: 'General',
  stage_payment: 'Stage Payment',
  interior: 'Interior',
}

export const CATEGORY_STYLES: Record<CallbackCategory, string> = {
  property_inquiry: 'bg-blue-100 text-blue-700',
  pricing: 'bg-green-100 text-green-700',
  technical_issue: 'bg-orange-100 text-orange-700',
  complaint: 'bg-red-100 text-red-700',
  general: 'bg-muted text-muted-foreground',
  stage_payment: 'bg-purple-100 text-purple-700',
  interior: 'bg-pink-100 text-pink-700',
}

export const SOURCE_LABELS: Record<CallbackSource, string> = {
  help_support: 'Help & Support',
  profile_support: 'Profile Help & Support',
  property_detail: 'Property Detail',
  payment: 'Payment',
  interior: 'Interior',
}

export const STATUS_LABELS: Record<CallbackStatus, string> = {
  pending: 'Pending',
  called: 'Called',
  resolved: 'Resolved',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
  overdue: 'Overdue',
}

export function isSlaOverdue(callback: Callback) {
  return callback.status !== 'resolved' && new Date(callback.slaDeadline).getTime() < Date.now()
}

export function getEffectiveStatus(callback: Callback): CallbackStatus {
  if (callback.status === 'resolved') return 'resolved'
  if (isSlaOverdue(callback)) return 'overdue'
  return callback.status
}

export function getSlaRemaining(callback: Callback) {
  const diff = new Date(callback.slaDeadline).getTime() - Date.now()
  if (diff <= 0) return { label: 'Overdue', variant: 'red' as const }
  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  return {
    label: hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`,
    variant: hours < 2 ? ('orange' as const) : ('green' as const),
  }
}

export function isPreferredTimePast(callbackOrTime: Callback | string) {
  const preferredTime = typeof callbackOrTime === 'string' ? callbackOrTime : callbackOrTime.preferredTime
  return new Date(preferredTime).getTime() < Date.now()
}

export function formatPreferredTime(callbackOrTime: Callback | string) {
  const preferredTime = typeof callbackOrTime === 'string' ? callbackOrTime : callbackOrTime.preferredTime
  const date = new Date(preferredTime)
  return {
    date: date.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    time: date.toLocaleTimeString('en-IN', { timeStyle: 'short' }),
  }
}

export function countOpenCallbacksByUser(callbacks: Callback[], userId: string) {
  return callbacks.filter((item) => item.userId === userId && getEffectiveStatus(item) !== 'resolved').length
}

function mapCallback(raw: RawEntity): Callback {
  const user = (raw.userSnapshot ?? raw.userId ?? {}) as RawEntity
  const property = (raw.propertySnapshot ?? raw.propertyId ?? {}) as RawEntity
  const attempts = Array.isArray(raw.attempts) ? raw.attempts : []
  const createdAt = isoOf(raw.createdAt)
  const status = stringOf(raw.status, 'pending') as CallbackStatus
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    callerName: stringOf(user.name, 'Customer'),
    phone: stringOf(user.phone),
    email: stringOf(user.email) || undefined,
    userType: stringOf(raw.userType, 'buyer') as CallbackUserType,
    userId: idOf(raw.userId),
    source: stringOf(raw.source, 'help_support') as CallbackSource,
    sourceScreen: stringOf(raw.sourceScreen, 'Customer app'),
    category: stringOf(raw.category, 'general') as CallbackCategory,
    propertyId: raw.propertyId ? idOf(raw.propertyId) : undefined,
    propertyTitle: stringOf(property.title) || undefined,
    propertyPrice: property.price === undefined ? undefined : formatINR(numberOf(property.price)),
    propertyImage: stringOf(property.image) || undefined,
    reason: stringOf(raw.reason, 'Callback requested'),
    preferredTime: isoOf(raw.preferredTime ?? createdAt),
    bestTimePreference: stringOf(raw.bestTimePreference, 'morning') as BestTimePreference,
    assignedTo: raw.assignedTo ? idOf(raw.assignedTo) : 'Unassigned',
    status,
    attemptCount: numberOf(raw.attemptsCount, attempts.length),
    attempts: attempts.map((attempt, index) => {
      const item = attempt as RawEntity
      return {
        id: idOf(item) || `attempt-${index + 1}`,
        attemptNumber: index + 1,
        calledAt: isoOf(item.attemptedAt),
        duration: numberOf(item.duration),
        outcome: stringOf(item.outcome, 'no_answer') as AttemptOutcome,
        notes: stringOf(item.notes),
      }
    }),
    resolutionNotes: stringOf(raw.resolutionNotes) || null,
    resolvedAt: status === 'resolved' ? isoOf(raw.updatedAt) : undefined,
    slaDeadline: isoOf(raw.slaDeadline),
    rescheduleCount: 0,
    createdAt,
    updatedAt: isoOf(raw.updatedAt, createdAt),
  }
}

export async function listAdminCallbacks(accessToken: string, params: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams()
  Object.entries({ limit: 100, sort: 'newest', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/callbacks?${query.toString()}`, { accessToken })
  return { data: (result.data ?? []).map(mapCallback), meta: result.meta } satisfies AdminListResult<Callback>
}

export async function getAdminCallback(accessToken: string, callbackId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/callbacks/${callbackId}`, { accessToken })
  return mapCallback(data ?? {})
}

export async function resolveAdminCallback(accessToken: string, callbackId: string, notes: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/callbacks/${callbackId}/resolve`, {
    method: 'PATCH',
    accessToken,
    body: { notes, resolutionNotes: notes },
  })
  return mapCallback(data ?? {})
}

export async function addAdminCallbackAttempt(
  accessToken: string,
  callbackId: string,
  body: { outcome: AttemptOutcome; notes?: string; preferredTime?: string },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/callbacks/${callbackId}/attempts`, {
    method: 'POST',
    accessToken,
    body,
  })
  return mapCallback(data ?? {})
}

export async function rescheduleAdminCallback(
  accessToken: string,
  callbackId: string,
  body: { preferredTime: string; reason: string; notes?: string },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/callbacks/${callbackId}/reschedule`, {
    method: 'PATCH',
    accessToken,
    body,
  })
  return mapCallback(data ?? {})
}

export type InteriorLeadStatus =
  | 'new'
  | 'contacted'
  | 'quote_sent'
  | 'accepted'
  | 'negotiating'
  | 'declined'
  | 'completed'

export type InteriorDesignStyle = 'modern' | 'classic' | 'contemporary' | 'minimalist'
export type InteriorBudgetRange = 'budget' | 'standard' | 'premium' | 'luxury'

export interface InteriorLead {
  id: string
  referenceId: string
  buyerName: string
  phone: string
  email: string | null
  buyerUserId: string
  userType: 'resident' | 'nri' | 'pio'
  propertyTitle: string
  propertyId: string
  propertyLocation: string
  propertyThumbnail: string
  selectedRooms: string[]
  designStyle: InteriorDesignStyle
  budgetRange: InteriorBudgetRange
  specialNotes: string | null
  status: InteriorLeadStatus
  submittedAt: string
  slaDeadline: string
  assignedDesigner: string | null
  quoteSentAt: string | null
  quoteAmount: number | null
  quotePackageName: string | null
  quoteTimeline: string | null
  quoteInclusions: string | null
  quoteValidUntil: string | null
}

export const INTERIOR_STATUS_LABELS: Record<InteriorLeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  quote_sent: 'Quote Sent',
  accepted: 'Accepted',
  negotiating: 'Negotiating',
  declined: 'Declined',
  completed: 'Completed',
}

export const INTERIOR_STATUS_STYLES: Record<InteriorLeadStatus, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-purple-100 text-purple-700',
  quote_sent: 'bg-orange-100 text-orange-700',
  accepted: 'bg-green-100 text-green-700',
  negotiating: 'bg-amber-100 text-amber-800',
  declined: 'bg-red-100 text-red-700',
  completed: 'bg-muted text-muted-foreground',
}

export const STYLE_LABELS: Record<InteriorDesignStyle, string> = {
  modern: 'Modern',
  classic: 'Classic',
  contemporary: 'Contemporary',
  minimalist: 'Minimalist',
}

export const BUDGET_LABELS: Record<InteriorBudgetRange, string> = {
  budget: 'Budget',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
}

export const BUDGET_STYLES: Record<InteriorBudgetRange, string> = {
  budget: 'bg-muted text-muted-foreground',
  standard: 'bg-blue-100 text-blue-700',
  premium: 'bg-purple-100 text-purple-700',
  luxury: 'bg-amber-100 text-amber-800',
}

export function getInteriorLeadCounts(leads: InteriorLead[]) {
  const counts: Record<InteriorLeadStatus | 'all', number> = {
    all: leads.length,
    new: 0,
    contacted: 0,
    quote_sent: 0,
    accepted: 0,
    negotiating: 0,
    declined: 0,
    completed: 0,
  }
  leads.forEach((lead) => {
    counts[lead.status] += 1
  })
  return counts
}

export function getSLAStatus(lead: InteriorLead) {
  if (['declined', 'completed'].includes(lead.status)) return 'ok'
  const diff = new Date(lead.slaDeadline).getTime() - Date.now()
  if (diff <= 0) return 'breached'
  if (diff < 4 * 3600000) return 'warning'
  return 'ok'
}

export function getSLALabel(lead: InteriorLead) {
  const diff = new Date(lead.slaDeadline).getTime() - Date.now()
  if (diff <= 0) return { text: 'SLA breached', tone: 'red' as const }
  const hours = Math.ceil(diff / 3600000)
  return {
    text: `${hours}h left`,
    tone: hours < 4 ? ('orange' as const) : ('green' as const),
  }
}

export function getSLAHoursRemaining(lead: InteriorLead) {
  return Math.ceil((new Date(lead.slaDeadline).getTime() - Date.now()) / 3600000)
}

export function formatInr(amount: number) {
  return formatINR(amount)
}

function mapInteriorLead(raw: RawEntity): InteriorLead {
  const buyer = (raw.buyerSnapshot ?? raw.buyerId ?? {}) as RawEntity
  const property = (raw.propertySnapshot ?? raw.propertyId ?? {}) as RawEntity
  const quote = (raw.quote ?? {}) as RawEntity
  const createdAt = isoOf(raw.createdAt)
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    buyerName: stringOf(buyer.name, 'Customer'),
    phone: stringOf(buyer.phone),
    email: stringOf(buyer.email) || null,
    buyerUserId: idOf(raw.buyerId),
    userType: stringOf(raw.userType, buyer.userType ? stringOf(buyer.userType) : 'resident') as 'resident' | 'nri' | 'pio',
    propertyTitle: stringOf(property.title, 'Property'),
    propertyId: idOf(raw.propertyId),
    propertyLocation: stringOf(property.location, 'Location not available'),
    propertyThumbnail: stringOf(property.thumbnail),
    selectedRooms: Array.isArray(raw.selectedRooms) ? raw.selectedRooms.map(String) : [],
    designStyle: stringOf(raw.designStyle, 'modern') as InteriorDesignStyle,
    budgetRange: stringOf(raw.budgetRange, 'standard') as InteriorBudgetRange,
    specialNotes: stringOf(raw.notes) || null,
    status: stringOf(raw.status, 'new') as InteriorLeadStatus,
    submittedAt: createdAt,
    slaDeadline: isoOf(raw.slaDeadline),
    assignedDesigner: raw.assignedDesigner ? idOf(raw.assignedDesigner) : null,
    quoteSentAt: raw.status === 'quote_sent' && raw.updatedAt ? isoOf(raw.updatedAt) : null,
    quoteAmount: quote.amount === undefined ? null : numberOf(quote.amount),
    quotePackageName: stringOf(quote.packageName) || null,
    quoteTimeline: stringOf(quote.timeline) || null,
    quoteInclusions: Array.isArray(quote.inclusions) ? quote.inclusions.map(String).join('\n') : null,
    quoteValidUntil: quote.validUntil ? isoOf(quote.validUntil) : null,
  }
}

export async function listAdminInteriorLeads(
  accessToken: string,
  params: Record<string, string | number | undefined> = {},
) {
  const query = new URLSearchParams()
  Object.entries({ limit: 100, sort: 'newest', ...params }).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const result = await adminApiRequestEnvelope<RawEntity[]>(`/admin/interior/leads?${query.toString()}`, {
    accessToken,
  })
  return { data: (result.data ?? []).map(mapInteriorLead), meta: result.meta } satisfies AdminListResult<InteriorLead>
}

export async function getAdminInteriorLead(accessToken: string, leadId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/interior/leads/${leadId}`, { accessToken })
  return mapInteriorLead(data ?? {})
}

export type UpdateInteriorLeadInput = {
  status?: InteriorLeadStatus
  assignedDesigner?: string | null
  notes?: string | null
  quote?: {
    amount: number
    packageName: string
    timeline: string
    inclusions: string[]
    validUntil: string
  }
  customerAcceptedAt?: string
  completionNote?: string
  remoteCoordinationNotes?: string
}

export async function updateAdminInteriorLead(
  accessToken: string,
  leadId: string,
  body: UpdateInteriorLeadInput,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/interior/leads/${leadId}`, {
    method: 'PATCH',
    accessToken,
    body: body as Record<string, unknown>,
  })
  return mapInteriorLead(data ?? {})
}

export type Designer = SalesPerson & {
  activeProjects: number
  isAvailable: boolean
  specialization: string[]
}

export async function getAdminDesigners(accessToken: string): Promise<Designer[]> {
  const data = await adminApiRequest<RawEntity[]>('/admin/designers', { accessToken })
  return (data ?? []).map((raw) => ({
    ...mapSalesPerson(raw),
    activeProjects: numberOf(raw.activeWorkload),
    isAvailable: raw.isAvailable !== false && raw.isActive !== false,
    specialization: Array.isArray(raw.specialization) ? raw.specialization.map(String) : [],
  }))
}

export type ChatStatus = 'active' | 'deal_agreed' | 'lost' | 'inactive'
export type MessageSender = 'buyer' | 'admin'
export type MessageType = 'text' | 'offer' | 'deal_agreed'
export type OfferStatus = 'pending' | 'accepted' | 'countered' | 'declined'

export interface ChatNegotiation {
  listedPrice: number
  buyerOffer: number | null
  counterOffer: number | null
  agreedPrice: number | null
  deadline: string
  discountPercent: number | null
}

export interface ChatMessage {
  id: string
  sender: MessageSender
  text: string
  timestamp: string
  type: MessageType
  offerAmount?: number
  offerStatus?: OfferStatus
  offerMessage?: string
  propertyTitle?: string
}

export interface ChatThread {
  id: string
  buyerName: string
  buyerPhone: string
  buyerUserId: string
  propertyTitle: string
  propertyId: string
  propertyPrice: string
  status: ChatStatus
  unreadCount: number
  lastMessage: string
  lastMessageAt: string
  buyerInactive: boolean
  negotiationStartedAt: string
  negotiation: ChatNegotiation
  messages: ChatMessage[]
}

export const CHAT_STATUS_LABELS: Record<ChatStatus, string> = {
  active: 'Active',
  deal_agreed: 'Deal Agreed',
  lost: 'Lost',
  inactive: 'Inactive',
}

export function calcDiscountPercent(listed: number, offer: number) {
  return Math.round(((listed - offer) / listed) * 1000) / 10
}

export function isDeadlineSoon(deadline: string, now = new Date()) {
  const diff = new Date(deadline).getTime() - now.getTime()
  return diff > 0 && diff < 2 * 24 * 60 * 60 * 1000
}

export function isLongNegotiation(startedAt: string, now = new Date()) {
  const diff = now.getTime() - new Date(startedAt).getTime()
  return diff >= 14 * 24 * 60 * 60 * 1000
}

export function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' })
}

export function formatThreadTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
}

export function getTotalUnread(chats: ChatThread[]) {
  return chats.reduce((sum, chat) => sum + chat.unreadCount, 0)
}

function mapChatThread(raw: RawEntity): ChatThread {
  const buyer = (raw.buyerSnapshot ?? raw.buyerId ?? {}) as RawEntity
  const property = (raw.propertySnapshot ?? raw.propertyId ?? {}) as RawEntity
  const negotiation = (raw.negotiation ?? {}) as RawEntity
  const messages = Array.isArray(raw.messages) ? raw.messages : []
  const mappedMessages = messages.map((message) => {
    const item = message as RawEntity
    return {
      id: idOf(item),
      sender: stringOf(item.sender, 'buyer') as MessageSender,
      text: stringOf(item.text),
      timestamp: isoOf(item.createdAt),
      type: stringOf(item.type, 'text') as MessageType,
      offerAmount: item.offerAmount === undefined ? undefined : numberOf(item.offerAmount),
      offerStatus: item.offerStatus ? (String(item.offerStatus) as OfferStatus) : undefined,
      offerMessage: stringOf(item.offerMessage) || undefined,
      propertyTitle: stringOf(property.title) || undefined,
    }
  })
  const lastMessage = mappedMessages.at(-1)
  const listedPrice = numberOf(property.price)
  const buyerOffer = [...mappedMessages].reverse().find((message) => message.sender === 'buyer' && message.offerAmount)?.offerAmount ?? null
  const counterOffer = [...mappedMessages].reverse().find((message) => message.sender === 'admin' && message.offerAmount)?.offerAmount ?? null
  const agreedPrice = negotiation.agreedPrice === undefined ? null : numberOf(negotiation.agreedPrice)
  const deadline = isoOf(negotiation.deadline ?? raw.updatedAt)
  const startedAt = isoOf(raw.createdAt)

  return {
    id: idOf(raw),
    buyerName: stringOf(buyer.name, 'Buyer'),
    buyerPhone: stringOf(buyer.phone),
    buyerUserId: idOf(raw.buyerId),
    propertyTitle: stringOf(property.title, 'Property'),
    propertyId: idOf(raw.propertyId),
    propertyPrice: listedPrice ? formatINR(listedPrice) : 'Price not available',
    status: stringOf(raw.status, 'active') as ChatStatus,
    unreadCount: 0,
    lastMessage: lastMessage?.text ?? 'No messages yet',
    lastMessageAt: isoOf(raw.lastMessageAt ?? lastMessage?.timestamp ?? raw.updatedAt),
    buyerInactive: false,
    negotiationStartedAt: startedAt,
    negotiation: {
      listedPrice,
      buyerOffer,
      counterOffer,
      agreedPrice,
      deadline,
      discountPercent: buyerOffer && listedPrice ? calcDiscountPercent(listedPrice, buyerOffer) : null,
    },
    messages: mappedMessages,
  }
}

export async function listAdminChatThreads(accessToken: string) {
  const result = await adminApiRequestEnvelope<RawEntity[]>('/admin/negotiations/chats?limit=100&sort=newest', {
    accessToken,
  })
  return { data: (result.data ?? []).map(mapChatThread), meta: result.meta } satisfies AdminListResult<ChatThread>
}

export async function sendAdminChatMessage(
  accessToken: string,
  threadId: string,
  body: { text: string; type?: MessageType; offerAmount?: number },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/negotiations/chats/${threadId}/messages`, {
    method: 'POST',
    accessToken,
    body,
  })
  return mapChatThread(data ?? {})
}
