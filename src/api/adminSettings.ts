import { adminApiRequest } from './admin'

export type AdminSettings = {
  organization: {
    name: string
    tagline: string
    email: string
    phone: string
    address: string
    city: string
    state: string
    pincode: string
  }
  app: {
    maintenance: boolean
    registration: boolean
    kycRequired: boolean
    showPrices: boolean
    virtualTours: boolean
    stagePayment: boolean
    interior: boolean
  }
  sla: {
    interiorHours: number
    stagePaymentHours: number
    enquiryHours: number
    autoEscalate: boolean
    escalateToAdminId: string | null
    escalateToName: string
  }
  alerts: {
    triggers: {
      slaBreached: boolean
      interiorInquiry: boolean
      stagePayment: boolean
      kycReview: boolean
      ticket48: boolean
      dailyEmail: boolean
      weeklyEmail: boolean
    }
    email: string
    whatsapp: string
  }
  notifications: {
    contact: {
      phone: string
      email: string
      ccEmail: string
    }
    email: {
      enquiry: boolean
      sell: boolean
      kyc: boolean
      user: boolean
      stageProof: boolean
      ticket: boolean
      daily: boolean
      weekly: boolean
    }
    whatsapp: {
      enquiry: boolean
      slaBreached: boolean
    }
  }
  display: {
    timezone: string
    dateFormat: string
    currencyFormat: 'indian' | 'international'
  }
  payment: {
    tokenAmount: number
    escrow: {
      accountHolder?: string
      bankName?: string
      accountNumber?: string
      ifsc?: string
      branch?: string
      upiId?: string
      chequePayee?: string
      chequeInstructions?: string[]
    } | null
  }
  tools: {
    boostPlans: Array<{
      id: string
      name: string
      priceLabel: string
      description: string
      benefits: string[]
      active: boolean
    }>
    interiorPackages: Array<{
      id: string
      name: string
      priceRange: string
      timeline: string
      active: boolean
    }>
    coupons: Array<{
      id: string
      code: string
      discount: string
      type: '% discount' | 'Flat discount'
      appliesTo: string
      uses: string
      expiry: string
      active: boolean
    }>
  }
  updatedAt?: string
}

export type AdminSettingsPatch = Partial<{
  organization: Partial<AdminSettings['organization']>
  app: Partial<AdminSettings['app']>
  sla: Partial<AdminSettings['sla']>
  alerts: {
    triggers?: Partial<AdminSettings['alerts']['triggers']>
    email?: string
    whatsapp?: string
  }
  notifications: {
    contact?: Partial<AdminSettings['notifications']['contact']>
    email?: Partial<AdminSettings['notifications']['email']>
    whatsapp?: Partial<AdminSettings['notifications']['whatsapp']>
  }
  display: Partial<AdminSettings['display']>
  payment: {
    tokenAmount?: number
    escrow?: Partial<NonNullable<AdminSettings['payment']['escrow']>> | null
  }
  tools: Partial<AdminSettings['tools']>
}>

export async function getAdminSettings(accessToken: string) {
  return adminApiRequest<AdminSettings>('/admin/settings', { accessToken })
}

export async function updateAdminSettings(accessToken: string, body: AdminSettingsPatch) {
  return adminApiRequest<AdminSettings>('/admin/settings', {
    accessToken,
    method: 'PATCH',
    body: body as Record<string, unknown>,
  })
}
