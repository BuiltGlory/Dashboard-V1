import {
  adminFormRequest,
  adminApiRequest,
  adminApiRequestEnvelope,
} from './admin'
import type {
  NearbyPlace,
  Property,
  PropertyAdvantages,
  PropertySource,
  PropertyStatus,
  PropertyType,
} from '@/domain/properties'
import { normalizePropertyTypeKey } from '@/domain/properties'

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

export type AdminPropertyListParams = {
  search?: string
  type?: string
  status?: string
  featured?: boolean
  upcoming?: boolean
  includeDeleted?: boolean
  deletedOnly?: boolean
  city?: string
  locality?: string
  page?: number
  limit?: number
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'oldest'
}

export type AdminPropertyPayload = {
  title: string
  description?: string | null
  type: PropertyType
  status?: PropertyStatus
  source?: PropertySource
  isFeatured?: boolean
  isUpcoming?: boolean
  isVisibleOnApp?: boolean
  address?: {
    line1?: string | null
    line2?: string | null
    locality?: string | null
    city?: string | null
    state?: string | null
    pincode?: string | null
    landmark?: string | null
    latitude?: number
    longitude?: number
  }
  price: number
  isNegotiable?: boolean
  specs?: Record<string, unknown>
  amenities?: string[]
  media?: Record<string, unknown>
  advantages?: PropertyAdvantages | null
  nearbyPlaces?: NearbyPlace[]
  highlights?: string[]
  launchDate?: string | null
  possessionDate?: string | null
}

export interface PropertyImportJob {
  id: string
  referenceId: string
  fileName: string
  status: 'validated' | 'rejected' | 'processing' | 'completed' | 'failed' | 'reverted'
  rowsTotal: number
  rowsAccepted: number
  rowsRejected: number
  errors: Array<{ row: number; field: string; message: string }>
  importedProperties: Array<{ id: string; referenceId: string; title: string; status: string; isDeleted: boolean }>
  createdAt: string
  completedAt: string | null
  revertedAt: string | null
}

export type PropertyTemplateMode = 'empty' | 'valued'

export type PropertyTemplateField = {
  key: string
  label: string
  required: boolean
  editable: boolean
  type: 'text' | 'number' | 'select' | 'boolean' | 'list' | string
}

export type PropertyTemplateRow = Record<string, string | number | boolean>

export type PropertyTemplateResult = {
  mode: PropertyTemplateMode
  fields: PropertyTemplateField[]
  rows: PropertyTemplateRow[]
  meta?: ApiMeta
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
  if (value === null || value === undefined) return fallback
  return Boolean(value)
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isoOf(value: unknown, fallback = new Date().toISOString()) {
  return isoOrNull(value) ?? fallback
}

function objectOf(value: unknown): RawEntity {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawEntity) : {}
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function withQuery(path: string, params: AdminPropertyListParams = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value))
  }
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

function mapAddressLine(address: RawEntity) {
  return [address.line1, address.line2, address.landmark].map((v) => stringOf(v)).filter(Boolean).join(', ')
}

