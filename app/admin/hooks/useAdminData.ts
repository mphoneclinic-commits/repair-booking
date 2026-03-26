'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Invoice, InvoiceItem, RepairRequest } from '../types'
import { normalizeMoneyValue } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function useAdminData() {
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [hiddenJobs, setHiddenJobs] = useState<RepairRequest[]>([])
  const [invoicesByJobId, setInvoicesByJobId] = useState<Record<string, Invoice>>({})
  const [invoiceItemsByInvoiceId, setInvoiceItemsByInvoiceId] = useState<
    Record<string, InvoiceItem[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

const normalizeJob = useCallback((raw: RepairRequest): RepairRequest => {
  return {
    ...raw,
    internal_notes: raw.internal_notes ?? '',
customer_id: raw.customer_id ?? null,
    quoted_price: normalizeMoneyValue(raw.quoted_price),
    parts_cost: normalizeMoneyValue(raw.parts_cost),
    serial_imei: raw.serial_imei ?? null,
    is_hidden: Boolean(raw.is_hidden),
    fault_photo_url: raw.fault_photo_url ?? null,
    repair_performed: raw.repair_performed ?? '',
    last_sms_sent_at: raw.last_sms_sent_at ?? null,
    last_sms_to: raw.last_sms_to ?? null,
    last_sms_message: raw.last_sms_message ?? null,
  }
}, [])

  const normalizeInvoice = useCallback((raw: Invoice): Invoice => {
    return {
      ...raw,
      tax_rate: Number(raw.tax_rate ?? 0),
      subtotal_ex_tax: Number(raw.subtotal_ex_tax ?? 0),
      tax_amount: Number(raw.tax_amount ?? 0),
      subtotal: Number(raw.subtotal ?? 0),
      total: Number(raw.total ?? 0),
      customer_visible_notes: raw.customer_visible_notes ?? null,
      internal_reference_notes: raw.internal_reference_notes ?? null,
      last_sms_sent_at: raw.last_sms_sent_at ?? null,
      last_sms_to: raw.last_sms_to ?? null,
      last_sms_message: raw.last_sms_message ?? null,
    }
  }, [])

  const normalizeInvoiceItem = useCallback((raw: InvoiceItem): InvoiceItem => {
    return {
      ...raw,
      qty: Number(raw.qty ?? 0),
      unit_price: Number(raw.unit_price ?? 0),
      line_total: Number(raw.line_total ?? 0),
      sort_order: Number(raw.sort_order ?? 0),
    }
  }, [])

  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('repair_requests')
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
      .order('created_at', { ascending: false })

    if (error) throw error

    const allJobs = ((data || []) as RepairRequest[]).map(normalizeJob)

    setJobs(allJobs.filter((job) => !job.is_hidden))
    setHiddenJobs(allJobs.filter((job) => job.is_hidden))
  }, [normalizeJob])

  const loadInvoices = useCallback(async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
	customer_id,
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
        last_sms_sent_at,
        last_sms_to,
        last_sms_message,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    const latestByJob: Record<string, Invoice> = {}

    for (const raw of (data || []) as Invoice[]) {
      if (!latestByJob[raw.repair_request_id]) {
        latestByJob[raw.repair_request_id] = normalizeInvoice(raw)
      }
    }

    setInvoicesByJobId(latestByJob)
  }, [normalizeInvoice])

  const loadInvoiceItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('invoice_items')
      .select(`
        id,
        invoice_id,
        description,
  serial_imei,
        qty,
        unit_price,
        line_total,
        sort_order,
        created_at
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    const grouped: Record<string, InvoiceItem[]> = {}

    for (const item of (data || []) as InvoiceItem[]) {
      const invoiceId = item.invoice_id
      if (!grouped[invoiceId]) grouped[invoiceId] = []
      grouped[invoiceId].push(normalizeInvoiceItem(item))
    }

    setInvoiceItemsByInvoiceId(grouped)
  }, [normalizeInvoiceItem])

  const refreshInvoiceById = useCallback(
    async (invoiceId: string) => {
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
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
          last_sms_sent_at,
          last_sms_to,
          last_sms_message,
          created_at,
          updated_at
        `)
        .eq('id', invoiceId)
        .single()

      if (invoiceError || !invoiceData) {
        throw invoiceError || new Error('Failed to refresh invoice')
      }

      const normalizedInvoice = normalizeInvoice(invoiceData as Invoice)

      const { data: itemsData, error: itemsError } = await supabase
        .from('invoice_items')
        .select(`
          id,
          invoice_id,
          description,
          qty,
          unit_price,
          line_total,
          sort_order,
          created_at
        `)
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (itemsError) throw itemsError

      const normalizedItems = ((itemsData || []) as InvoiceItem[]).map(normalizeInvoiceItem)

      setInvoicesByJobId((prev) => ({
        ...prev,
        [normalizedInvoice.repair_request_id]: normalizedInvoice,
      }))

      setInvoiceItemsByInvoiceId((prev) => ({
        ...prev,
        [invoiceId]: normalizedItems,
      }))
    },
    [normalizeInvoice, normalizeInvoiceItem]
  )

  const loadAllData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadJobs(), loadInvoices(), loadInvoiceItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [loadJobs, loadInvoices, loadInvoiceItems])

  return {
    supabase,
    jobs,
    setJobs,
    hiddenJobs,
    setHiddenJobs,
    invoicesByJobId,
    setInvoicesByJobId,
    invoiceItemsByInvoiceId,
    setInvoiceItemsByInvoiceId,
    loading,
    setLoading,
    error,
    setError,
    normalizeJob,
    normalizeInvoice,
    normalizeInvoiceItem,
    loadJobs,
    loadInvoices,
    loadInvoiceItems,
    refreshInvoiceById,
    loadAllData,
  }
}