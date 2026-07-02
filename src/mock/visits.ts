// TODO: Replace with API call GET /visits

export type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'missed'
  | 'rescheduled'

export type VisitType = 'physical' | 'virtual'

export type VirtualPlatform =
  | 'zoom'
  | 'google_meet'
  | 'teams'
  | 'whatsapp_video'
  | null

export const VIRTUAL_PLATFORM_LABELS: Record<
  NonNullable<VirtualPlatform>,
  string
> = {
  zoom: 'Zoom',
  google_meet: 'Google Meet',
  teams: 'Microsoft Teams',
  whatsapp_video: 'WhatsApp Video',
}

export type BuyerInterest = 'very_interested' | 'interested' | 'not_interested' | 'needs_time'

export type NextAction =
  | 'move_to_negotiation'
  | 'schedule_another_visit'
  | 'mark_lost'
  | 'follow_up'

export interface VisitFeedback {
  buyerInterest: BuyerInterest
  notes: string
  nextAction: NextAction
  completedAt: string
}

export interface RescheduleEntry {
  previousDate: string
  previousTime: string
  newDate: string
  newTime: string
  reason: string
  at: string
}

export interface VisitActivity {
  id: string
  type: 'info' | 'status' | 'call' | 'note' | 'checklist' | 'feedback'
  description: string
  timestamp: string
}

export interface VisitCallLog {
  id: string
  duration: number
  outcome: string
  notes: string
  at: string
}

export interface VisitNote {
  id: string
  text: string
  at: string
}

export interface Visit {
  id: string
  referenceId: string
  buyerName: string
  buyerPhone: string
  buyerEmail?: string
  buyerUserId: string
  buyerUserType: string
  buyerEnquiriesCount: number
  buyerVisitNumber: number
  propertyTitle: string
  propertyId: string
  propertyType: string
  propertyPrice: string
  propertyLocation: string
  propertyImage: string
  propertyBhk?: string
  propertyArea?: string
  propertyFloor?: string
  propertyVisitsTotal: number
  visitDate: string
  visitTime: string
  visitEndTime: string
  visitType: VisitType
  /** @deprecated Use virtualMeetingLink — kept for backward compatibility */
  virtualLink: string | null
  virtualPlatform: VirtualPlatform
  virtualMeetingLink: string | null
  virtualRecordingUrl: string | null
  callDuration: number | null
  callNotes: string | null
  documentsShared: string[]
  followUpAction: string | null
  followUpDate: string | null
  completedAt: string | null
  googleMapsLink: string | null
  status: VisitStatus
  /** NRI virtual assistance checklist (saved from admin) */
  nriChecklist?: Record<string, boolean>
  nriAssistanceNotes?: string | null
  rescheduleCount: number
  rescheduleHistory: RescheduleEntry[]
  assignedAdmin: string
  feedback: VisitFeedback | null
  callLogs: VisitCallLog[]
  notes: VisitNote[]
  activities: VisitActivity[]
  createdAt: string
  updatedAt: string
  reminderSent: boolean
  sellerNotified: boolean
  cancelReason?: string
}

/** Reference "today" for filters and banners */
export const VISITS_TODAY = '2026-05-30'

const EMPTY_VIRTUAL: Pick<
  Visit,
  | 'virtualPlatform'
  | 'virtualMeetingLink'
  | 'virtualLink'
  | 'virtualRecordingUrl'
  | 'callDuration'
  | 'callNotes'
  | 'documentsShared'
  | 'followUpAction'
  | 'followUpDate'
  | 'completedAt'
> = {
  virtualPlatform: null,
  virtualMeetingLink: null,
  virtualLink: null,
  virtualRecordingUrl: null,
  callDuration: null,
  callNotes: null,
  documentsShared: [],
  followUpAction: null,
  followUpDate: null,
  completedAt: null,
}

export function getVisitMeetingLink(visit: Visit): string | null {
  return visit.virtualMeetingLink ?? visit.virtualLink ?? null
}

export function isNriBuyer(userType: string): boolean {
  const t = userType.toLowerCase()
  return t === 'nri' || t === 'pio'
}