function mapProperty(raw: RawEntity): Property {
  const address = objectOf(raw.address)
  const media = objectOf(raw.media)
  const metrics = objectOf(raw.metrics)
  const now = new Date().toISOString()

  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    title: stringOf(raw.title, 'Untitled property'),
    description: stringOf(raw.description),
    type: normalizePropertyTypeKey(stringOf(raw.type)) ?? (stringOf(raw.type, 'plot') as PropertyType),
    status: stringOf(raw.status, 'draft') as PropertyStatus,
    source: stringOf(raw.source, 'manual') as PropertySource,
    isFeatured: booleanOf(raw.isFeatured),
    isUpcoming: booleanOf(raw.isUpcoming),
    isVisibleOnApp: raw.isVisibleOnApp === undefined ? stringOf(raw.status) === 'available' : booleanOf(raw.isVisibleOnApp),
    address: mapAddressLine(address),
    locality: stringOf(address.locality),
    city: stringOf(address.city),
    state: stringOf(address.state),
    pincode: stringOf(address.pincode),
    latitude: address.latitude == null ? null : numberOf(address.latitude),
    longitude: address.longitude == null ? null : numberOf(address.longitude),
    price: numberOf(raw.price),
    isNegotiable: booleanOf(raw.isNegotiable),
    specs: objectOf(raw.specs),
    amenities: arrayOfStrings(raw.amenities),
    photos: arrayOfStrings(media.photos),
    coverPhoto: stringOf(media.coverPhoto) || null,
    videoUrl: stringOf(media.videoUrl) || null,
    droneImageUrl: stringOf(media.droneImageUrl) || null,
    tour3dUrl: stringOf(media.tour3dUrl) || null,
    floorPlanUrl: stringOf(media.floorPlanUrl) || null,
    savedCount: numberOf(metrics.savedCount),
    savedByUsers: Array.isArray(raw.savedByUsers) ? raw.savedByUsers.map(idOf).filter(Boolean) : [],
    assignedTo: idOf(raw.assignedTo),
    source_sheet: stringOf(raw.sourceSheet) || null,
    acquisitionId: idOf(raw.acquisitionId) || null,
    addedAt: isoOf(raw.createdAt ?? raw.addedAt, now),
    updatedAt: isoOf(raw.updatedAt, now),
    soldAt: isoOrNull(raw.soldAt),
    views: numberOf(metrics.views),
    enquiries: numberOf(metrics.enquiries),
    visits: numberOf(metrics.visits),
    compareCount: numberOf(metrics.compareCount),
    isDeleted: booleanOf(raw.isDeleted),
    deletedAt: isoOrNull(raw.deletedAt),
    deletedBy: stringOf(raw.deletedBy) || null,
    launchDate: isoOrNull(raw.launchDate),
    advantages: objectOf(raw.advantages) as unknown as PropertyAdvantages | null,
    nearbyPlaces: Array.isArray(raw.nearbyPlaces) ? (raw.nearbyPlaces as NearbyPlace[]) : [],
    possessionDate: isoOrNull(raw.possessionDate) ?? stringOf(objectOf(raw.specs).possession) ?? null,
    highlights: arrayOfStrings(raw.highlights),
  }
}

function mapImportJob(raw: RawEntity): PropertyImportJob {
  return {
    id: idOf(raw),
    referenceId: stringOf(raw.referenceId, idOf(raw)),
    fileName: stringOf(raw.fileName, 'upload'),
    status: stringOf(raw.status, 'validated') as PropertyImportJob['status'],
    rowsTotal: numberOf(raw.rowsTotal),
    rowsAccepted: numberOf(raw.rowsAccepted),
    rowsRejected: numberOf(raw.rowsRejected),
    errors: Array.isArray(raw.errors)
      ? raw.errors.map((error) => {
          const item = objectOf(error)
          return {
            row: numberOf(item.row),
            field: stringOf(item.field),
            message: stringOf(item.message),
          }
        })
      : [],
    importedProperties: Array.isArray(raw.importedProperties)
      ? raw.importedProperties.map((property) => {
          const item = objectOf(property)
          return {
            id: idOf(item),
            referenceId: stringOf(item.referenceId, idOf(item)),
            title: stringOf(item.title, 'Imported property'),
            status: stringOf(item.status, 'available'),
            isDeleted: booleanOf(item.isDeleted),
          }
        })
      : [],
    createdAt: isoOf(raw.createdAt),
    completedAt: isoOrNull(raw.completedAt),
    revertedAt: isoOrNull(raw.revertedAt),
  }
}

async function formRequest<T>(path: string, accessToken: string, formData: FormData) {
  return adminFormRequest<T>(path, { accessToken, formData })
}

export async function listAdminProperties(
  accessToken: string,
  params: AdminPropertyListParams = {},
): Promise<AdminListResult<Property>> {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    withQuery('/admin/properties', { limit: 100, sort: 'newest', ...params }),
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapProperty), meta: result.meta }
}

