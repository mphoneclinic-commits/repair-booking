'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'
import styles from '../admin.module.css'
import type { Invoice, InvoiceItem } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceItemsByInvoiceId, setInvoiceItemsByInvoiceId] = useState<
    Record<string, InvoiceItem[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

async function loadInvoices() {
  const { data, error } = await supabase
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
    .order('created_at', { ascending: false })

  if (error) {
    console.error('loadInvoices error:', error)
    throw new Error(error.message)
  }

  const normalizedInvoices = ((data || []) as Invoice[]).map((invoice) => ({
    ...invoice,
    tax_rate: Number(invoice.tax_rate ?? 0),
    subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
    tax_amount: Number(invoice.tax_amount ?? 0),
    subtotal: Number(invoice.subtotal ?? 0),
    total: Number(invoice.total ?? 0),
    customer_visible_notes: invoice.customer_visible_notes ?? null,
    internal_reference_notes: invoice.internal_reference_notes ?? null,
  }))

  setInvoices(normalizedInvoices)
}

  async function loadInvoiceItems() {
    const { data, error } = await supabase
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
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    const grouped: Record<string, InvoiceItem[]> = {}

    for (const item of (data || []) as InvoiceItem[]) {
      const invoiceId = item.invoice_id
      if (!grouped[invoiceId]) grouped[invoiceId] = []

      grouped[invoiceId].push({
        ...item,
        qty: Number(item.qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        sort_order: Number(item.sort_order ?? 0),
      })
    }

    setInvoiceItemsByInvoiceId(grouped)
  }

  async function loadAllData() {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadInvoices(), loadInvoiceItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAllData()
  }, [])

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()

    return invoices.filter((invoice) => {
      const haystack = [
        invoice.invoice_number,
        invoice.customer_name,
        invoice.customer_phone || '',
        invoice.customer_email || '',
        invoice.status,
        invoice.customer_visible_notes || '',
      ]
        .join(' ')
        .toLowerCase()

      return term ? haystack.includes(term) : true
    })
  }, [invoices, search])

  function generatePDF(invoice: Invoice) {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const items = invoiceItemsByInvoiceId[invoice.id] || []
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

    const drawHorizontalLine = () => {
      addPageIfNeeded(4)
      doc.line(left, y, right, y)
      y += 4
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text('The Mobile Phone Clinic', left, y)
    y += 7

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Device Repairs & Diagnostics', left, y)
    y += 5
    doc.text('Melbourne, Victoria', left, y)

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

    y = 42
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

    drawLabelValueRow('Total Item Qty', Number(items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)).toFixed(2))
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

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Loading invoices...</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.errorText}>{error}</p>
        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Return to Dashboard
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Invoices</h1>
          <p className={styles.pageSubtitle}>All invoices and payment status</p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Return to Dashboard
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>
        </div>
      </div>

      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice number, customer, status, notes..."
          className={styles.field}
        />
      </div>

      {filteredInvoices.length === 0 ? (
        <p className={styles.message}>No invoices yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Notes</th>
                <th>Issued</th>
                <th>Paid</th>
                <th>Open</th>
                <th>Print</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>{invoice.customer_name}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}
                    >
                      {invoice.status.toUpperCase()}
                    </span>
                  </td>
                  <td>{formatCurrency(invoice.total)}</td>
                  <td>
                    {invoice.customer_visible_notes
                      ? invoice.customer_visible_notes.substring(0, 50) +
                        (invoice.customer_visible_notes.length > 50 ? '...' : '')
                      : '-'}
                  </td>
                  <td>{invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}</td>
                  <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                  <td>
<Link href={`/admin/invoice?id=${invoice.id}`} className={styles.button}>
  Open Invoice
</Link>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => generatePDF(invoice)}
                      className={styles.button}
                    >
                      Print to PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}