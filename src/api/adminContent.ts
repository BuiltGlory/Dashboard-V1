import { adminApiRequest, adminApiRequestEnvelope } from './admin'

type ApiMeta = {
  requestId?: string
  page?: number
  limit?: number
  total?: number
  totalPages?: number
  [key: string]: unknown
}

export type ContentSection = 'home' | 'onboarding' | 'faq' | 'legal' | 'about' | 'news' | 'general' | 'banner'
export type ContentStatus = 'draft' | 'published' | 'archived'

export type AdminContentItem = {
  _id?: string
  id?: string
  referenceId?: string
  slug: string
  section: ContentSection
  title: string
  excerpt?: string | null
  body?: string | null
  category?: string | null
  status: ContentStatus
  imageUrl?: string | null
  cta?: {
    label?: string | null
    target?: string | null
  } | null
  tags?: string[]
  order?: number
  metadata?: Record<string, unknown>
  publishedAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export type AdminContentPayload = {
  slug?: string
  section: ContentSection
  title: string
  excerpt?: string | null
  body?: string | null
  category?: string | null
  status?: ContentStatus
  imageUrl?: string | null
  cta?: {
    label?: string | null
    target?: string | null
  } | null
  tags?: string[]
  order?: number
  metadata?: Record<string, unknown>
}

export type AdminContentListParams = {
  section?: ContentSection
  category?: string
  status?: ContentStatus
  search?: string
  page?: number
  limit?: number
  sort?: 'newest' | 'oldest'
}

export type AdminContentListResult = {
  data: AdminContentItem[]
  meta?: ApiMeta
}

function buildQuery(params: AdminContentListParams = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.append(key, String(value))
  }
  const value = query.toString()
  return value ? `?${value}` : ''
}

export async function listAdminContent(accessToken: string, params: AdminContentListParams = {}) {
  const result = await adminApiRequestEnvelope<AdminContentItem[]>(
    `/admin/content${buildQuery({ limit: 100, sort: 'newest', ...params })}`,
    { accessToken },
  )
  return { data: result.data ?? [], meta: result.meta } satisfies AdminContentListResult
}

export async function createAdminContent(accessToken: string, data: AdminContentPayload) {
  return adminApiRequest<AdminContentItem>('/admin/content', {
    method: 'POST',
    accessToken,
    body: data,
  })
}

export async function updateAdminContent(accessToken: string, contentId: string, data: Partial<AdminContentPayload>) {
  return adminApiRequest<AdminContentItem>(`/admin/content/${contentId}`, {
    method: 'PATCH',
    accessToken,
    body: data,
  })
}

export async function deleteAdminContent(accessToken: string, contentId: string) {
  return adminApiRequest<null>(`/admin/content/${contentId}`, {
    method: 'DELETE',
    accessToken,
  })
}

export async function reorderAdminContent(accessToken: string, items: Array<{ id: string; order: number }>) {
  return adminApiRequest<AdminContentItem[]>('/admin/content/reorder', {
    method: 'PATCH',
    accessToken,
    body: { items },
  })
}
