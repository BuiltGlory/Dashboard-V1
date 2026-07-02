// TODO: Replace with API GET /interior/leads

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

/** Demo "now" for SLA calculations in dev */
export const INTERIOR_NOW_ISO = '2026-05-30T09:30:00Z'

const IMG_APT =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400'
const IMG_VILLA =
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400'

function hoursFromNow(hours: number) {
  return new Date(new Date(INTERIOR_NOW_ISO).getTime() - hours * 3600000).toISOString()
}

function daysFromNow(days: number) {
  return hoursFromNow(days * 24)
}

function addHours(iso: string, hours: number) {
  return new Date(new Date(iso).getTime() + hours * 3600000).toISOString()
}

function addDays(iso: string, days: number) {
  return addHours(iso, days * 24)
}

const int004Submitted = daysFromNow(5)
const int004QuoteSent = daysFromNow(2)

export const DESIGNERS = ['Arjun Kapoor', 'Priya Admin', 'Design Studio Co'] as const

export const STATUS_LABELS: Record<InteriorLeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  quote_sent: 'Quote Sent',
  accepted: 'Accepted',
  negotiating: 'Negotiating',
  declined: 'Declined',
  completed: 'Completed',
}

export const STATUS_STYLES: Record<InteriorLeadStatus, string> = {
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

export const MOCK_INTERIOR_LEADS: InteriorLead[] = [
  {
    id: 'int-001',
    referenceId: 'INT-001',
    buyerName: 'Meera Iyer',
    phone: '+91 98765 11122',
    email: 'meera.iyer@email.com',
    buyerUserId: 'USER-001',
    userType: 'resident',
    propertyTitle: '3BHK Apartment, Indiranagar',
    propertyId: 'PROP-101',
    propertyLocation: 'Indiranagar, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Living Room', 'Kitchen', 'Master Bedroom'],
    designStyle: 'modern',
    budgetRange: 'premium',
    specialNotes: 'Prefer warm lighting and modular kitchen.',
    status: 'new',
    submittedAt: hoursFromNow(2),
    slaDeadline: addHours(hoursFromNow(2), 24),
    assignedDesigner: null,
    quoteSentAt: null,
    quoteAmount: null,
    quotePackageName: null,
    quoteTimeline: null,
    quoteInclusions: null,
    quoteValidUntil: null,
  },
  {
    id: 'int-002',
    referenceId: 'INT-002',
    buyerName: 'Ahmed Al-Rashid',
    phone: '+971 50 888 7766',
    email: 'ahmed.r@email.com',
    buyerUserId: 'USER-005',
    userType: 'nri',
    propertyTitle: '5BHK Villa, Sarjapur Road',
    propertyId: 'PROP-109',
    propertyLocation: 'Sarjapur Road, Bangalore',
    propertyThumbnail: IMG_VILLA,
    selectedRooms: ['All rooms'],
    designStyle: 'classic',
    budgetRange: 'luxury',
    specialNotes: 'Full home luxury fit-out before move-in Dec 2026.',
    status: 'new',
    submittedAt: hoursFromNow(26),
    slaDeadline: addHours(hoursFromNow(26), 24),
    assignedDesigner: null,
    quoteSentAt: null,
    quoteAmount: null,
    quotePackageName: null,
    quoteTimeline: null,
    quoteInclusions: null,
    quoteValidUntil: null,
  },
  {
    id: 'int-003',
    referenceId: 'INT-003',
    buyerName: 'Sanjay Patel',
    phone: '+91 99000 33445',
    email: null,
    buyerUserId: 'USER-008',
    userType: 'resident',
    propertyTitle: '2BHK Apartment, HSR Layout',
    propertyId: 'PROP-105',
    propertyLocation: 'HSR Layout, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Kitchen', 'Bathrooms'],
    designStyle: 'contemporary',
    budgetRange: 'standard',
    specialNotes: null,
    status: 'contacted',
    submittedAt: daysFromNow(2),
    slaDeadline: addHours(daysFromNow(2), 24),
    assignedDesigner: 'Priya Admin',
    quoteSentAt: null,
    quoteAmount: null,
    quotePackageName: null,
    quoteTimeline: null,
    quoteInclusions: null,
    quoteValidUntil: null,
  },
  {
    id: 'int-004',
    referenceId: 'INT-004',
    buyerName: 'Kavya Menon',
    phone: '+91 98123 45678',
    email: 'kavya.m@email.com',
    buyerUserId: 'USER-012',
    userType: 'resident',
    propertyTitle: '4BHK Penthouse, Koramangala',
    propertyId: 'PROP-112',
    propertyLocation: 'Koramangala, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Living Room', 'Master Bedroom'],
    designStyle: 'modern',
    budgetRange: 'premium',
    specialNotes: 'Accent wall in living room.',
    status: 'quote_sent',
    submittedAt: int004Submitted,
    slaDeadline: addHours(int004Submitted, 24),
    assignedDesigner: 'Design Studio Co',
    quoteSentAt: int004QuoteSent,
    quoteAmount: 850000,
    quotePackageName: 'Premium Living Package',
    quoteTimeline: '6 weeks',
    quoteInclusions: 'Design, modular units, installation, 1-year warranty',
    quoteValidUntil: addDays(int004QuoteSent, 7),
  },
  {
    id: 'int-005',
    referenceId: 'INT-005',
    buyerName: 'Rohit Sharma',
    phone: '+91 91234 56789',
    email: 'rohit.s@email.com',
    buyerUserId: 'USER-015',
    userType: 'resident',
    propertyTitle: 'Villa, Whitefield',
    propertyId: 'PROP-120',
    propertyLocation: 'Whitefield, Bangalore',
    propertyThumbnail: IMG_VILLA,
    selectedRooms: ['Full home'],
    designStyle: 'classic',
    budgetRange: 'luxury',
    specialNotes: null,
    status: 'accepted',
    submittedAt: daysFromNow(14),
    slaDeadline: addHours(daysFromNow(14), 24),
    assignedDesigner: 'Arjun Kapoor',
    quoteSentAt: daysFromNow(10),
    quoteAmount: 2500000,
    quotePackageName: 'Luxury Full Home Package',
    quoteTimeline: '12 weeks',
    quoteInclusions: 'End-to-end design and execution',
    quoteValidUntil: addDays(daysFromNow(10), 7),
  },
  {
    id: 'int-006',
    referenceId: 'INT-006',
    buyerName: 'Fatima Khan',
    phone: '+44 7700 900456',
    email: 'fatima.k@email.com',
    buyerUserId: 'USER-018',
    userType: 'nri',
    propertyTitle: '3BHK Apartment, Electronic City',
    propertyId: 'PROP-108',
    propertyLocation: 'Electronic City, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Bedroom 1', 'Bedroom 2', 'Living Room'],
    designStyle: 'contemporary',
    budgetRange: 'premium',
    specialNotes: 'Remote review calls preferred.',
    status: 'negotiating',
    submittedAt: daysFromNow(8),
    slaDeadline: addHours(daysFromNow(8), 24),
    assignedDesigner: 'Priya Admin',
    quoteSentAt: daysFromNow(5),
    quoteAmount: 1200000,
    quotePackageName: 'Premium 3-Room Package',
    quoteTimeline: '8 weeks',
    quoteInclusions: 'Design + furniture for 3 rooms',
    quoteValidUntil: addDays(daysFromNow(5), 7),
  },
  {
    id: 'int-007',
    referenceId: 'INT-007',
    buyerName: 'Deepak Rao',
    phone: '+91 99887 66554',
    email: 'deepak.r@email.com',
    buyerUserId: 'USER-020',
    userType: 'resident',
    propertyTitle: '2BHK Apartment, BTM Layout',
    propertyId: 'PROP-103',
    propertyLocation: 'BTM Layout, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Kitchen'],
    designStyle: 'minimalist',
    budgetRange: 'budget',
    specialNotes: 'Budget-conscious modular kitchen only.',
    status: 'declined',
    submittedAt: daysFromNow(20),
    slaDeadline: addHours(daysFromNow(20), 24),
    assignedDesigner: 'Design Studio Co',
    quoteSentAt: daysFromNow(18),
    quoteAmount: 180000,
    quotePackageName: 'Kitchen Essentials',
    quoteTimeline: '3 weeks',
    quoteInclusions: 'Kitchen modular only',
    quoteValidUntil: addDays(daysFromNow(18), 7),
  },
  {
    id: 'int-008',
    referenceId: 'INT-008',
    buyerName: 'Anita Desai',
    phone: '+91 97654 32109',
    email: 'anita.d@email.com',
    buyerUserId: 'USER-022',
    userType: 'resident',
    propertyTitle: '4BHK Apartment, Jayanagar',
    propertyId: 'PROP-115',
    propertyLocation: 'Jayanagar, Bangalore',
    propertyThumbnail: IMG_APT,
    selectedRooms: ['Full home'],
    designStyle: 'modern',
    budgetRange: 'premium',
    specialNotes: 'Project completed successfully.',
    status: 'completed',
    submittedAt: daysFromNow(60),
    slaDeadline: addHours(daysFromNow(60), 24),
    assignedDesigner: 'Arjun Kapoor',
    quoteSentAt: daysFromNow(55),
    quoteAmount: 1800000,
    quotePackageName: 'Premium Full Home',
    quoteTimeline: '10 weeks',
    quoteInclusions: 'Full home interior',
    quoteValidUntil: addDays(daysFromNow(55), 7),
  },
]

