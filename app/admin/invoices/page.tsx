'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Invoice } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function loadInvoices() {
      setLoading(true)
      setError('')
      try {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invoices')
      } finally {
        setLoading(false)
      }
    }

    void loadInvoices()
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
      ].join(' ').toLowerCase()
      return term ? haystack.includes(term) : true
    })
  }, [invoices, search])

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
            Back to Dashboard
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
          <p className={styles.pageSubtitle}>
            All invoices and payment status
          </p>
        </div>
        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Back to Dashboard
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
                <th>Issued</th>
                <th>Paid</th>
                <th>Open</th>
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
                  <td>{invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}</td>
                  <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                  <td>
                    <Link
                      href={`/admin/invoice?id=${invoice.id}`}
                      className={styles.inlineLink}
                    >
                      Open Invoice
                    </Link>
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