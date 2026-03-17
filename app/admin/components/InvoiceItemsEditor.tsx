'use client'

import { useEffect, useMemo, useState } from 'react'
import styles from '../admin.module.css'
import type { InvoiceItem } from '../types'

type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

type DraftMap = Record<
  string,
  {
    description: string
    qty: string
    unit_price: string
  }
>

export default function InvoiceItemsEditor({
  items,
  actionState,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}: {
  items: InvoiceItem[]
  actionState: InvoiceItemsActionState
  onAddItem: () => Promise<void>
  onUpdateItem: (
    itemId: string,
    updates: Partial<Pick<InvoiceItem, 'description' | 'qty' | 'unit_price'>>
  ) => Promise<void>
  onDeleteItem: (itemId: string) => Promise<void>
}) {
  const [drafts, setDrafts] = useState<DraftMap>({})
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null)

  const itemIdsSignature = useMemo(
    () => items.map((item) => item.id).join('|'),
    [items]
  )

  useEffect(() => {
    setDrafts((prev) => {
      const next: DraftMap = {}

      for (const item of items) {
        const existing = prev[item.id]

        if (existing && focusedItemId === item.id) {
          next[item.id] = existing
        } else if (existing) {
          next[item.id] = {
            description: existing.description,
            qty: existing.qty,
            unit_price: existing.unit_price,
          }
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
  }, [itemIdsSignature, items, focusedItemId])

  useEffect(() => {
    if (!focusedItemId) return

    const stillExists = items.some((item) => item.id === focusedItemId)
    if (!stillExists) {
      setFocusedItemId(null)
    }
  }, [items, focusedItemId])

  const isBusy = actionState === 'saving'

  function setDraftValue(
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
  }

  async function flushItem(item: InvoiceItem) {
    const draft = drafts[item.id]
    if (!draft) return

    const description = draft.description.trim()
    const qty = Number(draft.qty)
    const unitPrice = Number(draft.unit_price)

    const safeQty = Number.isFinite(qty) ? qty : 0
    const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0

    if (
      description === item.description &&
      safeQty === item.qty &&
      safeUnitPrice === item.unit_price
    ) {
      return
    }

    await onUpdateItem(item.id, {
      description,
      qty: safeQty,
      unit_price: safeUnitPrice,
    })
  }

  return (
    <div className={styles.mt12}>
      <div className={styles.inputTopRow}>
        <div className={styles.expandedSectionTitle}>Invoice Items</div>
        {actionState === 'error' ? (
          <span className={styles.invoiceErrorText}>Item update failed</span>
        ) : null}
      </div>

      <div className={styles.invoiceItemsWrap}>
        {items.length === 0 ? (
          <div className={styles.invoiceItemsEmpty}>No invoice items yet.</div>
        ) : (
          items.map((item) => {
            const draft = drafts[item.id] || {
              description: item.description,
              qty: String(item.qty),
              unit_price: String(item.unit_price),
            }

            return (
              <div key={item.id} className={styles.invoiceItemCard}>
                <div className={styles.invoiceItemGrid}>
                  <div className={styles.invoiceItemDescriptionCol}>
                    <label className={styles.smallLabel}>Description</label>
                    <input
                      value={draft.description}
                      className={styles.smallField}
                      onFocus={() => setFocusedItemId(item.id)}
                      onChange={(e) =>
                        setDraftValue(item.id, 'description', e.target.value)
                      }
                      onBlur={async () => {
                        setFocusedItemId(null)
                        await flushItem(item)
                      }}
                    />
                  </div>

                  <div>
                    <label className={styles.smallLabel}>Qty</label>
                    <input
                      inputMode="decimal"
                      value={draft.qty}
                      className={styles.smallField}
                      onFocus={() => setFocusedItemId(item.id)}
                      onChange={(e) =>
                        setDraftValue(item.id, 'qty', e.target.value)
                      }
                      onBlur={async () => {
                        setFocusedItemId(null)
                        await flushItem(item)
                      }}
                    />
                  </div>

                  <div>
                    <label className={styles.smallLabel}>Unit Price</label>
                    <input
                      inputMode="decimal"
                      value={draft.unit_price}
                      className={styles.smallField}
                      onFocus={() => setFocusedItemId(item.id)}
                      onChange={(e) =>
                        setDraftValue(item.id, 'unit_price', e.target.value)
                      }
                      onBlur={async () => {
                        setFocusedItemId(null)
                        await flushItem(item)
                      }}
                    />
                  </div>

                  <div>
                    <label className={styles.smallLabel}>Line Total</label>
                    <div className={styles.readOnlyValue}>
                      ${Number(item.line_total ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className={styles.buttonRow}>
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => void onDeleteItem(item.id)}
                    disabled={isBusy}
                  >
                    {isBusy ? 'Working...' : 'Delete Item'}
                  </button>
                </div>
              </div>
            )
          })
        )}

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void onAddItem()}
            disabled={isBusy}
          >
            {isBusy ? 'Working...' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  )
}