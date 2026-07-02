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

export type UserType = 'resident' | 'nri' | 'pio'
export type UserRole = 'buyer' | 'seller' | 'both'
export type FemaComplianceStatus = 'not_checked' | 'compliant' | 'non_compliant' | 'under_review'
export type KycStatus = 'not_submitted' | 'pending' | 'verified' | 'rejected'
export type KycDocumentStatus = 'missing' | 'uploaded' | 'verified' | 'rejected' | 'expired'

export interface FemaCompliance {
  status: FemaComplianceStatus
  checkedBy: string | null
  checkedAt: string | null
  notes: string | null
}

export interface KycDocument {
  id: string
  name: string
  type: 'aadhar' | 'pan' | 'passport' | 'property_doc' | 'bank_statement' | 'photo' | string
  status: KycDocumentStatus
  uploadedAt: string | null
  verifiedAt: string | null
  rejectionReason: string | null
  fileUrl?: string | null
}

export interface User {
  id: string
  referenceId: string
  name: string
  phone: string
  email: string | null
  userType: UserType
  role: UserRole
  profilePhoto: string | null
  kycStatus: KycStatus
  kycDocuments: KycDocument[]
  kycSubmittedAt: string | null
  kycVerifiedAt: string | null
  kycRejectionReason: string | null
  totalEnquiries: number
  totalVisits: number
  totalDeals: number
  totalListings: number
  city: string
  state: string
  country: string
  registeredAt: string
  lastLoginAt: string
  isActive: boolean
  isBlocked: boolean
  blockedReason: string | null
  assignedTo: string | null
  assignedToName?: string | null
  femaCompliance?: FemaCompliance | null
}

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

function booleanOf(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  return value === undefined || value === null ? fallback : Boolean(value)
}

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  if (!value) return fallback
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString()
}

function nullableIsoOf(value: unknown) {
  return value ? isoOf(value) : null
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' ? (value as RawEntity) : {}
}

function withQuery(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

function mapUserType(value: unknown): UserType {
  const normalized = stringOf(value, 'resident').toLowerCase()
  if (normalized === 'nri' || normalized === 'pio') return normalized
  return 'resident'
}

function mapUserRole(value: unknown): UserRole {
  const normalized = stringOf(value, 'buyer').toLowerCase()
  if (normalized === 'seller' || normalized === 'both') return normalized
  return 'buyer'
}

function mapKycStatus(value: unknown): KycStatus {
  const normalized = stringOf(value, 'not_submitted').toLowerCase()
  if (normalized === 'pending' || normalized === 'verified' || normalized === 'rejected') return normalized
  return 'not_submitted'
}

function mapDocumentStatus(value: unknown): KycDocumentStatus {
  const normalized = stringOf(value, 'missing').toLowerCase()
  if (normalized === 'uploaded' || normalized === 'verified' || normalized === 'rejected' || normalized === 'expired') {
    return normalized
  }
  return 'missing'
}

function mapFemaStatus(value: unknown): FemaComplianceStatus {
  const normalized = stringOf(value, 'not_checked').toLowerCase()
  if (normalized === 'compliant' || normalized === 'non_compliant' || normalized === 'under_review') return normalized
  return 'not_checked'
}

function entityName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const entity = value as RawEntity
  return stringOf(entity.name || entity.email || entity.referenceId) || null
}

function mapKycDocument(raw: RawEntity): KycDocument {
  return {
    id: idOf(raw),
    name: stringOf(raw.name, stringOf(raw.type, 'KYC Document')),
    type: stringOf(raw.type, 'document'),
    status: mapDocumentStatus(raw.status),
    uploadedAt: nullableIsoOf(raw.uploadedAt),
    verifiedAt: nullableIsoOf(raw.verifiedAt),
    rejectionReason: stringOf(raw.rejectionReason) || null,
    fileUrl: stringOf(raw.fileUrl) || null,
  }
}

