// TODO: Replace with API GET /negotiations/chats

export type ChatStatus = 'active' | 'deal_agreed' | 'lost' | 'inactive'

export type MessageSender = 'buyer' | 'admin'

export type MessageType = 'text' | 'offer' | 'deal_agreed'

export type OfferStatus = 'pending' | 'accepted' | 'countered' | 'declined'

export interface ChatNegotiation {
  listedPrice: number
  buyerOffer: number | null
  counterOffer: number | null
  agreedPrice: number | null
  deadline: string
  discountPercent: number | null
}

export interface ChatMessage {
  id: string
  sender: MessageSender
  text: string
  timestamp: string
  type: MessageType
  offerAmount?: number
  offerStatus?: OfferStatus
  offerMessage?: string
  propertyTitle?: string
}

export interface ChatThread {
  id: string
  buyerName: string
  buyerPhone: string
  buyerUserId: string
  propertyTitle: string
  propertyId: string
  propertyPrice: string
  status: ChatStatus
  unreadCount: number
  lastMessage: string
  lastMessageAt: string
  buyerInactive: boolean
  negotiationStartedAt: string
  negotiation: ChatNegotiation
  messages: ChatMessage[]
}

export const CHAT_NOW_ISO = '2026-05-30T12:00:00Z'

export const STATUS_LABELS: Record<ChatStatus, string> = {
  active: 'Active',
  deal_agreed: 'Deal Agreed',
  lost: 'Lost',
  inactive: 'Inactive',
}

