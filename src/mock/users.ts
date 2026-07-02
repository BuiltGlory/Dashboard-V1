// TODO: Replace with API GET /users

export type UserType = 'resident' | 'nri' | 'pio'

export type UserRole = 'buyer' | 'seller' | 'both'

export type FemaComplianceStatus =
  | 'not_checked'
  | 'compliant'
  | 'non_compliant'
  | 'under_review'

export interface FemaCompliance {
  status: FemaComplianceStatus
  checkedBy: string | null
  checkedAt: string | null
  notes: string | null
}

export type KycStatus =
  | 'not_submitted'
  | 'pending'
  | 'verified'
  | 'rejected'

export type KycDocumentStatus =
  | 'missing'
  | 'uploaded'
  | 'verified'
  | 'rejected'
  | 'expired'

export interface KycDocument {
  name: string
  type:
    | 'aadhar'
    | 'pan'
    | 'passport'
    | 'property_doc'
    | 'bank_statement'
    | 'photo'
  status: KycDocumentStatus
  uploadedAt: string | null
  verifiedAt: string | null
  rejectionReason: string | null
}

export interface User {
  id: string
  referenceId: string
  name: string
  phone: string
  email: string | null
  userType: UserType
  role: UserRole
  profilePhoto: string | null
  kycStatus: KycStatus
  kycDocuments: KycDocument[]
  kycSubmittedAt: string | null
  kycVerifiedAt: string | null
  kycRejectionReason: string | null
  totalEnquiries: number
  totalVisits: number
  totalDeals: number
  totalListings: number
  city: string
  state: string
  country: string
  registeredAt: string
  lastLoginAt: string
  isActive: boolean
  isBlocked: boolean
  blockedReason: string | null
  assignedTo: string | null
  /** NRI/PIO property purchase compliance */
  femaCompliance?: FemaCompliance | null
}

export function getFemaBadgeLabel(status: FemaComplianceStatus): string {
  switch (status) {
    case 'compliant':
      return 'FEMA ✅'
    case 'non_compliant':
    case 'not_checked':
      return 'FEMA ⚠️'
    case 'under_review':
      return 'FEMA ⏳'
    default:
      return 'FEMA'
  }
}

export function shouldShowFemaWarning(status: FemaComplianceStatus | undefined): boolean {
  return status === 'not_checked' || status === 'non_compliant'
}

const VERIFIED_KYC_DOCS: KycDocument[] = [
  {
    name: 'Aadhar Card',
    type: 'aadhar',
    status: 'verified',
    uploadedAt: '2024-02-10T08:00:00.000Z',
    verifiedAt: '2024-02-11T10:30:00.000Z',
    rejectionReason: null,
  },
  {
    name: 'PAN Card',
    type: 'pan',
    status: 'verified',
    uploadedAt: '2024-02-10T08:15:00.000Z',
    verifiedAt: '2024-02-11T11:00:00.000Z',
    rejectionReason: null,
  },
]

const PENDING_KYC_DOCS: KycDocument[] = [
  {
    name: 'Aadhar Card',
    type: 'aadhar',
    status: 'uploaded',
    uploadedAt: '2025-01-20T12:00:00.000Z',
    verifiedAt: null,
    rejectionReason: null,
  },
]

const REJECTED_KYC_DOCS: KycDocument[] = [
  {
    name: 'Aadhar Card',
    type: 'aadhar',
    status: 'rejected',
    uploadedAt: '2024-08-05T09:00:00.000Z',
    verifiedAt: null,
    rejectionReason: 'Document image unclear',
  },
]

const KYC_STATUS_COLORS: Record<KycStatus, string> = {
  verified: '#10B981',
  pending: '#F59E0B',
  rejected: '#EF4444',
  not_submitted: '#6B7280',
}

const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  verified: 'KYC Verified',
  pending: 'Pending Review',
  rejected: 'KYC Rejected',
  not_submitted: 'Not Submitted',
}

