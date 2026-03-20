'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePdf } from '../lib/invoicePdf'
import { BUSINESS_DETAILS, PAYMENT_DETAILS } from '../lib/invoicePdfConfig'
import styles from './invoice.module.css'
import ui from '../sharedAdminUi.module.css'
import type {
  Invoice,
  InvoiceItem,
  InvoiceRepairLink,
  InvoiceStatus,
  RepairRequest,
  SaveState,
} from '../types'
import { formatDateTime } from '../utils'
import SaveIndicator from '../components/SaveIndicator'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)


function formatCurrency(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export default function InvoicePrintPage() {
  const [invoiceId, setInvoiceId] = useState<string>('')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [linkedJobs, setLinkedJobs] = useState<RepairRequest[]>([])

  const [localCustomerNotes, setLocalCustomerNotes] = useState('')
  const [localInternalNotes, setLocalInternalNotes] = useState('')

  const [customerNotesState, setCustomerNotesState] = useState<SaveState>('idle')
  const [internalNotesState, setInternalNotesState] = useState<SaveState>('idle')

  const [sendToEmail, setSendToEmail] = useState('')
  const [sendingInvoiceEmail, setSendingInvoiceEmail] = useState(false)
  const [emailSendError, setEmailSendError] = useState('')
  const [emailSendSuccess, setEmailSendSuccess] = useState('')

  const [sendToPhone, setSendToPhone] = useState('')
  const [smsMessage, setSmsMessage] = useState('')
  const [sendingSms, setSendingSms] = useState(false)
  const [smsSendError, setSmsSendError] = useState('')
  const [smsSendSuccess, setSmsSendSuccess] = useState('')

  const customerNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internalNotesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearCustomerSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearInternalSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const customerNotesFocusedRef = useRef(false)
  const internalNotesFocusedRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setInvoiceId(params.get('id') || '')
  }, [])

  useEffect(() => {
    return () => {
      if (customerNotesTimerRef.current) clearTimeout(customerNotesTimerRef.current)
      if (internalNotesTimerRef.current) clearTimeout(internalNotesTimerRef.current)
      if (clearCustomerSavedTimerRef.current) clearTimeout(clearCustomerSavedTimerRef.current)
      if (clearInternalSavedTimerRef.current) clearTimeout(clearInternalSavedTimerRef.current)
    }
  }, [])

  async function loadInvoicePage(currentInvoiceId: string) {
    if (!currentInvoiceId) {
      setError('Missing invoice ID')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    setSuccessMessage('')
    setEmailSendError('')
    setEmailSendSuccess('')
    setSmsSendError('')
    setSmsSendSuccess('')

    try {
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
        .eq('id', currentInvoiceId)
        .single()

      if (invoiceError || !invoiceData) {
        throw invoiceError || new Error('Invoice not found')
      }

      const normalizedInvoice: Invoice = {
        ...(invoiceData as Invoice),
        tax_rate: Number(invoiceData.tax_rate ?? 0),
        subtotal_ex_tax: Number(invoiceData.subtotal_ex_tax ?? 0),
        tax_amount: Number(invoiceData.tax_amount ?? 0),
        subtotal: Number(invoiceData.subtotal ?? 0),
        total: Number(invoiceData.total ?? 0),
        customer_visible_notes: invoiceData.customer_visible_notes ?? null,
        internal_reference_notes: invoiceData.internal_reference_notes ?? null,
        last_sms_sent_at: invoiceData.last_sms_sent_at ?? null,
        last_sms_to: invoiceData.last_sms_to ?? null,
        last_sms_message: invoiceData.last_sms_message ?? null,
      }

      if (!customerNotesFocusedRef.current) {
        setLocalCustomerNotes(normalizedInvoice.customer_visible_notes || '')
      }

      if (!internalNotesFocusedRef.current) {
        setLocalInternalNotes(normalizedInvoice.internal_reference_notes || '')
      }

      const { data: itemData, error: itemError } = await supabase
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
        .eq('invoice_id', currentInvoiceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (itemError) throw itemError

      const normalizedItems = ((itemData || []) as InvoiceItem[]).map((item) => ({
        ...item,
        qty: Number(item.qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        sort_order: Number(item.sort_order ?? 0),
      }))

      const { data: linkData, error: linkError } = await supabase
        .from('invoice_repair_links')
        .select(`
          id,
          invoice_id,
          repair_request_id,
          created_at
        `)
        .eq('invoice_id', currentInvoiceId)

      if (linkError) throw linkError

      const links = (linkData || []) as InvoiceRepairLink[]
      const linkedJobIds =
        links.length > 0
          ? links.map((link) => link.repair_request_id)
          : [normalizedInvoice.repair_request_id]

      const { data: jobsData, error: jobsError } = await supabase
        .from('repair_requests')
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
          status,
          preferred_contact,
          internal_notes,
          quoted_price,
          is_hidden,
          fault_photo_url,
          repair_performed,
          last_sms_sent_at,
          last_sms_to,
          last_sms_message
        `)
        .in('id', linkedJobIds)

      if (jobsError) throw jobsError

      const normalizedJobs = ((jobsData || []) as RepairRequest[]).map((job) => ({
        ...job,
        internal_notes: job.internal_notes ?? '',
        quoted_price: job.quoted_price ?? null,
        serial_imei: job.serial_imei ?? null,
        is_hidden: Boolean(job.is_hidden),
        fault_photo_url: job.fault_photo_url ?? null,
        repair_performed: job.repair_performed ?? '',
        last_sms_sent_at: job.last_sms_sent_at ?? null,
        last_sms_to: job.last_sms_to ?? null,
        last_sms_message: job.last_sms_message ?? null,
      }))

      normalizedJobs.sort((a, b) => {
        const aIndex = linkedJobIds.indexOf(a.id)
        const bIndex = linkedJobIds.indexOf(b.id)
        return aIndex - bIndex
      })

      setInvoice(normalizedInvoice)
      setItems(normalizedItems)
      setLinkedJobs(normalizedJobs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!invoiceId) return
    void loadInvoicePage(invoiceId)
  }, [invoiceId])

  useEffect(() => {
    if (!invoice) return
    setSendToEmail(invoice.customer_email || '')
  }, [invoice?.id, invoice?.customer_email])

  useEffect(() => {
    if (!invoice) return
    setSendToPhone((invoice.customer_phone || '').replace(/\D/g, ''))
  }, [invoice?.id, invoice?.customer_phone])

  function setSavedState(which: 'customer' | 'internal') {
    if (which === 'customer') {
      setCustomerNotesState('saved')
      if (clearCustomerSavedTimerRef.current) clearTimeout(clearCustomerSavedTimerRef.current)
      clearCustomerSavedTimerRef.current = setTimeout(() => {
        setCustomerNotesState((prev) => (prev === 'saved' ? 'idle' : prev))
      }, 1300)
      return
    }

    setInternalNotesState('saved')
    if (clearInternalSavedTimerRef.current) clearTimeout(clearInternalSavedTimerRef.current)
    clearInternalSavedTimerRef.current = setTimeout(() => {
      setInternalNotesState((prev) => (prev === 'saved' ? 'idle' : prev))
    }, 1300)
  }

  async function flushCustomerVisibleNotes(nextValue?: string) {
    if (!invoice) return

    const value = nextValue ?? localCustomerNotes
    const currentValue = invoice.customer_visible_notes ?? ''

    if (value === currentValue) {
      setCustomerNotesState('idle')
      return
    }

    setCustomerNotesState('saving')
    setError('')
    setSuccessMessage('')

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ customer_visible_notes: value || null })
      .eq('id', invoice.id)

    if (updateError) {
      setCustomerNotesState('error')
      setError(updateError.message || 'Failed to save customer notes')
      return
    }

    setInvoice((prev) => (prev ? { ...prev, customer_visible_notes: value || null } : null))
    setSavedState('customer')
  }

  async function flushInternalReferenceNotes(nextValue?: string) {
    if (!invoice) return

    const value = nextValue ?? localInternalNotes
    const currentValue = invoice.internal_reference_notes ?? ''

    if (value === currentValue) {
      setInternalNotesState('idle')
      return
    }

    setInternalNotesState('saving')
    setError('')
    setSuccessMessage('')

    const { error: updateError } = await supabase
      .from('invoices')
      .update({ internal_reference_notes: value || null })
      .eq('id', invoice.id)

    if (updateError) {
      setInternalNotesState('error')
      setError(updateError.message || 'Failed to save internal notes')
      return
    }

    setInvoice((prev) => (prev ? { ...prev, internal_reference_notes: value || null } : null))
    setSavedState('internal')
  }

  function handleCustomerNotesChange(value: string) {
    setLocalCustomerNotes(value)
    setCustomerNotesState('dirty')

    if (customerNotesTimerRef.current) clearTimeout(customerNotesTimerRef.current)
    customerNotesTimerRef.current = setTimeout(() => {
      void flushCustomerVisibleNotes(value)
    }, 900)
  }

  function handleInternalNotesChange(value: string) {
    setLocalInternalNotes(value)
    setInternalNotesState('dirty')

    if (internalNotesTimerRef.current) clearTimeout(internalNotesTimerRef.current)
    internalNotesTimerRef.current = setTimeout(() => {
      void flushInternalReferenceNotes(value)
    }, 900)
  }

  async function handleCustomerNotesBlur() {
    customerNotesFocusedRef.current = false
    if (customerNotesTimerRef.current) clearTimeout(customerNotesTimerRef.current)
    await flushCustomerVisibleNotes(localCustomerNotes)
  }

  async function handleInternalNotesBlur() {
    internalNotesFocusedRef.current = false
    if (internalNotesTimerRef.current) clearTimeout(internalNotesTimerRef.current)
    await flushInternalReferenceNotes(localInternalNotes)
  }

  async function updateInvoiceStatus(status: InvoiceStatus) {
    if (!invoice) return

    setUpdatingStatus(true)
    setError('')
    setSuccessMessage('')

    const nowIso = new Date().toISOString()
    const updates: {
      status: InvoiceStatus
      issued_at?: string | null
      paid_at?: string | null
    } = { status }

    if (status === 'draft') {
      updates.issued_at = null
      updates.paid_at = null
    }

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

    const { data, error: updateError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoice.id)
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
      .single()

    if (updateError || !data) {
      setError(updateError?.message || 'Failed to update invoice status')
      setUpdatingStatus(false)
      return
    }

    if (status === 'paid' && linkedJobs.length > 0) {
      const openJobIds = linkedJobs
        .filter((job) => job.status !== 'closed')
        .map((job) => job.id)

      if (openJobIds.length > 0) {
        const { error: closeError } = await supabase
          .from('repair_requests')
          .update({ status: 'ready' })
          .in('id', openJobIds)

        if (!closeError) {
          setLinkedJobs((prev) =>
            prev.map((job) =>
              openJobIds.includes(job.id) ? { ...job, status: 'closed' } : job
            )
          )
        }
      }
    }

    const normalizedInvoice: Invoice = {
      ...(data as Invoice),
      tax_rate: Number(data.tax_rate ?? 0),
      subtotal_ex_tax: Number(data.subtotal_ex_tax ?? 0),
      tax_amount: Number(data.tax_amount ?? 0),
      subtotal: Number(data.subtotal ?? 0),
      total: Number(data.total ?? 0),
      customer_visible_notes: data.customer_visible_notes ?? null,
      internal_reference_notes: data.internal_reference_notes ?? null,
      last_sms_sent_at: data.last_sms_sent_at ?? null,
      last_sms_to: data.last_sms_to ?? null,
      last_sms_message: data.last_sms_message ?? null,
    }

    setInvoice(normalizedInvoice)
    setSuccessMessage(`Invoice updated to ${status.toUpperCase()}.`)
    setUpdatingStatus(false)
  }

  async function sendInvoiceEmail() {
    if (!invoice) return

    const targetEmail = sendToEmail.trim()

    if (!targetEmail) {
      setEmailSendError('Please enter an email address to send the invoice to.')
      setEmailSendSuccess('')
      return
    }

    setSendingInvoiceEmail(true)
    setEmailSendError('')
    setEmailSendSuccess('')
    setError('')
    setSuccessMessage('')

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || window.location.origin

      const invoiceUrl = `${baseUrl}/invoice/toCustomer?id=${invoice.id}`

      const response = await fetch('/.netlify/functions/send-invoice-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: targetEmail,
          customerName: invoice.customer_name,
          invoiceNumber: invoice.invoice_number,
          invoiceUrl,
          total: formatCurrency(invoice.total),
        }),
      })

      const rawText = await response.text()
      let data: any = {}

      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        throw new Error(rawText || 'Server returned an invalid response')
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send invoice email')
      }

      const nowIso = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          sent_at: nowIso,
          sent_to_email: targetEmail,
        })
        .eq('id', invoice.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              sent_at: nowIso,
              sent_to_email: targetEmail,
            }
          : null
      )

      setEmailSendSuccess(`Invoice emailed to ${targetEmail}.`)
      setSuccessMessage('Invoice email sent successfully.')
    } catch (err) {
      setEmailSendError(err instanceof Error ? err.message : 'Failed to send invoice email')
    } finally {
      setSendingInvoiceEmail(false)
    }
  }

  function buildInvoiceSms() {
    if (!invoice) return ''

    const customerName = invoice.customer_name.split(' ')[0] || invoice.customer_name
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || window.location.origin
    const publicInvoiceUrl = `${baseUrl}/invoice/toCustomer?id=${invoice.id}`

    return `Hi ${customerName}, your invoice ${invoice.invoice_number} for ${formatCurrency(
      invoice.total
    )} is ready. View it here: ${publicInvoiceUrl}`
  }

  function buildPaidReminderSms() {
    if (!invoice) return ''

    const customerName = invoice.customer_name.split(' ')[0] || invoice.customer_name
    return `Hi ${customerName}, this is a reminder that invoice ${invoice.invoice_number} for ${formatCurrency(
      invoice.total
    )} is outstanding. Please contact The Mobile Phone Clinic if you have any questions.`
  }

  async function sendInvoiceSms(messageOverride?: string) {
    if (!invoice) return

    const to = String(sendToPhone || '').replace(/\D/g, '').trim()
    const message = (messageOverride ?? smsMessage).trim()

    if (!to) {
      setSmsSendError('Please enter a phone number to send the SMS to.')
      setSmsSendSuccess('')
      return
    }

    if (!message) {
      setSmsSendError('Please enter an SMS message.')
      setSmsSendSuccess('')
      return
    }

    setSendingSms(true)
    setSmsSendError('')
    setSmsSendSuccess('')
    setError('')
    setSuccessMessage('')

    try {
      const response = await fetch('/.netlify/functions/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      })

      const rawText = await response.text()
      let data: any = {}

      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        throw new Error(rawText || 'Server returned invalid response')
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send invoice SMS')
      }

      const nowIso = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          last_sms_sent_at: nowIso,
          last_sms_to: to,
          last_sms_message: message,
        })
        .eq('id', invoice.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              last_sms_sent_at: nowIso,
              last_sms_to: to,
              last_sms_message: message,
            }
          : null
      )

      setSmsSendSuccess(`SMS sent to ${to}.`)
      setSuccessMessage('Invoice SMS sent successfully.')
    } catch (err) {
      setSmsSendError(err instanceof Error ? err.message : 'Failed to send invoice SMS')
    } finally {
      setSendingSms(false)
    }
  }

  async function deleteInvoice() {
    if (!invoice) return

    const confirmed = window.confirm(
      'Are you sure you want to delete this invoice? This cannot be undone.'
    )

    if (!confirmed) return

    setDeleting(true)
    setError('')
    setSuccessMessage('')

    const { error: deleteInvoiceError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoice.id)

    if (deleteInvoiceError) {
      setError(deleteInvoiceError.message || 'Failed to delete invoice')
      setDeleting(false)
      return
    }

    setSuccessMessage('Invoice deleted successfully.')
    setDeleting(false)

    window.setTimeout(() => {
      window.location.href = '/admin/invoices'
    }, 1000)
  }

 function generatePDF() {
  if (!invoice) return

  generateInvoicePdf({
    invoice,
    items,
    businessDetails: BUSINESS_DETAILS,
    paymentDetails: PAYMENT_DETAILS,
    includeInternalReferenceNotes: false,
  })


    const COLOR_DARK: [number, number, number] = [15, 23, 42]
    const COLOR_GREEN: [number, number, number] = [55, 126, 71]
    const COLOR_BLUE: [number, number, number] = [37, 99, 235]

    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const left = 14
    const right = pageWidth - 14
    const contentWidth = right - left
    const bottomLimit = pageHeight - 14

    let y = 14

    const addPageIfNeeded = (requiredHeight = 10) => {
      if (y + requiredHeight > bottomLimit) {
        doc.addPage()
        y = 14
      }
    }

    const drawLabelValueRow = (label: string, value: string) => {
      addPageIfNeeded(7)
      doc.setTextColor(...COLOR_DARK)
      doc.setFont('helvetica', 'bold')
      doc.text(label, left, y)
      doc.setFont('helvetica', 'normal')
      doc.text(value, left + 42, y)
      y += 6
    }

    const drawHorizontalLine = () => {
      addPageIfNeeded(4)
      doc.line(left, y, right, y)
      y += 4
    }

    const drawWrappedBlock = (title: string, value: string) => {
      const lines = doc.splitTextToSize(value || '-', contentWidth)
      addPageIfNeeded(8 + lines.length * 5)
      doc.setTextColor(...COLOR_DARK)
      doc.setFont('helvetica', 'bold')
      doc.text(title, left, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.text(lines, left, y)
      y += lines.length * 5 + 2
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(...COLOR_GREEN)
    doc.text(BUSINESS_DETAILS.name, left, y)
    y += 7

    doc.setTextColor(...COLOR_DARK)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(BUSINESS_DETAILS.address, left, y)
    y += 5
    doc.text(`Landline: ${BUSINESS_DETAILS.landline}`, left, y)
    y += 5
    doc.text(`Mobile: ${BUSINESS_DETAILS.mobile}`, left, y)
    y += 5
    doc.text(`Email: ${BUSINESS_DETAILS.email}`, left, y)
    y += 5
    doc.text(`ABN: ${BUSINESS_DETAILS.abn}`, left, y)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...COLOR_BLUE)
    doc.text('TAX INVOICE', right, 16, { align: 'right' })

    doc.setTextColor(...COLOR_DARK)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Invoice: ${invoice.invoice_number}`, right, 23, { align: 'right' })
    doc.text(
      `Date: ${invoice.issued_at ? formatDateTime(invoice.issued_at) : formatDateTime(invoice.created_at)}`,
      right,
      29,
      { align: 'right' }
    )
    doc.text(`Status: ${invoice.status.toUpperCase()}`, right, 35, { align: 'right' })

    y = 46
    drawHorizontalLine()

    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Bill To', left, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    const billToLines = [
      invoice.customer_name,
      invoice.customer_phone || '',
      invoice.customer_email || '',
      invoice.bill_to_address || '',
    ].filter(Boolean)

    for (const line of billToLines) {
      addPageIfNeeded(5)
      doc.setTextColor(...COLOR_DARK)
      doc.text(line, left, y)
      y += 5
    }

    y += 3
    drawHorizontalLine()

    addPageIfNeeded(10)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Invoice Items', left, y)
    y += 7

    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text('Description', left, y)
    doc.text('Qty', 120, y, { align: 'right' })
    doc.text('Unit Price', 155, y, { align: 'right' })
    doc.text('Line Total', right, y, { align: 'right' })
    y += 4

    doc.line(left, y, right, y)
    y += 5

    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    if (items.length === 0) {
      addPageIfNeeded(6)
      doc.text('No invoice items found.', left, y)
      y += 6
    } else {
      for (const item of items) {
        const descriptionLines = doc.splitTextToSize(item.description, 95)
        const rowHeight = Math.max(descriptionLines.length * 4.5, 5)

        addPageIfNeeded(rowHeight + 2)

        doc.setTextColor(...COLOR_DARK)
        doc.text(descriptionLines, left, y)
        doc.text(Number(item.qty).toFixed(2), 120, y, { align: 'right' })
        doc.text(formatCurrency(item.unit_price), 155, y, { align: 'right' })
        doc.text(formatCurrency(item.line_total), right, y, { align: 'right' })

        y += rowHeight + 2
      }
    }

    y += 2
    drawHorizontalLine()

    addPageIfNeeded(24)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Summary', 120, y)
    y += 6

    drawLabelValueRow(
      'Total Item Qty',
      Number(items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)).toFixed(2)
    )
    drawLabelValueRow('Subtotal', formatCurrency(invoice.subtotal))
    drawLabelValueRow('GST', formatCurrency(invoice.tax_amount))

    addPageIfNeeded(7)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.text('Total', left, y)
    doc.text(formatCurrency(invoice.total), right, y, { align: 'right' })
    y += 7

    if (invoice.customer_visible_notes) {
      y += 2
      drawHorizontalLine()
      drawWrappedBlock('Notes', invoice.customer_visible_notes)
    }

    if (invoice.internal_reference_notes) {
      y += 2
      drawHorizontalLine()
      drawWrappedBlock('Internal Reference Notes', invoice.internal_reference_notes)
    }

    y += 2
    drawHorizontalLine()

    addPageIfNeeded(28)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Payment Details', left, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    drawLabelValueRow('Bank', PAYMENT_DETAILS.bankName)
    drawLabelValueRow('Account Name', PAYMENT_DETAILS.accountName)
    drawLabelValueRow('BSB', PAYMENT_DETAILS.bsb)
    drawLabelValueRow('Account Number', PAYMENT_DETAILS.accountNumber)
    drawLabelValueRow('PayID', PAYMENT_DETAILS.payId)

    y += 4
    addPageIfNeeded(8)
    doc.setTextColor(...COLOR_DARK)
    doc.setFontSize(9)
    doc.text('Thank you for choosing The Mobile Phone Clinic.', left, y)

    doc.save(`invoice_${invoice.invoice_number}.pdf`)
  }

  const totalQty = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)
  }, [items])

  const isGroupedInvoice = linkedJobs.length > 1

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.messageCard}>Loading invoice...</div>
        </div>
      </main>
    )
  }

  if (error || !invoice) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={styles.messageCardError}>
            {error || 'Invoice could not be loaded.'}
          </div>
          <div className={ui.topBar}>
            <Link href="/admin" className={ui.secondaryButton}>
              Back to Admin
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={ui.topBar}>
          <div>
            <div className={ui.eyebrow}>The Mobile Phone Clinic</div>
            <h1 className={ui.pageTitle}>Invoice {invoice.invoice_number}</h1>
            <p className={ui.pageSubtitle}>
              {isGroupedInvoice ? `${linkedJobs.length} linked jobs` : 'Single job invoice'}
            </p>
          </div>

          <div className={ui.topActionsRight}>
            <Link href="/admin/invoices" className={ui.secondaryButton}>
              Back to Invoices
            </Link>

            <Link href="/admin" className={ui.secondaryButton}>
              Back to Dashboard
            </Link>

            {invoice.status === 'draft' && (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Mark Issued
              </button>
            )}

            {(invoice.status === 'draft' || invoice.status === 'issued') && (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => void updateInvoiceStatus('paid')}
                disabled={updatingStatus}
              >
                Mark Paid
              </button>
            )}

            {invoice.status === 'paid' && (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Mark Unpaid
              </button>
            )}

            {invoice.status !== 'void' && (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => void updateInvoiceStatus('void')}
                disabled={updatingStatus}
              >
                Mark Void
              </button>
            )}

            {invoice.status === 'void' && (
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Restore Issued
              </button>
            )}

            <button
              type="button"
              className={ui.printButton}
              onClick={() => window.print()}
            >
              Print Invoice
            </button>

            <button
              type="button"
              className={ui.printButton}
              onClick={generatePDF}
            >
              Download PDF
            </button>

            <button
              type="button"
              className={ui.deleteButton}
              onClick={() => void deleteInvoice()}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Invoice'}
            </button>
          </div>
        </div>

        <div className={styles.notesSection}>
          <div className={ui.inputTopRow}>
            <div className={styles.sectionHeading}>Send Invoice Email</div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              type="email"
              value={sendToEmail}
              onChange={(e) => setSendToEmail(e.target.value)}
              placeholder="Send invoice to another email..."
              className={styles.notesInput}
              style={{ minHeight: 44, flex: '1 1 320px' }}
            />

            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => void sendInvoiceEmail()}
              disabled={sendingInvoiceEmail}
            >
              {sendingInvoiceEmail ? 'Sending Email...' : 'Send Invoice Email'}
            </button>
          </div>
        </div>

        <div className={styles.notesSection}>
          <div className={ui.inputTopRow}>
            <div className={styles.sectionHeading}>Send Invoice SMS</div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              value={sendToPhone}
              onChange={(e) => setSendToPhone(e.target.value.replace(/\D/g, ''))}
              placeholder="Send invoice SMS to phone..."
              className={styles.notesInput}
              style={{ minHeight: 44, flex: '1 1 320px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => {
                setSmsMessage(buildInvoiceSms())
                setSmsSendError('')
                setSmsSendSuccess('')
              }}
            >
              Load Invoice Template
            </button>

            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => {
                setSmsMessage(buildPaidReminderSms())
                setSmsSendError('')
                setSmsSendSuccess('')
              }}
            >
              Load Reminder Template
            </button>
          </div>

          <textarea
            value={smsMessage}
            onChange={(e) => {
              setSmsMessage(e.target.value)
              setSmsSendError('')
              setSmsSendSuccess('')
            }}
            className={styles.notesInput}
            placeholder="Type SMS here..."
            style={{ marginTop: 10 }}
          />

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => void sendInvoiceSms()}
              disabled={sendingSms}
            >
              {sendingSms ? 'Sending SMS...' : 'Send Invoice SMS'}
            </button>
          </div>

          {invoice.last_sms_sent_at ? (
            <div className={styles.metaValue} style={{ marginTop: 10 }}>
              Last SMS: {formatDateTime(invoice.last_sms_sent_at)}
              {invoice.last_sms_to ? ` • ${invoice.last_sms_to}` : ''}
            </div>
          ) : null}
        </div>

        {successMessage ? <div className={ui.successBanner}>{successMessage}</div> : null}
        {emailSendSuccess ? <div className={ui.successBanner}>{emailSendSuccess}</div> : null}
        {emailSendError ? <p className={ui.errorText}>{emailSendError}</p> : null}
        {smsSendSuccess ? <div className={ui.successBanner}>{smsSendSuccess}</div> : null}
        {smsSendError ? <p className={ui.errorText}>{smsSendError}</p> : null}

        <article className={styles.document}>
          <header className={styles.header}>
            <div className={styles.businessDetails}>
              <div className={styles.brand}>{BUSINESS_DETAILS.name}</div>
              <div className={styles.brandMeta}>{BUSINESS_DETAILS.address}</div>
              <div className={styles.brandMeta}>Landline: {BUSINESS_DETAILS.landline}</div>
              <div className={styles.brandMeta}>Mobile: {BUSINESS_DETAILS.mobile}</div>
              <div className={styles.brandMeta}>Email: {BUSINESS_DETAILS.email}</div>
              <div className={styles.brandMeta}>ABN: {BUSINESS_DETAILS.abn}</div>
            </div>

            <div className={styles.invoiceHeaderRight}>
              <div className={styles.invoiceTitle}>TAX INVOICE</div>
              <div className={styles.invoiceNumber}>{invoice.invoice_number}</div>
              <div className={`${styles.statusPill} ${styles[`status_${invoice.status}`]}`}>
                {invoice.status.toUpperCase()}
              </div>
            </div>
          </header>

          <section className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <div className={styles.metaTitle}>Bill To</div>
              <div className={styles.metaValueStrong}>{invoice.customer_name}</div>
              <div className={styles.metaValue}>{invoice.customer_phone}</div>
              <div className={styles.metaValue}>{invoice.customer_email || '-'}</div>
              {invoice.bill_to_address ? (
                <div className={styles.metaValue}>{invoice.bill_to_address}</div>
              ) : null}
            </div>

            <div className={styles.metaCard}>
              <div className={styles.metaTitle}>Invoice Date</div>
              <div className={styles.metaValueStrong}>
                {invoice.issued_at
                  ? formatDateTime(invoice.issued_at)
                  : formatDateTime(invoice.created_at)}
              </div>

              {invoice.sent_at ? (
                <div className={styles.metaValue}>Sent: {formatDateTime(invoice.sent_at)}</div>
              ) : null}

              {invoice.sent_to_email ? (
                <div className={styles.metaValue}>Sent to: {invoice.sent_to_email}</div>
              ) : null}

              {invoice.last_sms_sent_at ? (
                <div className={styles.metaValue}>
                  Last SMS: {formatDateTime(invoice.last_sms_sent_at)}
                </div>
              ) : null}

              {invoice.last_sms_to ? (
                <div className={styles.metaValue}>SMS to: {invoice.last_sms_to}</div>
              ) : null}

              {isGroupedInvoice ? (
                <div className={styles.metaValue}>{linkedJobs.length} linked jobs</div>
              ) : null}
            </div>
          </section>

          <section className={styles.tableSection}>
            <div className={styles.sectionHeading}>Invoice Items</div>

            <table className={styles.itemsTable}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className={styles.numberCell}>Qty</th>
                  <th className={styles.numberCell}>Unit Price</th>
                  <th className={styles.numberCell}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={styles.emptyTableCell}>
                      No invoice items found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.description}</td>
                      <td className={styles.numberCell}>{Number(item.qty).toFixed(2)}</td>
                      <td className={styles.numberCell}>{formatCurrency(item.unit_price)}</td>
                      <td className={styles.numberCell}>{formatCurrency(item.line_total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className={styles.summarySection}>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>Total Item Qty</span>
                <strong>{totalQty.toFixed(2)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Subtotal</span>
                <strong>{formatCurrency(invoice.subtotal)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>GST</span>
                <strong>{formatCurrency(invoice.tax_amount)}</strong>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total</span>
                <strong>{formatCurrency(invoice.total)}</strong>
              </div>
            </div>
          </section>

          <section className={styles.notesSection}>
            <div className={ui.inputTopRow}>
              <div className={styles.sectionHeading}>Customer Visible Notes</div>
              <SaveIndicator state={customerNotesState} compact />
            </div>
            <textarea
              value={localCustomerNotes}
              onChange={(e) => handleCustomerNotesChange(e.target.value)}
              onFocus={() => {
                customerNotesFocusedRef.current = true
              }}
              onBlur={() => void handleCustomerNotesBlur()}
              className={styles.notesInput}
              placeholder="Add customer-facing notes here..."
            />
          </section>

          <section className={styles.notesSection}>
            <div className={ui.inputTopRow}>
              <div className={styles.sectionHeading}>Internal Reference Notes</div>
              <SaveIndicator state={internalNotesState} compact />
            </div>
            <textarea
              value={localInternalNotes}
              onChange={(e) => handleInternalNotesChange(e.target.value)}
              onFocus={() => {
                internalNotesFocusedRef.current = true
              }}
              onBlur={() => void handleInternalNotesBlur()}
              className={styles.notesInput}
              placeholder="Hidden admin-only notes and references..."
            />
          </section>

          {invoice.customer_visible_notes ? (
            <section className={styles.notesSection}>
              <div className={styles.sectionHeading}>Customer Note Preview</div>
              <div className={styles.notesPreview}>{invoice.customer_visible_notes}</div>
            </section>
          ) : null}

          <section className={styles.paymentSection}>
            <div className={styles.sectionHeading}>Payment Details</div>
            <div className={styles.paymentCard}>
              <div className={styles.paymentRow}>
                <span>Bank</span>
                <strong>{PAYMENT_DETAILS.bankName}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>Account Name</span>
                <strong>{PAYMENT_DETAILS.accountName}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>BSB</span>
                <strong>{PAYMENT_DETAILS.bsb}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>Account Number</span>
                <strong>{PAYMENT_DETAILS.accountNumber}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>PayID</span>
                <strong>{PAYMENT_DETAILS.payId}</strong>
              </div>
            </div>
          </section>

          <footer className={styles.footer}>
            <div>Thank you for choosing The Mobile Phone Clinic.</div>
            <div>This document was generated from the admin dashboard.</div>
          </footer>
        </article>
      </div>
    </main>
  )
}