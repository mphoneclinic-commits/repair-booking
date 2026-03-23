'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from '../admin.module.css'
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  RepairRequest,
  RepairStatus,
  SaveField,
  SaveState,
} from '../types'
import {
  formatDateTime,
  getStatusLabel,
  normalizeMoneyValue,
} from '../utils'
import SaveIndicator from './SaveIndicator'

type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

type Props = {
  job: RepairRequest
  expanded: boolean
  toggleExpanded: (jobId: string) => void
  updateStatus: (id: string, newStatus: RepairStatus) => Promise<void> | void
  updateQuote: (id: string, price: number | null) => Promise<boolean> | boolean
  updatePartsCost: (id: string, cost: number | null) => Promise<boolean> | boolean
  updateNotes: (id: string, notes: string) => Promise<boolean> | boolean
  updateRepairPerformed: (id: string, repairPerformed: string) => Promise<boolean> | boolean
  removeInvoiceForJob: (job: RepairRequest) => Promise<void> | void
  onSendQuoteSms?: (job: RepairRequest, message: string) => Promise<void> | void
  onSendReadySms?: (job: RepairRequest, message: string) => Promise<void> | void
  updateJobBasics: (
    id: string,
    updates: Partial<
      Pick<
        RepairRequest,
        | 'job_number'
        | 'full_name'
        | 'phone'
        | 'email'
        | 'brand'
        | 'model'
        | 'device_type'
        | 'serial_imei'
        | 'fault_description'
      >
    >,
    field: 'job_number' | 'customer' | 'device'
  ) => Promise<boolean> | boolean
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void

  repairPerformedSaveState: SaveState
  statusSaveState: SaveState
  quoteSaveState: SaveState
  partsCostSaveState: SaveState
  notesSaveState: SaveState
  jobNumberSaveState: SaveState
  customerSaveState: SaveState
  deviceSaveState: SaveState

  invoice?: Invoice | null
  invoiceItems?: InvoiceItem[]
  invoiceActionState?: InvoiceActionState
  invoiceItemsActionState?: InvoiceItemsActionState
  createInvoiceForJob?: (job: RepairRequest) => Promise<void> | void
  updateInvoiceStatusForJob?: (
    jobId: string,
    status: InvoiceStatus
  ) => Promise<void> | void
  addInvoiceItemForInvoice?: (
    invoiceId: string,
    payload?: Partial<InvoiceItem>
  ) => Promise<void> | void
  updateInvoiceItemForInvoice?: (
    invoiceId: string,
    itemId: string,
    patch: Partial<InvoiceItem>
  ) => Promise<void> | void
  deleteInvoiceItemForInvoice?: (
    invoiceId: string,
    itemId: string
  ) => Promise<void> | void

  compact?: boolean
  selectable?: boolean
  selected?: boolean
  onToggleSelected?: (jobId: string) => void

  highlighted?: boolean
  cardRef?: (el: HTMLDivElement | null) => void
  onSelectCard?: (jobId: string) => void

  draggableEnabled?: boolean
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, jobId: string) => void
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void

  onDuplicateJob?: (job: RepairRequest) => Promise<void> | void
  onHideJob?: (jobId: string) => Promise<void> | void
  onUnhideJob?: (jobId: string) => Promise<void> | void
  onDeleteJob?: (jobId: string) => Promise<void> | void
}

const STATUS_OPTIONS: RepairStatus[] = [
  'new',
  'quoted',
  'approved',
  'in_progress',
  'ready',
  'closed',
  'rejected',
  'cancelled',
]

