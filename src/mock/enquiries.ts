// TODO: Replace with API call GET /enquiries?type=buy

export type EnquiryStatus = 'new' | 'responded' | 'visit_scheduled' | 'negotiating' | 'closed'

export type UserType = 'Resident' | 'NRI' | 'PIO'

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
}

export const PREFERRED_VISIT_TIME_LABELS: Record<
  Exclude<PreferredVisitTimeKey, null>,
  string
> = {
  tomorrow_morning: 'Tomorrow, 10:00 AM - 12:00 PM',
  tomorrow_afternoon: 'Tomorrow, 2:00 PM - 5:00 PM',
  this_weekend_morning: 'This Weekend, 10:00 AM - 12:00 PM',
  this_weekend_afternoon: 'This Weekend, 2:00 PM - 5:00 PM',
  custom: 'Custom date & time',
}

export const INTEREST_TYPE_LABELS: Record<InterestType, string> = {
  schedule_visit: '📅 Schedule a Visit',
  price_negotiation: '💬 Price Negotiation',
  more_details: 'ℹ️ More Details',
}

export const INTEREST_TYPE_BADGES: Record<
  InterestType,
  { label: string; className: string }
> = {
  schedule_visit: { label: '📅 Visit', className: 'bg-blue-100 text-blue-700' },
  price_negotiation: { label: '💬 Negotiate', className: 'bg-purple-100 text-purple-700' },
  more_details: { label: 'ℹ️ Details', className: 'bg-muted text-muted-foreground' },
}

export const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  phone: '📞 Phone Call',
  whatsapp: '💬 WhatsApp',
  email: '📧 Email',
}

export const PREFERRED_CONTACT_BADGE_CLASS: Record<PreferredContact, string> = {
  phone: 'bg-blue-100 text-blue-700',
  whatsapp: 'bg-green-100 text-green-700',
  email: 'bg-orange-100 text-orange-700',
}

export function preferredContactIcon(contact: PreferredContact): string {
  if (contact === 'phone') return '📞'
  if (contact === 'whatsapp') return '💬'
  return '📧'
}

export function formatPreferredVisitTimeDisplay(enquiry: BuyEnquiry): string | null {
  const key = enquiry.preferredVisitTime
  if (!key) return null
  if (key === 'custom') {
    if (enquiry.preferredVisitDate && enquiry.preferredVisitTimeSlot) {
      return `${enquiry.preferredVisitDate} · ${enquiry.preferredVisitTimeSlot}`
    }
    if (enquiry.preferredVisitDate) return enquiry.preferredVisitDate
    if (enquiry.preferredVisitTimeSlot) return enquiry.preferredVisitTimeSlot
    return 'Custom date & time'
  }
  return PREFERRED_VISIT_TIME_LABELS[key]
}

/** True when a relative slot (e.g. tomorrow) is stale vs submission date. */
export function isPreferredVisitTimePassed(enquiry: BuyEnquiry): boolean {
  if (enquiry.interestType !== 'schedule_visit') return false
  const key = enquiry.preferredVisitTime
  if (!key || key === 'custom') return false
  const submitted = new Date(enquiry.submittedAt).getTime()
  const daysSince = (Date.now() - submitted) / 86400000
  if (key === 'tomorrow_morning' || key === 'tomorrow_afternoon') {
    return daysSince >= 1
  }
  if (key === 'this_weekend_morning' || key === 'this_weekend_afternoon') {
    return daysSince >= 7
  }
  return false
}

