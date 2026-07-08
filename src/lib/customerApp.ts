const DEFAULT_CUSTOMER_APP_ORIGIN = 'https://builtglory.app'

export function getCustomerAppOrigin() {
  const configured = import.meta.env.VITE_CUSTOMER_APP_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/$/, '')
  }
  return DEFAULT_CUSTOMER_APP_ORIGIN
}

export function getCustomerPropertyUrl(propertyId: string) {
  return `${getCustomerAppOrigin()}/p/${propertyId}`
}
