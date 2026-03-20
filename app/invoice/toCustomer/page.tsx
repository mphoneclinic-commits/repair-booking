'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { Invoice, InvoiceItem } from '../../admin/types'
import { formatDateTime } from '../../admin/utils'
import { generateInvoicePdf } from '../../admin/lib/invoicePdf'
import { BUSINESS_DETAILS, PAYMENT_DETAILS } from '../../admin/lib/invoicePdfConfig'
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