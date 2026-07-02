import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type RawEntity = Record<string, unknown>

export interface AdminOperator {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  permissions: string[]
  assignedArea: string[]
  specialization: string[]
  isActive: boolean
  isAvailable: boolean
  lastLoginAt?: string
  createdAt?: string
}

function idOf(value: unknown): string {
  if (!value || typeof value !== 'object') return String(value ?? '')
  const entity = value as RawEntity
  return String(entity.id ?? entity._id ?? '')
}

function stringOf(value: unknown, fallback = '') {
  if (value === null || value === undefined) return fallback
  return String(value)
}

function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function mapAdmin(raw: RawEntity): AdminOperator {
  return {
    id: idOf(raw),
    name: stringOf(raw.name, 'Unnamed admin'),
    email: stringOf(raw.email),
    phone: raw.phone ? String(raw.phone) : undefined,
    role: stringOf(raw.role, 'admin'),
    permissions: stringArrayOf(raw.permissions),
    assignedArea: stringArrayOf(raw.assignedArea),
    specialization: stringArrayOf(raw.specialization),
    isActive: raw.isActive !== false,
    isAvailable: raw.isAvailable !== false && raw.isActive !== false,
    lastLoginAt: raw.lastLoginAt ? String(raw.lastLoginAt) : undefined,
    createdAt: raw.createdAt ? String(raw.createdAt) : undefined,
  }
}

export async function listAdminOperators(accessToken: string) {
  const result = await adminApiRequestEnvelope<RawEntity[]>('/admin/admins', { accessToken })
  return {
    data: (result.data ?? []).map(mapAdmin),
    meta: result.meta,
  }
}

export async function inviteAdminOperator(
  accessToken: string,
  payload: Record<string, unknown>,
) {
  const result = await adminApiRequest<RawEntity>('/admin/admins/invite', {
    accessToken,
    method: 'POST',
    body: payload,
  })
  return mapAdmin(result)
}

export async function updateAdminOperator(
  accessToken: string,
  id: string,
  payload: Record<string, unknown>,
) {
  const result = await adminApiRequest<RawEntity>(`/admin/admins/${id}`, {
    accessToken,
    method: 'PATCH',
    body: payload,
  })
  return mapAdmin(result)
}

export async function updateAdminOperatorPermissions(
  accessToken: string,
  id: string,
  permissions: string[],
) {
  const result = await adminApiRequest<RawEntity>(`/admin/admins/${id}/permissions`, {
    accessToken,
    method: 'PATCH',
    body: { permissions },
  })
  return mapAdmin(result)
}

export async function resetAdminOperatorPassword(accessToken: string, id: string, password: string) {
  const result = await adminApiRequest<RawEntity>(`/admin/admins/${id}/reset-password`, {
    accessToken,
    method: 'POST',
    body: { password },
  })
  return mapAdmin(result)
}

export async function setAdminOperatorSuspended(
  accessToken: string,
  id: string,
  suspended: boolean,
) {
  const result = await adminApiRequest<RawEntity>(`/admin/admins/${id}/suspend`, {
    accessToken,
    method: 'POST',
    body: { suspended },
  })
  return mapAdmin(result)
}

export async function removeAdminOperator(accessToken: string, id: string) {
  const result = await adminApiRequest<RawEntity>(`/admin/admins/${id}`, {
    accessToken,
    method: 'DELETE',
  })
  return mapAdmin(result)
}
