'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { generateInvoicePdf } from '../../admin/lib/invoicePdf'
import { BUSINESS_DETAILS, PAYMENT_DETAILS } from '../../admin/lib/invoicePdfConfig'
import type { Invoice, InvoiceItem } from '../../admin/types'
import { formatDateTime } from '../../admin/utils'
import styles from '../../admin/invoice/invoice.module.css'
import ui from '../../admin/sharedAdminUi.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)


function formatCurrency(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export default function PublicInvoicePage() {
  const [invoiceId, setInvoiceId] = useState('')
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    setInvoiceId(params.get('id') || '')
  }, [])

  useEffect(() => {
    if (!invoiceId) {
      setLoading(false)
      setError('Missing invoice ID')
      return
    }

    void loadInvoice(invoiceId)
  }, [invoiceId])

  async function loadInvoice(currentInvoiceId: string) {
    setLoading(true)
    setError('')

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
          customer_visible_notes,
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

      setInvoice(normalizedInvoice)
      setItems(normalizedItems)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice')
    } finally {
      setLoading(false)
    }
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
}

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
            <Link href="/" className={ui.secondaryButton}>
              Back
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
            <p className={ui.pageSubtitle}>Customer copy</p>
          </div>

          <div className={ui.topActionsRight}>
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
          </div>
        </div>

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
              <div className={styles.metaValue}>{invoice.customer_phone || '-'}</div>
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

              {invoice.paid_at ? (
                <div className={styles.metaValue}>Paid: {formatDateTime(invoice.paid_at)}</div>
              ) : null}

              {invoice.sent_at ? (
                <div className={styles.metaValue}>Sent: {formatDateTime(invoice.sent_at)}</div>
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

          {invoice.customer_visible_notes ? (
            <section className={styles.notesSection}>
              <div className={styles.sectionHeading}>Notes</div>
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
          </footer>
        </article>
      </div>
    </main>
  )
}