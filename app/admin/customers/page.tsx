'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Invoice, RepairRequest } from '../types'
import { formatDateTime, getStatusLabel } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CustomerGroup = {
  key: string
  displayName: string
  phone: string
  email: string
  jobs: RepairRequest[]
  visibleJobs: RepairRequest[]
  hiddenJobs: RepairRequest[]
  invoiceCount: number
  totalQuoted: number
}

function normalizePhone(value: string | null | undefined) {
  return (value || '').replace(/\D/g, '')
}

function buildCustomerKey(job: RepairRequest) {
  const phone = normalizePhone(job.phone)
  const email = (job.email || '').trim().toLowerCase()
  const name = job.full_name.trim().toLowerCase()
  if (phone) return `phone:${phone}`
  if (email) return `email:${email}`
  return `name:${name}`
}

export default function CustomersPage() {
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError('')
      try {
        const [{ data: jobsData, error: jobsError }, { data: invoiceData, error: invoiceError }] =
          await Promise.all([
            supabase
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
                is_hidden
              `)
              .order('created_at', { ascending: false }),
            supabase
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
              .order('created_at', { ascending: false }),
          ])
        if (jobsError) throw jobsError
        if (invoiceError) throw invoiceError
        const safeJobs = ((jobsData || []) as RepairRequest[]).map((job) => ({
          ...job,
          internal_notes: job.internal_notes ?? '',
          quoted_price: job.quoted_price ?? null,
          serial_imei: job.serial_imei ?? null,
          is_hidden: Boolean(job.is_hidden),
        }))
        const safeInvoices = ((invoiceData || []) as Invoice[]).map((invoice) => ({
          ...invoice,
          tax_rate: Number(invoice.tax_rate ?? 0),
          subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
          tax_amount: Number(invoice.tax_amount ?? 0),
          subtotal: Number(invoice.subtotal ?? 0),
          total: Number(invoice.total ?? 0),
        }))
        setJobs(safeJobs)
        setInvoices(safeInvoices)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customers')
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [])

  const customerGroups = useMemo(() => {
    const invoiceCountByJobId = invoices.reduce<Record<string, number>>((acc, invoice) => {
      acc[invoice.repair_request_id] = (acc[invoice.repair_request_id] || 0) + 1
      return acc
    }, {})
    const map = new Map<string, CustomerGroup>()
    for (const job of jobs) {
      const key = buildCustomerKey(job)
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          key,
          displayName: job.full_name,
          phone: job.phone || '',
          email: job.email || '',
          jobs: [job],
          visibleJobs: job.is_hidden ? [] : [job],
          hiddenJobs: job.is_hidden ? [job] : [],
          invoiceCount: invoiceCountByJobId[job.id] || 0,
          totalQuoted: job.quoted_price ?? 0,
        })
      } else {
        existing.jobs.push(job)
        if (job.is_hidden) {
          existing.hiddenJobs.push(job)
        } else {
          existing.visibleJobs.push(job)
        }
        existing.invoiceCount += invoiceCountByJobId[job.id] || 0
        existing.totalQuoted += job.quoted_price ?? 0
        if (!existing.phone && job.phone) existing.phone = job.phone
        if (!existing.email && job.email) existing.email = job.email
      }
    }
    const term = search.trim().toLowerCase()
    return Array.from(map.values())
      .filter((group) => {
        if (!term) return true
        const haystack = [
          group.displayName,
          group.phone,
          group.email,
          ...group.jobs.map((job) =>
            [
              job.job_number || '',
              job.brand,
              job.model,
              job.device_type || '',
              job.serial_imei || '',
              job.fault_description,
              job.status,
            ].join(' ')
          ),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(term)
      })
      .sort((a, b) => {
        const aTime = new Date(a.jobs[0]?.created_at || 0).getTime()
        const bTime = new Date(b.jobs[0]?.created_at || 0).getTime()
        return bTime - aTime
      })
  }, [jobs, invoices, search])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Customers</h1>
          <p className={styles.pageSubtitle}>
            Grouped repair history across visible and hidden jobs
          </p>
        </div>
        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Back to Dashboard
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            View Invoices
          </Link>
        </div>
      </div>
      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, email, device, serial, fault..."
          className={styles.field}
        />
        <div className={styles.readOnlyValue}>
          Customers found: <strong style={{ marginLeft: 6 }}>{customerGroups.length}</strong>
        </div>
      </div>
      {loading && <p className={styles.message}>Loading customers...</p>}
      {!!error && <p className={styles.errorText}>{error}</p>}
      {!loading && !error && customerGroups.length === 0 && (
        <p className={styles.message}>No matching customers.</p>
      )}
      {!loading && !error && customerGroups.length > 0 && (
        <div className={styles.customerGrid}>
          {customerGroups.map((customer) => (
            <section key={customer.key} className={styles.customerCard}>
              <div className={styles.customerCardHeader}>
                <div>
                  <h2 className={styles.customerTitle}>
                    <Link
                      href={`/admin/customer?key=${encodeURIComponent(customer.key)}`}
                      className={styles.customerLink}
                    >
                      {customer.displayName}
                    </Link>
                  </h2>
                  <p className={styles.customerMeta}>
                    {customer.phone || '-'} {customer.email ? `• ${customer.email}` : ''}
                  </p>
                </div>
                <div className={styles.customerStats}>
                  <span className={styles.statusBadge}>Jobs {customer.jobs.length}</span>
                  <span className={styles.statusBadge}>Visible {customer.visibleJobs.length}</span>
                  <span className={styles.statusBadge}>Hidden {customer.hiddenJobs.length}</span>
                  <span className={styles.statusBadge}>Invoices {customer.invoiceCount}</span>
                </div>
              </div>
              <div className={styles.customerSummaryRow}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Quoted Total</div>
                  <div className={styles.summaryValue}>${customer.totalQuoted.toFixed(2)}</div>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Device</th>
                      <th>Serial / IMEI</th>
                      <th>Status</th>
                      <th>Quote</th>
                      <th>Booked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.jobs.map((job) => (
                      <tr key={job.id}>
                        <td>{job.job_number || 'Pending'}</td>
                        <td>
                          {job.brand} {job.model}
                        </td>
                        <td>{job.serial_imei || '-'}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
                            {getStatusLabel(job.status)}
                          </span>
                        </td>
                        <td>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</td>
                        <td>{formatDateTime(job.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}