export default function JobCard({
  job,
  expanded,
  toggleExpanded,
  updateStatus,
  updateQuote,
  onSendQuoteSms,
  onSendReadySms,
  updatePartsCost,
  updateNotes,
  updateRepairPerformed,
  updateJobBasics,
  setFieldState,
  repairPerformedSaveState,
  statusSaveState,
  quoteSaveState,
  partsCostSaveState,
  notesSaveState,
  jobNumberSaveState,
  customerSaveState,
  deviceSaveState,
  invoice = null,
  invoiceItems = [],
  invoiceActionState = 'idle',
  invoiceItemsActionState = 'idle',
  createInvoiceForJob,
  updateInvoiceStatusForJob,
  addInvoiceItemForInvoice,
  updateInvoiceItemForInvoice,
  deleteInvoiceItemForInvoice,
  removeInvoiceForJob,
  compact = false,
  selectable = false,
  selected = false,
  onToggleSelected,
  highlighted = false,
  cardRef,
  onSelectCard,
  draggableEnabled = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDuplicateJob,
  onHideJob,
  onUnhideJob,
  onDeleteJob,
}: Props) {
  const [localJobNumber, setLocalJobNumber] = useState(job.job_number || '')
  const [localFullName, setLocalFullName] = useState(job.full_name || '')
  const [localPhone, setLocalPhone] = useState(job.phone || '')
  const [localEmail, setLocalEmail] = useState(job.email || '')
  const [localBrand, setLocalBrand] = useState(job.brand || '')
  const [localModel, setLocalModel] = useState(job.model || '')
  const [localDeviceType, setLocalDeviceType] = useState(job.device_type || '')
  const [localSerialImei, setLocalSerialImei] = useState(job.serial_imei || '')
  const [localFaultDescription, setLocalFaultDescription] = useState(job.fault_description || '')
  const [quoteSmsText, setQuoteSmsText] = useState('')
  const [readySmsText, setReadySmsText] = useState('')
  const [localQuote, setLocalQuote] = useState(
    job.quoted_price != null ? String(job.quoted_price) : ''
  )
  const [localPartsCost, setLocalPartsCost] = useState(
    job.parts_cost != null ? String(job.parts_cost) : ''
  )
  const [localNotes, setLocalNotes] = useState(job.internal_notes || '')
  const [localRepairPerformed, setLocalRepairPerformed] = useState(job.repair_performed || '')

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const partsCostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repairPerformedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setQuoteSmsText(buildQuoteSms())
  }, [job.full_name, job.brand, job.model, job.quoted_price])

  useEffect(() => {
    setReadySmsText(buildReadySms())
  }, [job.full_name, job.brand, job.model])

  useEffect(() => {
    setLocalJobNumber(job.job_number || '')
  }, [job.job_number])

  useEffect(() => {
    setLocalFullName(job.full_name || '')
  }, [job.full_name])

  useEffect(() => {
    setLocalPhone(job.phone || '')
  }, [job.phone])

  useEffect(() => {
    setLocalEmail(job.email || '')
  }, [job.email])

  useEffect(() => {
    setLocalBrand(job.brand || '')
  }, [job.brand])

  useEffect(() => {
    setLocalModel(job.model || '')
  }, [job.model])

  useEffect(() => {
    setLocalDeviceType(job.device_type || '')
  }, [job.device_type])

  useEffect(() => {
    setLocalSerialImei(job.serial_imei || '')
  }, [job.serial_imei])

  useEffect(() => {
    setLocalFaultDescription(job.fault_description || '')
  }, [job.fault_description])

  useEffect(() => {
    setLocalQuote(job.quoted_price != null ? String(job.quoted_price) : '')
  }, [job.quoted_price])

  useEffect(() => {
    setLocalPartsCost(job.parts_cost != null ? String(job.parts_cost) : '')
  }, [job.parts_cost])

  useEffect(() => {
    setLocalNotes(job.internal_notes || '')
  }, [job.internal_notes])

  useEffect(() => {
    setLocalRepairPerformed(job.repair_performed || '')
  }, [job.repair_performed])

  useEffect(() => {
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
      if (partsCostTimerRef.current) clearTimeout(partsCostTimerRef.current)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      if (repairPerformedTimerRef.current) clearTimeout(repairPerformedTimerRef.current)
    }
  }, [])

  const isArchived =
    job.status === 'closed' || job.status === 'rejected' || job.status === 'cancelled'

  const totalInvoiceQty = useMemo(() => {
    return invoiceItems.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)
  }, [invoiceItems])

  async function flushQuote(nextValue?: string) {
    const raw = nextValue ?? localQuote
    const normalized = normalizeMoneyValue(raw)
    await updateQuote(job.id, normalized)
  }

  async function flushPartsCost(nextValue?: string) {
    const raw = nextValue ?? localPartsCost
    const normalized = normalizeMoneyValue(raw)
    await updatePartsCost(job.id, normalized)
  }

  async function flushNotes(nextValue?: string) {
    await updateNotes(job.id, nextValue ?? localNotes)
  }

  async function flushRepairPerformed(nextValue?: string) {
    await updateRepairPerformed(job.id, nextValue ?? localRepairPerformed)
  }

  async function saveJobNumber() {
    await updateJobBasics(
      job.id,
      {
        job_number: localJobNumber.trim() || null,
      },
      'job_number'
    )
  }

  async function saveCustomerFields() {
    await updateJobBasics(
      job.id,
      {
        full_name: localFullName.trim(),
        phone: localPhone.trim(),
        email: localEmail.trim() || null,
      },
      'customer'
    )
  }

  async function saveDeviceFields() {
    await updateJobBasics(
      job.id,
      {
        brand: localBrand.trim(),
        model: localModel.trim(),
        device_type: localDeviceType.trim() || null,
        serial_imei: localSerialImei.trim() || null,
        fault_description: localFaultDescription.trim(),
      },
      'device'
    )
  }
