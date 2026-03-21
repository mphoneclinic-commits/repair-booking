import type { RepairStatus, StatusFilter } from './types'

export const BOARD_COLUMNS: RepairStatus[] = [
  'new',
  'quoted',
  'approved',
  'in_progress',
  'ready',
]

export const ARCHIVE_COLUMNS: RepairStatus[] = ['closed', 'rejected', 'cancelled']

export const STATUSES: StatusFilter[] = [
  'all',
  'new',
  'quoted',
  'approved',
  'in_progress',
  'ready',
  'closed',
  'rejected',
  'cancelled',
]

export function getStatusLabel(status: RepairStatus | StatusFilter): string {
  switch (status) {
    case 'all':
      return 'All statuses'
    case 'new':
      return 'New'
    case 'quoted':
      return 'Quoted'
    case 'approved':
      return 'Approved'
    case 'in_progress':
      return 'In Progress'
    case 'ready':
      return 'Ready'
    case 'closed':
      return 'Closed'
    case 'rejected':
      return 'Rejected'
    case 'cancelled':
      return 'Cancelled'
    default:
      return String(status)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function normalizePhone(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '')
}

export function normalizeQuoteInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')

  const firstDotIndex = cleaned.indexOf('.')
  if (firstDotIndex === -1) return cleaned

  const beforeDot = cleaned.slice(0, firstDotIndex + 1)
  const afterDot = cleaned.slice(firstDotIndex + 1).replace(/\./g, '')

  return `${beforeDot}${afterDot}`
}

export function normalizeMoneyValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[^0-9.-]/g, '')
    if (!cleaned) return null

    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function calculateJobProfit(
  quoted: number | null | undefined,
  cost: number | null | undefined
) {
  const q = Number(quoted ?? 0)
  const c = Number(cost ?? 0)
  return q - c
}