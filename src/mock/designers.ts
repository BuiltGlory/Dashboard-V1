// TODO: Replace with API GET /designers

export interface Designer {
  id: string
  name: string
  phone: string
  email: string
  specialization: string[]
  activeProjects: number
  isAvailable: boolean
}

export const MOCK_DESIGNERS: Designer[] = [
  {
    id: 'd1',
    name: 'Meera Krishnan',
    phone: '+91 98765 11111',
    email: 'meera@builtglory.com',
    specialization: ['Modern', 'Contemporary'],
    activeProjects: 3,
    isAvailable: true,
  },
  {
    id: 'd2',
    name: 'Rahul Sharma',
    phone: '+91 98765 22222',
    email: 'rahul@builtglory.com',
    specialization: ['Classic', 'Traditional'],
    activeProjects: 1,
    isAvailable: true,
  },
  {
    id: 'd3',
    name: 'Priya Nambiar',
    phone: '+91 98765 33333',
    email: 'priya.d@builtglory.com',
    specialization: ['Minimalist', 'Scandinavian'],
    activeProjects: 2,
    isAvailable: true,
  },
  {
    id: 'd4',
    name: 'Arjun Das',
    phone: '+91 98765 44444',
    email: 'arjun.d@builtglory.com',
    specialization: ['Luxury', 'Industrial'],
    activeProjects: 4,
    isAvailable: false,
  },
]

export function getDesignerById(id: string | null | undefined): Designer | undefined {
  if (!id) return undefined
  return MOCK_DESIGNERS.find((d) => d.id === id)
}

export function getDesignerByName(name: string | null | undefined): Designer | undefined {
  if (!name) return undefined
  return MOCK_DESIGNERS.find((d) => d.name === name)
}