function buildQuoteSms() {
  const customerName = job.full_name.split(' ')[0] || job.full_name
  const quoteText = job.quoted_price != null ? `$${job.quoted_price}` : 'your quoted amount'
  return `Hi ${customerName}, your repair quote for ${job.brand} ${job.model} is ${quoteText}+GST. Please contact us on 03 9547 9991 to approve this quote. Thanks, The Mobile Phone Clinic.`
}

function buildReadySms() {
  const customerName = job.full_name.split(' ')[0] || job.full_name
  return `Hi ${customerName}, your ${job.brand} ${job.model} repair is ready for pickup from The Mobile Phone Clinic. Please contact us on 03 9547 9991 to arrange collection. Thanks.`
}

function openSms(message: string) {
  const encoded = encodeURIComponent(message)
  const digits = job.phone.replace(/\D/g, '')
  window.open(`sms:${digits}?body=${encoded}`, '_self')
}
  function handleCardClick() {
    onSelectCard?.(job.id)
  }

  function handleDragStartInternal(e: React.DragEvent<HTMLDivElement>) {
    if (!draggableEnabled || !onDragStart) return
    onDragStart(e, job.id)
  }

  function handleDragEndInternal(e: React.DragEvent<HTMLDivElement>) {
    if (!draggableEnabled || !onDragEnd) return
    onDragEnd(e)
  }

  const quoteNumber = normalizeMoneyValue(localQuote) ?? 0
  const partsCostNumber = normalizeMoneyValue(localPartsCost) ?? 0
  const margin = quoteNumber - partsCostNumber

  return (
    <div
      ref={cardRef}
      className={`${styles.jobCard} ${compact ? styles.jobCardCompact : ''} ${
        draggableEnabled ? styles.jobCardDraggable : ''
      } ${isDragging ? styles.jobCardDragging : ''} ${
        selected ? styles.jobCardSelected : ''
      } ${highlighted ? styles.jobCardHighlighted : ''}`}
      onClick={handleCardClick}
      draggable={draggableEnabled}
      onDragStart={handleDragStartInternal}
      onDragEnd={handleDragEndInternal}
    >
      <div className={`${styles.cardTopRow} ${compact ? styles.cardTopRowCompact : ''}`}>
        <div className={styles.cardTopLeft}>
          <div className={styles.sectionLabel}>Job</div>
          <div className={styles.jobNumberDisplay}>{job.job_number || 'Pending Job Number'}</div>
          <p className={styles.customerName}>{job.full_name}</p>
          <p className={styles.phoneText}>{job.phone}</p>
          <p className={styles.deviceTitle}>
            {job.brand} {job.model}
            {job.device_type ? ` • ${job.device_type}` : ''}
          </p>
        </div>

<div className={styles.cardActions}>
  {selectable && (
    <label className={styles.archiveCheckboxLabel}>
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => {
          e.stopPropagation()
          onToggleSelected?.(job.id)
        }}
      />
      <span>Select</span>
    </label>
  )}

  <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
    {getStatusLabel(job.status)}
  </span>

  {!expanded && (
    <button
      type="button"
      className={styles.columnToggleButton}
      onClick={(e) => {
        e.stopPropagation()
        toggleExpanded(job.id)
      }}
    >
      Expand
    </button>
  )}

  {expanded && (
    <button
      type="button"
      className={styles.columnToggleButton}

      onClick={(e) => {
        e.stopPropagation()
        toggleExpanded(job.id)
      }}
    >
      Collapse
    </button>
  )}

  <SaveIndicator state={statusSaveState} compact />
