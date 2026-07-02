// TODO: Replace with API GET /sales-team

export interface SalesPerson {
  id: string
  name: string
  phone: string
  email: string
  role: 'sales_manager' | 'sales_executive' | 'relationship_manager'
  assignedArea: string[]
  activeEnquiries: number
  isAvailable: boolean
}

export const MOCK_SALES_TEAM: SalesPerson[] = [
  {
    id: 'SP-001',
    name: 'Vikram Singh',
    phone: '+91 98765 55555',
    email: 'vikram@builtglory.com',
    role: 'sales_manager',
    assignedArea: ['Whitefield', 'Marathahalli'],
    activeEnquiries: 8,
    isAvailable: true,
  },
  {
    id: 'SP-002',
    name: 'Anita Rao',
    phone: '+91 98765 66666',
    email: 'anita@builtglory.com',
    role: 'sales_executive',
    assignedArea: ['HSR Layout', 'Koramangala'],
    activeEnquiries: 12,
    isAvailable: true,
  },
  {
    id: 'SP-003',
    name: 'Ravi Kumar',
    phone: '+91 98765 77777',
    email: 'ravi@builtglory.com',
    role: 'relationship_manager',
    assignedArea: ['Indiranagar', 'Sadashivanagar'],
    activeEnquiries: 5,
    isAvailable: true,
  },
  {
    id: 'SP-004',
    name: 'Deepa Menon',
    phone: '+91 98765 88888',
    email: 'deepa@builtglory.com',
    role: 'sales_executive',
    assignedArea: ['Electronic City', 'Bannerghatta'],
    activeEnquiries: 15,
    isAvailable: false,
  },
]

export const getRoleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    sales_manager: 'Sales Manager',
    sales_executive: 'Sales Executive',
    relationship_manager: 'Relationship Manager',
  }
  return labels[role] || role
}

export function getSalesPersonById(id: string | null | undefined): SalesPerson | undefined {
  if (!id) return undefined
  return MOCK_SALES_TEAM.find((sp) => sp.id === id)
}
