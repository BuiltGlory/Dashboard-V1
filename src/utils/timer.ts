// Utility for 72hr validity timers

export type SeventyTwoHrStatus = 'valid' | 'expiring' | 'expired'

export const get72hrStatus = (
  sentAt: string | null,
): {
  status: SeventyTwoHrStatus
  hoursRemaining: number
  label: string
} => {
  if (!sentAt) {
    return {
      status: 'valid',
      hoursRemaining: 72,
      label: '72 hours',
    }
  }

  const elapsed = (Date.now() - new Date(sentAt).getTime()) / 3600000
  const remaining = 72 - elapsed

  if (remaining <= 0) {
    return {
      status: 'expired',
      hoursRemaining: 0,
      label: 'EXPIRED',
    }
  }
  if (remaining <= 12) {
    return {
      status: 'expiring',
      hoursRemaining: Math.floor(remaining),
      label: `${Math.floor(remaining)}hr remaining`,
    }
  }
  return {
    status: 'valid',
    hoursRemaining: Math.floor(remaining),
    label: `${Math.floor(remaining)}hr remaining`,
  }
}

export const get4hrStatus = (submittedAt: string) => {
  const elapsed = (Date.now() - new Date(submittedAt).getTime()) / 3600000
  const remaining = 4 - elapsed

  if (remaining <= 0) {
    return {
      status: 'breached' as const,
      label: `OVERDUE ${Math.abs(Math.floor(remaining))}hrs ago`,
    }
  }
  if (remaining <= 1) {
    return {
      status: 'warning' as const,
      label: `${Math.floor(remaining * 60)}min remaining`,
    }
  }
  return {
    status: 'ok' as const,
    label: `${Math.floor(remaining)}hr remaining`,
  }
}

export const get24hrStatus = (submittedAt: string) => {
  const elapsed = (Date.now() - new Date(submittedAt).getTime()) / 3600000
  const remaining = 24 - elapsed

  if (remaining <= 0) {
    return {
      status: 'breached' as const,
      label: `OVERDUE ${Math.abs(Math.floor(remaining))}hrs ago`,
    }
  }
  if (remaining <= 4) {
    return {
      status: 'warning' as const,
      label: `${Math.floor(remaining)}hr remaining`,
    }
  }
  return {
    status: 'ok' as const,
    label: `${Math.floor(remaining)}hr remaining`,
  }
}

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}
