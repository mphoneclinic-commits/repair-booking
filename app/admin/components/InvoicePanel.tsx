'use client'

import Link from 'next/link'
import styles from '../admin.module.css'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../types'
import { formatDateTime } from '../utils'
import InvoiceItemsEditor from './InvoiceItemsEditor'

type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

export default function InvoicePanel({
  invoice,
  items,
  actionState,
  itemsActionState,
  onCreateInvoice,
  onUpdateInvoiceStatus,
  onAddInvoiceItem,
  onUpdateInvoiceItem,
  onDeleteInvoiceItem,
}: {
  invoice: Invoice | null
  items: InvoiceItem[]
  actionState: InvoiceActionState
  itemsActionState: InvoiceItemsActionState
  onCreateInvoice: () => Promise<void>
  onUpdateInvoiceStatus: (status: InvoiceStatus) => Promise<void>
  onAddInvoiceItem: () => Promise<void>
  onUpdateInvoiceItem: (
    itemId: string,
    updates: Partial<Pick<InvoiceItem, 'description' | 'qty' | 'unit_price'>>
  ) => Promise<void>
  onDeleteInvoiceItem: (itemId: string) => Promise<void>
}) {
  const isBusy = actionState === 'saving'

  if (!invoice) {
    return (
      <div className={styles.expandedSectionCard}>
        <div className={styles.inputTopRow}>
          <div className={styles.expandedSectionTitle}>Invoice</div>
          {actionState === 'error' ? (
            <span className={styles.invoiceErrorText}>Action failed</span>
          ) : null}
        </div>

        <div className={styles.invoiceEmptyState}>
          <p className={styles.invoiceSummaryText}>
            No invoice has been created for this repair yet.
          </p>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void onCreateInvoice()}
              disabled={isBusy}
            >
              {isBusy ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.expandedSectionCard}>
      <div className={styles.inputTopRow}>
        <div className={styles.expandedSectionTitle}>Invoice</div>
        <span className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}>
          {invoice.status.toUpperCase()}
        </span>
      </div>

      <div className={styles.invoiceSummaryGrid}>
        <div>
          <div className={styles.sectionLabel}>Invoice Number</div>
          <div className={styles.invoiceValue}>{invoice.invoice_number}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Total</div>
          <div className={styles.invoiceValue}>${Number(invoice.total ?? 0).toFixed(2)}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Customer</div>
          <div className={styles.invoiceSummaryText}>{invoice.customer_name}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Phone</div>
          <div className={styles.invoiceSummaryText}>{invoice.customer_phone}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Email</div>
          <div className={styles.invoiceSummaryText}>{invoice.customer_email || '-'}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Created</div>
          <div className={styles.invoiceSummaryText}>{formatDateTime(invoice.created_at)}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Issued</div>
          <div className={styles.invoiceSummaryText}>
            {invoice.issued_at ? formatDateTime(invoice.issued_at) : '-'}
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Paid</div>
          <div className={styles.invoiceSummaryText}>
            {invoice.paid_at ? formatDateTime(invoice.paid_at) : '-'}
          </div>
        </div>
      </div>

      {invoice.notes ? (
        <div className={styles.mt12}>
          <div className={styles.sectionLabel}>Notes</div>
          <p className={styles.summaryRow}>{invoice.notes}</p>
        </div>
      ) : null}

      {actionState === 'error' ? (
        <p className={styles.invoiceErrorText}>Invoice action failed. Try again.</p>
      ) : null}

      <div className={styles.buttonRow}>
        <Link
          href={`/admin/invoice?id=${invoice.id}&jobId=${invoice.repair_request_id}`}
          className={styles.actionButton}
        >
          Open Invoice
        </Link>

        {invoice.status !== 'draft' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onUpdateInvoiceStatus('draft')}
            disabled={isBusy}
          >
            {isBusy ? 'Saving...' : 'Set Draft'}
          </button>
        )}

        {invoice.status !== 'issued' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onUpdateInvoiceStatus('issued')}
            disabled={isBusy}
          >
            {isBusy ? 'Saving...' : 'Mark Issued'}
          </button>
        )}

        {invoice.status !== 'paid' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onUpdateInvoiceStatus('paid')}
            disabled={isBusy}
          >
            {isBusy ? 'Saving...' : 'Mark Paid'}
          </button>
        )}

        {invoice.status !== 'void' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onUpdateInvoiceStatus('void')}
            disabled={isBusy}
          >
            {isBusy ? 'Saving...' : 'Void Invoice'}
          </button>
        )}
      </div>

      <InvoiceItemsEditor
        items={items}
        actionState={itemsActionState}
        onAddItem={onAddInvoiceItem}
        onUpdateItem={onUpdateInvoiceItem}
        onDeleteItem={onDeleteInvoiceItem}
      />
    </div>
  )
}