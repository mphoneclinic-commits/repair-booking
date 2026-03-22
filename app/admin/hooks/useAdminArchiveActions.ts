'use client'

import { useEffect } from 'react'
import useDeleteRepairRequests from './useDeleteRepairRequests'
import type { Invoice, InvoiceItem, RepairRequest, RepairStatus } from '../types'

type Props = {
  supabase: any
  jobs: RepairRequest[]
  hiddenJobs: RepairRequest[]
  invoicesByJobId: Record<string, Invoice>
  invoiceItemsByInvoiceId: Record<string, InvoiceItem[]>
  highlightedJobId: string | null
  selectedArchiveJobIds: string[]
  selectedHiddenJobIds: string[]
  setJobs: React.Dispatch<React.SetStateAction<RepairRequest[]>>
  setHiddenJobs: React.Dispatch<React.SetStateAction<RepairRequest[]>>
  setInvoicesByJobId: React.Dispatch<React.SetStateAction<Record<string, Invoice>>>
  setInvoiceItemsByInvoiceId: React.Dispatch<
    React.SetStateAction<Record<string, InvoiceItem[]>>
  >
  setHighlightedJobId: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedArchiveJobIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedHiddenJobIds: React.Dispatch<React.SetStateAction<string[]>>
  setBulkBusy: React.Dispatch<React.SetStateAction<boolean>>
  setError: React.Dispatch<React.SetStateAction<string>>
  normalizeJob: (raw: RepairRequest) => RepairRequest
}

