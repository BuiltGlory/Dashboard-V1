// TODO: Replace with API GET /sales/deals

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

  // Buyer info
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  buyerUserId: string
  buyerType: 'resident' | 'nri' | 'pio'

  // Property info
  propertyTitle: string
  propertyId: string
  propertyType: string
  propertyLocation: string
  propertyPrice: number

  // Deal financials
  offeredPrice: number | null
  agreedPrice: number | null
  tokenAmount: number | null
  tokenPaid: boolean
  paymentType: 'full' | 'stage' | null
  totalPaid: number

  // Stage tracking
  daysInStage: number
  lastActivityAt: string
  createdAt: string
  assignedTo: string

  // Source
  sourceEnquiryId: string | null

  // Outcome
  lostReason: string | null
  closedAt: string | null
  reengagementFollowUpAt?: string | null
  reengagementLastContactAt?: string | null
  reengagementAttempts?: number

  photos: string[]
}

const IMG_APT =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400'
const IMG_VILLA =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400'
const IMG_PLOT =
  'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400'

export const MOCK_SALES_DEALS: SalesDeal[] = [
  {
    id: 'DEAL-001',
    referenceId: 'BG-DEAL-2026-001',
    stage: 'active_leads',
    priority: 'high',
    buyerName: 'Rajesh Kumar',
    buyerPhone: '+91 98111 22334',
    buyerEmail: 'rajesh.k@email.com',
    buyerUserId: 'USER-201',
    buyerType: 'resident',
    propertyTitle: '2BHK Apartment, Whitefield',
    propertyId: 'PROP-101',
    propertyType: 'apartment',
    propertyLocation: 'Whitefield, Bangalore',
    propertyPrice: 6200000,
    offeredPrice: null,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 2,
    lastActivityAt: '2026-05-28T09:00:00Z',
    createdAt: '2026-05-26T08:00:00Z',
    assignedTo: 'Arjun Kapoor',
    sourceEnquiryId: 'BUY-101',
    lostReason: null,
    closedAt: null,
    photos: [IMG_APT],
  },
  {
    id: 'DEAL-002',
    referenceId: 'BG-DEAL-2026-002',
    stage: 'active_leads',
    priority: 'urgent',
    buyerName: 'Priya Sharma',
    buyerPhone: '+91 98222 33445',
    buyerEmail: 'priya.sharma@email.com',
    buyerUserId: 'USER-202',
    buyerType: 'nri',
    propertyTitle: '4BHK Villa, Sarjapur Road',
    propertyId: 'PROP-102',
    propertyType: 'villa',
    propertyLocation: 'Sarjapur Road, Bangalore',
    propertyPrice: 12500000,
    offeredPrice: null,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 5,
    lastActivityAt: '2026-05-25T14:30:00Z',
    createdAt: '2026-05-24T08:00:00Z',
    assignedTo: 'Priya Admin',
    sourceEnquiryId: 'BUY-088',
    lostReason: null,
    closedAt: null,
    photos: [IMG_VILLA],
  },
  {
    id: 'DEAL-003',
    referenceId: 'BG-DEAL-2026-003',
    stage: 'site_visits',
    priority: 'normal',
    buyerName: 'Amit Patel',
    buyerPhone: '+91 98333 44556',
    buyerEmail: 'amit.patel@email.com',
    buyerUserId: 'USER-203',
    buyerType: 'resident',
    propertyTitle: 'Residential Plot, Yelahanka',
    propertyId: 'PROP-103',
    propertyType: 'plot',
    propertyLocation: 'Yelahanka, Bangalore',
    propertyPrice: 2400000,
    offeredPrice: null,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 3,
    lastActivityAt: '2026-05-27T11:00:00Z',
    createdAt: '2026-05-24T08:00:00Z',
    assignedTo: 'Vikram Ops',
    sourceEnquiryId: 'BUY-112',
    lostReason: null,
    closedAt: null,
    photos: [IMG_PLOT],
  },
  {
    id: 'DEAL-004',
    referenceId: 'BG-DEAL-2026-004',
    stage: 'site_visits',
    priority: 'high',
    buyerName: 'Sneha Iyer',
    buyerPhone: '+91 98444 55667',
    buyerEmail: 'sneha.iyer@email.com',
    buyerUserId: 'USER-204',
    buyerType: 'resident',
    propertyTitle: '3BHK Apartment, HSR Layout',
    propertyId: 'PROP-104',
    propertyType: 'apartment',
    propertyLocation: 'HSR Layout, Bangalore',
    propertyPrice: 4800000,
    offeredPrice: null,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 8,
    lastActivityAt: '2026-05-22T16:00:00Z',
    createdAt: '2026-05-18T08:00:00Z',
    assignedTo: 'Arjun Kapoor',
    sourceEnquiryId: 'BUY-095',
    lostReason: null,
    closedAt: null,
    photos: [IMG_APT],
  },
  {
    id: 'DEAL-005',
    referenceId: 'BG-DEAL-2026-005',
    stage: 'negotiation',
    priority: 'urgent',
    buyerName: 'Vikram Singh',
    buyerPhone: '+91 98555 66778',
    buyerEmail: 'vikram.s@email.com',
    buyerUserId: 'USER-205',
    buyerType: 'resident',
    propertyTitle: 'Independent Villa, Indiranagar',
    propertyId: 'PROP-105',
    propertyType: 'villa',
    propertyLocation: 'Indiranagar, Bangalore',
    propertyPrice: 9800000,
    offeredPrice: 9200000,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 14,
    lastActivityAt: '2026-05-16T10:00:00Z',
    createdAt: '2026-05-01T08:00:00Z',
    assignedTo: 'Priya Admin',
    sourceEnquiryId: 'BUY-120',
    lostReason: null,
    closedAt: null,
    photos: [IMG_VILLA],
  },
  {
    id: 'DEAL-006',
    referenceId: 'BG-DEAL-2026-006',
    stage: 'token_payment',
    priority: 'normal',
    buyerName: 'Anita Desai',
    buyerPhone: '+91 98666 77889',
    buyerEmail: 'anita.desai@email.com',
    buyerUserId: 'USER-206',
    buyerType: 'nri',
    propertyTitle: '2BHK Flat, HSR Layout',
    propertyId: 'PROP-106',
    propertyType: 'apartment',
    propertyLocation: 'HSR Layout, Bangalore',
    propertyPrice: 4800000,
    offeredPrice: 4500000,
    agreedPrice: 4500000,
    tokenAmount: 45000,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 2,
    lastActivityAt: '2026-05-28T08:30:00Z',
    createdAt: '2026-05-20T08:00:00Z',
    assignedTo: 'Arjun Kapoor',
    sourceEnquiryId: 'BUY-130',
    lostReason: null,
    closedAt: null,
    photos: [IMG_APT],
  },
  {
    id: 'DEAL-007',
    referenceId: 'BG-DEAL-2026-007',
    stage: 'full_payment',
    priority: 'high',
    buyerName: 'Karthik Menon',
    buyerPhone: '+91 98777 88990',
    buyerEmail: 'karthik.m@email.com',
    buyerUserId: 'USER-207',
    buyerType: 'resident',
    propertyTitle: 'Corner Plot, Electronic City',
    propertyId: 'PROP-107',
    propertyType: 'plot',
    propertyLocation: 'Electronic City, Bangalore',
    propertyPrice: 3500000,
    offeredPrice: 3300000,
    agreedPrice: 3300000,
    tokenAmount: 33000,
    tokenPaid: true,
    paymentType: 'full',
    totalPaid: 33000,
    daysInStage: 1,
    lastActivityAt: '2026-05-29T07:00:00Z',
    createdAt: '2026-05-15T08:00:00Z',
    assignedTo: 'Vikram Ops',
    sourceEnquiryId: 'BUY-140',
    lostReason: null,
    closedAt: null,
    photos: [IMG_PLOT],
  },
  {
    id: 'DEAL-008',
    referenceId: 'BG-DEAL-2026-008',
    stage: 'stage_payment',
    priority: 'normal',
    buyerName: 'Divya Nair',
    buyerPhone: '+91 98888 99001',
    buyerEmail: 'divya.nair@email.com',
    buyerUserId: 'USER-208',
    buyerType: 'resident',
    propertyTitle: '3BHK Apartment, Marathahalli',
    propertyId: 'PROP-108',
    propertyType: 'apartment',
    propertyLocation: 'Marathahalli, Bangalore',
    propertyPrice: 5200000,
    offeredPrice: 4900000,
    agreedPrice: 4900000,
    tokenAmount: 49000,
    tokenPaid: true,
    paymentType: 'stage',
    totalPaid: 1470000,
    daysInStage: 6,
    lastActivityAt: '2026-05-24T12:00:00Z',
    createdAt: '2026-05-10T08:00:00Z',
    assignedTo: 'Priya Admin',
    sourceEnquiryId: 'BUY-150',
    lostReason: null,
    closedAt: null,
    photos: [IMG_APT],
  },
  {
    id: 'DEAL-009',
    referenceId: 'BG-DEAL-2026-009',
    stage: 'interior_design',
    priority: 'normal',
    buyerName: 'Rohan Desai',
    buyerPhone: '+91 98999 00112',
    buyerEmail: 'rohan.desai@email.com',
    buyerUserId: 'USER-209',
    buyerType: 'nri',
    propertyTitle: '5BHK Villa, Bellandur',
    propertyId: 'PROP-109',
    propertyType: 'villa',
    propertyLocation: 'Bellandur, Bangalore',
    propertyPrice: 18500000,
    offeredPrice: 17200000,
    agreedPrice: 17000000,
    tokenAmount: 170000,
    tokenPaid: true,
    paymentType: 'stage',
    totalPaid: 8500000,
    daysInStage: 4,
    lastActivityAt: '2026-05-26T09:00:00Z',
    createdAt: '2026-04-01T08:00:00Z',
    assignedTo: 'Arjun Kapoor',
    sourceEnquiryId: 'BUY-160',
    lostReason: null,
    closedAt: null,
    photos: [IMG_VILLA],
  },
  {
    id: 'DEAL-010',
    referenceId: 'BG-DEAL-2026-010',
    stage: 'documentation',
    priority: 'high',
    buyerName: 'Meera Joshi',
    buyerPhone: '+91 99000 11223',
    buyerEmail: 'meera.joshi@email.com',
    buyerUserId: 'USER-210',
    buyerType: 'resident',
    propertyTitle: '2BHK Apartment, Koramangala',
    propertyId: 'PROP-110',
    propertyType: 'apartment',
    propertyLocation: 'Koramangala, Bangalore',
    propertyPrice: 7500000,
    offeredPrice: 7100000,
    agreedPrice: 7000000,
    tokenAmount: 70000,
    tokenPaid: true,
    paymentType: 'full',
    totalPaid: 7070000,
    daysInStage: 7,
    lastActivityAt: '2026-05-23T15:00:00Z',
    createdAt: '2026-04-15T08:00:00Z',
    assignedTo: 'Priya Admin',
    sourceEnquiryId: 'BUY-170',
    lostReason: null,
    closedAt: null,
    photos: [IMG_APT],
  },
  {
    id: 'DEAL-011',
    referenceId: 'BG-DEAL-2026-011',
    stage: 'closed',
    priority: 'normal',
    buyerName: 'Suresh Patel',
    buyerPhone: '+91 99111 22334',
    buyerEmail: 'suresh.p@email.com',
    buyerUserId: 'USER-211',
    buyerType: 'resident',
    propertyTitle: 'Residential Plot, Devanahalli',
    propertyId: 'PROP-111',
    propertyType: 'plot',
    propertyLocation: 'Devanahalli, Bangalore',
    propertyPrice: 2800000,
    offeredPrice: 2650000,
    agreedPrice: 2800000,
    tokenAmount: 28000,
    tokenPaid: true,
    paymentType: 'full',
    totalPaid: 2800000,
    daysInStage: 0,
    lastActivityAt: '2026-05-20T10:00:00Z',
    createdAt: '2026-03-01T08:00:00Z',
    assignedTo: 'Vikram Ops',
    sourceEnquiryId: 'BUY-180',
    lostReason: null,
    closedAt: '2026-05-20T10:00:00Z',
    photos: [IMG_PLOT],
  },
  {
    id: 'DEAL-012',
    referenceId: 'BG-DEAL-2026-012',
    stage: 'lost',
    priority: 'normal',
    buyerName: 'Lakshmi Rao',
    buyerPhone: '+91 99222 33445',
    buyerEmail: 'lakshmi.r@email.com',
    buyerUserId: 'USER-212',
    buyerType: 'resident',
    propertyTitle: '3BHK Villa, MG Road',
    propertyId: 'PROP-112',
    propertyType: 'villa',
    propertyLocation: 'MG Road, Bangalore',
    propertyPrice: 14200000,
    offeredPrice: 13000000,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 0,
    lastActivityAt: '2026-05-18T11:00:00Z',
    createdAt: '2026-05-05T08:00:00Z',
    assignedTo: 'Arjun Kapoor',
    sourceEnquiryId: 'BUY-190',
    lostReason: 'Found better property',
    closedAt: null,
    photos: [IMG_VILLA],
  },
  {
    id: 'DEAL-013',
    referenceId: 'BG-DEAL-2026-013',
    stage: 're_engagement',
    priority: 'high',
    buyerName: 'Meera Nair',
    buyerPhone: '+91 99333 44556',
    buyerEmail: 'meera.nair@email.com',
    buyerUserId: 'USER-213',
    buyerType: 'nri',
    propertyTitle: '2BHK Apartment, Whitefield',
    propertyId: 'PROP-101',
    propertyType: 'apartment',
    propertyLocation: 'Whitefield, Bangalore',
    propertyPrice: 6200000,
    offeredPrice: 5900000,
    agreedPrice: null,
    tokenAmount: null,
    tokenPaid: false,
    paymentType: null,
    totalPaid: 0,
    daysInStage: 10,
    lastActivityAt: '2026-05-19T10:30:00Z',
    createdAt: '2026-04-28T08:00:00Z',
    assignedTo: 'Priya Admin',
    sourceEnquiryId: 'BUY-205',
    lostReason: 'Budget mismatch',
    closedAt: null,
    reengagementFollowUpAt: '2026-06-20T10:30:00Z',
    reengagementLastContactAt: '2026-06-18T16:00:00Z',
    reengagementAttempts: 2,
    photos: [IMG_APT],
  },
]

const SALES_DEALS_STORAGE_KEY = 'builtglory-sales-deals'

export function loadSalesDeals(): SalesDeal[] {
  try {
    const raw = localStorage.getItem(SALES_DEALS_STORAGE_KEY)
    if (!raw) return MOCK_SALES_DEALS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SalesDeal[]) : MOCK_SALES_DEALS
  } catch {
    return MOCK_SALES_DEALS
  }
}

export function saveSalesDealUpdate(deal: SalesDeal): void {
  try {
    const deals = loadSalesDeals()
    const exists = deals.some((d) => d.id === deal.id)
    const next = exists
      ? deals.map((d) => (d.id === deal.id ? deal : d))
      : [deal, ...deals]
    localStorage.setItem(SALES_DEALS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore local persistence failures in mock admin */
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
  return STAGE_LABELS[stage]
}

export function getSalesStageColor(stage: SalesStage): string {
  return STAGE_COLORS[stage]
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
