'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Customer, Invoice, RepairRequest } from '../types'
import { formatDateTime, getStatusLabel, normalizeMoneyValue } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type CustomerGroup = {
  customer: Customer
  jobs: RepairRequest[]
  visibleJobs: RepairRequest[]
  hiddenJobs: RepairRequest[]
  invoiceCount: number
  totalQuoted: number
  totalPartsCost: number
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
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
        const [
          { data: customersData, error: customersError },
          { data: jobsData, error: jobsError },
          { data: invoiceData, error: invoiceError },
        ] = await Promise.all([
          supabase
            .from('customers')
            .select(`
              id,
              full_name,
              phone,
              email,
              preferred_contact,
              billing_address,
              notes,
              is_active,
              created_at,
              updated_at
            `)
            .order('created_at', { ascending: false }),
          supabase
            .from('repair_requests')
            .select(`
              id,
              customer_id,
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
              repair_performed,
              status,
              preferred_contact,
              internal_notes,
              quoted_price,
              parts_cost,
              is_hidden,
              fault_photo_url,
              last_sms_sent_at,
              last_sms_to,
              last_sms_message
            `)
            .order('created_at', { ascending: false }),
          supabase
            .from('invoices')
            .select(`
              id,
              customer_id,
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
            .order('created_at', { ascending: false }),
        ])

        if (customersError) throw customersError
        if (jobsError) throw jobsError
        if (invoiceError) throw invoiceError

        const safeCustomers = ((customersData || []) as Customer[]).map((customer) => ({
          ...customer,
          phone: customer.phone ?? null,
          email: customer.email ?? null,
          preferred_contact: customer.preferred_contact ?? null,
          billing_address: customer.billing_address ?? null,
          notes: customer.notes ?? null,
          is_active: Boolean(customer.is_active),
        }))

        const safeJobs = ((jobsData || []) as RepairRequest[]).map((job) => ({
          ...job,
          customer_id: job.customer_id ?? null,
          internal_notes: job.internal_notes ?? '',
          quoted_price: normalizeMoneyValue(job.quoted_price),
          parts_cost: normalizeMoneyValue(job.parts_cost),
          serial_imei: job.serial_imei ?? null,
          repair_performed: job.repair_performed ?? '',
          is_hidden: Boolean(job.is_hidden),
          fault_photo_url: job.fault_photo_url ?? null,
          last_sms_sent_at: job.last_sms_sent_at ?? null,
          last_sms_to: job.last_sms_to ?? null,
          last_sms_message: job.last_sms_message ?? null,
        }))

        const safeInvoices = ((invoiceData || []) as Invoice[]).map((invoice) => ({
          ...invoice,
          customer_id: invoice.customer_id ?? null,
          tax_rate: Number(invoice.tax_rate ?? 0),
          subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
          tax_amount: Number(invoice.tax_amount ?? 0),
          subtotal: Number(invoice.subtotal ?? 0),
          total: Number(invoice.total ?? 0),
          customer_visible_notes: invoice.customer_visible_notes ?? null,
          internal_reference_notes: invoice.internal_reference_notes ?? null,
        }))

        setCustomers(safeCustomers)
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
    const jobsByCustomerId = jobs.reduce<Record<string, RepairRequest[]>>((acc, job) => {
      if (!job.customer_id) return acc
      if (!acc[job.customer_id]) acc[job.customer_id] = []
      acc[job.customer_id].push(job)
      return acc
    }, {})

    const invoiceCountByCustomerId = invoices.reduce<Record<string, number>>((acc, invoice) => {
      if (!invoice.customer_id) return acc
      acc[invoice.customer_id] = (acc[invoice.customer_id] || 0) + 1
      return acc
    }, {})

    const groups: CustomerGroup[] = customers.map((customer) => {
      const customerJobs = jobsByCustomerId[customer.id] || []
      const visibleJobs = customerJobs.filter((job) => !job.is_hidden)
      const hiddenJobs = customerJobs.filter((job) => job.is_hidden)

      return {
        customer,
        jobs: customerJobs,
        visibleJobs,
        hiddenJobs,
        invoiceCount: invoiceCountByCustomerId[customer.id] || 0,
        totalQuoted: customerJobs.reduce(
          (sum, job) => sum + (normalizeMoneyValue(job.quoted_price) ?? 0),
          0
        ),
        totalPartsCost: customerJobs.reduce(
          (sum, job) => sum + (normalizeMoneyValue(job.parts_cost) ?? 0),
          0
        ),
      }
    })

    const term = search.trim().toLowerCase()

    return groups
      .filter((group) => {
        if (!term) return true

        const haystack = [
          group.customer.full_name,
          group.customer.phone || '',
          group.customer.email || '',
          group.customer.preferred_contact || '',
          group.customer.billing_address || '',
          group.customer.notes || '',
          ...group.jobs.map((job) =>
            [
              job.job_number || '',
              job.brand,
              job.model,
              job.device_type || '',
              job.serial_imei || '',
              job.fault_description,
              job.repair_performed || '',
              job.status,
            ].join(' ')
          ),
        ]
          .join(' ')
          .toLowerCase()

        return haystack.includes(term)
      })
      .sort((a, b) => {
        const aLatest = a.jobs.length
          ? Math.max(...a.jobs.map((job) => new Date(job.created_at).getTime()))
          : new Date(a.customer.created_at).getTime()

        const bLatest = b.jobs.length
          ? Math.max(...b.jobs.map((job) => new Date(job.created_at).getTime()))
          : new Date(b.customer.created_at).getTime()

        return bLatest - aLatest
      })
  }, [customers, jobs, invoices, search])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Customers</h1>
          <p className={styles.pageSubtitle}>Customer database and linked repair history</p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Back to Dashboard
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            View Invoices
          </Link>
          <Link href="/admin/stats" className={styles.viewButton}>
            Stats
          </Link>
          <Link href="/admin/customers/new" className={styles.viewButton}>
            Add New Customer
          </Link>
        </div>
      </div>

      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, email, notes, device, serial, fault, repair..."
          className={styles.field}
        />
        <div className={styles.readOnlyValue}>
          Customers found: <strong style={{ marginLeft: 6 }}>{customerGroups.length}</strong>
        </div>
      </div>

      {loading ? <p className={styles.message}>Loading customers...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}

      {!loading && !error && customerGroups.length === 0 ? (
        <p className={styles.message}>No matching customers.</p>
      ) : null}

      {!loading && !error && customerGroups.length > 0 ? (
        <div className={styles.customerGrid}>
          {customerGroups.map((group) => (
            <section key={group.customer.id} className={styles.customerCard}>
              <div className={styles.customerCardHeader}>
                <div>
                  <h2 className={styles.customerTitle}>
                    <Link
                      href={`/admin/customer?id=${encodeURIComponent(group.customer.id)}`}
                      className={styles.customerLink}
                    >
                      {group.customer.full_name}
                    </Link>
                  </h2>

                  <p className={styles.customerMeta}>
                    {group.customer.phone || '-'}
                    {group.customer.email ? ` • ${group.customer.email}` : ''}
                  </p>
                </div>

                <div className={styles.customerStats}>
                  <span className={styles.statusBadge}>Jobs {group.jobs.length}</span>
                  <span className={styles.statusBadge}>Visible {group.visibleJobs.length}</span>
                  <span className={styles.statusBadge}>Hidden {group.hiddenJobs.length}</span>
                  <span className={styles.statusBadge}>Invoices {group.invoiceCount}</span>
                </div>
              </div>

              <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Quoted Total</div>
                  <div className={styles.summaryValue}>${group.totalQuoted.toFixed(2)}</div>
                </div>
                <div className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>Parts Cost Total</div>
                  <div className={styles.summaryValue}>${group.totalPartsCost.toFixed(2)}</div>
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={`${styles.table} ${styles.tableAligned}`}>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Device</th>
                      <th>Serial / IMEI</th>
                      <th>Status</th>
                      <th>Quote</th>
                      <th>Parts Cost</th>
                      <th>Booked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.jobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className={styles.tableCellCenter}>
                          No jobs yet
                        </td>
                      </tr>
                    ) : (
                      group.jobs.map((job) => (
                        <tr key={job.id}>
                          <td>{job.job_number || 'Pending'}</td>
                          <td className={styles.tableCellWrap}>
                            <div>
                              {job.brand} {job.model}
                              {job.device_type ? ` • ${job.device_type}` : ''}
                            </div>
                            <div className={styles.inlineMuted}>{job.fault_description}</div>
                            {job.repair_performed ? (
                              <div className={styles.inlineMuted}>
                                Repair: {job.repair_performed}
                              </div>
                            ) : null}
                          </td>
                          <td>{job.serial_imei || '-'}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
                              {getStatusLabel(job.status)}
                            </span>
                          </td>
                          <td>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</td>
                          <td>
                            {job.parts_cost != null ? `$${Number(job.parts_cost).toFixed(2)}` : '-'}
                          </td>
                          <td>{formatDateTime(job.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </main>
  )
}