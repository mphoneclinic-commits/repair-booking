'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Invoice, InvoiceStatus, RepairRequest } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type InvoiceRow = Invoice & {
  job_number: string | null
}

const STATUS_FILTERS: Array<'all' | InvoiceStatus> = ['all', 'draft', 'issued', 'paid', 'void']

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all')

  async function loadInvoices() {
    setLoading(true)
    setError('')

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
      .order('created_at', { ascending: false })

    if (invoiceError) {
      setError(invoiceError.message)
      setLoading(false)
      return
    }

    const repairRequestIds = Array.from(
      new Set(((invoiceData || []) as Invoice[]).map((invoice) => invoice.repair_request_id))
    )

    let jobsById: Record<string, RepairRequest> = {}

    if (repairRequestIds.length > 0) {
      const { data: jobsData, error: jobsError } = await supabase
        .from('repair_requests')
        .select('id, job_number')
        .in('id', repairRequestIds)

      if (jobsError) {
        setError(jobsError.message)
        setLoading(false)
        return
      }

      jobsById = Object.fromEntries(
        ((jobsData || []) as RepairRequest[]).map((job) => [job.id, job])
      )
    }

    const rows: InvoiceRow[] = ((invoiceData || []) as Invoice[]).map((invoice) => ({
      ...invoice,
      tax_rate: Number(invoice.tax_rate ?? 0),
      subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      subtotal: Number(invoice.subtotal ?? 0),
      total: Number(invoice.total ?? 0),
      job_number: jobsById[invoice.repair_request_id]?.job_number ?? null,
    }))

    setInvoices(rows)
    setLoading(false)
  }

  useEffect(() => {
    void loadInvoices()
  }, [])

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()

    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === 'all' ? true : invoice.status === statusFilter

      const haystack = [
        invoice.invoice_number,
        invoice.customer_name,
        invoice.customer_phone,
        invoice.customer_email || '',
        invoice.sent_to_email || '',
        invoice.job_number || '',
        invoice.status,
        String(invoice.total ?? ''),
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = term ? haystack.includes(term) : true

      return matchesStatus && matchesSearch
    })
  }, [invoices, search, statusFilter])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Invoices</h1>
          <p className={styles.pageSubtitle}>
            Search, review and open all invoices
          </p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Back to Admin
          </Link>
          <Link href="/admin/jobs/new" className={styles.viewButton}>
            New Job
          </Link>
          <button type="button" onClick={() => void loadInvoices()} className={styles.button}>
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice number, customer, phone, email, job number..."
          className={styles.field}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | InvoiceStatus)}
          className={styles.field}
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status === 'all'
                ? 'All statuses'
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.statsBar}>
        Showing <strong>{filteredInvoices.length}</strong> of <strong>{invoices.length}</strong>{' '}
        invoices
      </div>

      {loading && <p className={styles.message}>Loading invoices...</p>}
      {!!error && <p className={styles.errorText}>{error}</p>}
      {!loading && !error && filteredInvoices.length === 0 && (
        <p className={styles.message}>No matching invoices.</p>
      )}

      {!loading && !error && filteredInvoices.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Job</th>
                <th>Status</th>
                <th>Total</th>
                <th>Issued</th>
                <th>Paid</th>
                <th>Sent</th>
                <th>Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoice_number}</td>
                  <td>{invoice.customer_name}</td>
                  <td>{invoice.customer_phone}</td>
                  <td>{invoice.job_number || 'Pending'}</td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}
                    >
                      {invoice.status.toUpperCase()}
                    </span>
                  </td>
                  <td>${Number(invoice.total ?? 0).toFixed(2)}</td>
                  <td>{invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}</td>
                  <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                  <td>{invoice.sent_at ? formatDateTime(invoice.sent_at) : '-'}</td>
                  <td>
                    <Link
                      href={`/admin/invoice?id=${invoice.id}&jobId=${invoice.repair_request_id}`}
                      className={styles.actionButton}
                    >
                      Open
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