const IMG_APT =
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=400'
const IMG_VILLA =
  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400'
const IMG_COMM =
  'https://images.unsplash.com/photo-1486406146926-c627a92fd1ab?w=400'

export const MOCK_VISITS: Visit[] = [
  {
    id: 'VISIT-001',
    referenceId: 'BG-VST-2026-001',
    buyerName: 'Rajesh Kumar',
    buyerPhone: '+91 98765 43210',
    buyerEmail: 'rajesh@email.com',
    buyerUserId: 'USER-001',
    buyerUserType: 'Resident',
    buyerEnquiriesCount: 3,
    buyerVisitNumber: 1,
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyType: 'Apartment',
    propertyPrice: '₹45,00,000',
    propertyLocation: 'Indiranagar, Bangalore',
    propertyImage: IMG_APT,
    propertyBhk: '3 BHK',
    propertyArea: '1450 sqft',
    propertyFloor: '4th of 8',
    propertyVisitsTotal: 5,
    visitDate: VISITS_TODAY,
    visitTime: '10:00 AM',
    visitEndTime: '11:00 AM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=Indiranagar+Bangalore',
    status: 'confirmed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Arjun Kapoor',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-001',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-29T10:00:00Z',
      },
      {
        id: 'ACT-002',
        type: 'status',
        description: 'Visit confirmed by admin',
        timestamp: '2026-05-29T14:00:00Z',
      },
    ],
    createdAt: '2026-05-29T10:00:00Z',
    updatedAt: '2026-05-29T14:00:00Z',
    reminderSent: false,
    sellerNotified: false,
  },
  {
    id: 'VISIT-002',
    referenceId: 'BG-VST-2026-002',
    buyerName: 'Priya Sharma',
    buyerPhone: '+91 91234 56789',
    buyerEmail: 'priya@email.com',
    buyerUserId: 'USER-002',
    buyerUserType: 'NRI',
    buyerEnquiriesCount: 2,
    buyerVisitNumber: 2,
    propertyTitle: 'Premium Villa, HSR Layout',
    propertyId: 'PROP-002',
    propertyType: 'Villa',
    propertyPrice: '₹1,20,00,000',
    propertyLocation: 'HSR Layout, Bangalore',
    propertyImage: IMG_VILLA,
    propertyBhk: '4 BHK',
    propertyArea: '3200 sqft',
    propertyFloor: 'Ground + 1',
    propertyVisitsTotal: 3,
    visitDate: VISITS_TODAY,
    visitTime: '2:00 PM',
    visitEndTime: '3:00 PM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=HSR+Layout+Bangalore',
    status: 'scheduled',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Priya Admin',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-010',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-28T09:00:00Z',
      },
    ],
    createdAt: '2026-05-28T09:00:00Z',
    updatedAt: '2026-05-28T09:00:00Z',
    reminderSent: false,
    sellerNotified: true,
  },
  {
    id: 'VISIT-003',
    referenceId: 'BG-VST-2026-003',
    buyerName: 'Amit Patel',
    buyerPhone: '+91 99887 76655',
    buyerEmail: 'amit@email.com',
    buyerUserId: 'USER-003',
    buyerUserType: 'PIO',
    buyerEnquiriesCount: 1,
    buyerVisitNumber: 1,
    propertyTitle: 'Commercial Office, MG Road',
    propertyId: 'PROP-003',
    propertyType: 'Commercial',
    propertyPrice: '₹2,50,00,000',
    propertyLocation: 'MG Road, Bangalore',
    propertyImage: IMG_COMM,
    propertyVisitsTotal: 2,
    visitDate: '2026-05-31',
    visitTime: '11:00 AM',
    visitEndTime: '12:00 PM',
    visitType: 'virtual',
    virtualPlatform: 'google_meet',
    virtualMeetingLink: 'https://meet.google.com/abc-defg-hij',
    virtualLink: 'https://meet.google.com/abc-defg-hij',
    virtualRecordingUrl: null,
    callDuration: null,
    callNotes: null,
    documentsShared: [],
    followUpAction: null,
    followUpDate: null,
    completedAt: null,
    googleMapsLink: null,
    status: 'confirmed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Vikram Ops',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-020',
        type: 'info',
        description: 'Virtual visit scheduled via app',
        timestamp: '2026-05-27T11:00:00Z',
      },
    ],
    createdAt: '2026-05-27T11:00:00Z',
    updatedAt: '2026-05-27T11:00:00Z',
    reminderSent: true,
    sellerNotified: false,
  },
  {
    id: 'VISIT-004',
    referenceId: 'BG-VST-2026-004',
    buyerName: 'Sneha Iyer',
    buyerPhone: '+91 97654 32109',
    buyerEmail: 'sneha@email.com',
    buyerUserId: 'USER-004',
    buyerUserType: 'Resident',
    buyerEnquiriesCount: 4,
    buyerVisitNumber: 3,
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyType: 'Apartment',
    propertyPrice: '₹45,00,000',
    propertyLocation: 'Indiranagar, Bangalore',
    propertyImage: IMG_APT,
    propertyBhk: '3 BHK',
    propertyArea: '1450 sqft',
    propertyFloor: '4th of 8',
    propertyVisitsTotal: 5,
    visitDate: '2026-05-27',
    visitTime: '3:00 PM',
    visitEndTime: '4:00 PM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=Indiranagar+Bangalore',
    status: 'completed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Arjun Kapoor',
    feedback: {
      buyerInterest: 'very_interested',
      notes: 'Buyer loved the layout and natural light. Wants to discuss price.',
      nextAction: 'move_to_negotiation',
      completedAt: '2026-05-27T16:30:00Z',
    },
    callLogs: [
      {
        id: 'CL-001',
        duration: 5,
        outcome: 'Interested',
        notes: 'Pre-visit confirmation call',
        at: '2026-05-27T14:00:00Z',
      },
    ],
    notes: [{ id: 'N-001', text: 'Buyer arrived 10 min early', at: '2026-05-27T15:00:00Z' }],
    activities: [
      {
        id: 'ACT-030',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-25T08:00:00Z',
      },
      {
        id: 'ACT-031',
        type: 'feedback',
        description: 'Post-visit feedback submitted',
        timestamp: '2026-05-27T16:30:00Z',
      },
    ],
    createdAt: '2026-05-25T08:00:00Z',
    updatedAt: '2026-05-27T16:30:00Z',
    reminderSent: true,
    sellerNotified: true,
  },
  {
    id: 'VISIT-005',
    referenceId: 'BG-VST-2026-005',
    buyerName: 'Karthik Menon',
    buyerPhone: '+91 90123 45678',
    buyerUserId: 'USER-005',
    buyerUserType: 'Resident',
    buyerEnquiriesCount: 1,
    buyerVisitNumber: 1,
    propertyTitle: 'Studio Apartment, Koramangala',
    propertyId: 'PROP-004',
    propertyType: 'Apartment',
    propertyPrice: '₹38,00,000',
    propertyLocation: 'Koramangala, Bangalore',
    propertyImage: IMG_APT,
    propertyBhk: '1 BHK',
    propertyArea: '650 sqft',
    propertyVisitsTotal: 1,
    visitDate: '2026-05-28',
    visitTime: '9:00 AM',
    visitEndTime: '10:00 AM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=Koramangala+Bangalore',
    status: 'missed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Priya Admin',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-040',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-26T10:00:00Z',
      },
      {
        id: 'ACT-041',
        type: 'status',
        description: 'Marked as missed — buyer did not show up',
        timestamp: '2026-05-28T10:30:00Z',
      },
    ],
    createdAt: '2026-05-26T10:00:00Z',
    updatedAt: '2026-05-28T10:30:00Z',
    reminderSent: true,
    sellerNotified: false,
  },
  {
    id: 'VISIT-006',
    referenceId: 'BG-VST-2026-006',
    buyerName: 'Divya Nair',
    buyerPhone: '+91 93456 78901',
    buyerEmail: 'divya@email.com',
    buyerUserId: 'USER-006',
    buyerUserType: 'NRI',
    buyerEnquiriesCount: 2,
    buyerVisitNumber: 1,
    propertyTitle: 'Penthouse, Jayanagar',
    propertyId: 'PROP-005',
    propertyType: 'Apartment',
    propertyPrice: '₹95,00,000',
    propertyLocation: 'Jayanagar, Bangalore',
    propertyImage: IMG_APT,
    propertyBhk: '4 BHK',
    propertyArea: '2800 sqft',
    propertyVisitsTotal: 4,
    visitDate: '2026-06-02',
    visitTime: '4:00 PM',
    visitEndTime: '5:00 PM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=Jayanagar+Bangalore',
    status: 'cancelled',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Arjun Kapoor',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-050',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-24T12:00:00Z',
      },
      {
        id: 'ACT-051',
        type: 'status',
        description: 'Visit cancelled — Buyer cancelled',
        timestamp: '2026-05-29T09:00:00Z',
      },
    ],
    createdAt: '2026-05-24T12:00:00Z',
    updatedAt: '2026-05-29T09:00:00Z',
    reminderSent: false,
    sellerNotified: false,
    cancelReason: 'Buyer cancelled',
  },
  {
    id: 'VISIT-007',
    referenceId: 'BG-VST-2026-007',
    buyerName: 'Rohan Desai',
    buyerPhone: '+91 94567 89012',
    buyerEmail: 'rohan@email.com',
    buyerUserId: 'USER-007',
    buyerUserType: 'Resident',
    buyerEnquiriesCount: 5,
    buyerVisitNumber: 2,
    propertyTitle: 'Premium Villa, HSR Layout',
    propertyId: 'PROP-002',
    propertyType: 'Villa',
    propertyPrice: '₹1,20,00,000',
    propertyLocation: 'HSR Layout, Bangalore',
    propertyImage: IMG_VILLA,
    propertyBhk: '4 BHK',
    propertyArea: '3200 sqft',
    propertyVisitsTotal: 3,
    visitDate: '2026-06-01',
    visitTime: '10:30 AM',
    visitEndTime: '11:30 AM',
    visitType: 'physical',
    ...EMPTY_VIRTUAL,
    googleMapsLink: 'https://maps.google.com/?q=HSR+Layout+Bangalore',
    status: 'rescheduled',
    rescheduleCount: 2,
    rescheduleHistory: [
      {
        previousDate: '2026-05-29',
        previousTime: '2:00 PM',
        newDate: '2026-05-31',
        newTime: '10:30 AM',
        reason: 'Buyer request',
        at: '2026-05-28T11:00:00Z',
      },
      {
        previousDate: '2026-05-31',
        previousTime: '10:30 AM',
        newDate: '2026-06-01',
        newTime: '10:30 AM',
        reason: 'Property not ready',
        at: '2026-05-30T08:00:00Z',
      },
    ],
    assignedAdmin: 'Vikram Ops',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-060',
        type: 'info',
        description: 'Visit scheduled via app',
        timestamp: '2026-05-22T10:00:00Z',
      },
      {
        id: 'ACT-061',
        type: 'status',
        description: 'Visit rescheduled (2x)',
        timestamp: '2026-05-30T08:00:00Z',
      },
    ],
    createdAt: '2026-05-22T10:00:00Z',
    updatedAt: '2026-05-30T08:00:00Z',
    reminderSent: false,
    sellerNotified: true,
  },
  {
    id: 'VISIT-008',
    referenceId: 'BG-VST-2026-008',
    buyerName: 'Meera Joshi',
    buyerPhone: '+91 95678 90123',
    buyerEmail: 'meera@email.com',
    buyerUserId: 'USER-008',
    buyerUserType: 'PIO',
    buyerEnquiriesCount: 1,
    buyerVisitNumber: 1,
    propertyTitle: 'Retail Space, Whitefield',
    propertyId: 'PROP-006',
    propertyType: 'Commercial',
    propertyPrice: '₹80,00,000',
    propertyLocation: 'Whitefield, Bangalore',
    propertyImage: IMG_COMM,
    propertyVisitsTotal: 1,
    visitDate: '2026-06-03',
    visitTime: '1:00 PM',
    visitEndTime: '2:00 PM',
    visitType: 'virtual',
    virtualPlatform: 'teams',
    virtualMeetingLink: null,
    virtualLink: null,
    virtualRecordingUrl: null,
    callDuration: null,
    callNotes: null,
    documentsShared: [],
    followUpAction: null,
    followUpDate: null,
    completedAt: null,
    googleMapsLink: null,
    status: 'scheduled',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Priya Admin',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-070',
        type: 'info',
        description: 'Virtual visit scheduled via app',
        timestamp: '2026-05-29T16:00:00Z',
      },
    ],
    createdAt: '2026-05-29T16:00:00Z',
    updatedAt: '2026-05-29T16:00:00Z',
    reminderSent: false,
    sellerNotified: false,
  },
  {
    id: 'VISIT-009',
    referenceId: 'BG-VST-2026-009',
    buyerName: 'Ahmed Al-Rashid',
    buyerPhone: '+971 50 987 6543',
    buyerEmail: 'ahmed.alrashid@email.com',
    buyerUserId: 'USER-NRI-009',
    buyerUserType: 'NRI',
    buyerEnquiriesCount: 1,
    buyerVisitNumber: 1,
    propertyTitle: '5BHK Villa, Sarjapur',
    propertyId: 'PROP-203',
    propertyType: 'Villa',
    propertyPrice: '₹1,20,00,000',
    propertyLocation: 'Sarjapur, Bangalore',
    propertyImage: IMG_VILLA,
    propertyBhk: '5 BHK',
    propertyArea: '4200 sqft',
    propertyVisitsTotal: 2,
    visitDate: '2026-05-31',
    visitTime: '11:00 AM',
    visitEndTime: '12:00 PM',
    visitType: 'virtual',
    virtualPlatform: 'zoom',
    virtualMeetingLink: 'https://zoom.us/j/123456789',
    virtualLink: 'https://zoom.us/j/123456789',
    virtualRecordingUrl: null,
    callDuration: null,
    callNotes: null,
    documentsShared: [],
    followUpAction: null,
    followUpDate: null,
    completedAt: null,
    googleMapsLink: null,
    status: 'confirmed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Arjun Kapoor',
    feedback: null,
    callLogs: [],
    notes: [],
    activities: [
      {
        id: 'ACT-080',
        type: 'info',
        description: 'Virtual visit scheduled via app (B-12)',
        timestamp: '2026-05-28T14:00:00Z',
      },
      {
        id: 'ACT-081',
        type: 'info',
        description: 'Virtual meeting link added',
        timestamp: '2026-05-29T10:00:00Z',
      },
      {
        id: 'ACT-082',
        type: 'status',
        description: 'Meeting confirmed - link sent to buyer',
        timestamp: '2026-05-29T11:00:00Z',
      },
    ],
    createdAt: '2026-05-28T14:00:00Z',
    updatedAt: '2026-05-29T11:00:00Z',
    reminderSent: false,
    sellerNotified: false,
  },
  {
    id: 'VISIT-010',
    referenceId: 'BG-VST-2026-010',
    buyerName: 'Priya Nair NRI',
    buyerPhone: '+44 7700 900456',
    buyerEmail: 'priya.nair.nri@email.co.uk',
    buyerUserId: 'USER-NRI-010',
    buyerUserType: 'NRI',
    buyerEnquiriesCount: 2,
    buyerVisitNumber: 1,
    propertyTitle: '3BHK Apartment, Whitefield',
    propertyId: 'PROP-202',
    propertyType: 'Apartment',
    propertyPrice: '₹85,00,000',
    propertyLocation: 'Whitefield, Bangalore',
    propertyImage: IMG_COMM,
    propertyBhk: '3 BHK',
    propertyArea: '1650 sqft',
    propertyVisitsTotal: 1,
    visitDate: '2026-05-27',
    visitTime: '4:00 PM',
    visitEndTime: '5:00 PM',
    visitType: 'virtual',
    virtualPlatform: 'google_meet',
    virtualMeetingLink: 'https://meet.google.com/abc-defg',
    virtualLink: 'https://meet.google.com/abc-defg',
    virtualRecordingUrl: 'https://drive.google.com/file/d/recording-demo',
    callDuration: 45,
    callNotes:
      'Buyer very interested. Discussed floor plan and pricing. Wants to proceed to enquiry.',
    documentsShared: [
      'Floor Plan PDF',
      'RERA Certificate',
      'Property Photos',
    ],
    followUpAction: 'Send formal quote',
    followUpDate: '2026-05-31',
    completedAt: '2026-05-27T17:30:00Z',
    googleMapsLink: null,
    status: 'completed',
    rescheduleCount: 0,
    rescheduleHistory: [],
    assignedAdmin: 'Priya Admin',
    feedback: {
      buyerInterest: 'very_interested',
      notes: 'Virtual call completed — ready for formal quote',
      nextAction: 'follow_up',
      completedAt: '2026-05-27T17:30:00Z',
    },
    callLogs: [],
    notes: [],
    nriChecklist: {
      walkthrough: true,
      rera: true,
      floorPlan: true,
      pricing: true,
      legal: true,
      fema: true,
      payment: true,
      nextSteps: true,
    },
    nriAssistanceNotes: 'Buyer asked about repatriation timeline.',
    activities: [
      {
        id: 'ACT-090',
        type: 'info',
        description: 'Virtual visit scheduled via app (B-12)',
        timestamp: '2026-05-24T12:00:00Z',
      },
      {
        id: 'ACT-091',
        type: 'status',
        description: 'Meeting confirmed - link sent to buyer',
        timestamp: '2026-05-25T09:00:00Z',
      },
      {
        id: 'ACT-092',
        type: 'status',
        description: 'Call completed - 45 minutes',
        timestamp: '2026-05-27T17:30:00Z',
      },
      {
        id: 'ACT-093',
        type: 'note',
        description:
          'Call notes recorded by Priya Admin — Documents shared: Floor Plan PDF, RERA Certificate, Property Photos',
        timestamp: '2026-05-27T17:35:00Z',
      },
    ],
    createdAt: '2026-05-24T12:00:00Z',
    updatedAt: '2026-05-27T17:35:00Z',
    reminderSent: true,
    sellerNotified: false,
  },
]

