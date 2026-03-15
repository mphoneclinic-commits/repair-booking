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
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    const normalizedInvoices = ((data || []) as Invoice[]).map((invoice) => ({
      ...invoice,
      tax_rate: Number(invoice.tax_rate ?? 0),
      subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      subtotal: Number(invoice.subtotal ?? 0),
      total: Number(invoice.total ?? 0),
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
        invoice.notes || '',
      ]
        .join(' ')
        .toLowerCase()
      return term ? haystack.includes(term) : true
    })
  }, [invoices, search])

  function generatePDF(invoice: Invoice) {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Invoice', 105, 20, { align: 'center' })
    doc.setFontSize(12)
    doc.text(`Invoice Number: ${invoice.invoice_number}`, 20, 40)
    doc.text(`Status: ${invoice.status.toUpperCase()}`, 20, 50)
    doc.text(`Customer: ${invoice.customer_name}`, 20, 60)
    if (invoice.customer_phone) {
      doc.text(`Phone: ${invoice.customer_phone}`, 20, 70)
    }
    if (invoice.customer_email) {
      doc.text(`Email: ${invoice.customer_email}`, 20, 80)
    }
    doc.text(`Total: $${invoice.total.toFixed(2)}`, 20, 90)
    doc.text(`Tax: $${invoice.tax_amount.toFixed(2)} (${(invoice.tax_rate * 100).toFixed(0)}%)`, 20, 100)

    doc.text('Items:', 20, 120)
    let y = 130
    const items = invoiceItemsByInvoiceId[invoice.id] || []
    items.forEach((item, index) => {
      doc.text(
        `${index + 1}. ${item.description} x ${item.qty} @ $${item.unit_price.toFixed(2)} = $${item.line_total.toFixed(2)}`,
        30,
        y
      )
      y += 10
    })

    y += 10
    doc.text('Notes:', 20, y)
    y += 10
    if (invoice.notes) {
      const notesLines = doc.splitTextToSize(invoice.notes, 170)
      doc.text(notesLines, 20, y)
    }

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
                    <span className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}>
                      {invoice.status.toUpperCase()}
                    </span>
                  </td>
                  <td>${Number(invoice.total ?? 0).toFixed(2)}</td>
                  <td>
                    {invoice.notes
                      ? invoice.notes.substring(0, 50) + (invoice.notes.length > 50 ? '...' : '')
                      : '-'}
                  </td>
                  <td>{invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}</td>
                  <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                  <td>
                    <Link href={`/admin/invoice?id=${invoice.id}`} className={styles.inlineLink}>
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