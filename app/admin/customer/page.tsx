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

export default function CustomerDetailPage() {
  const [customerKey, setCustomerKey] = useState('')
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingGroupedInvoice, setCreatingGroupedInvoice] = useState(false)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setCustomerKey(params.get('key') || '')
  }, [])

  useEffect(() => {
    async function loadData() {
      if (!customerKey) {
        setError('Missing customer key')
        setLoading(false)
        return
      }
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
        const matchingJobs = safeJobs.filter((job) => buildCustomerKey(job) === customerKey)
        const safeInvoices = ((invoiceData || []) as Invoice[]).map((invoice) => ({
          ...invoice,
          tax_rate: Number(invoice.tax_rate ?? 0),
          subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
          tax_amount: Number(invoice.tax_amount ?? 0),
          subtotal: Number(invoice.subtotal ?? 0),
          total: Number(invoice.total ?? 0),
        }))
        const jobIds = new Set(matchingJobs.map((job) => job.id))
        const matchingInvoices = safeInvoices.filter((invoice) =>
          jobIds.has(invoice.repair_request_id)
        )
        setJobs(matchingJobs)
        setInvoices(matchingInvoices)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customer')
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [customerKey])

  const customerSummary = useMemo(() => {
    if (jobs.length === 0) return null
    const newest = jobs[0]
    const visibleJobs = jobs.filter((job) => !job.is_hidden)
    const hiddenJobs = jobs.filter((job) => job.is_hidden)
    const quotedTotal = jobs.reduce((sum, job) => sum + (job.quoted_price ?? 0), 0)
    return {
      name: newest.full_name,
      phone: newest.phone || '',
      email: newest.email || '',
      visibleCount: visibleJobs.length,
      hiddenCount: hiddenJobs.length,
      totalJobs: jobs.length,
      quotedTotal,
      invoiceCount: invoices.length,
    }
  }, [jobs, invoices])

  const invoicesByJobId = useMemo(() => {
    return invoices.reduce<Record<string, Invoice[]>>((acc, invoice) => {
      if (!acc[invoice.repair_request_id]) acc[invoice.repair_request_id] = []
      acc[invoice.repair_request_id].push(invoice)
      return acc
    }, {})
  }, [invoices])

  const selectableJobs = useMemo(() => {
    return jobs.filter((job) => !job.is_hidden)
  }, [jobs])

  function toggleSelectedJob(jobId: string) {
    setSelectedJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    )
  }

  function selectAllVisibleJobs() {
    setSelectedJobIds(selectableJobs.map((job) => job.id))
  }

  function clearSelectedJobs() {
    setSelectedJobIds([])
  }

  async function deleteJob(jobId: string) {
    if (!window.confirm('Are you sure you want to delete this job? This cannot be undone.')) return

    setDeleting(true)
    const { error } = await supabase
      .from('repair_requests')
      .delete()
      .eq('id', jobId)

    if (error) {
      setError(error.message)
      setDeleting(false)
      return
    }

    setJobs((prev) => prev.filter((j) => j.id !== jobId))
    setSelectedJobIds((prev) => prev.filter((id) => id !== jobId))
    setDeleting(false)
  }

  async function bulkDeleteJobs() {
    if (selectedJobIds.length === 0) return
    if (!window.confirm(`Are you sure you want to delete ${selectedJobIds.length} selected jobs? This cannot be undone.`)) return

    setDeleting(true)
    const { error } = await supabase
      .from('repair_requests')
      .delete()
      .in('id', selectedJobIds)

    if (error) {
      setError(error.message)
      setDeleting(false)
      return
    }

    setJobs((prev) => prev.filter((j) => !selectedJobIds.includes(j.id)))
    setSelectedJobIds([])
    setDeleting(false)
  }

  async function handleCreateGroupedInvoice() {
    if (!customerSummary) return
    if (selectedJobIds.length === 0) {
      setError('Select at least one visible job first.')
      return
    }
    setCreatingGroupedInvoice(true)
    setError('')
    const selectedJobs = jobs.filter((job) => selectedJobIds.includes(job.id))
    const primaryJob = selectedJobs[0]
    if (!primaryJob) {
      setError('No valid jobs selected.')
      setCreatingGroupedInvoice(false)
      return
    }
    const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc(
      'generate_invoice_number'
    )
    if (invoiceNumberError || !invoiceNumberData) {
      setError(invoiceNumberError?.message || 'Failed to generate invoice number')
      setCreatingGroupedInvoice(false)
      return
    }
    const invoiceNumber = String(invoiceNumberData)
    const subtotal = selectedJobs.reduce((sum, job) => sum + (job.quoted_price ?? 0), 0)
    const referenceLines = selectedJobs.map((job) => {
      const device = [job.brand, job.model, job.device_type].filter(Boolean).join(' • ')
      const serial = job.serial_imei?.trim() ? ` | Serial/IMEI: ${job.serial_imei.trim()}` : ''
      return `${job.job_number || 'Pending'} | ${device}${serial}`
    })
    const invoiceNotes = `Repair references:\n${referenceLines.join('\n')}`
    const { data: insertedInvoice, error: invoiceInsertError } = await supabase
      .from('invoices')
      .insert({
        repair_request_id: primaryJob.id,
        invoice_number: invoiceNumber,
        status: 'draft',
        customer_name: customerSummary.name,
        customer_phone: customerSummary.phone || null,
        customer_email: customerSummary.email || null,
        tax_mode: 'exclusive',
        tax_rate: 0.1,
        subtotal_ex_tax: subtotal,
        tax_amount: 0,
        subtotal,
        total: subtotal,
        notes: invoiceNotes,
      })
      .select('id')
      .single()
    if (invoiceInsertError || !insertedInvoice) {
      setError(invoiceInsertError?.message || 'Failed to create invoice')
      setCreatingGroupedInvoice(false)
      return
    }
    const linkRows = selectedJobs.map((job) => ({
      invoice_id: insertedInvoice.id,
      repair_request_id: job.id,
    }))
    const { error: linkError } = await supabase
      .from('invoice_repair_links')
      .insert(linkRows)
    if (linkError) {
      await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
      setError(linkError.message || 'Failed to link jobs to invoice')
      setCreatingGroupedInvoice(false)
      return
    }
    const itemRows = selectedJobs.map((job, index) => {
      const cleanDevice = [job.brand, job.model].filter(Boolean).join(' ')
      const cleanFault = job.fault_description.trim()
      return {
        invoice_id: insertedInvoice.id,
        description: `${cleanDevice} • ${cleanFault}`,
        qty: 1,
        unit_price: Number(job.quoted_price ?? 0),
        line_total: Number(job.quoted_price ?? 0),
        sort_order: index,
      }
    })
    const { error: itemError } = await supabase
      .from('invoice_items')
      .insert(itemRows)
    if (itemError) {
      await supabase.from('invoice_repair_links').delete().eq('invoice_id', insertedInvoice.id)
      await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
      setError(itemError.message || 'Failed to create invoice items')
      setCreatingGroupedInvoice(false)
      return
    }
    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: insertedInvoice.id,
    })
    if (recalcError) {
      setError(recalcError.message || 'Invoice created, but total recalculation failed')
      setCreatingGroupedInvoice(false)
      return
    }
    window.location.href = `/admin/invoice?id=${insertedInvoice.id}`
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Loading customer details...</p>
      </main>
    )
  }

  if (error && !customerSummary) {
    return (
      <main className={styles.page}>
        <p className={styles.errorText}>{error}</p>
        <div className={styles.toolbar}>
          <Link href="/admin/customers" className={styles.viewButton}>
            Back to Customers
          </Link>
        </div>
      </main>
    )
  }

  if (!customerSummary) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Customer not found.</p>
        <div className={styles.toolbar}>
          <Link href="/admin/customers" className={styles.viewButton}>
            Back to Customers
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
          <h1 className={styles.pageTitle}>{customerSummary.name}</h1>
          <p className={styles.pageSubtitle}>
            Full repair and invoice history for this customer
          </p>
        </div>
        <div className={styles.toolbar}>
          <Link href="/admin/customers" className={styles.viewButton}>
            Back to Customers
          </Link>
          <Link href="/admin" className={styles.viewButton}>
            Dashboard
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            Invoices
          </Link>
          <Link
            href={`/admin/jobs/new?full_name=${encodeURIComponent(customerSummary.name)}&phone=${encodeURIComponent(customerSummary.phone)}&email=${encodeURIComponent(customerSummary.email)}`}
            className={styles.viewButton}
          >
            New Job for Customer
          </Link>
        </div>
      </div>
      {!!error && <p className={styles.errorText}>{error}</p>}
      <div className={styles.customerDetailHeader}>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Phone</div>
            <div className={styles.summaryValueSmall}>{customerSummary.phone || '-'}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Email</div>
            <div className={styles.summaryValueSmall}>{customerSummary.email || '-'}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Jobs</div>
            <div className={styles.summaryValue}>{customerSummary.totalJobs}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Visible Jobs</div>
            <div className={styles.summaryValue}>{customerSummary.visibleCount}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Hidden Jobs</div>
            <div className={styles.summaryValue}>{customerSummary.hiddenCount}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Invoices</div>
            <div className={styles.summaryValue}>{customerSummary.invoiceCount}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Quoted Total</div>
            <div className={styles.summaryValue}>${customerSummary.quotedTotal.toFixed(2)}</div>
          </div>
        </div>
      </div>
      <section className={styles.customerDetailSection}>
        <div className={styles.customerSectionHeader}>
          <h2 className={styles.sectionTitle}>Jobs</h2>
          <div className={styles.bulkBarActions}>
            <button
              type="button"
              className={styles.miniButton}
              onClick={selectAllVisibleJobs}
            >
              Select All Visible
            </button>
            <button
              type="button"
              className={styles.miniButton}
              onClick={clearSelectedJobs}
            >
              Clear Selection
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void handleCreateGroupedInvoice()}
              disabled={creatingGroupedInvoice || selectedJobIds.length === 0}
            >
              {creatingGroupedInvoice ? 'Creating...' : `Create Grouped Invoice (${selectedJobIds.length})`}
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={bulkDeleteJobs}
              disabled={deleting || selectedJobIds.length === 0}
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selectedJobIds.length})`}
            </button>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Select</th>
                <th>Job</th>
                <th>Device</th>
                <th>Serial / IMEI</th>
                <th>Status</th>
                <th>Visible</th>
                <th>Quote</th>
                <th>Booked</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const linkedInvoices = invoicesByJobId[job.id] || []
                const canSelect = !job.is_hidden
                return (
                  <tr key={job.id}>
                    <td>
                      {canSelect ? (
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(job.id)}
                          onChange={() => toggleSelectedJob(job.id)}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{job.job_number || 'Pending'}</td>
                    <td>
                      {job.brand} {job.model}
                      {job.device_type ? ` • ${job.device_type}` : ''}
                      <div className={styles.inlineMuted}>{job.fault_description}</div>
                    </td>
                    <td>{job.serial_imei || '-'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </td>
                    <td>{job.is_hidden ? 'Hidden' : 'Visible'}</td>
                    <td>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</td>
                    <td>{formatDateTime(job.created_at)}</td>
                    <td>
                      {linkedInvoices.length === 0 ? (
                        '-'
                      ) : (
                        <div className={styles.invoiceLinkStack}>
                          {linkedInvoices.map((invoice) => (
                            <Link
                              key={invoice.id}
                              href={`/admin/invoice?id=${invoice.id}`}
                              className={styles.inlineLink}
                            >
                              {invoice.invoice_number}
                            </Link>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className={styles.customerDetailSection}>
        <h2 className={styles.sectionTitle}>Invoices</h2>
        {invoices.length === 0 ? (
          <p className={styles.message}>No invoices for this customer yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issued</th>
                  <th>Paid</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoice_number}</td>
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
      </section>
    </main>
  )
}