// VISIT-003 + VISIT-009: same property on 2026-05-31 within 1 hour (calendar conflict demo)
MOCK_VISITS[2] = {
  ...MOCK_VISITS[2],
  propertyId: 'PROP-001',
  propertyTitle: 'Luxury Apartment, Indiranagar',
  propertyImage: IMG_APT,
  visitDate: '2026-05-31',
  visitTime: '10:00 AM',
}

export function parseVisitTimeMinutes(time: string): number {
  const match = time.match(/(\d+):(\d+)\s*(AM|PM)/i)
  if (!match) return 0
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const period = match[3].toUpperCase()
  if (period === 'PM' && hours !== 12) hours += 12
  if (period === 'AM' && hours === 12) hours = 0
  return hours * 60 + minutes
}

export function findVisitConflicts(
  visits: Visit[],
  propertyId: string,
  visitDate: string,
  visitTime: string,
  excludeId?: string,
): Visit[] {
  const targetStart = parseVisitTimeMinutes(visitTime)
  const targetEnd = targetStart + 60
  return visits.filter((v) => {
    if (v.id === excludeId) return false
    if (v.propertyId !== propertyId || v.visitDate !== visitDate) return false
    if (v.status === 'cancelled') return false
    const start = parseVisitTimeMinutes(v.visitTime)
    const end = parseVisitTimeMinutes(v.visitEndTime) || start + 60
    return start < targetEnd && end > targetStart
  })
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function isVisitPast(visit: Visit, today = VISITS_TODAY): boolean {
  if (visit.visitDate < today) return true
  if (visit.visitDate > today) return false
  const nowMins = 12 * 60
  return parseVisitTimeMinutes(visit.visitTime) < nowMins
}

export function isVisitToday(visit: Visit, today = VISITS_TODAY): boolean {
  return visit.visitDate === today
}
