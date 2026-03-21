'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Invoice, InvoiceRepairLink, RepairRequest } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function formatCurrency(value: number) {
  return `$${Number(value || 0).toFixed(2)}`
}

function todayLocal() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfMonthLocal() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}-01`
}

export default function AdminStatsPage() {
  const [startDate, setStartDate] = useState(startOfMonthLocal())
  const [endDate, setEndDate] = useState(todayLocal())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceLinks, setInvoiceLinks] = useState<InvoiceRepairLink[]>([])

  useEffect(() => {
    void loadData()
  }, [startDate, endDate])

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const startIso = `${startDate}T00:00:00`
      const endIso = `${endDate}T23:59:59`

      const [
        { data: invoicesData, error: invoicesError },
        { data: linksData, error: linksError },
      ] = await Promise.all([
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

        supabase
          .from('invoice_repair_links')
          .select(`
            id,
            invoice_id,
            repair_request_id,
            created_at
          `),
      ])

      if (invoicesError) throw invoicesError
      if (linksError) throw linksError

      const normalizedInvoices = ((invoicesData || []) as Invoice[]).map((invoice) => ({
        ...invoice,
        tax_rate: Number(invoice.tax_rate ?? 0),
        subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
        tax_amount: Number(invoice.tax_amount ?? 0),
        subtotal: Number(invoice.subtotal ?? 0),
        total: Number(invoice.total ?? 0),
        customer_visible_notes: invoice.customer_visible_notes ?? null,
        internal_reference_notes: invoice.internal_reference_notes ?? null,
      }))

      const filteredInvoices = normalizedInvoices.filter((invoice) => {
        const compareDate = invoice.paid_at || invoice.issued_at || invoice.created_at
        return compareDate >= startIso && compareDate <= endIso
      })

      const linkedJobIds = new Set<string>()

      for (const invoice of filteredInvoices) {
        linkedJobIds.add(invoice.repair_request_id)
      }

      for (const link of (linksData || []) as InvoiceRepairLink[]) {
        if (filteredInvoices.some((invoice) => invoice.id === link.invoice_id)) {
          linkedJobIds.add(link.repair_request_id)
        }
      }

      const jobIdsArray = Array.from(linkedJobIds)

      let normalizedJobs: RepairRequest[] = []

      if (jobIdsArray.length > 0) {
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
            repair_performed,
            status,
            preferred_contact,
            internal_notes,
            quoted_price,
            parts_cost,
            is_hidden
          `)
          .in('id', jobIdsArray)

        if (jobsError) throw jobsError

        normalizedJobs = ((jobsData || []) as RepairRequest[]).map((job) => ({
          ...job,
          internal_notes: job.internal_notes ?? '',
          quoted_price: job.quoted_price ?? null,
          parts_cost: job.parts_cost ?? null,
          serial_imei: job.serial_imei ?? null,
          is_hidden: Boolean(job.is_hidden),
          repair_performed: job.repair_performed ?? '',
        }))
      }

      setInvoices(filteredInvoices)
      setInvoiceLinks((linksData || []) as InvoiceRepairLink[])
      setJobs(normalizedJobs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]))

    const linksByInvoiceId = invoiceLinks.reduce<Record<string, string[]>>((acc, link) => {
      if (!acc[link.invoice_id]) acc[link.invoice_id] = []
      acc[link.invoice_id].push(link.repair_request_id)
      return acc
    }, {})

    function getLinkedJobIdsForInvoice(invoice: Invoice) {
      const linkedIds = linksByInvoiceId[invoice.id] || []
      if (linkedIds.length > 0) return linkedIds
      return invoice.repair_request_id ? [invoice.repair_request_id] : []
    }

    function getLinkedJobsForInvoice(invoice: Invoice) {
      return getLinkedJobIdsForInvoice(invoice)
        .map((jobId) => jobsById.get(jobId))
        .filter(Boolean) as RepairRequest[]
    }

    function getLinkedPartsCostForInvoice(invoice: Invoice) {
      return getLinkedJobsForInvoice(invoice).reduce(
        (sum, job) => sum + Number(job.parts_cost ?? 0),
        0
      )
    }

    const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid')
    const issuedInvoices = invoices.filter(
      (invoice) => invoice.status === 'issued' || invoice.status === 'paid'
    )
    const unpaidInvoices = invoices.filter((invoice) => invoice.status === 'issued')

    const quotedValue = jobs.reduce((sum, job) => sum + Number(job.quoted_price ?? 0), 0)
    const partsCostTotal = jobs.reduce((sum, job) => sum + Number(job.parts_cost ?? 0), 0)

    const paidRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)
    const issuedRevenue = issuedInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total ?? 0),
      0
    )
    const unpaidRevenue = unpaidInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total ?? 0),
      0
    )

    const paidJobsCost = paidInvoices.reduce(
      (sum, invoice) => sum + getLinkedPartsCostForInvoice(invoice),
      0
    )

    const issuedJobsCost = issuedInvoices.reduce(
      (sum, invoice) => sum + getLinkedPartsCostForInvoice(invoice),
      0
    )

    const unpaidJobsCost = unpaidInvoices.reduce(
      (sum, invoice) => sum + getLinkedPartsCostForInvoice(invoice),
      0
    )

    const grossProfit = paidRevenue - paidJobsCost
    const grossMargin = paidRevenue > 0 ? (grossProfit / paidRevenue) * 100 : 0

    return {
      totalJobs: jobs.length,
      visibleJobs: jobs.filter((job) => !job.is_hidden).length,
      hiddenJobs: jobs.filter((job) => job.is_hidden).length,
      paidInvoices: paidInvoices.length,
      issuedInvoices: issuedInvoices.length,
      unpaidInvoices: unpaidInvoices.length,
      quotedValue,
      issuedRevenue,
      paidRevenue,
      unpaidRevenue,
      partsCostTotal,
      paidJobsCost,
      issuedJobsCost,
      unpaidJobsCost,
      grossProfit,
      grossMargin,
      paidInvoicesList: paidInvoices.map((invoice) => ({
        ...invoice,
        linkedJobs: getLinkedJobsForInvoice(invoice),
        linkedPartsCost: getLinkedPartsCostForInvoice(invoice),
        invoiceProfit: Number(invoice.total ?? 0) - getLinkedPartsCostForInvoice(invoice),
      })),
    }
  }, [jobs, invoices, invoiceLinks])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Stats</h1>
          <p className={styles.pageSubtitle}>
            Revenue, linked job costs and gross profit for a selected date range
          </p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Dashboard
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            Invoices
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>
        </div>
      </div>

      <div className={styles.filtersWrap}>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={styles.field}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={styles.field}
        />
      </div>

      {loading ? <p className={styles.message}>Loading stats...</p> : null}
      {error ? <p className={styles.errorText}>{error}</p> : null}

      {!loading && !error ? (
        <>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Jobs Linked in Range</div>
              <div className={styles.summaryValue}>{stats.totalJobs}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Quoted Value</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.quotedValue)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Issued Revenue</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.issuedRevenue)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Paid Revenue</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.paidRevenue)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Parts Cost on Linked Jobs</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.partsCostTotal)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Cost on Issued Invoices</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.issuedJobsCost)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Cost on Paid Invoices</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.paidJobsCost)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Gross Profit</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.grossProfit)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Gross Margin</div>
              <div className={styles.summaryValue}>{stats.grossMargin.toFixed(1)}%</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Unpaid Invoice Total</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.unpaidRevenue)}</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>Cost on Unpaid Invoices</div>
              <div className={styles.summaryValue}>{formatCurrency(stats.unpaidJobsCost)}</div>
            </div>
          </div>

          <section className={styles.otherStatusesSection}>
            <h2 className={styles.sectionTitle}>Paid invoices in range</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Linked Jobs</th>
                    <th>Revenue</th>
                    <th>Parts Cost</th>
                    <th>Gross Profit</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.paidInvoicesList.length === 0 ? (
                    <tr>
                      <td colSpan={7}>No paid invoices in this range.</td>
                    </tr>
                  ) : (
                    stats.paidInvoicesList.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <Link
                            href={`/admin/invoice?id=${invoice.id}`}
                            className={styles.inlineLink}
                          >
                            {invoice.invoice_number}
                          </Link>
                        </td>
                        <td>{invoice.customer_name}</td>
                        <td>
                          <div className={styles.invoiceLinkStack}>
                            {invoice.linkedJobs.length === 0 ? (
                              <span>-</span>
                            ) : (
                              invoice.linkedJobs.map((job) => (
                                <span key={job.id}>
                                  {job.job_number || 'Pending'} — {job.brand} {job.model}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td>{formatCurrency(Number(invoice.total ?? 0))}</td>
                        <td>{formatCurrency(invoice.linkedPartsCost)}</td>
                        <td>{formatCurrency(invoice.invoiceProfit)}</td>
                        <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}