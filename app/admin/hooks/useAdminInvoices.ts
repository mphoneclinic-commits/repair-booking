'use client'

import { useState } from 'react'
import type { Invoice, InvoiceItem, InvoiceStatus, RepairRequest } from '../types'

type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

type Params = {
  supabase: any
  invoicesByJobId: Record<string, Invoice>
  setInvoicesByJobId: React.Dispatch<React.SetStateAction<Record<string, Invoice>>>
  invoiceItemsByInvoiceId: Record<string, InvoiceItem[]>
  setInvoiceItemsByInvoiceId: React.Dispatch<
    React.SetStateAction<Record<string, InvoiceItem[]>>
  >
  setJobs: React.Dispatch<React.SetStateAction<RepairRequest[]>>
  setHiddenJobs: React.Dispatch<React.SetStateAction<RepairRequest[]>>
  setHighlightedJobId: React.Dispatch<React.SetStateAction<string | null>>
  setError: React.Dispatch<React.SetStateAction<string>>
  loadInvoices: () => Promise<void>
  loadInvoiceItems: () => Promise<void>
  refreshInvoiceById: (invoiceId: string) => Promise<void>
  normalizeJob: (raw: RepairRequest) => RepairRequest
  normalizeInvoice: (raw: Invoice) => Invoice
}

