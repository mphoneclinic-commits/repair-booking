'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'
import styles from './invoice.module.css'
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

const BUSINESS_DETAILS = {
  name: 'The Mobile Phone Clinic',
  address: 'Melbourne, Victoria, Australia',
  landline: '(03) 9547 9991',
  mobile: '0411 369 814',
  email: 'admin@themobilephoneclinic.com.au',
  abn: '59696 1787 82',
}

const PAYMENT_DETAILS = {
  bankName: 'GREAT SOUTHERN BANK',
  accountName: 'BUN UNG',
  bsb: '814 282',
  accountNumber: '520 372 19',
  payId: '0411 369 814',
}

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
          fault_photo_url
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

    setInvoice((prev) =>
      prev ? { ...prev, customer_visible_notes: value || null } : null
    )
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

    setInvoice((prev) =>
      prev ? { ...prev, internal_reference_notes: value || null } : null
    )
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
          .update({ status: 'closed' })
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
      const baseUrl = window.location.origin
      const invoiceUrl = `${baseUrl}/admin/invoice?id=${invoice.id}`

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
        throw new Error(rawText || `Server returned ${response.status} with invalid response`)
      }

      if (!response.ok) {
        throw new Error(data?.error || `Failed to send invoice email (${response.status})`)
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
      setEmailSendError(
        err instanceof Error ? err.message : 'Failed to send invoice email'
      )
    } finally {
      setSendingInvoiceEmail(false)
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

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

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
      doc.setFont('helvetica', 'bold')
      doc.text(title, left, y)
      y += 5
      doc.setFont('helvetica', 'normal')
      doc.text(lines, left, y)
      y += lines.length * 5 + 2
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(BUSINESS_DETAILS.name, left, y)
    y += 7

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
    doc.text('TAX INVOICE', right, 16, { align: 'right' })

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
      doc.text(line, left, y)
      y += 5
    }

    y += 3
    drawHorizontalLine()

    addPageIfNeeded(10)
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
          <div className={styles.topBar}>
            <Link href="/admin" className={styles.secondaryButton}>
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
        <div className={styles.topBar}>
          <div>
            <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
            <h1 className={styles.pageTitle}>Invoice {invoice.invoice_number}</h1>
            <p className={styles.pageSubtitle}>
              {isGroupedInvoice ? `${linkedJobs.length} linked jobs` : 'Single job invoice'}
            </p>
          </div>

          <div className={styles.topActionsRight}>
            <Link href="/admin/invoices" className={styles.secondaryButton}>
              Back to Invoices
            </Link>

            {invoice.status !== 'draft' && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('draft')}
                disabled={updatingStatus}
              >
                Restore Draft
              </button>
            )}

            {invoice.status === 'draft' && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Mark Issued
              </button>
            )}

            {(invoice.status === 'draft' || invoice.status === 'issued') && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('paid')}
                disabled={updatingStatus}
              >
                Mark Paid
              </button>
            )}

            {invoice.status === 'paid' && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Mark Unpaid
              </button>
            )}

            {invoice.status !== 'void' && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('void')}
                disabled={updatingStatus}
              >
                Mark Void
              </button>
            )}

            {invoice.status === 'void' && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => void updateInvoiceStatus('issued')}
                disabled={updatingStatus}
              >
                Restore Issued
              </button>
            )}

            <button
              type="button"
              className={styles.printButton}
              onClick={() => window.print()}
            >
              Print Invoice
            </button>

            <button
              type="button"
              className={styles.printButton}
              onClick={generatePDF}
            >
              Download PDF
            </button>

            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => void deleteInvoice()}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Invoice'}
            </button>
          </div>
        </div>

        <div className={styles.notesSection}>
          <div className={styles.inputTopRow}>
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
              className={styles.secondaryButton}
              onClick={() => void sendInvoiceEmail()}
              disabled={sendingInvoiceEmail}
            >
              {sendingInvoiceEmail ? 'Sending Email...' : 'Send Invoice Email'}
            </button>
          </div>
        </div>

        {successMessage ? <div className={styles.successBanner}>{successMessage}</div> : null}
        {emailSendSuccess ? <div className={styles.successBanner}>{emailSendSuccess}</div> : null}
        {emailSendError ? <p className={styles.errorText}>{emailSendError}</p> : null}

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
            <div className={styles.inputTopRow}>
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
            <div className={styles.inputTopRow}>
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