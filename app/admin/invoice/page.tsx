'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from './invoice.module.css'
import type { Invoice, InvoiceItem } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InvoicePrintPage() {
  const [invoiceId, setInvoiceId] = useState<string>('')
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
    async function loadInvoicePage() {
      if (!invoiceId) {
        setError('Missing invoice ID')
        setLoading(false)
        return
      }

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
            notes,
            issued_at,
            paid_at,
            sent_at,
            sent_to_email,
            created_at,
            updated_at
          `)
          .eq('id', invoiceId)
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
          .eq('invoice_id', invoiceId)
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

    void loadInvoicePage()
  }, [invoiceId])

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

          <div className={styles.topActions}>
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
        <div className={styles.topActions}>
          <Link href="/admin" className={styles.secondaryButton}>
            Back to Admin
          </Link>

          <button
            type="button"
            className={styles.printButton}
            onClick={() => window.print()}
          >
            Print Invoice
          </button>
        </div>

        <article className={styles.document}>
          <header className={styles.header}>
            <div>
              <div className={styles.brand}>The Mobile Phone Clinic</div>
              <div className={styles.brandMeta}>Device Repairs & Diagnostics</div>
              <div className={styles.brandMeta}>Melbourne, Victoria</div>
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
                      <td className={styles.numberCell}>
                        ${Number(item.unit_price).toFixed(2)}
                      </td>
                      <td className={styles.numberCell}>
                        ${Number(item.line_total).toFixed(2)}
                      </td>
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
                <strong>${Number(invoice.subtotal ?? 0).toFixed(2)}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>GST</span>
                <strong>${Number(invoice.tax_amount ?? 0).toFixed(2)}</strong>
              </div>
              <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
                <span>Total</span>
                <strong>${Number(invoice.total ?? 0).toFixed(2)}</strong>
              </div>
            </div>
          </section>

          {invoice.notes ? (
            <section className={styles.notesSection}>
              <div className={styles.sectionHeading}>Notes</div>
              <p className={styles.notesText}>{invoice.notes}</p>
            </section>
          ) : null}

          <footer className={styles.footer}>
            <div>Thank you for choosing The Mobile Phone Clinic.</div>
            <div>This document was generated from the admin dashboard.</div>
          </footer>
        </article>
      </div>
    </main>
  )
}