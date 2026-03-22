'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type { Customer, Invoice, RepairRequest } from '../types'
import { formatDateTime, getStatusLabel, normalizeMoneyValue } from '../utils'
import useDeleteRepairRequests from '../hooks/useDeleteRepairRequests'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function CustomerDetailPage() {
  const [customerId, setCustomerId] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingGroupedInvoice, setCreatingGroupedInvoice] = useState(false)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])

  const [customerDraft, setCustomerDraft] = useState({
    full_name: '',
    phone: '',
    email: '',
    preferred_contact: '',
    billing_address: '',
    notes: '',
    is_active: true,
  })

  const [propagateIdentityChanges, setPropagateIdentityChanges] = useState(true)
  const [propagateDetailChanges, setPropagateDetailChanges] = useState(true)

  const [identitySaveState, setIdentitySaveState] = useState<SaveState>('idle')
  const [detailSaveState, setDetailSaveState] = useState<SaveState>('idle')
  const [notesSaveState, setNotesSaveState] = useState<SaveState>('idle')

  const {
    deleting,
    deleteError,
    deleteSingle,
    deleteBulk,
  } = useDeleteRepairRequests()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    setCustomerId(params.get('id') || '')
  }, [])

  useEffect(() => {
    if (deleteError) {
      setError(deleteError)
    }
  }, [deleteError])

  useEffect(() => {
    async function loadData() {
      if (!customerId) {
        setError('Missing customer ID')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const [
          { data: customerData, error: customerError },
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
            .eq('id', customerId)
            .single(),
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
            .eq('customer_id', customerId)
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
              last_sms_sent_at,
              last_sms_to,
              last_sms_message,
              created_at,
              updated_at
            `)
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false }),
        ])

        if (customerError) throw customerError
        if (jobsError) throw jobsError
        if (invoiceError) throw invoiceError

        const safeCustomer = (customerData || null) as Customer | null
        setCustomer(safeCustomer)

        if (safeCustomer) {
          setCustomerDraft({
            full_name: safeCustomer.full_name || '',
            phone: safeCustomer.phone || '',
            email: safeCustomer.email || '',
            preferred_contact: safeCustomer.preferred_contact || '',
            billing_address: safeCustomer.billing_address || '',
            notes: safeCustomer.notes || '',
            is_active: Boolean(safeCustomer.is_active),
          })
        }

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
          last_sms_sent_at: invoice.last_sms_sent_at ?? null,
          last_sms_to: invoice.last_sms_to ?? null,
          last_sms_message: invoice.last_sms_message ?? null,
        }))

        setJobs(safeJobs)
        setInvoices(safeInvoices)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customer')
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [customerId])

  const customerSummary = useMemo(() => {
    if (!customer) return null

    const visibleJobs = jobs.filter((job) => !job.is_hidden)
    const hiddenJobs = jobs.filter((job) => job.is_hidden)

    const quotedTotal = jobs.reduce(
      (sum, job) => sum + (normalizeMoneyValue(job.quoted_price) ?? 0),
      0
    )

    const totalPartsCost = jobs.reduce(
      (sum, job) => sum + (normalizeMoneyValue(job.parts_cost) ?? 0),
      0
    )

    return {
      ...customer,
      visibleCount: visibleJobs.length,
      hiddenCount: hiddenJobs.length,
      totalJobs: jobs.length,
      quotedTotal,
      totalPartsCost,
      invoiceCount: invoices.length,
    }
  }, [customer, jobs, invoices])

  const invoicesByJobId = useMemo(() => {
    return invoices.reduce<Record<string, Invoice[]>>((acc, invoice) => {
      if (!acc[invoice.repair_request_id]) acc[invoice.repair_request_id] = []
      acc[invoice.repair_request_id].push(invoice)
      return acc
    }, {})
  }, [invoices])

  const selectableJobs = useMemo(() => jobs.filter((job) => !job.is_hidden), [jobs])

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

  function setSavedBriefly(setter: React.Dispatch<React.SetStateAction<SaveState>>) {
    setter('saved')
    window.setTimeout(() => {
      setter((prev) => (prev === 'saved' ? 'idle' : prev))
    }, 1300)
  }

  async function saveIdentityDetails() {
    if (!customer) return

    const full_name = normalizeName(customerDraft.full_name)
    const phone = normalizePhone(customerDraft.phone)
    const email = normalizeEmail(customerDraft.email)

    if (!full_name) {
      setError('Full name is required.')
      setIdentitySaveState('error')
      return
    }

    setIdentitySaveState('saving')
    setError('')

    const { data, error: customerUpdateError } = await supabase
      .from('customers')
      .update({
        full_name,
        phone: phone || null,
        email: email || null,
      })
      .eq('id', customer.id)
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
      .single()

    if (customerUpdateError || !data) {
      setIdentitySaveState('error')
      setError(customerUpdateError?.message || 'Failed to save customer identity')
      return
    }

    if (propagateIdentityChanges) {
      const [{ error: jobsUpdateError }, { error: invoicesUpdateError }] = await Promise.all([
        supabase
          .from('repair_requests')
          .update({
            full_name,
            phone: phone || '',
            email: email || null,
          })
          .eq('customer_id', customer.id),
        supabase
          .from('invoices')
          .update({
            customer_name: full_name,
            customer_phone: phone || null,
            customer_email: email || null,
          })
          .eq('customer_id', customer.id),
      ])

      if (jobsUpdateError || invoicesUpdateError) {
        setIdentitySaveState('error')
        setError(
          jobsUpdateError?.message ||
            invoicesUpdateError?.message ||
            'Customer saved, but linked record propagation failed'
        )
        return
      }
    }

    const updatedCustomer = data as Customer
    setCustomer(updatedCustomer)
    setCustomerDraft((prev) => ({
      ...prev,
      full_name: updatedCustomer.full_name || '',
      phone: updatedCustomer.phone || '',
      email: updatedCustomer.email || '',
    }))

    if (propagateIdentityChanges) {
      setJobs((prev) =>
        prev.map((job) => ({
          ...job,
          full_name: updatedCustomer.full_name,
          phone: updatedCustomer.phone || '',
          email: updatedCustomer.email || null,
        }))
      )

      setInvoices((prev) =>
        prev.map((invoice) => ({
          ...invoice,
          customer_name: updatedCustomer.full_name,
          customer_phone: updatedCustomer.phone || null,
          customer_email: updatedCustomer.email || null,
        }))
      )
    }

    setSavedBriefly(setIdentitySaveState)
  }

  async function saveCustomerDetails() {
    if (!customer) return

    const preferred_contact = customerDraft.preferred_contact.trim() || null
    const billing_address = customerDraft.billing_address.trim() || null
    const is_active = Boolean(customerDraft.is_active)

    setDetailSaveState('saving')
    setError('')

    const { data, error: customerUpdateError } = await supabase
      .from('customers')
      .update({
        preferred_contact,
        billing_address,
        is_active,
      })
      .eq('id', customer.id)
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
      .single()

    if (customerUpdateError || !data) {
      setDetailSaveState('error')
      setError(customerUpdateError?.message || 'Failed to save customer details')
      return
    }

    if (propagateDetailChanges) {
      const [{ error: jobsUpdateError }, { error: invoicesUpdateError }] = await Promise.all([
        supabase
          .from('repair_requests')
          .update({
            preferred_contact,
          })
          .eq('customer_id', customer.id),
        supabase
          .from('invoices')
          .update({
            bill_to_address: billing_address,
          })
          .eq('customer_id', customer.id),
      ])

      if (jobsUpdateError || invoicesUpdateError) {
        setDetailSaveState('error')
        setError(
          jobsUpdateError?.message ||
            invoicesUpdateError?.message ||
            'Customer saved, but linked record propagation failed'
        )
        return
      }
    }

    const updatedCustomer = data as Customer
    setCustomer(updatedCustomer)
    setCustomerDraft((prev) => ({
      ...prev,
      preferred_contact: updatedCustomer.preferred_contact || '',
      billing_address: updatedCustomer.billing_address || '',
      is_active: Boolean(updatedCustomer.is_active),
    }))

    if (propagateDetailChanges) {
      setJobs((prev) =>
        prev.map((job) => ({
          ...job,
          preferred_contact: updatedCustomer.preferred_contact || null,
        }))
      )

      setInvoices((prev) =>
        prev.map((invoice) => ({
          ...invoice,
          bill_to_address: updatedCustomer.billing_address || null,
        }))
      )
    }

    setSavedBriefly(setDetailSaveState)
  }

  async function saveCustomerNotes() {
    if (!customer) return

    setNotesSaveState('saving')
    setError('')

    const { data, error: updateError } = await supabase
      .from('customers')
      .update({
        notes: customerDraft.notes.trim() || null,
      })
      .eq('id', customer.id)
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
      .single()

    if (updateError || !data) {
      setNotesSaveState('error')
      setError(updateError?.message || 'Failed to save customer notes')
      return
    }

    const updatedCustomer = data as Customer
    setCustomer(updatedCustomer)
    setCustomerDraft((prev) => ({
      ...prev,
      notes: updatedCustomer.notes || '',
    }))

    setSavedBriefly(setNotesSaveState)
  }

  async function deleteJob(jobId: string) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this job? This cannot be undone.'
    )
    if (!confirmed) return

    setError('')

    const result = await deleteSingle(jobId)

    if (!result.success) {
      setError(result.error || 'Failed to delete job')
      return
    }

    setJobs((prev) => prev.filter((job) => job.id !== jobId))
    setSelectedJobIds((prev) => prev.filter((id) => id !== jobId))
    window.location.href = `/admin/customer?id=${customerId}`
  }

  async function bulkDeleteJobs() {
    if (selectedJobIds.length === 0) return

    const confirmed = window.confirm(
      `Are you sure you want to delete ${selectedJobIds.length} selected jobs? This cannot be undone.`
    )
    if (!confirmed) return

    setError('')

    const idsToDelete = [...selectedJobIds]
    const result = await deleteBulk(idsToDelete)

    if (!result.success) {
      setError(result.error || 'Failed to delete selected jobs')
      return
    }

    setJobs((prev) => prev.filter((job) => !idsToDelete.includes(job.id)))
    setSelectedJobIds([])
    window.location.href = `/admin/customer?id=${customerId}`
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
    const subtotal = selectedJobs.reduce(
      (sum, job) => sum + (normalizeMoneyValue(job.quoted_price) ?? 0),
      0
    )

    const referenceLines = selectedJobs.map((job) => {
      const device = [job.brand, job.model, job.device_type].filter(Boolean).join(' • ')
      const serial = job.serial_imei?.trim() ? ` | Serial/IMEI: ${job.serial_imei.trim()}` : ''
      const repair = job.repair_performed?.trim()
        ? ` | Repair: ${job.repair_performed.trim()}`
        : ''
      return `${job.job_number || 'Pending'} | ${device}${serial}${repair}`
    })

    const invoiceNotes = `Repair references:\n${referenceLines.join('\n')}`

    const { data: insertedInvoice, error: invoiceInsertError } = await supabase
      .from('invoices')
      .insert({
        customer_id: customerSummary.id,
        repair_request_id: primaryJob.id,
        invoice_number: invoiceNumber,
        status: 'draft',
        customer_name: customerSummary.full_name,
        customer_phone: customerSummary.phone || null,
        customer_email: customerSummary.email || null,
        bill_to_address: customerSummary.billing_address || null,
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
      const cleanRepair = job.repair_performed?.trim() || job.fault_description.trim()

      return {
        invoice_id: insertedInvoice.id,
        description: `${cleanDevice} • ${cleanRepair}`,
        qty: 1,
        unit_price: normalizeMoneyValue(job.quoted_price) ?? 0,
        line_total: normalizeMoneyValue(job.quoted_price) ?? 0,
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
          <h1 className={styles.pageTitle}>{customerSummary.full_name}</h1>
          <p className={styles.pageSubtitle}>Full repair and invoice history for this customer</p>
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
          <Link href="/admin/stats" className={styles.viewButton}>
            Stats
          </Link>
          <Link
            href={`/admin/jobs/new?customer_id=${encodeURIComponent(customerSummary.id)}`}
            className={styles.viewButton}
          >
            New Job for Customer
          </Link>
        </div>
      </div>

      {error ? <p className={styles.errorText}>{error}</p> : null}

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
            <div className={styles.summaryLabel}>Preferred Contact</div>
            <div className={styles.summaryValueSmall}>
              {customerSummary.preferred_contact || '-'}
            </div>
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
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Parts Cost Total</div>
            <div className={styles.summaryValue}>
              ${customerSummary.totalPartsCost.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <section className={styles.customerDetailSection}>
        <div className={styles.customerSectionHeader}>
          <h2 className={styles.sectionTitle}>Customer Details</h2>
        </div>

        <div className={styles.customerFormCard}>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.smallLabel}>Full Name</label>
              <input
                value={customerDraft.full_name}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({ ...prev, full_name: e.target.value }))
                }
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Phone</label>
              <input
                value={customerDraft.phone}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({
                    ...prev,
                    phone: normalizePhone(e.target.value),
                  }))
                }
                className={styles.smallField}
                inputMode="numeric"
                maxLength={10}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Email</label>
              <input
                value={customerDraft.email}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({ ...prev, email: e.target.value }))
                }
                className={styles.smallField}
              />
            </div>

            <div className={styles.customerFullWidth}>
              <label className={styles.archiveCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={propagateIdentityChanges}
                  onChange={(e) => setPropagateIdentityChanges(e.target.checked)}
                />
                <span>Also update linked jobs and invoices with name / phone / email</span>
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void saveIdentityDetails()}
                disabled={identitySaveState === 'saving'}
              >
                {identitySaveState === 'saving' ? 'Saving...' : 'Save Identity'}
              </button>
              <span className={styles.inlineMuted}>
                {identitySaveState === 'saved'
                  ? 'Saved'
                  : identitySaveState === 'error'
                    ? 'Error'
                    : ''}
              </span>
            </div>

            <div>
              <label className={styles.smallLabel}>Preferred Contact</label>
              <input
                value={customerDraft.preferred_contact}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({
                    ...prev,
                    preferred_contact: e.target.value,
                  }))
                }
                className={styles.smallField}
                placeholder="sms, phone, email"
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Status</label>
              <select
                value={customerDraft.is_active ? 'active' : 'inactive'}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({
                    ...prev,
                    is_active: e.target.value === 'active',
                  }))
                }
                className={styles.smallField}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Billing Address</label>
              <textarea
                value={customerDraft.billing_address}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({
                    ...prev,
                    billing_address: e.target.value,
                  }))
                }
                className={styles.notesField}
                placeholder="Billing address"
              />
            </div>

            <div className={styles.customerFullWidth}>
              <label className={styles.archiveCheckboxLabel}>
                <input
                  type="checkbox"
                  checked={propagateDetailChanges}
                  onChange={(e) => setPropagateDetailChanges(e.target.checked)}
                />
                <span>
                  Also update linked jobs and invoices with preferred contact / billing address
                </span>
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void saveCustomerDetails()}
                disabled={detailSaveState === 'saving'}
              >
                {detailSaveState === 'saving' ? 'Saving...' : 'Save Details'}
              </button>
              <span className={styles.inlineMuted}>
                {detailSaveState === 'saved'
                  ? 'Saved'
                  : detailSaveState === 'error'
                    ? 'Error'
                    : ''}
              </span>
            </div>

            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Customer Notes</label>
              <textarea
                value={customerDraft.notes}
                onChange={(e) =>
                  setCustomerDraft((prev) => ({ ...prev, notes: e.target.value }))
                }
                className={styles.notesField}
                placeholder="Customer notes"
              />
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void saveCustomerNotes()}
                disabled={notesSaveState === 'saving'}
              >
                {notesSaveState === 'saving' ? 'Saving...' : 'Save Notes'}
              </button>
              <span className={styles.inlineMuted}>
                {notesSaveState === 'saved'
                  ? 'Saved'
                  : notesSaveState === 'error'
                    ? 'Error'
                    : ''}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.customerDetailSection}>
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarText}>
            Selected visible jobs: <strong>{selectedJobIds.length}</strong>
          </div>

          <div className={styles.bulkBarActions}>
            <button type="button" className={styles.actionButton} onClick={selectAllVisibleJobs}>
              Select All Visible
            </button>
            <button type="button" className={styles.actionButton} onClick={clearSelectedJobs}>
              Clear Selection
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void handleCreateGroupedInvoice()}
              disabled={creatingGroupedInvoice || selectedJobIds.length === 0}
            >
              {creatingGroupedInvoice
                ? 'Creating...'
                : `Create Grouped Invoice (${selectedJobIds.length})`}
            </button>
            <button
              type="button"
              className={styles.deleteButton}
              onClick={() => void bulkDeleteJobs()}
              disabled={deleting || selectedJobIds.length === 0}
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selectedJobIds.length})`}
            </button>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>Jobs</h2>

        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.tableAligned}`}>
            <thead>
              <tr>
                <th className={styles.tableCellCenter}>Select</th>
                <th>Job</th>
                <th>Device</th>
                <th>Serial / IMEI</th>
                <th>Status</th>
                <th>Visible</th>
                <th>Quote</th>
                <th>Parts Cost</th>
                <th>Booked</th>
                <th>Invoice</th>
                <th className={styles.tableCellCenter}>Delete</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const linkedInvoices = invoicesByJobId[job.id] || []
                const canSelect = !job.is_hidden

                return (
                  <tr key={job.id}>
                    <td className={styles.tableCellCenter}>
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
                    <td className={styles.tableCellWrap}>
                      <div>
                        {job.brand} {job.model}
                        {job.device_type ? ` • ${job.device_type}` : ''}
                      </div>
                      <div className={styles.inlineMuted}>{job.fault_description}</div>
                      {job.repair_performed ? (
                        <div className={styles.inlineMuted}>Repair: {job.repair_performed}</div>
                      ) : null}
                    </td>
                    <td>{job.serial_imei || '-'}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
                        {getStatusLabel(job.status)}
                      </span>
                    </td>
                    <td>{job.is_hidden ? 'Hidden' : 'Visible'}</td>
                    <td>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</td>
                    <td>
                      {job.parts_cost != null ? `$${Number(job.parts_cost).toFixed(2)}` : '-'}
                    </td>
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
                    <td className={styles.tableButtonCell}>
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => void deleteJob(job.id)}
                        disabled={deleting}
                      >
                        Delete
                      </button>
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
            <table className={`${styles.table} ${styles.tableAligned}`}>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Issued</th>
                  <th>Paid</th>
                  <th className={styles.tableCellCenter}>Open</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{invoice.invoice_number}</td>
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
                    <td className={styles.tableButtonCell}>
                      <Link href={`/admin/invoice?id=${invoice.id}`} className={styles.button}>
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