export function mapAdminUser(raw: RawEntity): User {
  const createdAt = isoOf(raw.createdAt ?? raw.registeredAt)
  const fema = objectOf(raw.femaCompliance)
  const kycDocuments = Array.isArray(raw.kycDocuments)
    ? raw.kycDocuments.map((doc) => mapKycDocument(objectOf(doc)))
    : []

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    name: stringOf(raw.name, 'Unnamed user'),
    phone: stringOf(raw.phone ?? raw.mobileNumber ?? raw.phoneNormalized),
    email: stringOf(raw.email) || null,
    userType: mapUserType(raw.userType),
    role: mapUserRole(raw.role),
    profilePhoto: stringOf(raw.profilePhoto) || null,
    kycStatus: mapKycStatus(raw.kycStatus),
    kycDocuments,
    kycSubmittedAt: nullableIsoOf(raw.kycSubmittedAt),
    kycVerifiedAt: nullableIsoOf(raw.kycVerifiedAt),
    kycRejectionReason: stringOf(raw.kycRejectionReason) || null,
    totalEnquiries: numberOf(raw.totalEnquiries),
    totalVisits: numberOf(raw.totalVisits),
    totalDeals: numberOf(raw.totalDeals),
    totalListings: numberOf(raw.totalListings),
    city: stringOf(raw.city, 'Unknown'),
    state: stringOf(raw.state, 'Unknown'),
    country: stringOf(raw.country, 'India'),
    registeredAt: isoOf(raw.registeredAt ?? raw.createdAt, createdAt),
    lastLoginAt: isoOf(raw.lastLoginAt ?? raw.updatedAt ?? raw.createdAt, createdAt),
    isActive: booleanOf(raw.isActive, true) && !booleanOf(raw.isBlocked),
    isBlocked: booleanOf(raw.isBlocked),
    blockedReason: stringOf(raw.blockedReason) || null,
    assignedTo: raw.assignedTo ? idOf(raw.assignedTo) : null,
    assignedToName: entityName(raw.assignedTo),
    femaCompliance:
      raw.femaCompliance && Object.keys(fema).length > 0
        ? {
            status: mapFemaStatus(fema.status),
            checkedBy: entityName(fema.checkedBy) ?? (idOf(fema.checkedBy) || null),
            checkedAt: nullableIsoOf(fema.checkedAt),
            notes: stringOf(fema.notes) || null,
          }
        : null,
  }
}

export function getFemaBadgeLabel(status: FemaComplianceStatus): string {
  switch (status) {
    case 'compliant':
      return 'FEMA OK'
    case 'non_compliant':
    case 'not_checked':
      return 'FEMA Alert'
    case 'under_review':
      return 'FEMA Review'
    default:
      return 'FEMA'
  }
}

export function shouldShowFemaWarning(status: FemaComplianceStatus | undefined): boolean {
  return status === 'not_checked' || status === 'non_compliant'
}

export function getKycStatusColor(status: KycStatus): string {
  return {
    verified: '#10B981',
    pending: '#F59E0B',
    rejected: '#EF4444',
    not_submitted: '#6B7280',
  }[status]
}

export function getKycStatusLabel(status: KycStatus): string {
  return {
    verified: 'KYC Verified',
    pending: 'Pending Review',
    rejected: 'KYC Rejected',
    not_submitted: 'Not Submitted',
  }[status]
}

export function getRoleLabel(role: UserRole): string {
  return {
    buyer: 'Buyer',
    seller: 'Seller',
    both: 'Buyer & Seller',
  }[role]
}

export function getUserTypeBadgeColor(type: UserType): string {
  return {
    resident: 'bg-blue-100 text-blue-700',
    nri: 'bg-purple-100 text-purple-700',
    pio: 'bg-orange-100 text-orange-700',
  }[type]
}

export async function listAdminUsers(
  accessToken: string,
  params: Record<string, string | number | boolean | undefined> = {},
): Promise<AdminListResult<User>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/users', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapAdminUser), meta: result.meta }
}

export async function getAdminUser(accessToken: string, userId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}`, { accessToken })
  return mapAdminUser(data ?? {})
}

export async function updateAdminUserProfile(
  accessToken: string,
  userId: string,
  body: {
    name?: string
    email?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    userType?: UserType
    role?: UserRole
    assignedTo?: string | null
  },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapAdminUser(data ?? {})
}

export async function exportAdminUserData(accessToken: string, userId: string) {
  return adminApiRequest<RawEntity>(`/admin/users/${userId}/export`, { accessToken })
}

export async function updateAdminUserBlock(
  accessToken: string,
  userId: string,
  body: { isBlocked: boolean; blockedReason?: string | null },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}/block`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapAdminUser(data ?? {})
}

export async function assignAdminUser(accessToken: string, userId: string, assignedTo: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}/assign`, {
    accessToken,
    method: 'PATCH',
    body: { assignedTo },
  })
  return mapAdminUser(data ?? {})
}

export async function updateAdminUserKyc(
  accessToken: string,
  userId: string,
  body: { status?: KycStatus; documentUpdates?: Array<{ documentId: string; status: KycDocumentStatus; rejectionReason?: string | null }>; notes?: string | null },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}/kyc`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapAdminUser(data ?? {})
}

export async function updateAdminUserFema(
  accessToken: string,
  userId: string,
  body: { status: FemaComplianceStatus; notes?: string | null },
) {
  const data = await adminApiRequest<RawEntity>(`/admin/users/${userId}/fema`, {
    accessToken,
    method: 'PATCH',
    body,
  })
  return mapAdminUser(data ?? {})
}