export function formatINR(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatINRShort(amount: number) {
  if (amount >= 10000000) {
    const cr = amount / 10000000
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`
  }
  const lakhs = amount / 100000
  return `₹${lakhs % 1 === 0 ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`
}

export function calcDiscountPercent(listed: number, offer: number) {
  return Math.round(((listed - offer) / listed) * 1000) / 10
}

export function isDeadlineSoon(deadline: string, now = new Date(CHAT_NOW_ISO)) {
  const diff = new Date(deadline).getTime() - now.getTime()
  return diff > 0 && diff < 2 * 24 * 60 * 60 * 1000
}

export function isLongNegotiation(startedAt: string, now = new Date(CHAT_NOW_ISO)) {
  const diff = now.getTime() - new Date(startedAt).getTime()
  return diff >= 14 * 24 * 60 * 60 * 1000
}

export const MOCK_CHATS: ChatThread[] = [
  {
    id: 'CHAT-001',
    buyerName: 'Rajesh Kumar',
    buyerPhone: '+91 98765 43210',
    buyerUserId: 'USER-001',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyPrice: '₹45,00,000',
    status: 'active',
    unreadCount: 3,
    lastMessage: 'Can you do 42 lakhs?',
    lastMessageAt: '2026-05-30T10:30:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-29T09:00:00Z',
    negotiation: {
      listedPrice: 4500000,
      buyerOffer: 4200000,
      counterOffer: 4350000,
      agreedPrice: null,
      deadline: '2026-06-05T00:00:00Z',
      discountPercent: 6.7,
    },
    messages: [
      {
        id: 'MSG-001',
        sender: 'buyer',
        text: 'Hi, I am interested in this property',
        timestamp: '2026-05-29T09:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-002',
        sender: 'admin',
        text: 'Hello Rajesh! Great choice. How can I help?',
        timestamp: '2026-05-29T09:05:00Z',
        type: 'text',
      },
      {
        id: 'MSG-003',
        sender: 'buyer',
        text: 'Opening offer',
        timestamp: '2026-05-29T14:00:00Z',
        type: 'offer',
        offerAmount: 4100000,
        offerStatus: 'countered',
        offerMessage: 'Can work with 41 lakhs if paperwork is quick',
        propertyTitle: 'Luxury Apartment, Indiranagar',
      },
      {
        id: 'MSG-004',
        sender: 'admin',
        text: 'Counter at 43.5 lakhs',
        timestamp: '2026-05-29T16:00:00Z',
        type: 'offer',
        offerAmount: 4350000,
        offerStatus: 'countered',
        offerMessage: 'Best we can do after internal review',
        propertyTitle: 'Luxury Apartment, Indiranagar',
      },
      {
        id: 'MSG-005',
        sender: 'buyer',
        text: 'Can you do 42 lakhs?',
        timestamp: '2026-05-30T10:30:00Z',
        type: 'offer',
        offerAmount: 4200000,
        offerStatus: 'pending',
        offerMessage: 'Final budget — can close this week',
        propertyTitle: 'Luxury Apartment, Indiranagar',
      },
    ],
  },
  {
    id: 'CHAT-002',
    buyerName: 'Priya Sharma',
    buyerPhone: '+91 91234 56789',
    buyerUserId: 'USER-002',
    propertyTitle: 'Premium Villa, HSR Layout',
    propertyId: 'PROP-002',
    propertyPrice: '₹1,20,00,000',
    status: 'active',
    unreadCount: 5,
    lastMessage: 'Is 1.05 crore your final offer?',
    lastMessageAt: '2026-05-30T11:00:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-15T10:00:00Z',
    negotiation: {
      listedPrice: 12000000,
      buyerOffer: 10500000,
      counterOffer: 11200000,
      agreedPrice: null,
      deadline: '2026-05-31T00:00:00Z',
      discountPercent: 12.5,
    },
    messages: [
      {
        id: 'MSG-010',
        sender: 'buyer',
        text: 'Interested in the villa. Budget around 1 crore.',
        timestamp: '2026-05-15T10:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-011',
        sender: 'admin',
        text: 'We can discuss. Listed at ₹1.2Cr.',
        timestamp: '2026-05-15T11:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-012',
        sender: 'buyer',
        text: 'Is 1.05 crore your final offer?',
        timestamp: '2026-05-30T11:00:00Z',
        type: 'text',
      },
    ],
  },
  {
    id: 'CHAT-003',
    buyerName: 'Amit Patel',
    buyerPhone: '+91 99887 76655',
    buyerUserId: 'USER-003',
    propertyTitle: 'Commercial Office, MG Road',
    propertyId: 'PROP-003',
    propertyPrice: '₹2,50,00,000',
    status: 'deal_agreed',
    unreadCount: 0,
    lastMessage: 'Deal agreed at ₹2.38Cr',
    lastMessageAt: '2026-05-28T16:00:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-10T08:00:00Z',
    negotiation: {
      listedPrice: 25000000,
      buyerOffer: 23500000,
      counterOffer: 23800000,
      agreedPrice: 23800000,
      deadline: '2026-06-01T00:00:00Z',
      discountPercent: 4.8,
    },
    messages: [
      {
        id: 'MSG-020',
        sender: 'buyer',
        text: 'NRI buyer — need virtual tour first',
        timestamp: '2026-05-10T08:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-021',
        sender: 'admin',
        text: 'Scheduled for next week.',
        timestamp: '2026-05-12T09:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-022',
        sender: 'admin',
        text: 'Deal agreed at ₹2.38Cr',
        timestamp: '2026-05-28T16:00:00Z',
        type: 'deal_agreed',
        offerAmount: 23800000,
      },
    ],
  },
  {
    id: 'CHAT-004',
    buyerName: 'Sneha Iyer',
    buyerPhone: '+91 97654 32109',
    buyerUserId: 'USER-004',
    propertyTitle: 'Studio Apartment, Koramangala',
    propertyId: 'PROP-004',
    propertyPrice: '₹38,00,000',
    status: 'lost',
    unreadCount: 0,
    lastMessage: 'Buyer chose another property',
    lastMessageAt: '2026-05-25T14:00:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-18T09:00:00Z',
    negotiation: {
      listedPrice: 3800000,
      buyerOffer: 3200000,
      counterOffer: 3500000,
      agreedPrice: null,
      deadline: '2026-05-28T00:00:00Z',
      discountPercent: 15.8,
    },
    messages: [
      {
        id: 'MSG-030',
        sender: 'buyer',
        text: 'Offer 32 lakhs maximum',
        timestamp: '2026-05-20T10:00:00Z',
        type: 'offer',
        offerAmount: 3200000,
      },
      {
        id: 'MSG-031',
        sender: 'admin',
        text: 'Unable to match. Best we can do is 35L.',
        timestamp: '2026-05-22T11:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-032',
        sender: 'admin',
        text: 'Buyer chose another property',
        timestamp: '2026-05-25T14:00:00Z',
        type: 'text',
      },
    ],
  },
  {
    id: 'CHAT-005',
    buyerName: 'Karthik Menon',
    buyerPhone: '+91 90123 45678',
    buyerUserId: 'USER-005',
    propertyTitle: 'Luxury Apartment, Indiranagar',
    propertyId: 'PROP-001',
    propertyPrice: '₹45,00,000',
    status: 'inactive',
    unreadCount: 0,
    lastMessage: 'Please call me when available',
    lastMessageAt: '2026-05-20T09:00:00Z',
    buyerInactive: true,
    negotiationStartedAt: '2026-05-01T10:00:00Z',
    negotiation: {
      listedPrice: 4500000,
      buyerOffer: 4000000,
      counterOffer: 4300000,
      agreedPrice: null,
      deadline: '2026-05-25T00:00:00Z',
      discountPercent: 11.1,
    },
    messages: [
      {
        id: 'MSG-040',
        sender: 'buyer',
        text: 'Please call me when available',
        timestamp: '2026-05-20T09:00:00Z',
        type: 'text',
      },
    ],
  },
  {
    id: 'CHAT-006',
    buyerName: 'Divya Nair',
    buyerPhone: '+91 93456 78901',
    buyerUserId: 'USER-006',
    propertyTitle: 'Penthouse, Jayanagar',
    propertyId: 'PROP-005',
    propertyPrice: '₹95,00,000',
    status: 'active',
    unreadCount: 1,
    lastMessage: 'Can we schedule a visit this weekend?',
    lastMessageAt: '2026-05-30T08:45:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-28T14:00:00Z',
    negotiation: {
      listedPrice: 9500000,
      buyerOffer: null,
      counterOffer: null,
      agreedPrice: null,
      deadline: '2026-06-10T00:00:00Z',
      discountPercent: null,
    },
    messages: [
      {
        id: 'MSG-050',
        sender: 'buyer',
        text: 'Love the penthouse photos!',
        timestamp: '2026-05-28T14:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-051',
        sender: 'admin',
        text: 'Happy to arrange a visit.',
        timestamp: '2026-05-29T10:00:00Z',
        type: 'text',
      },
      {
        id: 'MSG-052',
        sender: 'buyer',
        text: 'Can we schedule a visit this weekend?',
        timestamp: '2026-05-30T08:45:00Z',
        type: 'text',
      },
    ],
  },
  {
    id: 'CHAT-007',
    buyerName: 'Rohan Desai',
    buyerPhone: '+91 94567 89012',
    buyerUserId: 'USER-007',
    propertyTitle: 'Retail Space, Whitefield',
    propertyId: 'PROP-006',
    propertyPrice: '₹80,00,000',
    status: 'active',
    unreadCount: 0,
    lastMessage: 'Offer: ₹74L',
    lastMessageAt: '2026-05-30T09:15:00Z',
    buyerInactive: false,
    negotiationStartedAt: '2026-05-12T09:00:00Z',
    negotiation: {
      listedPrice: 8000000,
      buyerOffer: 7400000,
      counterOffer: 7600000,
      agreedPrice: null,
      deadline: '2026-06-02T00:00:00Z',
      discountPercent: 10,
    },
    messages: [
      {
        id: 'MSG-060',
        sender: 'buyer',
        text: 'Offer ₹72L for retail unit',
        timestamp: '2026-05-25T12:00:00Z',
        type: 'offer',
        offerAmount: 7200000,
        offerStatus: 'countered',
        offerMessage: 'Cash ready — need possession in 60 days',
        propertyTitle: 'Retail Space, Whitefield',
      },
      {
        id: 'MSG-061',
        sender: 'admin',
        text: 'Counter offer sent',
        timestamp: '2026-05-29T17:00:00Z',
        type: 'offer',
        offerAmount: 7600000,
        offerStatus: 'countered',
        offerMessage: 'Includes parking and fit-out allowance',
        propertyTitle: 'Retail Space, Whitefield',
      },
      {
        id: 'MSG-062',
        sender: 'buyer',
        text: 'Revised offer ₹74L',
        timestamp: '2026-05-30T09:15:00Z',
        type: 'offer',
        offerAmount: 7400000,
        offerStatus: 'pending',
        offerMessage: 'Meet in the middle — can sign by Friday',
        propertyTitle: 'Retail Space, Whitefield',
      },
    ],
  },
  {
    id: 'CHAT-008',
    buyerName: 'Meera Joshi',
    buyerPhone: '+91 95678 90123',
    buyerUserId: 'USER-008',
    propertyTitle: '3BHK Apartment, Whitefield',
    propertyId: 'PROP-007',
    propertyPrice: '₹65,00,000',
    status: 'inactive',
    unreadCount: 0,
    lastMessage: 'Thanks, will think about it',
    lastMessageAt: '2026-05-18T15:00:00Z',
    buyerInactive: true,
    negotiationStartedAt: '2026-05-01T08:00:00Z',
    negotiation: {
      listedPrice: 6500000,
      buyerOffer: 5800000,
      counterOffer: 6200000,
      agreedPrice: null,
      deadline: '2026-05-20T00:00:00Z',
      discountPercent: 10.8,
    },
    messages: [
      {
        id: 'MSG-070',
        sender: 'buyer',
        text: 'Thanks, will think about it',
        timestamp: '2026-05-18T15:00:00Z',
        type: 'text',
      },
    ],
  },
]

export function getTotalUnread(chats: ChatThread[]) {
  return chats.reduce((sum, c) => sum + c.unreadCount, 0)
}

export function formatMessageTime(iso: string) {
  const d = new Date(iso)
  const now = new Date(CHAT_NOW_ISO)
  const today = now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const msgDay = d.toDateString()
  if (msgDay === today) return 'Today'
  if (msgDay === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatThreadTime(iso: string) {
  const d = new Date(iso)
  const now = new Date(CHAT_NOW_ISO)
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