export async function getAdminProperty(accessToken: string, propertyId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}`, { accessToken })
  return mapProperty(data)
}

export async function createAdminProperty(accessToken: string, payload: AdminPropertyPayload) {
  const data = await adminApiRequest<RawEntity>('/admin/properties', {
    accessToken,
    method: 'POST',
    body: payload as Record<string, unknown>,
  })
  return mapProperty(data)
}

export async function updateAdminProperty(
  accessToken: string,
  propertyId: string,
  payload: Partial<AdminPropertyPayload>,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}`, {
    accessToken,
    method: 'PATCH',
    body: payload as Record<string, unknown>,
  })
  return mapProperty(data)
}

export async function deleteAdminProperty(accessToken: string, propertyId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}`, {
    accessToken,
    method: 'DELETE',
  })
  return mapProperty(data)
}

export async function restoreAdminProperty(accessToken: string, propertyId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}/restore`, {
    accessToken,
    method: 'PATCH',
  })
  return mapProperty(data)
}

export async function permanentlyDeleteAdminProperty(accessToken: string, propertyId: string) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}/permanent`, {
    accessToken,
    method: 'DELETE',
  })
  return mapProperty(data)
}

export async function updateAdminPropertyStatus(
  accessToken: string,
  propertyId: string,
  status: PropertyStatus,
  reason?: string,
) {
  const data = await adminApiRequest<RawEntity>(`/admin/properties/${propertyId}/status`, {
    accessToken,
    method: 'PATCH',
    body: { status, reason },
  })
  return mapProperty(data)
}

export async function uploadAdminPropertyMedia(
  accessToken: string,
  propertyId: string,
  files: File[],
  documentType = 'photo',
) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  formData.append('documentType', documentType)
  const data = await formRequest<{ property: RawEntity }>(
    `/admin/properties/${propertyId}/media`,
    accessToken,
    formData,
  )
  return mapProperty(data.property)
}

export async function bulkUploadAdminProperties(accessToken: string, file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const result = await formRequest<{
    valid: boolean
    rowsAccepted: number
    rowsRejected: number
    errors: Array<{ row: number; field: string; message: string }>
    job?: RawEntity
  }>('/admin/properties/bulk-upload', accessToken, formData)
  return { ...result, job: result.job ? mapImportJob(result.job) : undefined }
}

export async function getAdminPropertyTemplate(
  accessToken: string,
  mode: PropertyTemplateMode,
  limit = 100,
): Promise<PropertyTemplateResult> {
  const result = await adminApiRequestEnvelope<{
    mode: PropertyTemplateMode
    fields: PropertyTemplateField[]
    rows: RawEntity[]
  }>(`/admin/properties/bulk-template?mode=${mode}&limit=${limit}`, { accessToken })
  return {
    mode: result.data?.mode ?? mode,
    fields: result.data?.fields ?? [],
    rows: (result.data?.rows ?? []).map((row) => ({ ...row } as PropertyTemplateRow)),
    meta: result.meta,
  }
}

export async function listAdminPropertyImportJobs(accessToken: string, limit = 10) {
  const result = await adminApiRequestEnvelope<RawEntity[]>(
    `/admin/properties/import-jobs?limit=${limit}`,
    { accessToken },
  )
  return { data: (result.data ?? []).map(mapImportJob), meta: result.meta } satisfies AdminListResult<PropertyImportJob>
}

export async function undoAdminPropertyImportJob(accessToken: string, importJobId: string) {
  const result = await adminApiRequest<{ job?: RawEntity; revertedCount?: number }>(
    `/admin/import-jobs/${importJobId}/undo`,
    {
      accessToken,
      method: 'POST',
    },
  )
  return {
    job: result.job ? mapImportJob(result.job) : null,
    revertedCount: numberOf(result.revertedCount),
  }
}
