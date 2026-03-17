'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from '../admin.module.css'
import type { Invoice, InvoiceItem, InvoiceStatus, SaveState } from '../types'

type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

type ItemDraftMap = Record<
  string,
  {
    description: string
    qty: string
    unit_price: string
  }
>

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

  const [drafts, setDrafts] = useState<ItemDraftMap>({})
  const [itemSaveStates, setItemSaveStates] = useState<Record<string, SaveState>>({})

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const clearSavedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})

  const itemIdsSignature = useMemo(() => items.map((item) => item.id).join('|'), [items])

  useEffect(() => {
    setDrafts((prev) => {
      const next: ItemDraftMap = {}

      for (const item of items) {
        const itemState = itemSaveStates[item.id] || 'idle'
        const shouldPreserveLocal = itemState === 'dirty' || itemState === 'saving'

        if (shouldPreserveLocal && prev[item.id]) {
          next[item.id] = prev[item.id]
        } else {
          next[item.id] = {
            description: item.description,
            qty: String(item.qty),
            unit_price: String(item.unit_price),
          }
        }
      }

      return next
    })

    setItemSaveStates((prev) => {
      const next: Record<string, SaveState> = {}
      for (const item of items) {
        next[item.id] = prev[item.id] || 'idle'
      }
      return next
    })
  }, [itemIdsSignature, items])

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer)
      })
      Object.values(clearSavedTimersRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer)
      })
    }
  }, [])

  function setItemState(itemId: string, state: SaveState) {
    setItemSaveStates((prev) => ({
      ...prev,
      [itemId]: state,
    }))
  }

  function setItemSaved(itemId: string) {
    setItemState(itemId, 'saved')

    if (clearSavedTimersRef.current[itemId]) {
      clearTimeout(clearSavedTimersRef.current[itemId]!)
    }

    clearSavedTimersRef.current[itemId] = setTimeout(() => {
      setItemSaveStates((prev) => {
        if (prev[itemId] !== 'saved') return prev
        return {
          ...prev,
          [itemId]: 'idle',
        }
      })
    }, 1300)
  }

  function getDraft(item: InvoiceItem) {
    return (
      drafts[item.id] || {
        description: item.description,
        qty: String(item.qty),
        unit_price: String(item.unit_price),
      }
    )
  }

  function updateDraft(
    itemId: string,
    key: 'description' | 'qty' | 'unit_price',
    value: string
  ) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: {
        ...(prev[itemId] || {
          description: '',
          qty: '1',
          unit_price: '0',
        }),
        [key]: value,
      },
    }))

    setItemState(itemId, 'dirty')
  }

  function scheduleFlush(item: InvoiceItem, nextDraft?: ItemDraftMap[string]) {
    if (saveTimersRef.current[item.id]) {
      clearTimeout(saveTimersRef.current[item.id]!)
    }

    saveTimersRef.current[item.id] = setTimeout(() => {
      void flushItem(item, nextDraft)
    }, 700)
  }

  async function flushItem(item: InvoiceItem, explicitDraft?: ItemDraftMap[string]) {
    const draft = explicitDraft || drafts[item.id]
    if (!draft) return

    const description = draft.description.trim()
    const qty = Number(draft.qty)
    const unit_price = Number(draft.unit_price)

    const safeQty = Number.isFinite(qty) ? qty : 0
    const safeUnitPrice = Number.isFinite(unit_price) ? unit_price : 0

    if (
      description === item.description &&
      safeQty === Number(item.qty) &&
      safeUnitPrice === Number(item.unit_price)
    ) {
      setItemState(item.id, 'idle')
      return
    }

    setItemState(item.id, 'saving')

    try {
      await onUpdateInvoiceItem(item.id, {
        description,
        qty: safeQty,
        unit_price: safeUnitPrice,
      })
      setItemSaved(item.id)
    } catch {
      setItemState(item.id, 'error')
    }
  }

  function getItemStateLabel(state: SaveState) {
    if (state === 'dirty') return 'Typing...'
    if (state === 'saving') return 'Saving...'
    if (state === 'saved') return 'Saved'
    if (state === 'error') return 'Error'
    return ''
  }

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
          <p className={styles.summaryRow}>No invoice created for this job yet.</p>

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
              <div className={styles.readOnlyValue}>
                ${Number(invoice.subtotal ?? 0).toFixed(2)}
              </div>
            </div>

            <div>
              <label className={styles.smallLabel}>Total</label>
              <div className={styles.readOnlyValue}>
                ${Number(invoice.total ?? 0).toFixed(2)}
              </div>
            </div>
          </div>

          <div className={styles.buttonRow}>
            <Link
              href={`/admin/invoice?id=${invoice.id}&jobId=${invoice.repair_request_id}`}
              className={styles.actionButton}
            >
              Open Invoice
            </Link>

            {invoice.status === 'issued' && (
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
                {items.map((item) => {
                  const draft = getDraft(item)
                  const itemState = itemSaveStates[item.id] || 'idle'
                  const stateLabel = getItemStateLabel(itemState)

                  return (
                    <div key={item.id} className={styles.expandedSectionCard}>
                      <div className={styles.inputTopRow}>
                        <label className={styles.smallLabel}>Description</label>
                        <div className={styles.saveIndicator}>
                          {stateLabel}
                        </div>
                      </div>

                      <input
                        value={draft.description}
                        className={styles.smallField}
                        onChange={(e) => {
                          const nextDraft = {
                            ...draft,
                            description: e.target.value,
                          }
                          updateDraft(item.id, 'description', e.target.value)
                          scheduleFlush(item, nextDraft)
                        }}
                        onBlur={async () => {
                          if (saveTimersRef.current[item.id]) {
                            clearTimeout(saveTimersRef.current[item.id]!)
                          }
                          await flushItem(item)
                        }}
                      />

                      <div className={styles.twoCol}>
                        <div>
                          <label className={styles.smallLabel}>Qty</label>
                          <input
                            type="number"
                            step="0.01"
                            value={draft.qty}
                            className={styles.smallField}
                            onChange={(e) => {
                              const nextDraft = {
                                ...draft,
                                qty: e.target.value,
                              }
                              updateDraft(item.id, 'qty', e.target.value)
                              scheduleFlush(item, nextDraft)
                            }}
                            onBlur={async () => {
                              if (saveTimersRef.current[item.id]) {
                                clearTimeout(saveTimersRef.current[item.id]!)
                              }
                              await flushItem(item)
                            }}
                          />
                        </div>

                        <div>
                          <label className={styles.smallLabel}>Unit Price</label>
                          <input
                            type="number"
                            step="0.01"
                            value={draft.unit_price}
                            className={styles.smallField}
                            onChange={(e) => {
                              const nextDraft = {
                                ...draft,
                                unit_price: e.target.value,
                              }
                              updateDraft(item.id, 'unit_price', e.target.value)
                              scheduleFlush(item, nextDraft)
                            }}
                            onBlur={async () => {
                              if (saveTimersRef.current[item.id]) {
                                clearTimeout(saveTimersRef.current[item.id]!)
                              }
                              await flushItem(item)
                            }}
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
                  )
                })}
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