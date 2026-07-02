import { adminApiRequest } from './admin'

export interface AdminSearchResult {
  type: 'property' | 'user' | 'enquiry' | 'acquisition' | 'deal'
  id: string
  title: string
  subtitle: string
  route: string
  emoji: string
}

const iconByType: Record<AdminSearchResult['type'], string> = {
  property: '🏠',
  user: '👤',
  enquiry: '💬',
  acquisition: '🏗️',
  deal: '🤝',
}

export async function searchAdminDashboard(accessToken: string, query: string, limit = 12) {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const results = await adminApiRequest<AdminSearchResult[]>(`/admin/search?${params.toString()}`, {
    accessToken,
  })
  return (results ?? []).map((result) => ({
    ...result,
    emoji: iconByType[result.type] ?? result.emoji,
  }))
}
