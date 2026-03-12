'use client'

import { useEffect, useRef, useState } from 'react'
import styles from '../admin.module.css'
import type {
  Invoice,
  InvoiceStatus,
  RepairRequest,
  RepairStatus,
  SaveField,
  SaveState,
} from '../types'
import {
  formatDateTime,
  getStatusLabel,
  normalizePhone,
  normalizeQuoteInput,
} from '../utils'
import SaveIndicator from './SaveIndicator'
import InvoicePanel from './InvoicePanel'

type InvoiceActionState = 'idle' | 'saving' | 'error'

export default function JobCard({
  job,
  expanded,
  toggleExpanded,
  updateStatus,
  updateQuote,
  updateNotes,
  updateJobBasics,
  statusSaveState,
  quoteSaveState,
  notesSaveState,
  jobNumberSaveState,
  customerSaveState,
  deviceSaveState,
  setFieldState,
  draggableEnabled = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  invoice,
  invoiceActionState,
  createInvoiceForJob,
  updateInvoiceStatusForJob,
}: {
  job: RepairRequest
  expanded: boolean
  toggleExpanded: (jobId: string) => void
  updateStatus: (id: string, newStatus: RepairStatus) => Promise<void>
  updateQuote: (id: string, price: number | null) => Promise<boolean>
  updateNotes: (id: string, notes: string) => Promise<boolean>
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
        | 'fault_description'
      >
    >,
    field: 'job_number' | 'customer' | 'device'
  ) => Promise<boolean>
  statusSaveState: SaveState
  quoteSaveState: SaveState
  notesSaveState: SaveState
  jobNumberSaveState: SaveState
  customerSaveState: SaveState
  deviceSaveState: SaveState
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
  draggableEnabled?: boolean
  isDragging?: boolean
  onDragStart?: (jobId: string) => void
  onDragEnd?: () => void
  invoice: Invoice | null
  invoiceActionState: InvoiceActionState
  createInvoiceForJob: (job: RepairRequest) => Promise<void>
  updateInvoiceStatusForJob: (invoiceId: string, status: InvoiceStatus) => Promise<void>
}) {
  const [localQuote, setLocalQuote] = useState(job.quoted_price?.toString() ?? '')
  const [localNotes, setLocalNotes] = useState(job.internal_notes ?? '')
  const [localJobNumber, setLocalJobNumber] = useState(job.job_number ?? '')

  const [customerDraft, setCustomerDraft] = useState({
    full_name: job.full_name,
    phone: job.phone,
    email: job.email ?? '',
  })

  const [deviceDraft, setDeviceDraft] = useState({
    brand: job.brand,
    model: job.model,
    device_type: job.device_type ?? '',
    fault_description: job.fault_description,
  })

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobNumberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deviceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const quoteFocusedRef = useRef(false)
  const notesFocusedRef = useRef(false)
  const jobNumberFocusedRef = useRef(false)
  const customerFocusedRef = useRef(false)
  const deviceFocusedRef = useRef(false)

  useEffect(() => {
    if (!quoteFocusedRef.current) {
      setLocalQuote(job.quoted_price?.toString() ?? '')
    }
  }, [job.quoted_price])

  useEffect(() => {
    if (!notesFocusedRef.current) {
      setLocalNotes(job.internal_notes ?? '')
    }
  }, [job.internal_notes])

  useEffect(() => {
    if (!jobNumberFocusedRef.current) {
      setLocalJobNumber(job.job_number ?? '')
    }
  }, [job.job_number])

  useEffect(() => {
    if (!customerFocusedRef.current) {
      setCustomerDraft({
        full_name: job.full_name,
        phone: job.phone,
        email: job.email ?? '',
      })
    }
  }, [job.full_name, job.phone, job.email])

  useEffect(() => {
    if (!deviceFocusedRef.current) {
      setDeviceDraft({
        brand: job.brand,
        model: job.model,
        device_type: job.device_type ?? '',
        fault_description: job.fault_description,
      })
    }
  }, [job.brand, job.model, job.device_type, job.fault_description])

  useEffect(() => {
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      if (jobNumberTimerRef.current) clearTimeout(jobNumberTimerRef.current)
      if (customerTimerRef.current) clearTimeout(customerTimerRef.current)
      if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
    }
  }, [])

  async function flushQuote(rawValue: string) {
    const normalized = normalizeQuoteInput(rawValue).trim()
    const nextValue =
      normalized === '' ? null : Number.isNaN(Number(normalized)) ? null : Number(normalized)

    const currentDbValue = job.quoted_price ?? null

    if (nextValue === currentDbValue) {
      setFieldState(job.id, 'quote', 'idle')
      return
    }

    await updateQuote(job.id, nextValue)
  }

  async function flushNotes(value: string) {
    const currentDbValue = job.internal_notes ?? ''
    if (value === currentDbValue) {
      setFieldState(job.id, 'notes', 'idle')
      return
    }

    await updateNotes(job.id, value)
  }

  async function flushJobNumber(value: string) {
    const trimmed = value.trim()
    const currentDbValue = job.job_number ?? ''

    if (trimmed === currentDbValue) {
      setFieldState(job.id, 'job_number', 'idle')
      return
    }

    await updateJobBasics(
      job.id,
      {
        job_number: trimmed || null,
      },
      'job_number'
    )
  }

  async function flushCustomer(nextDraft: {
    full_name: string
    phone: string
    email: string
  }) {
    const fullName = nextDraft.full_name.trim()
    const phone = normalizePhone(nextDraft.phone)
    const email = nextDraft.email.trim()

    const currentName = job.full_name
    const currentPhone = job.phone
    const currentEmail = job.email ?? ''

    if (fullName === currentName && phone === currentPhone && email === currentEmail) {
      setFieldState(job.id, 'customer', 'idle')
      return
    }

    if (!fullName || phone.length < 8) {
      setFieldState(job.id, 'customer', 'error')
      return
    }

    await updateJobBasics(
      job.id,
      {
        full_name: fullName,
        phone,
        email: email || null,
      },
      'customer'
    )
  }

  async function flushDevice(nextDraft: {
    brand: string
    model: string
    device_type: string
    fault_description: string
  }) {
    const brand = nextDraft.brand.trim()
    const model = nextDraft.model.trim()
    const deviceType = nextDraft.device_type.trim()
    const fault = nextDraft.fault_description.trim()

    const currentBrand = job.brand
    const currentModel = job.model
    const currentType = job.device_type ?? ''
    const currentFault = job.fault_description

    if (
      brand === currentBrand &&
      model === currentModel &&
      deviceType === currentType &&
      fault === currentFault
    ) {
      setFieldState(job.id, 'device', 'idle')
      return
    }

    if (!brand || !model || fault.length < 3) {
      setFieldState(job.id, 'device', 'error')
      return
    }

    await updateJobBasics(
      job.id,
      {
        brand,
        model,
        device_type: deviceType || null,
        fault_description: fault,
      },
      'device'
    )
  }

  function handleQuoteChange(value: string) {
    const normalized = normalizeQuoteInput(value)
    setLocalQuote(normalized)
    setFieldState(job.id, 'quote', 'dirty')

    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    quoteTimerRef.current = setTimeout(() => {
      void flushQuote(normalized)
    }, 700)
  }

  function handleNotesChange(value: string) {
    setLocalNotes(value)
    setFieldState(job.id, 'notes', 'dirty')

    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      void flushNotes(value)
    }, 900)
  }

  function handleJobNumberChange(value: string) {
    setLocalJobNumber(value)
    setFieldState(job.id, 'job_number', 'dirty')

    if (jobNumberTimerRef.current) clearTimeout(jobNumberTimerRef.current)
    jobNumberTimerRef.current = setTimeout(() => {
      void flushJobNumber(value)
    }, 700)
  }

  function handleCustomerDraftChange(
    key: 'full_name' | 'phone' | 'email',
    value: string
  ) {
    const next = {
      ...customerDraft,
      [key]: key === 'phone' ? normalizePhone(value) : value,
    }

    setCustomerDraft(next)
    setFieldState(job.id, 'customer', 'dirty')

    if (customerTimerRef.current) clearTimeout(customerTimerRef.current)
    customerTimerRef.current = setTimeout(() => {
      void flushCustomer(next)
    }, 900)
  }

  function handleDeviceDraftChange(
    key: 'brand' | 'model' | 'device_type' | 'fault_description',
    value: string
  ) {
    const next = {
      ...deviceDraft,
      [key]: value,
    }

    setDeviceDraft(next)
    setFieldState(job.id, 'device', 'dirty')

    if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
    deviceTimerRef.current = setTimeout(() => {
      void flushDevice(next)
    }, 900)
  }

  async function handleQuoteBlur() {
    quoteFocusedRef.current = false
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    await flushQuote(localQuote)
  }

  async function handleNotesBlur() {
    notesFocusedRef.current = false
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    await flushNotes(localNotes)
  }

  async function handleJobNumberBlur() {
    jobNumberFocusedRef.current = false
    if (jobNumberTimerRef.current) clearTimeout(jobNumberTimerRef.current)
    await flushJobNumber(localJobNumber)
  }

  async function handleCustomerBlur() {
    customerFocusedRef.current = false
    if (customerTimerRef.current) clearTimeout(customerTimerRef.current)
    await flushCustomer(customerDraft)
  }

  async function handleDeviceBlur() {
    deviceFocusedRef.current = false
    if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
    await flushDevice(deviceDraft)
  }

  function buildQuoteSms() {
    const customerName = job.full_name.split(' ')[0] || job.full_name
    const quoteText =
      job.quoted_price != null ? `$${job.quoted_price}` : 'your quoted amount'

    return `Hi ${customerName}, your repair quote for ${job.brand} ${job.model} is ${quoteText}. Please reply to approve or contact The Mobile Phone Clinic for details.`
  }

  function buildReadySms() {
    const customerName = job.full_name.split(' ')[0] || job.full_name
    return `Hi ${customerName}, your ${job.brand} ${job.model} repair is ready for pickup from The Mobile Phone Clinic. Please contact us to arrange collection.`
  }

  function openSms(message: string) {
    const encoded = encodeURIComponent(message)
    const digits = normalizePhone(job.phone)
    window.open(`sms:${digits}?body=${encoded}`, '_self')
  }

  function handleCardDragStart(event: React.DragEvent<HTMLDivElement>) {
    if (!draggableEnabled) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', job.id)
    onDragStart?.(job.id)
  }

  function handleCardDragEnd() {
    if (!draggableEnabled) return
    onDragEnd?.()
  }

  return (
    <div
      className={`${styles.jobCard} ${
        draggableEnabled ? styles.jobCardDraggable : ''
      } ${isDragging ? styles.jobCardDragging : ''}`}
      draggable={draggableEnabled}
      onDragStart={handleCardDragStart}
      onDragEnd={handleCardDragEnd}
    >
      <div className={styles.cardTopRow}>
        <div className={styles.cardTopLeft}>
          <div className={styles.sectionLabel}>Job Number</div>
          <div className={styles.jobNumberDisplay}>
            {job.job_number || 'Pending Job Number'}
          </div>
        </div>

        <div className={styles.cardActions}>
          <span
            className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}
          >
            {getStatusLabel(job.status)}
          </span>

          <button
            type="button"
            onClick={() => toggleExpanded(job.id)}
            className={styles.miniButton}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {!expanded ? (
        <div className={styles.collapsedBlock}>
          <div>
            <div className={styles.sectionLabel}>Customer</div>
            <p className={styles.customerName}>{job.full_name}</p>
          </div>

          <div>
            <div className={styles.sectionLabel}>Phone</div>
            <p className={styles.metaText}>{job.phone}</p>
          </div>

          <div>
            <div className={styles.sectionLabel}>Device</div>
            <p className={styles.deviceTitle}>
              {job.brand} {job.model}
              {job.device_type ? ` • ${job.device_type}` : ''}
            </p>
          </div>

          <div>
            <div className={styles.sectionLabel}>Fault</div>
            <p className={styles.collapsedFault}>{job.fault_description}</p>
          </div>

          <div>
            <div className={styles.sectionLabel}>Quote</div>
            <p className={styles.metaText}>
              {job.quoted_price != null ? `$${job.quoted_price}` : '-'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.expandedBlock}>
            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <div className={styles.expandedSectionTitle}>Job Details</div>
                <SaveIndicator state={jobNumberSaveState} />
              </div>

              <div className={styles.mt10}>
                <label className={styles.smallLabel}>Job Number</label>
                <input
                  value={localJobNumber}
                  placeholder="Enter job number"
                  className={styles.smallField}
                  onFocus={() => {
                    jobNumberFocusedRef.current = true
                  }}
                  onBlur={() => void handleJobNumberBlur()}
                  onChange={(e) => handleJobNumberChange(e.target.value)}
                />
              </div>

              <div className={styles.mt12}>
                <div className={styles.inputTopRow}>
                  <label className={styles.smallLabel}>Status</label>
                  <SaveIndicator state={statusSaveState} />
                </div>

                <div className={styles.statusButtonsWrap}>
                  {(
                    [
                      ['new', 'New'],
                      ['quoted', 'Quoted'],
                      ['approved', 'Approved'],
                      ['in_progress', 'In Progress'],
                      ['completed', 'Ready'],
                      ['closed', 'Closed'],
                      ['rejected', 'Reject'],
                      ['cancelled', 'Cancel'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => void updateStatus(job.id, value)}
                      className={`${styles.statusButton} ${
                        job.status === value ? styles.statusButtonActive : ''
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <div className={styles.expandedSectionTitle}>Customer Details</div>
                <SaveIndicator state={customerSaveState} />
              </div>

              <div className={styles.formGrid}>
                <div>
                  <label className={styles.smallLabel}>Full Name</label>
                  <input
                    value={customerDraft.full_name}
                    className={styles.smallField}
                    onFocus={() => {
                      customerFocusedRef.current = true
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('full_name', e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Phone</label>
                  <input
                    value={customerDraft.phone}
                    inputMode="numeric"
                    maxLength={10}
                    className={styles.smallField}
                    onFocus={() => {
                      customerFocusedRef.current = true
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('phone', e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Email</label>
                  <input
                    value={customerDraft.email}
                    className={styles.smallField}
                    onFocus={() => {
                      customerFocusedRef.current = true
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('email', e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Preferred Contact</label>
                  <div className={styles.readOnlyValue}>
                    {job.preferred_contact || '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <div className={styles.expandedSectionTitle}>Device Details</div>
                <SaveIndicator state={deviceSaveState} />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.twoCol}>
                  <div>
                    <label className={styles.smallLabel}>Brand</label>
                    <input
                      value={deviceDraft.brand}
                      className={styles.smallField}
                      onFocus={() => {
                        deviceFocusedRef.current = true
                      }}
                      onBlur={() => void handleDeviceBlur()}
                      onChange={(e) => handleDeviceDraftChange('brand', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className={styles.smallLabel}>Model</label>
                    <input
                      value={deviceDraft.model}
                      className={styles.smallField}
                      onFocus={() => {
                        deviceFocusedRef.current = true
                      }}
                      onBlur={() => void handleDeviceBlur()}
                      onChange={(e) => handleDeviceDraftChange('model', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className={styles.smallLabel}>Device Type</label>
                  <input
                    value={deviceDraft.device_type}
                    placeholder="Phone, tablet, laptop..."
                    className={styles.smallField}
                    onFocus={() => {
                      deviceFocusedRef.current = true
                    }}
                    onBlur={() => void handleDeviceBlur()}
                    onChange={(e) => handleDeviceDraftChange('device_type', e.target.value)}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Fault Description</label>
                  <textarea
                    value={deviceDraft.fault_description}
                    className={styles.notesField}
                    onFocus={() => {
                      deviceFocusedRef.current = true
                    }}
                    onBlur={() => void handleDeviceBlur()}
                    onChange={(e) =>
                      handleDeviceDraftChange('fault_description', e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <label className={styles.expandedSectionTitle}>Quote</label>
                <SaveIndicator state={quoteSaveState} />
              </div>

              <input
                inputMode="decimal"
                value={localQuote}
                placeholder="Enter quote"
                className={styles.smallField}
                onFocus={() => {
                  quoteFocusedRef.current = true
                }}
                onBlur={() => void handleQuoteBlur()}
                onChange={(e) => handleQuoteChange(e.target.value)}
              />

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => openSms(buildQuoteSms())}
                >
                  Send Quote SMS
                </button>
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <label className={styles.expandedSectionTitle}>Internal Notes</label>
                <SaveIndicator state={notesSaveState} />
              </div>

              <textarea
                value={localNotes}
                placeholder="Diagnostics, parts ordered, quote sent, approval received, reminders..."
                className={styles.notesField}
                onFocus={() => {
                  notesFocusedRef.current = true
                }}
                onBlur={() => void handleNotesBlur()}
                onChange={(e) => handleNotesChange(e.target.value)}
              />

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => openSms(buildReadySms())}
                >
                  Ready for Pickup SMS
                </button>
              </div>
            </div>

            <InvoicePanel
              invoice={invoice}
              actionState={invoiceActionState}
              onCreateInvoice={() => createInvoiceForJob(job)}
              onUpdateInvoiceStatus={(status) => {
                if (!invoice) return Promise.resolve()
                return updateInvoiceStatusForJob(invoice.id, status)
              }}
            />
          </div>

          <div className={styles.mt12}>
            <p className={styles.summaryRow}>
              <strong>Booked in:</strong> {formatDateTime(job.created_at)}
            </p>
          </div>
        </>
      )}
    </div>
  )
}