export function findDuplicateEnquiryId(
  enquiry: BuyEnquiry,
  all: BuyEnquiry[],
): string | null {
  const phoneKey = enquiry.phone.replace(/\D/g, '')
  if (!phoneKey) return null
  const siblings = all.filter(
    (o) =>
      o.propertyId === enquiry.propertyId &&
      o.phone.replace(/\D/g, '') === phoneKey,
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

export const MOCK_BUY_ENQUIRIES: BuyEnquiry[] = [
  {
    id: 'ENQ-001',
    buyerName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@email.com',
    userType: 'Resident',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyPrice: '₹45,00,000',
    propertyType: 'Apartment',
    propertyLocation: 'Indiranagar, Bangalore',
    enquiryTypes: ['Schedule Visit'],
    preferredContact: 'whatsapp',
    interestType: 'schedule_visit',
    preferredVisitTime: 'tomorrow_morning',
    preferredVisitDate: null,
    preferredVisitTimeSlot: '10:00 AM - 12:00 PM',
    additionalMessage: 'Looking for 3BHK with good ventilation',
    status: 'new',
    submittedAt: '2026-05-29T10:30:00Z',
    referenceId: 'BG-ENQ-2026-001',
    source: 'app',
    assignedTo: 'SP-003',
  },
  {
    id: 'ENQ-002',
    buyerName: 'Priya Sharma',
    phone: '+91 91234 56789',
    email: 'priya.sharma@gmail.com',
    userType: 'NRI',
    propertyTitle: 'Premium Villa with Private Garden, HSR Layout Phase 2',
    propertyId: 'PROP-002',
    propertyPrice: '₹1,25,00,000',
    propertyType: 'Villa',
    propertyLocation: 'HSR Layout, Bangalore',
    enquiryTypes: ['Price Negotiation'],
    preferredContact: 'phone',
    interestType: 'price_negotiation',
    preferredVisitTime: null,
    preferredVisitDate: null,
    preferredVisitTimeSlot: null,
    additionalMessage: 'Is there any flexibility on price?',
    status: 'new',
    submittedAt: '2026-05-29T08:15:00Z',
    referenceId: 'BG-ENQ-2026-002',
    source: 'app',
    assignedTo: 'SP-002',
  },
  {
    id: 'ENQ-003',
    buyerName: 'Amit Patel',
    phone: '+91 99887 76655',
    email: 'amit.p@outlook.com',
    userType: 'Resident',
    propertyTitle: '3BHK Ready to Move, Koramangala 5th Block',
    propertyId: 'PROP-003',
    propertyPrice: '₹82,50,000',
    propertyType: 'Apartment',
    propertyLocation: 'Koramangala, Bangalore',
    enquiryTypes: ['More Details'],
    preferredContact: 'email',
    interestType: 'more_details',
    preferredVisitTime: null,
    preferredVisitDate: null,
    preferredVisitTimeSlot: null,
    additionalMessage: 'Please share floor plan and RERA details',
    status: 'new',
    submittedAt: '2026-05-28T16:45:00Z',
    referenceId: 'BG-ENQ-2026-003',
    source: 'app',
    assignedTo: null,
  },
  {
    id: 'ENQ-004',
    buyerName: 'Sneha Reddy',
    phone: '+91 87654 32109',
    email: 'sneha.reddy@yahoo.com',
    userType: 'PIO',
    propertyTitle: 'CEO Mansion, Sadashivanagar',
    propertyId: 'PROP-208',
    propertyPrice: '₹2,50,00,000',
    propertyType: 'CEO Mansion',
    propertyLocation: 'Sadashivanagar, Bangalore',
    enquiryTypes: ['Schedule Visit', 'More Details'],
    preferredContact: 'whatsapp',
    interestType: 'schedule_visit',
    preferredVisitTime: 'custom',
    preferredVisitDate: 'Saturday, 7 June 2026',
    preferredVisitTimeSlot: '11:00 AM - 1:00 PM',
    additionalMessage:
      'Interested in the mansion. Please share floor plans and recent comparable sales in the area.',
    status: 'responded',
    submittedAt: '2026-05-27T12:20:00Z',
    referenceId: 'BG-ENQ-2026-004',
    source: 'app',
    assignedTo: 'SP-003',
  },
  {
    id: 'ENQ-005',
    buyerName: 'Vikram Singh',
    phone: '',
    email: 'vikram.singh@email.com',
    userType: 'Resident',
    propertyTitle: 'Plot for Sale, Electronic City Phase 1',
    propertyId: 'PROP-005',
    propertyPrice: '₹35,00,000',
    propertyType: 'Plot',
    propertyLocation: 'Electronic City, Bangalore',
    enquiryTypes: ['More Details'],
    preferredContact: 'whatsapp',
    interestType: 'more_details',
    preferredVisitTime: null,
    preferredVisitDate: null,
    preferredVisitTimeSlot: null,
    additionalMessage: 'Need information on BBMP approval status and boundary measurements.',
    status: 'responded',
    submittedAt: '2026-05-26T09:00:00Z',
    referenceId: 'BG-ENQ-2026-005',
    source: 'app',
    assignedTo: null,
  },
  {
    id: 'ENQ-006',
    buyerName: 'Anita Desai',
    phone: '+91 65432 10987',
    email: 'anita.desai@company.com',
    userType: 'Resident',
    propertyTitle: 'Studio Apartment near Metro, Whitefield',
    propertyId: 'PROP-006',
    propertyPrice: '₹28,50,000',
    propertyType: 'Studio',
    propertyLocation: 'Whitefield, Bangalore',
    enquiryTypes: ['Schedule Visit'],
    preferredContact: 'phone',
    interestType: 'schedule_visit',
    preferredVisitTime: 'this_weekend_afternoon',
    preferredVisitDate: null,
    preferredVisitTimeSlot: '2:00 PM - 5:00 PM',
    additionalMessage:
      'First-time buyer. Would like to visit the property after office hours on Friday.',
    status: 'visit_scheduled',
    submittedAt: '2026-05-25T14:30:00Z',
    referenceId: 'BG-ENQ-2026-006',
    source: 'app',
    assignedTo: 'SP-001',
  },
  {
    id: 'ENQ-007',
    buyerName: 'Karan Mehta',
    phone: '+91 94321 09876',
    email: 'karan.mehta@gmail.com',
    userType: 'NRI',
    propertyTitle: 'Independent House, Sarjapur Road',
    propertyId: 'PROP-007',
    propertyPrice: '₹95,00,000',
    propertyType: 'Independent House',
    propertyLocation: 'Sarjapur Road, Bangalore',
    enquiryTypes: ['Price Negotiation'],
    preferredContact: 'email',
    interestType: 'price_negotiation',
    preferredVisitTime: null,
    preferredVisitDate: null,
    preferredVisitTimeSlot: null,
    additionalMessage:
      'We have shortlisted this property. Open to negotiation if seller is flexible on possession timeline.',
    status: 'negotiating',
    submittedAt: '2026-05-24T11:10:00Z',
    referenceId: 'BG-ENQ-2026-007',
    source: 'app',
    assignedTo: 'SP-002',
  },
  {
    id: 'ENQ-008',
    buyerName: 'Deepa Nair',
    phone: '+91 83210 98765',
    email: 'deepa.nair@email.com',
    userType: 'Resident',
    propertyTitle: '2BHK Apartment, Bellandur',
    propertyId: 'PROP-008',
    propertyPrice: '₹52,00,000',
    propertyType: 'Apartment',
    propertyLocation: 'Bellandur, Bangalore',
    enquiryTypes: ['Schedule Visit'],
    preferredContact: 'whatsapp',
    interestType: 'schedule_visit',
    preferredVisitTime: 'tomorrow_morning',
    preferredVisitDate: null,
    preferredVisitTimeSlot: '10:00 AM - 12:00 PM',
    additionalMessage: 'Visited property. Decided to go with another listing. Thank you for your assistance.',
    status: 'closed',
    submittedAt: '2026-05-20T08:00:00Z',
    referenceId: 'BG-ENQ-2026-008',
    source: 'app',
    assignedTo: 'SP-004',
  },
  {
    id: 'ENQ-009',
    buyerName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@email.com',
    userType: 'Resident',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyPrice: '₹45,00,000',
    propertyType: 'Apartment',
    propertyLocation: 'Indiranagar, Bangalore',
    enquiryTypes: ['Schedule Visit'],
    preferredContact: 'whatsapp',
    interestType: 'schedule_visit',
    preferredVisitTime: 'tomorrow_afternoon',
    preferredVisitDate: null,
    preferredVisitTimeSlot: '2:00 PM - 5:00 PM',
    additionalMessage: 'Following up — can we confirm visit timing?',
    status: 'new',
    submittedAt: '2026-05-29T14:00:00Z',
    referenceId: 'BG-ENQ-2026-009',
    source: 'app',
    assignedTo: null,
  },
]