export function getLeadById(id: string | undefined) {
  if (!id) return undefined
  return MOCK_INTERIOR_LEADS.find((l) => l.id === id || l.referenceId === id)
}

export function getSLAStatus(lead: InteriorLead): 'ok' | 'warning' | 'breached' {
  if (lead.status !== 'new' && lead.status !== 'contacted') return 'ok'
  const now = new Date(INTERIOR_NOW_ISO).getTime()
  const elapsed = (now - new Date(lead.submittedAt).getTime()) / 3600000
  if (elapsed > 24) return 'breached'
  if (elapsed > 20) return 'warning'
  return 'ok'
}

export function getSLAHoursRemaining(lead: InteriorLead) {
  const now = new Date(INTERIOR_NOW_ISO).getTime()
  return (new Date(lead.slaDeadline).getTime() - now) / 3600000
}

export function getSLALabel(lead: InteriorLead): {
  text: string
  tone: 'green' | 'orange' | 'red'
} {
  if (lead.status !== 'new' && lead.status !== 'contacted') {
    return {
      text: new Date(lead.submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      }),
      tone: 'green',
    }
  }
  const remaining = getSLAHoursRemaining(lead)
  if (remaining <= 0) {
    const overdue = Math.abs(remaining)
    if (overdue < 1) return { text: 'OVERDUE just now', tone: 'red' }
    const hrs = Math.max(1, Math.round(overdue))
    return { text: `OVERDUE ${hrs}hrs ago`, tone: 'red' }
  }
  const hrs = Math.max(1, Math.round(remaining))
  const status = getSLAStatus(lead)
  if (status === 'warning') return { text: `${hrs}hr remaining`, tone: 'orange' }
  return { text: `${hrs}hr remaining`, tone: 'green' }
}

export function getInteriorLeadCounts(leads: InteriorLead[]) {
  const counts = {
    all: leads.length,
    new: 0,
    contacted: 0,
    quote_sent: 0,
    accepted: 0,
    negotiating: 0,
    declined: 0,
    completed: 0,
    sla_warning: 0,
    sla_breached: 0,
  }
  leads.forEach((l) => {
    counts[l.status] += 1
    const sla = getSLAStatus(l)
    if (sla === 'warning') counts.sla_warning += 1
    if (sla === 'breached') counts.sla_breached += 1
  })
  return counts
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}
