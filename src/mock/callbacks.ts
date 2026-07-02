// TODO: Replace with API call GET /callbacks

export type CallbackStatus =
  | 'pending'
  | 'called'
  | 'resolved'
  | 'missed'
  | 'rescheduled'
  | 'overdue'

export type CallbackUserType = 'buyer' | 'seller' | 'nri'

export type CallbackSource = 'help_support' | 'profile_support'

export type CallbackCategory =
  | 'property_inquiry'
  | 'pricing'
  | 'technical_issue'
  | 'complaint'
  | 'general'
  | 'stage_payment'
  | 'interior'

export type BestTimePreference = 'morning' | 'afternoon' | 'evening'

export type AttemptOutcome =
  | 'answered'
  | 'no_answer'
  | 'busy'
  | 'wrong_number'
  | 'callback_later'

export interface CallbackAttempt {
  id: string
  attemptNumber: number
  calledAt: string
  duration: number
  outcome: AttemptOutcome
  notes: string
}

export interface Callback {
  id: string
  referenceId: string
  callerName: string
  phone: string
  email?: string
  userType: CallbackUserType
  userId: string
  source: CallbackSource
  sourceScreen: string
  category: CallbackCategory
  propertyId?: string
  propertyTitle?: string
  propertyPrice?: string
  propertyImage?: string
  reason: string
  preferredTime: string
  bestTimePreference: BestTimePreference
  assignedTo: string
  status: CallbackStatus
  attemptCount: number
  attempts: CallbackAttempt[]
  resolutionNotes: string | null
  resolvedAt?: string
  slaDeadline: string
  rescheduleCount?: number
  createdAt: string
  updatedAt: string
}

/** Demo "now" for SLA calculations in dev */
export const CALLBACKS_NOW_ISO = '2026-05-30T09:30:00Z'

const IMG_APT =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400'

export const ADMIN_ASSIGNEES = [
  { id: 'arjun', name: 'Arjun Kapoor', role: 'Super Admin' },
  { id: 'priya', name: 'Priya Admin', role: 'Admin' },
  { id: 'vikram', name: 'Vikram Ops', role: 'Ops' },
]

export const CATEGORY_LABELS: Record<CallbackCategory, string> = {
  property_inquiry: 'Property Inquiry',
  pricing: 'Pricing',
  technical_issue: 'Technical',
  complaint: 'Complaint',
  general: 'General',
  stage_payment: 'Stage Payment',
  interior: 'Interior',
}

export const CATEGORY_STYLES: Record<CallbackCategory, string> = {
  property_inquiry: 'bg-blue-100 text-blue-700',
  pricing: 'bg-green-100 text-green-700',
  technical_issue: 'bg-orange-100 text-orange-700',
  complaint: 'bg-red-100 text-red-700',
  general: 'bg-muted text-muted-foreground',
  stage_payment: 'bg-purple-100 text-purple-700',
  interior: 'bg-pink-100 text-pink-700',
}

export const SOURCE_LABELS: Record<CallbackSource, string> = {
  help_support: 'Help & Support',
  profile_support: 'Profile Help & Support',
}

export const STATUS_LABELS: Record<CallbackStatus, string> = {
  pending: 'Pending',
  called: 'Called',
  resolved: 'Resolved',
  missed: 'Missed',
  rescheduled: 'Rescheduled',
  overdue: 'Overdue',
}