export default function useAdminInvoices({
  supabase,
  invoicesByJobId,
  setInvoicesByJobId,
  invoiceItemsByInvoiceId,
  setInvoiceItemsByInvoiceId,
  setJobs,
  setHiddenJobs,
  setHighlightedJobId,
  setError,
  loadInvoices,
  loadInvoiceItems,
  refreshInvoiceById,
  normalizeJob,
  normalizeInvoice,
}: Params) {
  const [invoiceActionStates, setInvoiceActionStates] = useState<
    Record<string, InvoiceActionState>
  >({})
  const [invoiceItemsActionStates, setInvoiceItemsActionStates] = useState<
    Record<string, InvoiceItemsActionState>
  >({})

  function setInvoiceActionState(jobId: string, state: InvoiceActionState) {
    setInvoiceActionStates((prev) => ({
      ...prev,
      [jobId]: state,
    }))
  }

  function setInvoiceItemsActionState(invoiceId: string, state: InvoiceItemsActionState) {
    setInvoiceItemsActionStates((prev) => ({
      ...prev,
      [invoiceId]: state,
    }))
  }

async function createInvoiceForJob(job: RepairRequest) {
  setInvoiceActionState(job.id, 'saving')
  setError('')

  const { data: existingInvoice, error: existingInvoiceError } = await supabase
    .from('invoices')
    .select('id, invoice_number, repair_request_id')
    .eq('repair_request_id', job.id)
    .maybeSingle()

  if (existingInvoiceError) {
    setInvoiceActionState(job.id, 'error')
    setError(existingInvoiceError.message || 'Failed to check existing invoice')
    return
  }

  if (existingInvoice) {
    setInvoiceActionState(job.id, 'error')
    setError(
      `Job ${job.job_number || job.id} already has invoice ${existingInvoice.invoice_number}`
    )
    return
  }

  const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc(
    'generate_invoice_number'
  )

  if (invoiceNumberError || !invoiceNumberData) {
    setInvoiceActionState(job.id, 'error')
    setError(invoiceNumberError?.message || 'Failed to generate invoice number')
    return
  }

  const invoiceNumber = String(invoiceNumberData)
  const amount = Number(job.quoted_price ?? 0)
  const defaultDescription = (
    job.repair_performed ||
    job.internal_notes ||
    `Repair service for ${job.brand} ${job.model}`
  ).trim()
  const nowIso = new Date().toISOString()

  const { data: insertedInvoice, error: invoiceInsertError } = await supabase
    .from('invoices')
    .insert({
      repair_request_id: job.id,
      invoice_number: invoiceNumber,
      status: 'issued',
      customer_name: job.full_name,
      customer_phone: job.phone,
      customer_email: job.email,
      tax_mode: 'exclusive',
      tax_rate: 0.1,
      subtotal_ex_tax: amount,
      tax_amount: 0,
      subtotal: amount,
      total: amount,
      notes: job.internal_notes || null,
      issued_at: nowIso,
    })
    .select(`
      id,
      repair_request_id,
      invoice_number,
      status,
      customer_name,
      customer_phone,
      customer_email,
      bill_to_address,
      tax_mode,
      tax_rate,
      subtotal_ex_tax,
      tax_amount,
      subtotal,
      total,
      notes,
      customer_visible_notes,
      internal_reference_notes,
      issued_at,
      paid_at,
      sent_at,
      sent_to_email,
      created_at,
      updated_at
    `)
    .single()

  if (invoiceInsertError || !insertedInvoice) {
    setInvoiceActionState(job.id, 'error')
    setError(invoiceInsertError?.message || 'Failed to create invoice')
    return
  }

  const { error: itemInsertError } = await supabase.from('invoice_items').insert({
    invoice_id: insertedInvoice.id,
    description: defaultDescription || 'Repair service',
    qty: 1,
    unit_price: amount,
    line_total: amount,
    sort_order: 0,
  })

  if (itemInsertError) {
    await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
    setInvoiceActionState(job.id, 'error')
    setError(itemInsertError.message || 'Failed to create invoice item')
    return
  }

  const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
    p_invoice_id: insertedInvoice.id,
  })

  if (recalcError) {
    await supabase.from('invoice_items').delete().eq('invoice_id', insertedInvoice.id)
    await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
    setInvoiceActionState(job.id, 'error')
    setError(recalcError.message || 'Failed to recalculate invoice totals')
    return
  }

  const { data: updatedJob, error: updateJobStatusError } = await supabase
    .from('repair_requests')
    .update({ status: 'ready' })
    .eq('id', job.id)
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
    .single()

  if (updateJobStatusError || !updatedJob) {
    setInvoiceActionState(job.id, 'error')
    setError(updateJobStatusError?.message || 'Invoice created but failed to update job status')
    return
  }

  const normalizedUpdatedJob = normalizeJob(updatedJob as RepairRequest)

  setJobs((prev) =>
    prev.map((existingJob) => (existingJob.id === job.id ? normalizedUpdatedJob : existingJob))
  )
  setHiddenJobs((prev) =>
    prev.map((existingJob) => (existingJob.id === job.id ? normalizedUpdatedJob : existingJob))
  )

  try {
    await refreshInvoiceById(insertedInvoice.id)
    setInvoiceActionState(job.id, 'idle')
    setInvoiceItemsActionState(insertedInvoice.id, 'idle')
    setHighlightedJobId(job.id)
  } catch (err) {
    setInvoiceActionState(job.id, 'error')
    setError(err instanceof Error ? err.message : 'Failed to refresh invoice')
  }
}

  async function updateInvoiceStatusForJob(invoiceId: string, status: InvoiceStatus) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return

    setInvoiceActionState(invoice.repair_request_id, 'saving')
    setError('')

    const nowIso = new Date().toISOString()
    const updates: {
      status: InvoiceStatus
      issued_at?: string | null
      paid_at?: string | null
    } = { status }

    if (status === 'issued') {
      updates.issued_at = invoice.issued_at || nowIso
      updates.paid_at = null
    }

    if (status === 'paid') {
      updates.issued_at = invoice.issued_at || nowIso
      updates.paid_at = nowIso
    }

    if (status === 'void') {
      updates.issued_at = invoice.issued_at || nowIso
      updates.paid_at = null
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select(`
        id,
        repair_request_id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        customer_email,
        bill_to_address,
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        customer_visible_notes,
        internal_reference_notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .single()

    if (error || !data) {
      setInvoiceActionState(invoice.repair_request_id, 'error')
      setError(error?.message || 'Failed to update invoice status')
      return
    }

    setInvoicesByJobId((prev) => ({
      ...prev,
      [invoice.repair_request_id]: normalizeInvoice(data as Invoice),
    }))

    setInvoiceActionState(invoice.repair_request_id, 'idle')
    setHighlightedJobId(invoice.repair_request_id)
  }

  async function addInvoiceItemForInvoice(invoiceId: string) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return

    const currentItems = invoiceItemsByInvoiceId[invoiceId] || []
    setInvoiceItemsActionState(invoiceId, 'saving')

    const nextSortOrder =
      currentItems.length > 0
        ? Math.max(...currentItems.map((item) => item.sort_order)) + 1
        : 0

    const { error } = await supabase.from('invoice_items').insert({
      invoice_id: invoiceId,
      description: '',
      qty: 1,
      unit_price: 0,
      line_total: 0,
      sort_order: nextSortOrder,
    })

    if (error) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }

    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: invoiceId,
    })

    if (recalcError) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }

    try {
      await refreshInvoiceById(invoiceId)
      setInvoiceItemsActionState(invoiceId, 'idle')
      setHighlightedJobId(invoice.repair_request_id)
    } catch {
      setInvoiceItemsActionState(invoiceId, 'error')
    }
  }


async function updateInvoiceItemForInvoice(
  invoiceId: string,
  itemId: string,
  updates: Partial<Pick<InvoiceItem, 'description' | 'qty' | 'unit_price'>>
) {
  const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
  if (!invoice) return

  setInvoiceItemsActionState(invoiceId, 'saving')

  const previousItems = invoiceItemsByInvoiceId[invoiceId] || []
  const previousInvoice = invoicesByJobId[invoice.repair_request_id]

  const safeUpdates = {
    ...(updates.description !== undefined
      ? { description: updates.description.trim() || 'Item' }
      : {}),
    ...(updates.qty !== undefined
      ? { qty: Number.isFinite(updates.qty) ? updates.qty : 0 }
      : {}),
    ...(updates.unit_price !== undefined
      ? { unit_price: Number.isFinite(updates.unit_price) ? updates.unit_price : 0 }
      : {}),
  }

  const optimisticItems = previousItems.map((item) => {
    if (item.id !== itemId) return item

    const nextQty =
      safeUpdates.qty !== undefined ? Number(safeUpdates.qty) : Number(item.qty)

    const nextUnitPrice =
      safeUpdates.unit_price !== undefined
        ? Number(safeUpdates.unit_price)
        : Number(item.unit_price)

    return {
      ...item,
      ...safeUpdates,
      qty: nextQty,
      unit_price: nextUnitPrice,
      line_total: nextQty * nextUnitPrice,
    }
  })

  setInvoiceItemsByInvoiceId((prev) => ({
    ...prev,
    [invoiceId]: optimisticItems,
  }))

  const optimisticSubtotal = optimisticItems.reduce(
    (sum, item) => sum + Number(item.line_total ?? 0),
    0
  )

  setInvoicesByJobId((prev) => ({
    ...prev,
    [invoice.repair_request_id]: {
      ...prev[invoice.repair_request_id],
      subtotal_ex_tax: optimisticSubtotal,
      subtotal: optimisticSubtotal,
      total: optimisticSubtotal,
      tax_amount: 0,
    },
  }))

  const { error } = await supabase
    .from('invoice_items')
    .update(safeUpdates)
    .eq('id', itemId)

  if (error) {
    setInvoiceItemsByInvoiceId((prev) => ({
      ...prev,
      [invoiceId]: previousItems,
    }))

    if (previousInvoice) {
      setInvoicesByJobId((prev) => ({
        ...prev,
        [invoice.repair_request_id]: previousInvoice,
      }))
    }

    setInvoiceItemsActionState(invoiceId, 'error')
    return
  }

  const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
    p_invoice_id: invoiceId,
  })

  if (recalcError) {
    setInvoiceItemsByInvoiceId((prev) => ({
      ...prev,
      [invoiceId]: previousItems,
    }))

    if (previousInvoice) {
      setInvoicesByJobId((prev) => ({
        ...prev,
        [invoice.repair_request_id]: previousInvoice,
      }))
    }

    setInvoiceItemsActionState(invoiceId, 'error')
    return
  }

  try {
    await refreshInvoiceById(invoiceId)
    setInvoiceItemsActionState(invoiceId, 'idle')
    setHighlightedJobId(invoice.repair_request_id)
  } catch {
    setInvoiceItemsActionState(invoiceId, 'error')
  }
}

  async function deleteInvoiceItemForInvoice(invoiceId: string, itemId: string) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return

    setInvoiceItemsActionState(invoiceId, 'saving')

    const { error } = await supabase.from('invoice_items').delete().eq('id', itemId)

    if (error) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }

    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: invoiceId,
    })

    if (recalcError) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }

    try {
      await refreshInvoiceById(invoiceId)
      setInvoiceItemsActionState(invoiceId, 'idle')
      setHighlightedJobId(invoice.repair_request_id)
    } catch {
      setInvoiceItemsActionState(invoiceId, 'error')
    }
  }

  async function removeInvoiceForJob(job: RepairRequest) {
    const existingInvoice = invoicesByJobId[job.id]
    if (!existingInvoice) return

    setInvoiceActionState(job.id, 'saving')
    setError('')

    const { error: deleteItemsError } = await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', existingInvoice.id)

    if (deleteItemsError) {
      setInvoiceActionState(job.id, 'error')
      setError(deleteItemsError.message || 'Failed to delete invoice items')
      return
    }

    const { error: deleteInvoiceError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', existingInvoice.id)

    if (deleteInvoiceError) {
      setInvoiceActionState(job.id, 'error')
      setError(deleteInvoiceError.message || 'Failed to delete invoice')
      return
    }

    const { data: updatedJob, error: reopenJobError } = await supabase
      .from('repair_requests')
      .update({ status: 'ready' })
      .eq('id', job.id)
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
      .single()

    if (reopenJobError || !updatedJob) {
      setInvoiceActionState(job.id, 'error')
      setError(reopenJobError?.message || 'Invoice removed but failed to reopen job')
      return
    }

    const normalizedUpdatedJob = normalizeJob(updatedJob as RepairRequest)

    setInvoicesByJobId((prev) => {
      const next = { ...prev }
      delete next[job.id]
      return next
    })

    setInvoiceItemsByInvoiceId((prev) => {
      const next = { ...prev }
      delete next[existingInvoice.id]
      return next
    })

    setJobs((prev) =>
      prev.map((existingJob) => (existingJob.id === job.id ? normalizedUpdatedJob : existingJob))
    )
    setHiddenJobs((prev) =>
      prev.map((existingJob) => (existingJob.id === job.id ? normalizedUpdatedJob : existingJob))
    )

    await loadInvoices()
    await loadInvoiceItems()

    setInvoiceActionState(job.id, 'idle')
    setHighlightedJobId(job.id)
  }

  return {
    invoiceActionStates,
    invoiceItemsActionStates,
    setInvoiceActionState,
    setInvoiceItemsActionState,
    createInvoiceForJob,
    updateInvoiceStatusForJob,
    addInvoiceItemForInvoice,
    updateInvoiceItemForInvoice,
    deleteInvoiceItemForInvoice,
    removeInvoiceForJob,
  }
}