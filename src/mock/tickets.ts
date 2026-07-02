export type TicketCategory =
  | 'property_inquiry'
  | 'payment'
  | 'technical'
  | 'kyc'
  | 'general'
  | 'complaint'

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface TicketResponse {
  id: string
  author: string
  message: string
  at: string
}

export interface SupportTicket {
  id: string
  userId: string
  userName: string
  phone: string
  category: TicketCategory
  subject: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  createdAt: string
  resolvedAt: string | null
  assignedTo: string
  responses: TicketResponse[]
}

export const CURRENT_ADMIN = 'Arjun Kapoor'

export const ASSIGNEES = ['Arjun Kapoor', 'Priya Admin', 'Vikram Ops'] as const

export const ESCALATE_TARGETS = ['Arjun Kapoor', 'Priya Admin', 'Senior Support Lead'] as const

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  property_inquiry: 'Property Inquiry',
  payment: 'Payment',
  technical: 'Technical',
  kyc: 'KYC',
  general: 'General',
  complaint: 'Complaint',
}

export const REPLY_TEMPLATES = [
  'Thank you for contacting BuiltGlory. We have received your request and will respond shortly.',
  'We are looking into your issue and will update you within 24 hours.',
  'Could you please share more details or a screenshot so we can assist you better?',
  'Your request has been forwarded to the relevant team. We appreciate your patience.',
  'We tried reaching you by phone. Please let us know a convenient time to call back.',
] as const

export const MOCK_TICKETS: SupportTicket[] = [
  {
    id: 'TKT-001',
    userId: 'USER-001',
    userName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    category: 'property_inquiry',
    subject: 'Unable to schedule visit',
    description: 'I tried to schedule a visit but getting error when selecting time slot.',
    status: 'open',
    priority: 'medium',
    createdAt: '2026-05-29T10:00:00Z',
    resolvedAt: null,
    assignedTo: 'Arjun Kapoor',
    responses: [],
  },
  {
    id: 'TKT-002',
    userId: 'USER-003',
    userName: 'Rajesh Khanna',
    phone: '+971 50 123 4567',
    category: 'payment',
    subject: 'Token payment not reflecting',
    description: 'Paid token yesterday but status still shows pending on app.',
    status: 'in_progress',
    priority: 'high',
    createdAt: '2026-05-28T08:30:00Z',
    resolvedAt: null,
    assignedTo: 'Priya Admin',
    responses: [
      {
        id: 'r1',
        author: 'Priya Admin',
        message: 'We are checking with finance team.',
        at: '2026-05-28T14:00:00Z',
      },
    ],
  },
  {
    id: 'TKT-003',
    userId: 'USER-006',
    userName: 'Vikram Desai',
    phone: '+91 98200 33445',
    category: 'kyc',
    subject: 'KYC rejection appeal',
    description: 'My document was rejected. Please re-review uploaded Aadhar.',
    status: 'resolved',
    priority: 'medium',
    createdAt: '2026-05-25T09:00:00Z',
    resolvedAt: '2026-05-27T11:00:00Z',
    assignedTo: 'Priya Admin',
    responses: [
      {
        id: 'r2',
        author: 'Priya Admin',
        message: 'Documents re-verified successfully.',
        at: '2026-05-27T10:30:00Z',
      },
    ],
  },
  {
    id: 'TKT-004',
    userId: 'USER-010',
    userName: 'Kavya Rao',
    phone: '+91 99001 22334',
    category: 'technical',
    subject: 'App crashes on property detail',
    description: 'App closes when opening PROP-089 gallery on Android.',
    status: 'open',
    priority: 'urgent',
    createdAt: '2026-05-29T06:00:00Z',
    resolvedAt: null,
    assignedTo: 'Vikram Ops',
    responses: [],
  },
  {
    id: 'TKT-005',
    userId: 'USER-004',
    userName: 'Priya Reddy',
    phone: '+91 90000 55667',
    category: 'general',
    subject: 'How to change phone number?',
    description: 'Need to update registered phone number on profile.',
    status: 'closed',
    priority: 'low',
    createdAt: '2026-05-20T12:00:00Z',
    resolvedAt: '2026-05-21T09:00:00Z',
    assignedTo: 'Vikram Ops',
    responses: [
      {
        id: 'r3',
        author: 'Vikram Ops',
        message: 'Please use Profile > Edit to update phone.',
        at: '2026-05-20T16:00:00Z',
      },
    ],
  },
  {
    id: 'TKT-006',
    userId: 'USER-001',
    userName: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    category: 'complaint',
    subject: 'Delayed callback from agent',
    description: 'Requested callback 3 days ago, no one called back.',
    status: 'in_progress',
    priority: 'high',
    createdAt: '2026-05-26T15:00:00Z',
    resolvedAt: null,
    assignedTo: 'Arjun Kapoor',
    responses: [],
  },
  {
    id: 'TKT-007',
    userId: 'USER-005',
    userName: 'Ananya Sharma',
    phone: '+44 7700 900123',
    category: 'property_inquiry',
    subject: 'NRI booking process',
    description: 'What documents are needed for NRI purchase in Bangalore?',
    status: 'open',
    priority: 'low',
    createdAt: '2026-05-27T18:00:00Z',
    resolvedAt: null,
    assignedTo: 'Priya Admin',
    responses: [],
  },
  {
    id: 'TKT-008',
    userId: 'USER-012',
    userName: 'Rohit Kumar',
    phone: '+91 91111 99999',
    category: 'complaint',
    subject: 'Spam messages received',
    description: 'Getting promotional SMS not related to my enquiry.',
    status: 'closed',
    priority: 'medium',
    createdAt: '2026-05-15T08:00:00Z',
    resolvedAt: '2026-05-16T10:00:00Z',
    assignedTo: 'Vikram Ops',
    responses: [
      {
        id: 'r4',
        author: 'Vikram Ops',
        message: 'Unsubscribed from marketing list.',
        at: '2026-05-16T09:00:00Z',
      },
    ],
  },
]

export function getTicketById(id: string | undefined) {
  if (!id) return undefined
  return MOCK_TICKETS.find((t) => t.id === id)
}

export function countTicketsByUser(userId: string) {
  return MOCK_TICKETS.filter((t) => t.userId === userId).length
}

export function isTicketOverdue(ticket: SupportTicket) {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return false
  if (ticket.responses.length > 0) return false
  const hours = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000
  return hours >= 24
}

export function isUrgentOverdue(ticket: SupportTicket) {
  return ticket.priority === 'urgent' && isTicketOverdue(ticket)
}