export default function useAdminArchiveActions({
  supabase,
  jobs,
  hiddenJobs,
  invoicesByJobId,
  invoiceItemsByInvoiceId,
  highlightedJobId,
  selectedArchiveJobIds,
  selectedHiddenJobIds,
  setJobs,
  setHiddenJobs,
  setInvoicesByJobId,
  setInvoiceItemsByInvoiceId,
  setHighlightedJobId,
  setSelectedArchiveJobIds,
  setSelectedHiddenJobIds,
  setBulkBusy,
  setError,
  normalizeJob,
}: Props) {
  const { deleteBulk, deleting, deleteError } = useDeleteRepairRequests()

  useEffect(() => {
    if (deleteError) {
      setError(deleteError)
    }
  }, [deleteError, setError])

  useEffect(() => {
    setBulkBusy(deleting)
  }, [deleting, setBulkBusy])

  function removeJobsFromLocalState(jobIds: string[]) {
    const removedInvoiceIds = jobIds
      .map((jobId) => invoicesByJobId[jobId]?.id)
      .filter((id): id is string => Boolean(id))

    setJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)))
    setHiddenJobs((prev) => prev.filter((job) => !jobIds.includes(job.id)))

    setInvoicesByJobId((prev) => {
      const next = { ...prev }
      for (const jobId of jobIds) {
        delete next[jobId]
      }
      return next
    })

    setInvoiceItemsByInvoiceId((prev) => {
      const next = { ...prev }
      for (const invoiceId of removedInvoiceIds) {
        delete next[invoiceId]
      }
      return next
    })

    setSelectedArchiveJobIds((prev) => prev.filter((id) => !jobIds.includes(id)))
    setSelectedHiddenJobIds((prev) => prev.filter((id) => !jobIds.includes(id)))

    if (highlightedJobId && jobIds.includes(highlightedJobId)) {
      setHighlightedJobId(null)
    }
  }

  async function hideJob(jobId: string) {
    setError('')

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .eq('id', jobId)

    if (error) {
      setError(error.message || 'Failed to hide job')
      return
    }

    const sourceJob =
      jobs.find((job) => job.id === jobId) || hiddenJobs.find((job) => job.id === jobId)

    if (!sourceJob) return

    const updatedJob = { ...sourceJob, is_hidden: true }

    setJobs((prev) => prev.filter((job) => job.id !== jobId))
    setHiddenJobs((prev) => {
      const withoutOld = prev.filter((job) => job.id !== jobId)
      return [updatedJob, ...withoutOld]
    })
  }

  async function unhideJob(jobId: string) {
    setError('')

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .eq('id', jobId)

    if (error) {
      setError(error.message || 'Failed to unhide job')
      return
    }

    const sourceJob =
      hiddenJobs.find((job) => job.id === jobId) || jobs.find((job) => job.id === jobId)

    if (!sourceJob) return

    const updatedJob = { ...sourceJob, is_hidden: false }

    setHiddenJobs((prev) => prev.filter((job) => job.id !== jobId))
    setJobs((prev) => {
      const withoutOld = prev.filter((job) => job.id !== jobId)
      return [updatedJob, ...withoutOld]
    })
  }

  async function bulkHideArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { error } = await supabase
        .from('repair_requests')
        .update({ is_hidden: true })
        .in('id', selectedArchiveJobIds)

      if (error) throw error

      const selectedSet = new Set(selectedArchiveJobIds)
      const movedJobs = jobs
        .filter((job) => selectedSet.has(job.id))
        .map((job) => ({ ...job, is_hidden: true }))

      setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setHiddenJobs((prev) => [...movedJobs, ...prev.filter((job) => !selectedSet.has(job.id))])
      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hide selected jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkUnhideHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { error } = await supabase
        .from('repair_requests')
        .update({ is_hidden: false })
        .in('id', selectedHiddenJobIds)

      if (error) throw error

      const selectedSet = new Set(selectedHiddenJobIds)
      const movedJobs = hiddenJobs
        .filter((job) => selectedSet.has(job.id))
        .map((job) => ({ ...job, is_hidden: false }))

      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setJobs((prev) => [...movedJobs, ...prev.filter((job) => !selectedSet.has(job.id))])
      setSelectedHiddenJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unhide selected jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkUpdateArchiveStatus(status: RepairStatus) {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { error } = await supabase
        .from('repair_requests')
        .update({ status, is_hidden: false })
        .in('id', selectedArchiveJobIds)

      if (error) throw error

      const selectedSet = new Set(selectedArchiveJobIds)
      const reopenedJobs = jobs
        .filter((job) => selectedSet.has(job.id))
        .map((job) => ({
          ...job,
          status,
          is_hidden: false,
        }))

      setJobs((prev) => {
        const remaining = prev.filter((job) => !selectedSet.has(job.id))
        return [...reopenedJobs, ...remaining]
      })

      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update selected jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDuplicateArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const selectedJobs = jobs.filter((job) => selectedArchiveJobIds.includes(job.id))
      const insertedJobs: RepairRequest[] = []

      for (const sourceJob of selectedJobs) {
        const { data, error } = await supabase
          .from('repair_requests')
          .insert({
            customer_id: sourceJob.customer_id ?? null,
            job_number: null,
            full_name: sourceJob.full_name,
            phone: sourceJob.phone,
            email: sourceJob.email,
            brand: sourceJob.brand,
            model: sourceJob.model,
            device_type: sourceJob.device_type,
            serial_imei: sourceJob.serial_imei,
            fault_description: sourceJob.fault_description,
            repair_performed: sourceJob.repair_performed,
            status: 'new',
            preferred_contact: sourceJob.preferred_contact,
            internal_notes: sourceJob.internal_notes,
            quoted_price: sourceJob.quoted_price,
            parts_cost: sourceJob.parts_cost,
            is_hidden: false,
            fault_photo_url: sourceJob.fault_photo_url ?? null,
          })
          .select(`
            id,
            customer_id,
            job_number,
            created_at,
            full_name,
            phone,
            email,
            brand,
            model,
            device_type,
            serial_imei,
            fault_description,
            repair_performed,
            status,
            preferred_contact,
            internal_notes,
            quoted_price,
            parts_cost,
            is_hidden,
            fault_photo_url,
            last_sms_sent_at,
            last_sms_to,
            last_sms_message
          `)
          .single()

        if (error || !data) {
          throw error || new Error('Failed to duplicate job')
        }

        insertedJobs.push(normalizeJob(data as RepairRequest))
      }

      setJobs((prev) => [...insertedJobs, ...prev])
      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate selected jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDeleteArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedArchiveJobIds.length} selected archive job(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    setError('')

    try {
      const idsToDelete = [...selectedArchiveJobIds]
      const result = await deleteBulk(idsToDelete)

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete selected archive jobs')
      }

      removeJobsFromLocalState(idsToDelete)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete selected archive jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDeleteHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedHiddenJobIds.length} selected hidden job(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    setError('')

    try {
      const idsToDelete = [...selectedHiddenJobIds]
      const result = await deleteBulk(idsToDelete)

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete selected hidden jobs')
      }

      removeJobsFromLocalState(idsToDelete)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete selected hidden jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  return {
    hideJob,
    unhideJob,
    bulkHideArchiveJobs,
    bulkUnhideHiddenJobs,
    bulkUpdateArchiveStatus,
    bulkDuplicateArchiveJobs,
    bulkDeleteArchiveJobs,
    bulkDeleteHiddenJobs,
  }
}