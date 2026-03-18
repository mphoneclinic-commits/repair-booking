'use client'

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
}: Params) {
  async function hideJob(id: string) {
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobToHide = jobs.find((job) => job.id === id)

    if (!jobToHide) return

    setJobs((prev) => prev.filter((job) => job.id !== id))
    setHiddenJobs((prev) => [{ ...jobToHide, is_hidden: true }, ...prev])
    setSelectedArchiveJobIds((prev) => prev.filter((jobId) => jobId !== id))

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .eq('id', id)

    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      return
    }

    if (highlightedJobId === id) {
      setHighlightedJobId(null)
    }
  }

  async function unhideJob(id: string) {
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobToUnhide = hiddenJobs.find((job) => job.id === id)

    if (!jobToUnhide) return

    setHiddenJobs((prev) => prev.filter((job) => job.id !== id))
    setJobs((prev) => [{ ...jobToUnhide, is_hidden: false }, ...prev])
    setSelectedHiddenJobIds((prev) => prev.filter((jobId) => jobId !== id))

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .eq('id', id)

    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      return
    }

    setHighlightedJobId(id)
  }

  async function bulkHideArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    const selectedSet = new Set(selectedArchiveJobIds)
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobsToHide = jobs.filter((job) => selectedSet.has(job.id))

    setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
    setHiddenJobs((prev) => [
      ...jobsToHide.map((job) => ({ ...job, is_hidden: true })),
      ...prev,
    ])

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .in('id', selectedArchiveJobIds)

    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      setBulkBusy(false)
      return
    }

    if (highlightedJobId && selectedSet.has(highlightedJobId)) {
      setHighlightedJobId(null)
    }

    setSelectedArchiveJobIds([])
    setBulkBusy(false)
  }

  async function bulkUnhideHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    const selectedSet = new Set(selectedHiddenJobIds)
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobsToUnhide = hiddenJobs.filter((job) => selectedSet.has(job.id))

    setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
    setJobs((prev) => [
      ...jobsToUnhide.map((job) => ({ ...job, is_hidden: false })),
      ...prev,
    ])

    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .in('id', selectedHiddenJobIds)

    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      setBulkBusy(false)
      return
    }

    setSelectedHiddenJobIds([])
    setBulkBusy(false)
  }

  async function bulkUpdateArchiveStatus(targetStatus: RepairStatus) {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    const selectedSet = new Set(selectedArchiveJobIds)
    const previousJobs = jobs

    setJobs((prev) =>
      prev.map((job) =>
        selectedSet.has(job.id) ? { ...job, status: targetStatus } : job
      )
    )

    const { error } = await supabase
      .from('repair_requests')
      .update({ status: targetStatus })
      .in('id', selectedArchiveJobIds)

    if (error) {
      setJobs(previousJobs)
      setError(error.message)
      setBulkBusy(false)
      return
    }

    setSelectedArchiveJobIds([])
    setBulkBusy(false)
  }

  async function bulkDuplicateArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    setBulkBusy(true)
    setError('')

    const selectedJobs = jobs.filter((job) => selectedArchiveJobIds.includes(job.id))

    const inserts = selectedJobs.map((job) => ({
      job_number: null,
      full_name: job.full_name,
      phone: job.phone,
      email: job.email,
      brand: job.brand,
      model: job.model,
      device_type: job.device_type,
      serial_imei: job.serial_imei,
      fault_description: job.fault_description,
      repair_performed: job.repair_performed ?? '',
      status: 'new' as RepairStatus,
      preferred_contact: job.preferred_contact,
      internal_notes: job.internal_notes,
      quoted_price: job.quoted_price,
      is_hidden: false,
      fault_photo_url: job.fault_photo_url ?? null,
    }))

    const { data, error } = await supabase
      .from('repair_requests')
      .insert(inserts)
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
        is_hidden,
        fault_photo_url
      `)

    if (error) {
      setError(error.message)
      setBulkBusy(false)
      return
    }

    const newJobs = ((data || []) as RepairRequest[]).map(normalizeJob)

    setJobs((prev) => [...newJobs, ...prev])
    setSelectedArchiveJobIds([])
    if (newJobs[0]) setHighlightedJobId(newJobs[0].id)
    setBulkBusy(false)
  }

  async function bulkDeleteArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedArchiveJobIds.length} selected jobs? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    setError('')

    const idsToDelete = [...selectedArchiveJobIds]
    const selectedSet = new Set(idsToDelete)

    const previousJobs = jobs
    const previousHiddenJobs = hiddenJobs
    const previousHighlightedJobId = highlightedJobId
    const previousInvoicesByJobId = invoicesByJobId
    const previousInvoiceItemsByInvoiceId = invoiceItemsByInvoiceId

    try {
      const { data: linkedInvoices, error: linkedInvoicesError } = await supabase
        .from('invoices')
        .select('id, repair_request_id')
        .in('repair_request_id', idsToDelete)

      if (linkedInvoicesError) throw linkedInvoicesError

      const invoiceIds = (linkedInvoices || []).map((invoice: { id: string }) => invoice.id)

      if (invoiceIds.length > 0) {
        const { error: deleteInvoiceItemsError } = await supabase
          .from('invoice_items')
          .delete()
          .in('invoice_id', invoiceIds)
        if (deleteInvoiceItemsError) throw deleteInvoiceItemsError

        const { error: deleteInvoiceLinksError } = await supabase
          .from('invoice_repair_links')
          .delete()
          .in('invoice_id', invoiceIds)
        if (deleteInvoiceLinksError) throw deleteInvoiceLinksError

        const { error: deleteInvoicesError } = await supabase
          .from('invoices')
          .delete()
          .in('id', invoiceIds)
        if (deleteInvoicesError) throw deleteInvoicesError
      }

      const { error: deletePhotosError } = await supabase
        .from('repair_request_photos')
        .delete()
        .in('repair_request_id', idsToDelete)
      if (deletePhotosError) throw deletePhotosError

      const { error: deleteJobsError } = await supabase
        .from('repair_requests')
        .delete()
        .in('id', idsToDelete)
      if (deleteJobsError) throw deleteJobsError

      setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setSelectedArchiveJobIds([])

      if (highlightedJobId && selectedSet.has(highlightedJobId)) {
        setHighlightedJobId(null)
      }

      setInvoicesByJobId((prev) => {
        const next = { ...prev }
        for (const jobId of idsToDelete) delete next[jobId]
        return next
      })

      setInvoiceItemsByInvoiceId((prev) => {
        if (invoiceIds.length === 0) return prev
        const next = { ...prev }
        for (const invoiceId of invoiceIds) delete next[invoiceId]
        return next
      })
    } catch (err) {
      setJobs(previousJobs)
      setHiddenJobs(previousHiddenJobs)
      setHighlightedJobId(previousHighlightedJobId)
      setInvoicesByJobId(previousInvoicesByJobId)
      setInvoiceItemsByInvoiceId(previousInvoiceItemsByInvoiceId)
      setSelectedArchiveJobIds(idsToDelete)
      setError(err instanceof Error ? err.message : 'Failed to delete selected archive jobs')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkDeleteHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedHiddenJobIds.length} selected jobs? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkBusy(true)
    setError('')

    const idsToDelete = [...selectedHiddenJobIds]
    const selectedSet = new Set(idsToDelete)

    const previousJobs = jobs
    const previousHiddenJobs = hiddenJobs
    const previousHighlightedJobId = highlightedJobId
    const previousInvoicesByJobId = invoicesByJobId
    const previousInvoiceItemsByInvoiceId = invoiceItemsByInvoiceId

    try {
      const { data: linkedInvoices, error: linkedInvoicesError } = await supabase
        .from('invoices')
        .select('id, repair_request_id')
        .in('repair_request_id', idsToDelete)

      if (linkedInvoicesError) throw linkedInvoicesError

      const invoiceIds = (linkedInvoices || []).map((invoice: { id: string }) => invoice.id)

      if (invoiceIds.length > 0) {
        const { error: deleteInvoiceItemsError } = await supabase
          .from('invoice_items')
          .delete()
          .in('invoice_id', invoiceIds)
        if (deleteInvoiceItemsError) throw deleteInvoiceItemsError

        const { error: deleteInvoiceLinksError } = await supabase
          .from('invoice_repair_links')
          .delete()
          .in('invoice_id', invoiceIds)
        if (deleteInvoiceLinksError) throw deleteInvoiceLinksError

        const { error: deleteInvoicesError } = await supabase
          .from('invoices')
          .delete()
          .in('id', invoiceIds)
        if (deleteInvoicesError) throw deleteInvoicesError
      }

      const { error: deletePhotosError } = await supabase
        .from('repair_request_photos')
        .delete()
        .in('repair_request_id', idsToDelete)
      if (deletePhotosError) throw deletePhotosError

      const { error: deleteJobsError } = await supabase
        .from('repair_requests')
        .delete()
        .in('id', idsToDelete)
      if (deleteJobsError) throw deleteJobsError

      setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
      setSelectedHiddenJobIds([])

      if (highlightedJobId && selectedSet.has(highlightedJobId)) {
        setHighlightedJobId(null)
      }

      setInvoicesByJobId((prev) => {
        const next = { ...prev }
        for (const jobId of idsToDelete) delete next[jobId]
        return next
      })

      setInvoiceItemsByInvoiceId((prev) => {
        if (invoiceIds.length === 0) return prev
        const next = { ...prev }
        for (const invoiceId of invoiceIds) delete next[invoiceId]
        return next
      })
    } catch (err) {
      setJobs(previousJobs)
      setHiddenJobs(previousHiddenJobs)
      setHighlightedJobId(previousHighlightedJobId)
      setInvoicesByJobId(previousInvoicesByJobId)
      setInvoiceItemsByInvoiceId(previousInvoiceItemsByInvoiceId)
      setSelectedHiddenJobIds(idsToDelete)
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