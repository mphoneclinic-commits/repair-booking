'use client'

import Link from 'next/link'
import styles from '../admin.module.css'
import type { Invoice, InvoiceItem, InvoiceStatus } from '../types'

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
  onRemoveInvoice,
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
  onRemoveInvoice: () => Promise<void>
}) {
  const busy = actionState === 'saving' || itemsActionState === 'saving'

  return (
    <div className={styles.expandedSectionCard}>
      <div className={styles.inputTopRow}>
        <div className={styles.expandedSectionTitle}>Invoice</div>
        <div className={styles.readOnlyValue}>
          {actionState === 'saving'
            ? 'Saving...'
            : actionState === 'error'
              ? 'Error'
              : itemsActionState === 'saving'
                ? 'Updating items...'
                : itemsActionState === 'error'
                  ? 'Item error'
                  : 'Ready'}
        </div>
      </div>

      {!invoice ? (
        <>
          <p className={styles.summaryRow}>
            No invoice created for this job yet.
          </p>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void onCreateInvoice()}
              disabled={busy}
            >
              {actionState === 'saving' ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.smallLabel}>Invoice Number</label>
              <div className={styles.readOnlyValue}>{invoice.invoice_number}</div>
            </div>

            <div>
              <label className={styles.smallLabel}>Status</label>
              <div className={styles.readOnlyValue}>{invoice.status.toUpperCase()}</div>
            </div>

            <div>
              <label className={styles.smallLabel}>Issued</label>
              <div className={styles.readOnlyValue}>{invoice.issued_at || '-'}</div>
            </div>

            <div>
              <label className={styles.smallLabel}>Paid</label>
              <div className={styles.readOnlyValue}>{invoice.paid_at || '-'}</div>
            </div>

            <div>
              <label className={styles.smallLabel}>Subtotal</label>
              <div className={styles.readOnlyValue}>${Number(invoice.subtotal ?? 0).toFixed(2)}</div>
            </div>

            <div>
              <label className={styles.smallLabel}>Total</label>
              <div className={styles.readOnlyValue}>${Number(invoice.total ?? 0).toFixed(2)}</div>
            </div>
          </div>

          <div className={styles.buttonRow}>
            <Link
              href={`/admin/invoice?id=${invoice.id}&jobId=${invoice.repair_request_id}`}
              className={styles.actionButton}
            >
              Open Invoice
            </Link>

            {invoice.status !== 'paid' && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void onUpdateInvoiceStatus('paid')}
                disabled={busy}
              >
                Mark Paid
              </button>
            )}

            {invoice.status === 'paid' && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void onUpdateInvoiceStatus('issued')}
                disabled={busy}
              >
                Mark Unpaid
              </button>
            )}

            {invoice.status !== 'void' && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void onUpdateInvoiceStatus('void')}
                disabled={busy}
              >
                Mark Void
              </button>
            )}

            {invoice.status === 'void' && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void onUpdateInvoiceStatus('issued')}
                disabled={busy}
              >
                Restore Issued
              </button>
            )}

            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void onRemoveInvoice()}
              disabled={busy}
            >
              Remove Invoice
            </button>
          </div>

          <div className={styles.mt12}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Invoice Items</div>
              <div className={styles.readOnlyValue}>
                {items.length} item{items.length === 1 ? '' : 's'}
              </div>
            </div>

            {items.length === 0 ? (
              <p className={styles.summaryRow}>No invoice items yet.</p>
            ) : (
              <div className={styles.formGrid}>
                {items.map((item) => (
                  <div key={item.id} className={styles.expandedSectionCard}>
                    <div>
                      <label className={styles.smallLabel}>Description</label>
                      <input
                        value={item.description}
                        className={styles.smallField}
                        onChange={(e) =>
                          void onUpdateInvoiceItem(item.id, {
                            description: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div className={styles.twoCol}>
                      <div>
                        <label className={styles.smallLabel}>Qty</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.qty}
                          className={styles.smallField}
                          onChange={(e) =>
                            void onUpdateInvoiceItem(item.id, {
                              qty: Number(e.target.value),
                            })
                          }
                        />
                      </div>

                      <div>
                        <label className={styles.smallLabel}>Unit Price</label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          className={styles.smallField}
                          onChange={(e) =>
                            void onUpdateInvoiceItem(item.id, {
                              unit_price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>

                    <p className={styles.summaryRow}>
                      <strong>Line Total:</strong> ${Number(item.line_total ?? 0).toFixed(2)}
                    </p>

                    <div className={styles.buttonRow}>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={() => void onDeleteInvoiceItem(item.id)}
                        disabled={busy}
                      >
                        Delete Item
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void onAddInvoiceItem()}
                disabled={busy}
              >
                Add Item
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}