export const MOCK_CALLBACKS: Callback[] = [
  {
    id: 'CB-001',
    referenceId: 'BG-CB-2026-001',
    callerName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@email.com',
    userType: 'buyer',
    userId: 'USER-001',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'property_inquiry',
    propertyId: 'PROP-001',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyPrice: '₹45,00,000',
    propertyImage: IMG_APT,
    reason: 'Wanted to know more about the property pricing and availability',
    preferredTime: '2026-05-30T10:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Arjun Kapoor',
    status: 'pending',
    attemptCount: 0,
    attempts: [],
    resolutionNotes: null,
    slaDeadline: '2026-05-30T12:00:00Z',
    createdAt: '2026-05-30T08:00:00Z',
    updatedAt: '2026-05-30T08:00:00Z',
  },
  {
    id: 'CB-002',
    referenceId: 'BG-CB-2026-002',
    callerName: 'Priya Sharma',
    phone: '+91 91234 56789',
    email: 'priya@email.com',
    userType: 'buyer',
    userId: 'USER-002',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'pricing',
    propertyId: 'PROP-002',
    propertyTitle: 'Premium Villa, HSR Layout',
    propertyPrice: '₹1,20,00,000',
    propertyImage: IMG_APT,
    reason: 'Requesting discount on listed price and payment plan options',
    preferredTime: '2026-05-30T14:00:00Z',
    bestTimePreference: 'afternoon',
    assignedTo: 'Priya Admin',
    status: 'overdue',
    attemptCount: 2,
    attempts: [
      {
        id: 'AT-001',
        attemptNumber: 1,
        calledAt: '2026-05-30T08:30:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Rang twice, no pickup',
      },
      {
        id: 'AT-002',
        attemptNumber: 2,
        calledAt: '2026-05-30T09:00:00Z',
        duration: 1,
        outcome: 'busy',
        notes: 'Line busy',
      },
    ],
    resolutionNotes: null,
    slaDeadline: '2026-05-30T09:00:00Z',
    createdAt: '2026-05-29T16:00:00Z',
    updatedAt: '2026-05-30T09:00:00Z',
  },
  {
    id: 'CB-003',
    referenceId: 'BG-CB-2026-003',
    callerName: 'Sunita Reddy',
    phone: '+91 98123 45678',
    email: 'sunita@email.com',
    userType: 'seller',
    userId: 'USER-003',
    source: 'profile_support',
    sourceScreen: 'P-11 Profile Help & Support',
    category: 'general',
    reason: 'Questions about listing approval timeline and document upload',
    preferredTime: '2026-05-31T06:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Vikram Ops',
    status: 'pending',
    attemptCount: 0,
    attempts: [],
    resolutionNotes: null,
    slaDeadline: '2026-05-31T08:00:00Z',
    createdAt: '2026-05-30T07:00:00Z',
    updatedAt: '2026-05-30T07:00:00Z',
  },
  {
    id: 'CB-004',
    referenceId: 'BG-CB-2026-004',
    callerName: 'Amit Patel',
    phone: '+91 99887 76655',
    userType: 'nri',
    userId: 'USER-004',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'technical_issue',
    reason: 'App crashes when opening property gallery on iOS',
    preferredTime: '2026-05-30T11:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Arjun Kapoor',
    status: 'called',
    attemptCount: 1,
    attempts: [
      {
        id: 'AT-010',
        attemptNumber: 1,
        calledAt: '2026-05-30T09:15:00Z',
        duration: 8,
        outcome: 'answered',
        notes: 'Walked through cache clear steps. Will follow up if issue persists.',
      },
    ],
    resolutionNotes: null,
    slaDeadline: '2026-05-30T13:00:00Z',
    createdAt: '2026-05-30T06:00:00Z',
    updatedAt: '2026-05-30T09:15:00Z',
  },
  {
    id: 'CB-005',
    referenceId: 'BG-CB-2026-005',
    callerName: 'Sneha Iyer',
    phone: '+91 97654 32109',
    email: 'sneha@email.com',
    userType: 'buyer',
    userId: 'USER-005',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'complaint',
    propertyId: 'PROP-001',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyPrice: '₹45,00,000',
    propertyImage: IMG_APT,
    reason: 'Agent did not show up for scheduled site visit yesterday',
    preferredTime: '2026-05-29T10:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Priya Admin',
    status: 'resolved',
    attemptCount: 2,
    attempts: [
      {
        id: 'AT-020',
        attemptNumber: 1,
        calledAt: '2026-05-29T14:00:00Z',
        duration: 12,
        outcome: 'answered',
        notes: 'Apologized and rescheduled visit',
      },
      {
        id: 'AT-021',
        attemptNumber: 2,
        calledAt: '2026-05-29T16:00:00Z',
        duration: 5,
        outcome: 'callback_later',
        notes: 'Confirmed new visit time',
      },
    ],
    resolutionNotes:
      'Escalated to field team. New visit scheduled for 31 May. Buyer satisfied with resolution.',
    resolvedAt: '2026-05-29T17:00:00Z',
    slaDeadline: '2026-05-29T12:00:00Z',
    createdAt: '2026-05-29T09:00:00Z',
    updatedAt: '2026-05-29T17:00:00Z',
  },
  {
    id: 'CB-006',
    referenceId: 'BG-CB-2026-006',
    callerName: 'Karthik Menon',
    phone: '+91 90123 45678',
    userType: 'buyer',
    userId: 'USER-006',
    source: 'profile_support',
    sourceScreen: 'P-11 Profile Help & Support',
    category: 'stage_payment',
    reason: 'Clarification on construction-linked payment milestones',
    preferredTime: '2026-05-30T16:00:00Z',
    bestTimePreference: 'evening',
    assignedTo: 'Vikram Ops',
    status: 'rescheduled',
    attemptCount: 1,
    attempts: [
      {
        id: 'AT-030',
        attemptNumber: 1,
        calledAt: '2026-05-30T08:00:00Z',
        duration: 2,
        outcome: 'callback_later',
        notes: 'Buyer asked to call after 4 PM',
      },
    ],
    resolutionNotes: null,
    rescheduleCount: 1,
    slaDeadline: '2026-05-30T18:00:00Z',
    createdAt: '2026-05-29T11:00:00Z',
    updatedAt: '2026-05-30T08:00:00Z',
  },
  {
    id: 'CB-007',
    referenceId: 'BG-CB-2026-007',
    callerName: 'Divya Nair',
    phone: '+91 93456 78901',
    email: 'divya@email.com',
    userType: 'seller',
    userId: 'USER-007',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'interior',
    propertyId: 'PROP-005',
    propertyTitle: 'Penthouse, Jayanagar',
    propertyPrice: '₹95,00,000',
    propertyImage: IMG_APT,
    reason: 'Interested in BuiltGlory interior design package for listed property',
    preferredTime: '2026-05-31T09:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Arjun Kapoor',
    status: 'pending',
    attemptCount: 3,
    attempts: [
      {
        id: 'AT-040',
        attemptNumber: 1,
        calledAt: '2026-05-29T10:00:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'No answer',
      },
      {
        id: 'AT-041',
        attemptNumber: 2,
        calledAt: '2026-05-29T15:00:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Voicemail',
      },
      {
        id: 'AT-042',
        attemptNumber: 3,
        calledAt: '2026-05-30T07:00:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Third attempt',
      },
    ],
    resolutionNotes: null,
    slaDeadline: '2026-05-31T11:00:00Z',
    createdAt: '2026-05-28T14:00:00Z',
    updatedAt: '2026-05-30T07:00:00Z',
  },
  {
    id: 'CB-008',
    referenceId: 'BG-CB-2026-008',
    callerName: 'Rohan Desai',
    phone: '+91 94567 89012',
    userType: 'nri',
    userId: 'USER-008',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'property_inquiry',
    propertyId: 'PROP-003',
    propertyTitle: 'Commercial Office, MG Road',
    propertyPrice: '₹2,50,00,000',
    propertyImage: IMG_APT,
    reason: 'NRI buyer wants virtual tour and ROI projection for commercial unit',
    preferredTime: '2026-05-30T06:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Priya Admin',
    status: 'missed',
    attemptCount: 5,
    attempts: [
      {
        id: 'AT-050',
        attemptNumber: 1,
        calledAt: '2026-05-30T06:30:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Attempt 1',
      },
      {
        id: 'AT-051',
        attemptNumber: 2,
        calledAt: '2026-05-30T07:00:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Attempt 2',
      },
      {
        id: 'AT-052',
        attemptNumber: 3,
        calledAt: '2026-05-30T07:30:00Z',
        duration: 0,
        outcome: 'busy',
        notes: 'Attempt 3',
      },
      {
        id: 'AT-053',
        attemptNumber: 4,
        calledAt: '2026-05-30T08:00:00Z',
        duration: 0,
        outcome: 'no_answer',
        notes: 'Attempt 4',
      },
      {
        id: 'AT-054',
        attemptNumber: 5,
        calledAt: '2026-05-30T08:30:00Z',
        duration: 0,
        outcome: 'wrong_number',
        notes: 'Number unreachable',
      },
    ],
    resolutionNotes: null,
    slaDeadline: '2026-05-30T08:00:00Z',
    createdAt: '2026-05-29T20:00:00Z',
    updatedAt: '2026-05-30T08:30:00Z',
  },
  {
    id: 'CB-009',
    referenceId: 'BG-CB-2026-009',
    callerName: 'Meera Joshi',
    phone: '+91 95678 90123',
    email: 'meera@email.com',
    userType: 'buyer',
    userId: 'USER-009',
    source: 'profile_support',
    sourceScreen: 'P-11 Profile Help & Support',
    category: 'general',
    reason: 'How to update profile photo and KYC documents',
    preferredTime: '2026-05-30T12:00:00Z',
    bestTimePreference: 'afternoon',
    assignedTo: 'Vikram Ops',
    status: 'overdue',
    attemptCount: 0,
    attempts: [],
    resolutionNotes: null,
    slaDeadline: '2026-05-30T09:00:00Z',
    createdAt: '2026-05-30T05:00:00Z',
    updatedAt: '2026-05-30T05:00:00Z',
  },
  {
    id: 'CB-010',
    referenceId: 'BG-CB-2026-010',
    callerName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@email.com',
    userType: 'buyer',
    userId: 'USER-001',
    source: 'help_support',
    sourceScreen: 'H-05 Help & Support',
    category: 'pricing',
    reason: 'Follow-up on loan eligibility and EMI calculator for shortlisted property',
    preferredTime: '2026-05-31T07:00:00Z',
    bestTimePreference: 'morning',
    assignedTo: 'Arjun Kapoor',
    status: 'pending',
    attemptCount: 0,
    attempts: [],
    resolutionNotes: null,
    slaDeadline: '2026-05-31T09:00:00Z',
    rescheduleCount: 3,
    createdAt: '2026-05-30T08:30:00Z',
    updatedAt: '2026-05-30T08:30:00Z',
  },
]