const ROLE_LABELS: Record<UserRole, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  both: 'Buyer & Seller',
}

const USER_TYPE_BADGE_COLORS: Record<UserType, string> = {
  resident: 'bg-blue-100 text-blue-700',
  nri: 'bg-purple-100 text-purple-700',
  pio: 'bg-orange-100 text-orange-700',
}

export const MOCK_USERS: User[] = [
  {
    id: 'usr_001',
    referenceId: 'USER-001',
    name: 'Arjun Mehta',
    phone: '+91 98765 43210',
    email: 'arjun.mehta@email.com',
    userType: 'resident',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-02-10T08:00:00.000Z',
    kycVerifiedAt: '2024-02-11T11:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 3,
    totalVisits: 2,
    totalDeals: 1,
    totalListings: 0,
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    registeredAt: '2023-11-01T06:00:00.000Z',
    lastLoginAt: '2025-05-28T14:22:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_priya',
  },
  {
    id: 'usr_002',
    referenceId: 'USER-002',
    name: 'Lakshmi Narayanan',
    phone: '+91 98400 11223',
    email: 'lakshmi.n@email.com',
    userType: 'resident',
    role: 'seller',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-01-05T10:00:00.000Z',
    kycVerifiedAt: '2024-01-07T09:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 0,
    totalVisits: 0,
    totalDeals: 0,
    totalListings: 2,
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    registeredAt: '2023-09-15T08:00:00.000Z',
    lastLoginAt: '2025-05-27T09:15:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: null,
  },
  {
    id: 'usr_003',
    referenceId: 'USER-003',
    name: 'Rajesh Khanna',
    phone: '+971 50 123 4567',
    email: 'rajesh.k@email.com',
    userType: 'nri',
    role: 'both',
    profilePhoto: null,
    kycStatus: 'pending',
    kycDocuments: PENDING_KYC_DOCS,
    kycSubmittedAt: '2025-01-20T12:00:00.000Z',
    kycVerifiedAt: null,
    kycRejectionReason: null,
    totalEnquiries: 2,
    totalVisits: 0,
    totalDeals: 1,
    totalListings: 1,
    city: 'Dubai',
    state: 'Dubai',
    country: 'UAE',
    registeredAt: '2024-06-10T10:00:00.000Z',
    lastLoginAt: '2025-05-26T18:40:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_ahmed',
    femaCompliance: {
      status: 'not_checked',
      checkedBy: null,
      checkedAt: null,
      notes: null,
    },
  },
  {
    id: 'usr_004',
    referenceId: 'USER-004',
    name: 'Priya Reddy',
    phone: '+91 90000 55667',
    email: null,
    userType: 'resident',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'not_submitted',
    kycDocuments: [],
    kycSubmittedAt: null,
    kycVerifiedAt: null,
    kycRejectionReason: null,
    totalEnquiries: 1,
    totalVisits: 0,
    totalDeals: 0,
    totalListings: 0,
    city: 'Hyderabad',
    state: 'Telangana',
    country: 'India',
    registeredAt: '2025-03-01T07:30:00.000Z',
    lastLoginAt: '2025-05-25T11:00:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: null,
  },
  {
    id: 'usr_005',
    referenceId: 'USER-005',
    name: 'Ananya Sharma',
    phone: '+44 7700 900123',
    email: 'ananya.sharma@email.co.uk',
    userType: 'nri',
    role: 'seller',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2023-12-01T14:00:00.000Z',
    kycVerifiedAt: '2023-12-03T16:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 0,
    totalVisits: 0,
    totalDeals: 0,
    totalListings: 3,
    city: 'London',
    state: 'England',
    country: 'UK',
    registeredAt: '2023-10-20T12:00:00.000Z',
    lastLoginAt: '2025-05-24T08:30:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_james',
    femaCompliance: {
      status: 'compliant',
      checkedBy: 'Priya Admin',
      checkedAt: '2024-12-03T10:00:00.000Z',
      notes: 'FEMA declaration verified for UK NRI seller.',
    },
  },
  {
    id: 'usr_006',
    referenceId: 'USER-006',
    name: 'Vikram Desai',
    phone: '+91 98200 33445',
    email: 'vikram.desai@email.com',
    userType: 'pio',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'rejected',
    kycDocuments: REJECTED_KYC_DOCS,
    kycSubmittedAt: '2024-08-05T09:00:00.000Z',
    kycVerifiedAt: null,
    kycRejectionReason: 'Document unclear',
    totalEnquiries: 2,
    totalVisits: 2,
    totalDeals: 0,
    totalListings: 0,
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    registeredAt: '2024-05-12T09:00:00.000Z',
    lastLoginAt: '2025-05-20T16:45:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_priya',
    femaCompliance: {
      status: 'under_review',
      checkedBy: null,
      checkedAt: null,
      notes: 'Awaiting bank NRE account statement.',
    },
  },
  {
    id: 'usr_007',
    referenceId: 'USER-007',
    name: 'Deepa Iyer',
    phone: '+91 98860 77889',
    email: 'deepa.iyer@email.com',
    userType: 'resident',
    role: 'both',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-03-18T11:00:00.000Z',
    kycVerifiedAt: '2024-03-20T10:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 4,
    totalVisits: 3,
    totalDeals: 2,
    totalListings: 1,
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    registeredAt: '2023-08-22T06:00:00.000Z',
    lastLoginAt: '2025-05-29T07:10:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_priya',
  },
  {
    id: 'usr_008',
    referenceId: 'USER-008',
    name: 'Michael Tan',
    phone: '+65 9123 4567',
    email: 'michael.tan@email.com',
    userType: 'nri',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'pending',
    kycDocuments: PENDING_KYC_DOCS,
    kycSubmittedAt: '2025-02-14T06:00:00.000Z',
    kycVerifiedAt: null,
    kycRejectionReason: null,
    totalEnquiries: 1,
    totalVisits: 1,
    totalDeals: 0,
    totalListings: 0,
    city: 'Singapore',
    state: 'Singapore',
    country: 'Singapore',
    registeredAt: '2024-11-05T04:00:00.000Z',
    lastLoginAt: '2025-05-28T21:00:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: null,
    femaCompliance: {
      status: 'non_compliant',
      checkedBy: 'Arjun Kapoor',
      checkedAt: '2025-03-10T14:00:00.000Z',
      notes: 'Outstanding LRS filing required before purchase.',
    },
  },
  {
    id: 'usr_nri_009',
    referenceId: 'USER-NRI-009',
    name: 'Ahmed Al-Rashid',
    phone: '+971 50 987 6543',
    email: 'ahmed.alrashid@email.com',
    userType: 'nri',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2025-04-01T10:00:00.000Z',
    kycVerifiedAt: '2025-04-03T12:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 1,
    totalVisits: 1,
    totalDeals: 0,
    totalListings: 0,
    city: 'Dubai',
    state: 'Dubai',
    country: 'UAE',
    registeredAt: '2025-02-10T08:00:00.000Z',
    lastLoginAt: '2026-05-28T18:00:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_ahmed',
    femaCompliance: {
      status: 'not_checked',
      checkedBy: null,
      checkedAt: null,
      notes: null,
    },
  },
  {
    id: 'usr_nri_010',
    referenceId: 'USER-NRI-010',
    name: 'Priya Nair NRI',
    phone: '+44 7700 900456',
    email: 'priya.nair.nri@email.co.uk',
    userType: 'nri',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-10-15T09:00:00.000Z',
    kycVerifiedAt: '2024-10-17T11:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 2,
    totalVisits: 1,
    totalDeals: 0,
    totalListings: 0,
    city: 'London',
    state: 'England',
    country: 'UK',
    registeredAt: '2024-08-01T06:00:00.000Z',
    lastLoginAt: '2026-05-27T09:00:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_james',
    femaCompliance: {
      status: 'compliant',
      checkedBy: 'Priya Admin',
      checkedAt: '2025-01-12T10:00:00.000Z',
      notes: 'FEMA compliant — NRE account verified.',
    },
  },
  {
    id: 'usr_009',
    referenceId: 'USER-009',
    name: 'Suresh Patil',
    phone: '+91 97654 32109',
    email: 'suresh.patil@email.com',
    userType: 'resident',
    role: 'seller',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-04-02T08:00:00.000Z',
    kycVerifiedAt: '2024-04-04T12:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 0,
    totalVisits: 0,
    totalDeals: 0,
    totalListings: 1,
    city: 'Pune',
    state: 'Maharashtra',
    country: 'India',
    registeredAt: '2024-01-18T10:00:00.000Z',
    lastLoginAt: '2025-05-27T13:20:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: null,
  },
  {
    id: 'usr_010',
    referenceId: 'USER-010',
    name: 'Kavya Rao',
    phone: '+91 99001 22334',
    email: 'kavya.rao@email.com',
    userType: 'resident',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2023-07-10T09:00:00.000Z',
    kycVerifiedAt: '2023-07-12T14:00:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 5,
    totalVisits: 4,
    totalDeals: 1,
    totalListings: 0,
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    registeredAt: '2023-06-01T05:00:00.000Z',
    lastLoginAt: '2025-05-29T10:05:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: 'rm_priya',
  },
  {
    id: 'usr_011',
    referenceId: 'USER-011',
    name: 'Ganesh Venkatesh',
    phone: '+91 94440 55667',
    email: 'ganesh.v@email.com',
    userType: 'resident',
    role: 'both',
    profilePhoto: null,
    kycStatus: 'verified',
    kycDocuments: VERIFIED_KYC_DOCS,
    kycSubmittedAt: '2024-02-28T07:00:00.000Z',
    kycVerifiedAt: '2024-03-01T09:30:00.000Z',
    kycRejectionReason: null,
    totalEnquiries: 2,
    totalVisits: 0,
    totalDeals: 1,
    totalListings: 2,
    city: 'Chennai',
    state: 'Tamil Nadu',
    country: 'India',
    registeredAt: '2023-12-10T08:00:00.000Z',
    lastLoginAt: '2025-05-26T15:30:00.000Z',
    isActive: true,
    isBlocked: false,
    blockedReason: null,
    assignedTo: null,
  },
  {
    id: 'usr_012',
    referenceId: 'USER-012',
    name: 'Rohit Kumar',
    phone: '+91 91111 99999',
    email: 'rohit.kumar@spam.test',
    userType: 'resident',
    role: 'buyer',
    profilePhoto: null,
    kycStatus: 'not_submitted',
    kycDocuments: [],
    kycSubmittedAt: null,
    kycVerifiedAt: null,
    kycRejectionReason: null,
    totalEnquiries: 0,
    totalVisits: 0,
    totalDeals: 0,
    totalListings: 0,
    city: 'Bangalore',
    state: 'Karnataka',
    country: 'India',
    registeredAt: '2025-04-01T12:00:00.000Z',
    lastLoginAt: '2025-04-15T08:00:00.000Z',
    isActive: false,
    isBlocked: true,
    blockedReason: 'Spam activity',
    assignedTo: null,
  },
]

export function getKycStatusColor(status: KycStatus): string {
  return KYC_STATUS_COLORS[status]
}

export function getKycStatusLabel(status: KycStatus): string {
  return KYC_STATUS_LABELS[status]
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role]
}

export function getUserTypeBadgeColor(type: UserType): string {
  return USER_TYPE_BADGE_COLORS[type]
}

export function getUserCounts(users: User[]) {
  return {
    all: users.length,
    buyers: users.filter((u) => u.role === 'buyer' || u.role === 'both').length,
    sellers: users.filter((u) => u.role === 'seller' || u.role === 'both').length,
    kyc_pending: users.filter((u) => u.kycStatus === 'pending').length,
    blocked: users.filter((u) => u.isBlocked).length,
  }
}
