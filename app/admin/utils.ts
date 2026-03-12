import type { RepairStatus } from './types'

export const STATUSES = [
  'all',
  'new',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'closed',
  'rejected',
  'cancelled',
] as const

export const BOARD_COLUMNS: RepairStatus[] = [
  'new',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'closed',
]

export function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(dateString))
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    all: 'All statuses',
    new: 'New',
    quoted: 'Quoted',
    approved: 'Approved',
    in_progress: 'In Progress',
    completed: 'Ready',
    closed: 'Closed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  }

  return labels[status] || status
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

export function normalizeQuoteInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const firstDotIndex = cleaned.indexOf('.')

  if (firstDotIndex === -1) return cleaned

  const beforeDot = cleaned.slice(0, firstDotIndex + 1)
  const afterDot = cleaned
    .slice(firstDotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2)

  return `${beforeDot}${afterDot}`
}