export function getEffectiveStatus(cb: Callback, now = new Date(CALLBACKS_NOW_ISO)): CallbackStatus {
  if (cb.status === 'resolved' || cb.status === 'missed' || cb.status === 'rescheduled') {
    return cb.status
  }
  if (new Date(cb.slaDeadline) < now) {
    return 'overdue'
  }
  if (cb.status === 'overdue') return 'overdue'
  return cb.status
}

export function isSlaOverdue(cb: Callback, now = new Date(CALLBACKS_NOW_ISO)): boolean {
  return getEffectiveStatus(cb, now) === 'overdue'
}

export function getSlaRemaining(
  cb: Callback,
  now = new Date(CALLBACKS_NOW_ISO),
): { label: string; variant: 'green' | 'orange' | 'red' } {
  const deadline = new Date(cb.slaDeadline).getTime()
  const diff = deadline - now.getTime()
  if (diff <= 0) {
    return { label: 'OVERDUE', variant: 'red' }
  }
  const totalMins = Math.floor(diff / 60000)
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  const label =
    hours > 0 ? `${hours}hr ${mins}min remaining` : `${mins}min remaining`
  if (totalMins > 60) return { label, variant: 'green' }
  if (totalMins >= 30) return { label, variant: 'orange' }
  return { label, variant: 'red' }
}

export function formatPreferredTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
  }
}

export function isPreferredTimePast(iso: string, now = new Date(CALLBACKS_NOW_ISO)): boolean {
  return new Date(iso) < now
}

export function countOpenCallbacksByUser(callbacks: Callback[], userId: string): number {
  return callbacks.filter((c) => {
    if (c.userId !== userId) return false
    const eff = getEffectiveStatus(c)
    return eff !== 'resolved' && eff !== 'missed'
  }).length
}
