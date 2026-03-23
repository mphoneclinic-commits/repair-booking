'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import generateInvoicePdf from '../lib/generateInvoicePdf'

import styles from '../admin.module.css'
import type { Invoice, InvoiceItem } from '../types'
import { formatDateTime } from '../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const BUSINESS_DETAILS = {
  name: 'The Mobile Phone Clinic',
  address: 'Melbourne, Victoria, Australia',
  landline: '(03) 9547 9991',
  mobile: '0411 369 814',
  email: 'admin@themobilephoneclinic.com.au',
  abn: '59696 1787 82',
}

const PAYMENT_DETAILS = {
  bankName: 'GREAT SOUTHERN BANK',
  accountName: 'BUN UNG',
  bsb: '814 282',
  accountNumber: '520 372 19',
  payId: '0411 369 814',
}

function formatCurrency(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceItemsByInvoiceId, setInvoiceItemsByInvoiceId] = useState<
    Record<string, InvoiceItem[]>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [search, setSearch] = useState('')

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const [editableCustomerNotes, setEditableCustomerNotes] = useState<Record<string, string>>({})
  const [savingCustomerNotesIds, setSavingCustomerNotesIds] = useState<string[]>([])

  async function loadInvoices() {
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
        customer_visible_notes,
        internal_reference_notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('loadInvoices error:', error)
      throw new Error(error.message)
    }

    const normalizedInvoices = ((data || []) as Invoice[]).map((invoice) => ({
      ...invoice,
      tax_rate: Number(invoice.tax_rate ?? 0),
      subtotal_ex_tax: Number(invoice.subtotal_ex_tax ?? 0),
      tax_amount: Number(invoice.tax_amount ?? 0),
      subtotal: Number(invoice.subtotal ?? 0),
      total: Number(invoice.total ?? 0),
      customer_visible_notes: invoice.customer_visible_notes ?? null,
      internal_reference_notes: invoice.internal_reference_notes ?? null,
    }))

    setInvoices(normalizedInvoices)

    const notesMap: Record<string, string> = {}
    for (const invoice of normalizedInvoices) {
      notesMap[invoice.id] = invoice.customer_visible_notes ?? ''
    }
    setEditableCustomerNotes(notesMap)
  }

  async function loadInvoiceItems() {
    const { data, error } = await supabase
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
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) throw error

    const grouped: Record<string, InvoiceItem[]> = {}

    for (const item of (data || []) as InvoiceItem[]) {
      const invoiceId = item.invoice_id
      if (!grouped[invoiceId]) grouped[invoiceId] = []

      grouped[invoiceId].push({
        ...item,
        qty: Number(item.qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        sort_order: Number(item.sort_order ?? 0),
      })
    }

    setInvoiceItemsByInvoiceId(grouped)
  }

  async function loadAllData() {
    setLoading(true)
    setError('')
    setSuccessMessage('')

    try {
      await Promise.all([loadInvoices(), loadInvoiceItems()])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAllData()
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
        invoice.customer_visible_notes || '',
      ]
        .join(' ')
        .toLowerCase()

      return term ? haystack.includes(term) : true
    })
  }, [invoices, search])

  const visibleInvoiceIds = filteredInvoices.map((invoice) => invoice.id)
  const allVisibleSelected =
    visibleInvoiceIds.length > 0 &&
    visibleInvoiceIds.every((id) => selectedInvoiceIds.includes(id))

  function toggleSelectedInvoice(invoiceId: string) {
    setSelectedInvoiceIds((prev) =>
      prev.includes(invoiceId)
        ? prev.filter((id) => id !== invoiceId)
        : [...prev, invoiceId]
    )
  }

  function clearSelectedInvoices() {
    setSelectedInvoiceIds([])
  }

  function selectAllVisibleInvoices(ids: string[]) {
    setSelectedInvoiceIds(ids)
  }

  async function deleteSelectedInvoices() {
    if (selectedInvoiceIds.length === 0) return

    const confirmed = window.confirm(
      `Delete ${selectedInvoiceIds.length} selected invoice(s)? This cannot be undone.`
    )
    if (!confirmed) return

    setBulkDeleting(true)
    setError('')
    setSuccessMessage('')

    const idsToDelete = [...selectedInvoiceIds]
    const selectedSet = new Set(idsToDelete)

    try {
      const { error: deleteItemsError } = await supabase
        .from('invoice_items')
        .delete()
        .in('invoice_id', idsToDelete)

      if (deleteItemsError) throw deleteItemsError

      const { error: deleteLinksError } = await supabase
        .from('invoice_repair_links')
        .delete()
        .in('invoice_id', idsToDelete)

      if (deleteLinksError) throw deleteLinksError

      const { error: deleteInvoicesError } = await supabase
        .from('invoices')
        .delete()
        .in('id', idsToDelete)

      if (deleteInvoicesError) throw deleteInvoicesError

      setInvoices((prev) => prev.filter((invoice) => !selectedSet.has(invoice.id)))

      setInvoiceItemsByInvoiceId((prev) => {
        const next = { ...prev }
        for (const invoiceId of idsToDelete) {
          delete next[invoiceId]
        }
        return next
      })

      setEditableCustomerNotes((prev) => {
        const next = { ...prev }
        for (const invoiceId of idsToDelete) {
          delete next[invoiceId]
        }
        return next
      })

      setSelectedInvoiceIds([])
      setSuccessMessage(`${idsToDelete.length} invoice(s) deleted successfully.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete selected invoices')
    } finally {
      setBulkDeleting(false)
    }
  }

  async function saveCustomerVisibleNotes(invoiceId: string) {
    const currentValue = editableCustomerNotes[invoiceId] ?? ''
    const existingInvoice = invoices.find((invoice) => invoice.id === invoiceId)

    if (!existingInvoice) return

    const normalizedCurrentValue = currentValue.trim()
    const normalizedExistingValue = (existingInvoice.customer_visible_notes ?? '').trim()

    if (normalizedCurrentValue === normalizedExistingValue) return

    setSavingCustomerNotesIds((prev) =>
      prev.includes(invoiceId) ? prev : [...prev, invoiceId]
    )
    setError('')
    setSuccessMessage('')

    try {
      const timestamp = new Date().toISOString()

      const { error } = await supabase
        .from('invoices')
        .update({
          customer_visible_notes: normalizedCurrentValue || null,
          updated_at: timestamp,
        })
        .eq('id', invoiceId)

      if (error) throw error

      setInvoices((prev) =>
        prev.map((invoice) =>
          invoice.id === invoiceId
            ? {
                ...invoice,
                customer_visible_notes: normalizedCurrentValue || null,
                updated_at: timestamp,
              }
            : invoice
        )
      )

      setEditableCustomerNotes((prev) => ({
        ...prev,
        [invoiceId]: normalizedCurrentValue,
      }))

      setSuccessMessage('Customer notes updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update customer notes')
    } finally {
      setSavingCustomerNotesIds((prev) => prev.filter((id) => id !== invoiceId))
    }
  }

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
            Return to Dashboard
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
          <p className={styles.pageSubtitle}>All invoices and payment status</p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Return to Dashboard
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>
        </div>
      </div>

      {successMessage ? <p className={styles.successText}>{successMessage}</p> : null}

      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice number, customer, status, notes..."
          className={styles.field}
        />
      </div>

      <div className={styles.bulkBar}>
        <div className={styles.bulkBarText}>
          Selected invoices: <strong>{selectedInvoiceIds.length}</strong>
        </div>

        <div className={styles.bulkBarActions}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() =>
              allVisibleSelected
                ? clearSelectedInvoices()
                : selectAllVisibleInvoices(visibleInvoiceIds)
            }
            disabled={bulkDeleting || visibleInvoiceIds.length === 0}
          >
            {allVisibleSelected ? 'Clear Visible' : 'Select Visible'}
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={clearSelectedInvoices}
            disabled={bulkDeleting || selectedInvoiceIds.length === 0}
          >
            Clear Selection
          </button>

          <button
            type="button"
            className={styles.deleteButton}
            onClick={() => void deleteSelectedInvoices()}
            disabled={bulkDeleting || selectedInvoiceIds.length === 0}
          >
            {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
          </button>
        </div>
      </div>

      {filteredInvoices.length === 0 ? (
        <p className={styles.message}>No invoices yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.tableAligned}`}>
            <thead>
              <tr>
                <th className={styles.tableCellCenter}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={() =>
                      allVisibleSelected
                        ? clearSelectedInvoices()
                        : selectAllVisibleInvoices(visibleInvoiceIds)
                    }
                  />
                </th>
                <th>Invoice Number</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Total</th>
                <th>Notes to Customer</th>
                <th>Issued</th>
                <th>Paid</th>
                <th className={styles.tableCellCenter}>Open</th>
                <th className={styles.tableCellCenter}>Print</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.map((invoice) => {
                const isSavingNotes = savingCustomerNotesIds.includes(invoice.id)

                return (
                  <tr key={invoice.id}>
                    <td className={styles.tableCellCenter}>
                      <input
                        type="checkbox"
                        checked={selectedInvoiceIds.includes(invoice.id)}
                        onChange={() => toggleSelectedInvoice(invoice.id)}
                      />
                    </td>
                    <td>{invoice.invoice_number}</td>
                    <td>{invoice.customer_name}</td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}
                      >
                        {invoice.status.toUpperCase()}
                      </span>
                    </td>
                    <td>{formatCurrency(invoice.total)}</td>
                    <td className={`${styles.tableCellWrap} ${styles.invoiceNotesCell}`}>
                      <textarea
                        value={editableCustomerNotes[invoice.id] ?? ''}
                        onChange={(e) =>
                          setEditableCustomerNotes((prev) => ({
                            ...prev,
                            [invoice.id]: e.target.value,
                          }))
                        }
                        onBlur={() => void saveCustomerVisibleNotes(invoice.id)}
                        placeholder="Add customer note..."
                        className={styles.invoiceNotesInput}
                        rows={3}
                        disabled={isSavingNotes}
                      />
                    </td>
                    <td>{invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}</td>
                    <td>{invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}</td>
                    <td className={styles.tableButtonCell}>
                      <Link href={`/admin/invoice?id=${invoice.id}`} className={styles.button}>
                        Open Invoice
                      </Link>
                    </td>
                    <td className={styles.tableButtonCell}>
                      <button
                        type="button"
                          className={`${styles.printButton} ${styles.actionButton}`}

                        onClick={() =>
                          generateInvoicePdf({
                            invoice,
                            items: invoiceItemsByInvoiceId[invoice.id] ?? [],
                            businessDetails: BUSINESS_DETAILS,
                            paymentDetails: PAYMENT_DETAILS,
                            formatCurrency,
                            formatDateTime,
                          })
                        }
                      >
                        Download PDF
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}