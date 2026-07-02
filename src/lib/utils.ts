import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL ?? ''
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}
