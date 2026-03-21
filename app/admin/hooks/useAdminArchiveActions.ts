'use client'

import type { Dispatch, SetStateAction } from 'react'
import type { Invoice, InvoiceItem, RepairRequest, RepairStatus } from '../types'

type Params = {
  supabase: any
  jobs: RepairRequest[]
  hiddenJobs: RepairRequest[]
  invoicesByJobId: Record<string, Invoice>
  invoiceItemsByInvoiceId: Record<string, InvoiceItem[]>
  highlightedJobId: string | null
  selectedArchiveJobIds: string[]
  selectedHiddenJobIds: string[]
  setJobs: Dispatch<SetStateAction<RepairRequest[]>>
  setHiddenJobs: Dispatch<SetStateAction<RepairRequest[]>>
  setInvoicesByJobId: Dispatch<SetStateAction<Record<string, Invoice>>>
  setInvoiceItemsByInvoiceId: Dispatch<SetStateAction<Record<string, InvoiceItem[]>>>
  setHighlightedJobId: Dispatch<SetStateAction<string | null>>
  setSelectedArchiveJobIds: Dispatch<SetStateAction<string[]>>
  setSelectedHiddenJobIds: Dispatch<SetStateAction<string[]>>
  setBulkBusy: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string>>
  normalizeJob: (raw: RepairRequest) => RepairRequest
  loadJobs: () => Promise<void>
  loadInvoices: () => Promise<void>
  loadInvoiceItems: () => Promise<void>
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
  loadJobs,
  loadInvoices,
  loadInvoiceItems,
}: Params) {
  async function refreshAllAdminData() {
    await loadJobs()
    await loadInvoices()
    await loadInvoiceItems()
  }

  async function safeDeleteInvoiceRepairLinks(invoiceIds: string[]) {
    if (invoiceIds.length === 0) return

    const { error } = await supabase
      .from('invoice_repair_links')
      .delete()
      .in('invoice_id', invoiceIds)

    if (error) {
      const message = String(error.message || '').toLowerCase()
      if (
        !message.includes('relation') &&
        !message.includes('does not exist') &&
        !message.includes('schema cache')
      ) {
        throw error
      }
    }
  }

  async function safeDeleteRepairRequestPhotos(jobIds: string[]) {
    if (jobIds.length === 0) return

    const { data: photos, error: photosError } = await supabase
      .from('repair_request_photos')
      .select('id, storage_path')
      .in('repair_request_id', jobIds)

    if (photosError) throw photosError

    const storagePaths = ((photos || []) as Array<{ storage_path?: string | null }>)
      .map((photo) => photo.storage_path)
      .filter(Boolean) as string[]

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('fault-photos')
        .remove(storagePaths)

      if (storageError) throw storageError
    }

    const { error: deletePhotosError } = await supabase
      .from('repair_request_photos')
      .delete()
      .in('repair_request_id', jobIds)

    if (deletePhotosError) throw deletePhotosError
  }

  async function hideJob(jobId: string) {
    setError('')

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .eq('id', jobId)
      .select(`
        id,
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
      setError(error?.message || 'Failed to hide job')
      return
    }

    const normalized = normalizeJob(data as RepairRequest)

    setJobs((prev) => prev.filter((job) => job.id !== jobId))
    setHiddenJobs((prev) => {
      const withoutExisting = prev.filter((job) => job.id !== jobId)
      return [normalized, ...withoutExisting]
    })
  }

  async function unhideJob(jobId: string) {
    setError('')

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .eq('id', jobId)
      .select(`
        id,
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
      setError(error?.message || 'Failed to unhide job')
      return
    }

    const normalized = normalizeJob(data as RepairRequest)

    setHiddenJobs((prev) => prev.filter((job) => job.id !== jobId))
    setJobs((prev) => {
      const withoutExisting = prev.filter((job) => job.id !== jobId)
      return [normalized, ...withoutExisting]
    })
  }

  async function bulkHideArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('repair_requests')
        .update({ is_hidden: true })
        .in('id', selectedArchiveJobIds)
        .select(`
          id,
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

      if (error) throw error

      const normalized = ((data || []) as RepairRequest[]).map(normalizeJob)
      const selectedSet = new Set(selectedArchiveJobIds)

      setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setHiddenJobs((prev) => {
        const kept = prev.filter((job) => !selectedSet.has(job.id))
        return [...normalized, ...kept]
      })
      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to hide selected jobs')
      console.error('bulkHideArchiveJobs failed:', err)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkUnhideHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('repair_requests')
        .update({ is_hidden: false })
        .in('id', selectedHiddenJobIds)
        .select(`
          id,
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

      if (error) throw error

      const normalized = ((data || []) as RepairRequest[]).map(normalizeJob)
      const selectedSet = new Set(selectedHiddenJobIds)

      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setJobs((prev) => {
        const kept = prev.filter((job) => !selectedSet.has(job.id))
        return [...normalized, ...kept]
      })
      setSelectedHiddenJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unhide selected jobs')
      console.error('bulkUnhideHiddenJobs failed:', err)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkUpdateArchiveStatus(nextStatus: RepairStatus) {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const { data, error } = await supabase
        .from('repair_requests')
        .update({ status: nextStatus })
        .in('id', selectedArchiveJobIds)
        .select(`
          id,
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

      if (error) throw error

      const normalized = ((data || []) as RepairRequest[]).map(normalizeJob)
      const normalizedById = new Map(normalized.map((job) => [job.id, job]))
      const selectedSet = new Set(selectedArchiveJobIds)

      setJobs((prev) =>
        prev.map((job) => (selectedSet.has(job.id) ? normalizedById.get(job.id) || job : job))
      )

      setHiddenJobs((prev) =>
        prev.map((job) => (selectedSet.has(job.id) ? normalizedById.get(job.id) || job : job))
      )

      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update selected jobs')
      console.error('bulkUpdateArchiveStatus failed:', err)
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDuplicateArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    try {
      const sourceJobs = jobs.filter((job) => selectedArchiveJobIds.includes(job.id))
      if (sourceJobs.length === 0) return

      const insertRows = sourceJobs.map((job) => ({
        job_number: null,
        full_name: job.full_name,
        phone: job.phone,
        email: job.email,
        brand: job.brand,
        model: job.model,
        device_type: job.device_type,
        serial_imei: job.serial_imei,
        fault_description: job.fault_description,
        repair_performed: job.repair_performed,
        status: 'new',
        preferred_contact: job.preferred_contact,
        internal_notes: job.internal_notes,
        quoted_price: job.quoted_price,
        parts_cost: job.parts_cost,
        is_hidden: false,
        fault_photo_url: job.fault_photo_url ?? null,
      }))

      const { data, error } = await supabase
        .from('repair_requests')
        .insert(insertRows)
        .select(`
          id,
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

      if (error) throw error

      const normalized = ((data || []) as RepairRequest[]).map(normalizeJob)
      setJobs((prev) => [...normalized, ...prev])
      setSelectedArchiveJobIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate selected jobs')
      console.error('bulkDuplicateArchiveJobs failed:', err)
    } finally {
      setBulkBusy(false)
    }
  }

  async function deleteJobsCore(idsToDelete: string[]) {
    if (idsToDelete.length === 0) {
      throw new Error('No jobs selected for deletion')
    }

    console.log('Deleting jobs:', idsToDelete)

    const { data: directInvoices, error: directInvoicesError } = await supabase
      .from('invoices')
      .select('id, repair_request_id')
      .in('repair_request_id', idsToDelete)

    if (directInvoicesError) throw directInvoicesError

    const { data: linkedRows, error: linkedRowsError } = await supabase
      .from('invoice_repair_links')
      .select('invoice_id, repair_request_id')
      .in('repair_request_id', idsToDelete)

    if (linkedRowsError) throw linkedRowsError

    const affectedInvoiceIds = Array.from(
      new Set([
        ...((directInvoices || []) as Array<{ id: string }>).map((row) => row.id),
        ...((linkedRows || []) as Array<{ invoice_id: string }>).map((row) => row.invoice_id),
      ])
    )

    await safeDeleteRepairRequestPhotos(idsToDelete)

    for (const invoiceId of affectedInvoiceIds) {
      const { error: deleteSelectedLinksError } = await supabase
        .from('invoice_repair_links')
        .delete()
        .eq('invoice_id', invoiceId)
        .in('repair_request_id', idsToDelete)

      if (deleteSelectedLinksError) {
        const msg = String(deleteSelectedLinksError.message || '').toLowerCase()
        if (
          !msg.includes('relation') &&
          !msg.includes('does not exist') &&
          !msg.includes('schema cache')
        ) {
          throw deleteSelectedLinksError
        }
      }

      const { data: remainingLinks, error: remainingLinksError } = await supabase
        .from('invoice_repair_links')
        .select('repair_request_id')
        .eq('invoice_id', invoiceId)

      if (remainingLinksError) {
        const msg = String(remainingLinksError.message || '').toLowerCase()
        if (
          !msg.includes('relation') &&
          !msg.includes('does not exist') &&
          !msg.includes('schema cache')
        ) {
          throw remainingLinksError
        }
      }

      const remainingLinkedJobIds = (
        (remainingLinks || []) as Array<{ repair_request_id: string }>
      ).map((row) => row.repair_request_id)

      const { data: invoiceRow, error: invoiceRowError } = await supabase
        .from('invoices')
        .select('id, repair_request_id')
        .eq('id', invoiceId)
        .single()

      if (invoiceRowError) throw invoiceRowError

      const currentPrimaryJobId = String(invoiceRow.repair_request_id || '')
      const primaryStillExists = currentPrimaryJobId && !idsToDelete.includes(currentPrimaryJobId)

      const remainingJobIds = Array.from(
        new Set([
          ...(primaryStillExists ? [currentPrimaryJobId] : []),
          ...remainingLinkedJobIds,
        ])
      )

      if (remainingJobIds.length === 0) {
        const { error: deleteInvoiceItemsError } = await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', invoiceId)

        if (deleteInvoiceItemsError) throw deleteInvoiceItemsError

        await safeDeleteInvoiceRepairLinks([invoiceId])

        const { error: deleteInvoiceError } = await supabase
          .from('invoices')
          .delete()
          .eq('id', invoiceId)

        if (deleteInvoiceError) throw deleteInvoiceError
        continue
      }

      if (!primaryStillExists) {
        const nextPrimaryJobId = remainingJobIds[0]

        const { error: updateInvoicePrimaryError } = await supabase
          .from('invoices')
          .update({ repair_request_id: nextPrimaryJobId })
          .eq('id', invoiceId)

        if (updateInvoicePrimaryError) throw updateInvoicePrimaryError

        const { error: removeDuplicatePrimaryLinkError } = await supabase
          .from('invoice_repair_links')
          .delete()
          .eq('invoice_id', invoiceId)
          .eq('repair_request_id', nextPrimaryJobId)

        if (removeDuplicatePrimaryLinkError) {
          const msg = String(removeDuplicatePrimaryLinkError.message || '').toLowerCase()
          if (
            !msg.includes('relation') &&
            !msg.includes('does not exist') &&
            !msg.includes('schema cache')
          ) {
            throw removeDuplicatePrimaryLinkError
          }
        }
      }
    }

    const { error: deleteJobsError } = await supabase
      .from('repair_requests')
      .delete()
      .in('id', idsToDelete)

    if (deleteJobsError) throw deleteJobsError
  }

  async function deleteJobsByIds(idsToDelete: string[], source: 'archive' | 'hidden') {
    if (idsToDelete.length === 0) {
      setError('No jobs selected for deletion')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${idsToDelete.length} selected job(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    setError('')

    const selectedSet = new Set(idsToDelete)
    const previousJobs = jobs
    const previousHiddenJobs = hiddenJobs
    const previousHighlightedJobId = highlightedJobId
    const previousInvoicesByJobId = invoicesByJobId
    const previousInvoiceItemsByInvoiceId = invoiceItemsByInvoiceId

    try {
      await deleteJobsCore(idsToDelete)
      await refreshAllAdminData()

      setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))

      if (highlightedJobId && selectedSet.has(highlightedJobId)) {
        setHighlightedJobId(null)
      }

      if (source === 'archive') {
        setSelectedArchiveJobIds([])
      } else {
        setSelectedHiddenJobIds([])
      }
    } catch (err) {
      setJobs(previousJobs)
      setHiddenJobs(previousHiddenJobs)
      setHighlightedJobId(previousHighlightedJobId)
      setInvoicesByJobId(previousInvoicesByJobId)
      setInvoiceItemsByInvoiceId(previousInvoiceItemsByInvoiceId)

      if (source === 'archive') {
        setSelectedArchiveJobIds(idsToDelete)
      } else {
        setSelectedHiddenJobIds(idsToDelete)
      }

      const message =
        err instanceof Error ? err.message : 'Failed to delete selected jobs'
      setError(message)
      console.error('deleteJobsByIds failed:', err)
      window.alert(`Delete failed: ${message}`)
    } finally {
      setBulkBusy(false)
    }
  }

  async function deleteSingleJob(jobId: string) {
    await deleteJobsByIds([jobId], 'hidden')
  }

  async function bulkDeleteArchiveJobs() {
    await deleteJobsByIds(selectedArchiveJobIds, 'archive')
  }

  async function bulkDeleteHiddenJobs() {
    await deleteJobsByIds(selectedHiddenJobIds, 'hidden')
  }

  return {
    hideJob,
    unhideJob,
    deleteSingleJob,
    bulkHideArchiveJobs,
    bulkUnhideHiddenJobs,
    bulkUpdateArchiveStatus,
    bulkDuplicateArchiveJobs,
    bulkDeleteArchiveJobs,
    bulkDeleteHiddenJobs,
  }
}