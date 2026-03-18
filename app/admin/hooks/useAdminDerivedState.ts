'use client'

import { useMemo } from 'react'
import type {
  Invoice,
  RepairRequest,
  RepairStatus,
  StatusFilter,
} from '../types'
import { ARCHIVE_COLUMNS, BOARD_COLUMNS } from '../utils'

type SortMode = 'newest' | 'oldest' | 'customer' | 'job_number'

function sortJobs(list: RepairRequest[], sortMode: SortMode) {
  const copy = [...list]

  copy.sort((a, b) => {
    if (sortMode === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }

    if (sortMode === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }

    if (sortMode === 'customer') {
      return a.full_name.localeCompare(b.full_name, undefined, {
        sensitivity: 'base',
      })
    }

    const aJob = a.job_number || ''
    const bJob = b.job_number || ''
    return aJob.localeCompare(bJob, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  return copy
}

type Params = {
  jobs: RepairRequest[]
  hiddenJobs: RepairRequest[]
  invoicesByJobId: Record<string, Invoice>
  search: string
  statusFilter: StatusFilter
  archiveSort: SortMode
  hiddenSort: SortMode
}

export default function useAdminDerivedState({
  jobs,
  hiddenJobs,
  invoicesByJobId,
  search,
  statusFilter,
  archiveSort,
  hiddenSort,
}: Params) {
  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === 'all' ? true : job.status === statusFilter

      const haystack = [
        job.job_number || '',
        job.full_name,
        job.phone,
        job.email || '',
        job.brand,
        job.model,
        job.device_type || '',
        job.serial_imei || '',
        job.fault_description,
        job.repair_performed || '',
        job.status,
        job.preferred_contact || '',
        job.internal_notes || '',
        job.quoted_price != null ? String(job.quoted_price) : '',
        invoicesByJobId[job.id]?.invoice_number || '',
        invoicesByJobId[job.id]?.status || '',
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = term ? haystack.includes(term) : true

      return matchesStatus && matchesSearch
    })
  }, [jobs, search, statusFilter, invoicesByJobId])

  const filteredHiddenJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    return hiddenJobs.filter((job) => {
      const haystack = [
        job.job_number || '',
        job.full_name,
        job.phone,
        job.email || '',
        job.brand,
        job.model,
        job.device_type || '',
        job.serial_imei || '',
        job.fault_description,
        job.repair_performed || '',
        job.status,
        job.preferred_contact || '',
        job.internal_notes || '',
        job.quoted_price != null ? String(job.quoted_price) : '',
        invoicesByJobId[job.id]?.invoice_number || '',
        invoicesByJobId[job.id]?.status || '',
      ]
        .join(' ')
        .toLowerCase()

      return term ? haystack.includes(term) : true
    })
  }, [hiddenJobs, search, invoicesByJobId])

  const jobsByStatus = useMemo(() => {
    const allColumnStatuses = [...BOARD_COLUMNS, ...ARCHIVE_COLUMNS]
    return allColumnStatuses.reduce((acc, status) => {
      acc[status] = filteredJobs.filter((job) => job.status === status)
      return acc
    }, {} as Record<RepairStatus, RepairRequest[]>)
  }, [filteredJobs])

  const sortedArchiveJobsByStatus = useMemo(() => {
    return ARCHIVE_COLUMNS.reduce((acc, status) => {
      acc[status] = sortJobs(jobsByStatus[status] || [], archiveSort)
      return acc
    }, {} as Record<RepairStatus, RepairRequest[]>)
  }, [jobsByStatus, archiveSort])

  const sortedHiddenJobs = useMemo(() => {
    return sortJobs(filteredHiddenJobs, hiddenSort)
  }, [filteredHiddenJobs, hiddenSort])

  const summary = useMemo(() => {
    const totalJobs = filteredJobs.length
    const quotedCount = filteredJobs.filter((j) => j.status === 'quoted').length
    const inProgressCount = filteredJobs.filter((j) => j.status === 'in_progress').length
    const readyCount = filteredJobs.filter((j) => j.status === 'ready').length
    const quotedValue = filteredJobs.reduce((sum, j) => sum + (j.quoted_price ?? 0), 0)
    const invoiceCount = filteredJobs.filter((j) => !!invoicesByJobId[j.id]).length

    return {
      totalJobs,
      quotedCount,
      inProgressCount,
      readyCount,
      quotedValue,
      invoiceCount,
      hiddenCount: filteredHiddenJobs.length,
    }
  }, [filteredJobs, filteredHiddenJobs, invoicesByJobId])

  const archiveJobs = useMemo(
    () => filteredJobs.filter((job) => ARCHIVE_COLUMNS.includes(job.status)),
    [filteredJobs]
  )

  return {
    filteredJobs,
    filteredHiddenJobs,
    jobsByStatus,
    sortedArchiveJobsByStatus,
    sortedHiddenJobs,
    summary,
    archiveJobs,
  }
}