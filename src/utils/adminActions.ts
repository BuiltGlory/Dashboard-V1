/** Shared admin UI actions: copy, contact, and toast helpers for detail pages. */

export type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
}

/** Binds page-local `setToast` to a `toast.success` / `toast.error` API. */
export function bindToast(setToast: (msg: string | null) => void): ToastApi {
  return {
    success: (message) => setToast(message),
    error: (message) => setToast(message),
  }
}

export async function copyText(value: string, toast: ToastApi): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Copied!')
  } catch {
    toast.error('Copy failed')
  }
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function isValidPhone(phone: string | null | undefined): boolean {
  return !!phone && phoneDigits(phone).length >= 10
}

export function openWhatsApp(phone: string, _name?: string): void {
  if (!isValidPhone(phone)) return
  window.open(`https://wa.me/${phoneDigits(phone)}`, '_blank', 'noopener,noreferrer')
}

export function handleCall(phone: string): void {
  if (!isValidPhone(phone)) return
  window.open(`tel:${phone}`, '_self')
}

export function handleEmail(email: string): void {
  window.open(`mailto:${email}`, '_self')
}

/** Best-effort property route until the backend returns a converted property id for acquisitions. */
export function resolveAcquisitionPropertyPath(acquisition: {
  propertyTitle: string
  sellRequestId: string | null
}): string {
  void acquisition
  return '/admin/properties/all'
}