</div>
      </div>

      {!expanded ? (
        <div className={`${styles.collapsedBlock} ${compact ? styles.collapsedBlockCompact : ''}`}>
          <p className={styles.collapsedFault}>{job.fault_description}</p>

          <p className={styles.summaryRow}>
            <strong>Quote:</strong>{' '}
            {job.quoted_price != null ? `$${Number(job.quoted_price).toFixed(2)}` : '-'}
          </p>

          <p className={styles.summaryRow}>
            <strong>Parts:</strong>{' '}
            {job.parts_cost != null ? `$${Number(job.parts_cost).toFixed(2)}` : '-'}
          </p>

          <p className={styles.summaryRow}>
            <strong>Margin:</strong> ${margin.toFixed(2)}
          </p>

          <p className={styles.summaryRow}>
            <strong>Booked:</strong> {formatDateTime(job.created_at)}
          </p>

          {invoice ? (
            <p className={styles.summaryRow}>
              <strong>Invoice:</strong> {invoice.invoice_number} • {invoice.status.toUpperCase()}
            </p>
          ) : (
            <p className={styles.summaryRow}>
              <strong>Invoice:</strong> -
            </p>
          )}

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(job.id)
              }}
            >
              Expand
            </button>

            {onDuplicateJob && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onDuplicateJob(job)
                }}
              >
                Duplicate
              </button>
            )}

            {!job.is_hidden && onHideJob ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onHideJob(job.id)
                }}
              >
                Hide
              </button>
            ) : null}

            {job.is_hidden && onUnhideJob ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onUnhideJob(job.id)
                }}
              >
                Unhide
              </button>
            ) : null}

            {onDeleteJob ? (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onDeleteJob(job.id)
                }}
              >
                Delete Job
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className={styles.expandedBlock}>
          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Status</div>
              <SaveIndicator state={statusSaveState} compact />
            </div>

            <div className={styles.statusButtonsWrap}>
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`${styles.statusButton} ${
                    job.status === status ? styles.statusButtonActive : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void updateStatus(job.id, status)
                  }}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Job Basics</div>
              <SaveIndicator state={jobNumberSaveState} compact />
            </div>

            <div className={styles.formGrid}>
              <div>
                <label className={styles.smallLabel}>Job Number</label>
                <input
                  className={styles.smallField}
                  value={localJobNumber}
                  onChange={(e) => setLocalJobNumber(e.target.value)}
                  onBlur={() => void saveJobNumber()}
                  placeholder="Job number"
                />
              </div>
            </div>
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Customer</div>
              <SaveIndicator state={customerSaveState} compact />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.twoCol}>
                <div>
                  <label className={styles.smallLabel}>Full Name</label>
                  <input
                    className={styles.smallField}
                    value={localFullName}
                    onChange={(e) => setLocalFullName(e.target.value)}
                    onBlur={() => void saveCustomerFields()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Phone</label>
                  <input
                    className={styles.smallField}
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value)}
                    onBlur={() => void saveCustomerFields()}
                  />
                </div>
              </div>

              <div>
                <label className={styles.smallLabel}>Email</label>
                <input
                  className={styles.smallField}
                  value={localEmail}
                  onChange={(e) => setLocalEmail(e.target.value)}
                  onBlur={() => void saveCustomerFields()}
                />
              </div>
            </div>
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Device</div>
              <SaveIndicator state={deviceSaveState} compact />
            </div>

            <div className={styles.formGrid}>
              <div className={styles.twoCol}>
                <div>
                  <label className={styles.smallLabel}>Brand</label>
                  <input
                    className={styles.smallField}
                    value={localBrand}
                    onChange={(e) => setLocalBrand(e.target.value)}
                    onBlur={() => void saveDeviceFields()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Model</label>
                  <input
                    className={styles.smallField}
                    value={localModel}
                    onChange={(e) => setLocalModel(e.target.value)}
                    onBlur={() => void saveDeviceFields()}
                  />
                </div>
              </div>

              <div className={styles.twoCol}>
                <div>
                  <label className={styles.smallLabel}>Device Type</label>
                  <input
                    className={styles.smallField}
                    value={localDeviceType}
                    onChange={(e) => setLocalDeviceType(e.target.value)}
                    onBlur={() => void saveDeviceFields()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Serial / IMEI</label>
                  <input
                    className={styles.smallField}
                    value={localSerialImei}
                    onChange={(e) => setLocalSerialImei(e.target.value)}
                    onBlur={() => void saveDeviceFields()}
                  />
                </div>
              </div>

              <div>
                <label className={styles.smallLabel}>Fault Description</label>
                <textarea
                  className={styles.notesField}
                  value={localFaultDescription}
                  onChange={(e) => setLocalFaultDescription(e.target.value)}
                  onBlur={() => void saveDeviceFields()}
                />
              </div>
            </div>
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Quote & Costing</div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.twoCol}>
                <div>
                  <div className={styles.inputTopRow}>
                    <label className={styles.smallLabel}>Quoted Price</label>
                    <SaveIndicator state={quoteSaveState} compact />
                  </div>
                  <input
                    className={styles.smallField}
                    value={localQuote}
                    onChange={(e) => {
                      setLocalQuote(e.target.value)
                      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
                      quoteTimerRef.current = setTimeout(() => {
                        void flushQuote(e.target.value)
                      }, 700)
                    }}
                    onBlur={() => void flushQuote(localQuote)}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <div className={styles.inputTopRow}>
                    <label className={styles.smallLabel}>Parts Cost</label>
                    <SaveIndicator state={partsCostSaveState} compact />
                  </div>
                  <input
                    className={styles.smallField}
                    value={localPartsCost}
                    onChange={(e) => {
                      setLocalPartsCost(e.target.value)
                      if (partsCostTimerRef.current) clearTimeout(partsCostTimerRef.current)
                      partsCostTimerRef.current = setTimeout(() => {
                        void flushPartsCost(e.target.value)
                      }, 700)
                    }}
                    onBlur={() => void flushPartsCost(localPartsCost)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <p className={styles.summaryRow}>
                <strong>Estimated Margin:</strong> ${margin.toFixed(2)}
              </p>
            </div>
          </div>

              <div>
                <label className={styles.smallLabel}>Quote SMS</label>
                <textarea
                  className={styles.notesField}
                  value={quoteSmsText}
                  onChange={(e) => setQuoteSmsText(e.target.value)}
                  placeholder="Quote SMS message"
                />
              </div>

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    void onSendQuoteSms?.(job, quoteSmsText)
                  }}
                >
                  Send Quote SMS
                </button>
              </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Repair Performed</div>
              <SaveIndicator state={repairPerformedSaveState} compact />
            </div>

            <textarea
              className={styles.notesField}
              value={localRepairPerformed}
              onChange={(e) => {
                setLocalRepairPerformed(e.target.value)
                if (repairPerformedTimerRef.current) {
                  clearTimeout(repairPerformedTimerRef.current)
                }
                repairPerformedTimerRef.current = setTimeout(() => {
                  void flushRepairPerformed(e.target.value)
                }, 700)
              }}
              onBlur={() => void flushRepairPerformed(localRepairPerformed)}
              placeholder="What repair was actually done?"
            />
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.inputTopRow}>
              <div className={styles.expandedSectionTitle}>Internal Notes</div>
              <SaveIndicator state={notesSaveState} compact />
            </div>

            <textarea
              className={styles.notesField}
              value={localNotes}
              onChange={(e) => {
                setLocalNotes(e.target.value)
                if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
                notesTimerRef.current = setTimeout(() => {
                  void flushNotes(e.target.value)
                }, 700)
              }}
              onBlur={() => void flushNotes(localNotes)}
              placeholder="Internal notes"
            />
          </div>
            <div>
              <label className={styles.smallLabel}>Ready SMS</label>
              <textarea
                className={styles.notesField}
                value={readySmsText}
                onChange={(e) => setReadySmsText(e.target.value)}
                placeholder="Ready for pickup SMS message"
              />
            </div>

            <div className={styles.buttonRow}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onSendReadySms?.(job, readySmsText)
                }}
              >
                Ready for Pickup SMS
              </button>
            </div>
         
              <div className={styles.expandedSectionCard}>
  <div className={styles.inputTopRow}>
    <div className={styles.expandedSectionTitle}>Invoice</div>
    <SaveIndicator
      state={
        invoiceActionState === 'saving'
          ? 'saving'
          : invoiceActionState === 'error'
            ? 'error'
            : 'idle'
      }
      compact
    />
  </div>

  {!invoice ? (
    <div className={styles.buttonRow}>
      <button
        type="button"
        className={styles.actionButton}
        onClick={(e) => {
          e.stopPropagation()
          void createInvoiceForJob?.(job)
        }}
      >
        Create Invoice
      </button>
    </div>
  ) : (
    <>
      <div className={styles.invoiceSummaryGrid}>
        <div>
          <div className={styles.sectionLabel}>Invoice Number</div>
          <div className={styles.invoiceValue}>{invoice.invoice_number}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Status</div>
          <div>
            <span className={`${styles.statusBadge} ${styles[`invoice_${invoice.status}`]}`}>
              {invoice.status.toUpperCase()}
            </span>
          </div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Total Qty</div>
          <div className={styles.invoiceValue}>{totalInvoiceQty.toFixed(2)}</div>
        </div>

        <div>
          <div className={styles.sectionLabel}>Total</div>
          <div className={styles.invoiceValue}>
            ${Number(invoice.total ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      <div className={styles.buttonRow}>
        {invoice.status === 'draft' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              void updateInvoiceStatusForJob?.(job.id, 'issued')
            }}
          >
            Mark Issued
          </button>
        )}

        {(invoice.status === 'draft' || invoice.status === 'issued') && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              void updateInvoiceStatusForJob?.(job.id, 'paid')
            }}
          >
            Mark Paid
          </button>
        )}

        {invoice.status === 'paid' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              void updateInvoiceStatusForJob?.(job.id, 'issued')
            }}
          >
            Mark Unpaid
          </button>
        )}

        {invoice.status !== 'void' && (
          <button
            type="button"
            className={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              void updateInvoiceStatusForJob?.(job.id, 'void')
            }}
          >
            Mark Void
          </button>
        )}
      </div>

      <div className={styles.invoiceItemsWrap}>
        {invoiceItems.length === 0 ? (
          <div className={styles.invoiceItemsEmpty}>No invoice items yet.</div>
        ) : (
          invoiceItems.map((item) => (
            <InvoiceItemEditor
              key={item.id}
              invoiceId={invoice.id}
              item={item}
              busy={invoiceItemsActionState === 'saving'}
              updateInvoiceItemForInvoice={updateInvoiceItemForInvoice}
              deleteInvoiceItemForInvoice={deleteInvoiceItemForInvoice}
            />
          ))
        )}
      </div>
     
  

      <div className={styles.buttonRow}>

 <button
          type="button"
          className={styles.actionButton}
          onClick={(e) => {
            e.stopPropagation()
            void addInvoiceItemForInvoice?.(invoice.id)
          }}
        >
          Add Item
        </button>
        <a
          href={`/admin/invoice?id=${invoice.id}`}
          className={styles.actionButton}
          onClick={(e) => e.stopPropagation()}
        >
          Open Invoice
        </a>



        <button
          type="button"
          className={styles.deleteButton}
          onClick={(e) => {
            e.stopPropagation()
            void removeInvoiceForJob?.(job)
          }}
        >
          Delete Invoice
        </button>
      </div>
    </>
  )}
</div>
          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={(e) => {
                e.stopPropagation()
                toggleExpanded(job.id)
              }}
            >
              Collapse
            </button>

            {onDuplicateJob && (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onDuplicateJob(job)
                }}
              >
                Duplicate Job
              </button>
            )}

            {!job.is_hidden && onHideJob ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onHideJob(job.id)
                }}
              >
                Hide Job
              </button>
            ) : null}

            {job.is_hidden && onUnhideJob ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onUnhideJob(job.id)
                }}
              >
                Unhide Job
              </button>
            ) : null}

            {onDeleteJob ? (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={(e) => {
                  e.stopPropagation()
                  void onDeleteJob(job.id)
                }}
              >
                Delete Job
              </button>
            ) : null}
          </div>

          {isArchived ? (
            <p className={styles.helperText}>
              Archived job • created {formatDateTime(job.created_at)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

type InvoiceItemEditorProps = {
  invoiceId: string
  item: InvoiceItem
  busy: boolean
  updateInvoiceItemForInvoice?: (
    invoiceId: string,
    itemId: string,
    patch: Partial<InvoiceItem>
  ) => Promise<void> | void
  deleteInvoiceItemForInvoice?: (
    invoiceId: string,
    itemId: string
  ) => Promise<void> | void
}

function InvoiceItemEditor({
  invoiceId,
  item,
  busy,
  updateInvoiceItemForInvoice,
  deleteInvoiceItemForInvoice,
}: InvoiceItemEditorProps) {
  const [description, setDescription] = useState(item.description || '')
  const [qty, setQty] = useState(String(item.qty ?? 1))
  const [unitPrice, setUnitPrice] = useState(String(item.unit_price ?? 0))

  useEffect(() => {
    setDescription(item.description || '')
  }, [item.description])

  useEffect(() => {
    setQty(String(item.qty ?? 1))
  }, [item.qty])

  useEffect(() => {
    setUnitPrice(String(item.unit_price ?? 0))
  }, [item.unit_price])

  async function flush() {
    const normalizedQty = Number(qty || 0)
    const normalizedUnitPrice = Number(unitPrice || 0)

    await updateInvoiceItemForInvoice?.(invoiceId, item.id, {
      description: description.trim(),
      qty: Number.isFinite(normalizedQty) ? normalizedQty : 0,
      unit_price: Number.isFinite(normalizedUnitPrice) ? normalizedUnitPrice : 0,
    })
  }

  return (
    <div className={styles.invoiceItemCard}>
      <div className={styles.invoiceItemGrid}>
        <div className={styles.invoiceItemDescriptionCol}>
          <label className={styles.smallLabel}>Description</label>
          <input
            className={styles.smallField}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => void flush()}
            disabled={busy}
          />
        </div>

        <div>
          <label className={styles.smallLabel}>Qty</label>
          <input
            className={styles.smallField}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => void flush()}
            disabled={busy}
          />
        </div>

        <div>
          <label className={styles.smallLabel}>Unit Price</label>
          <input
            className={styles.smallField}
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            onBlur={() => void flush()}
            disabled={busy}
          />
        </div>
      </div>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.miniButton}
          onClick={() => void flush()}
          disabled={busy}
        >
          Save Item
        </button>

        <button
          type="button"
          className={styles.deleteButton}
          onClick={() => void deleteInvoiceItemForInvoice?.(invoiceId, item.id)}
          disabled={busy}
        >
          Delete Item
        </button>
      </div>
    </div>
  )
}