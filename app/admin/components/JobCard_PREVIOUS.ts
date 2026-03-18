'use client'

import { useEffect, useRef, useState } from 'react'
import styles from '../admin.module.css'
import type {
  RepairRequest,
  RepairStatus,
  SaveField,
  SaveState,
} from '../types'
import SaveIndicator from './SaveIndicator'

type Props = {
  job: RepairRequest
  expanded: boolean
  toggleExpanded: (jobId: string) => void
  updateStatus: (jobId: string, status: RepairStatus) => Promise<void>
  updateQuote: (jobId: string, quoteInput: string) => Promise<void>
  updateNotes: (jobId: string, notes: string) => Promise<void>
  updateRepairPerformed: (jobId: string, repairPerformed: string) => Promise<void>
  updateJobBasics: (
    jobId: string,
    patch: {
      job_number?: number | null
      full_name?: string
      phone?: string | null
      email?: string | null
      device_brand?: string | null
      device_model?: string | null
      device_type?: string | null
    }
  ) => Promise<void>
  statusSaveState: SaveState
  quoteSaveState: SaveState
  notesSaveState: SaveState
  repairPerformedSaveState: SaveState
  jobNumberSaveState: SaveState
  customerSaveState: SaveState
  deviceSaveState: SaveState
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
  formatDateTime: (value?: string | null) => string
  getStatusLabel: (status: RepairStatus) => string
  normalizePhone: (value: string) => string
  normalizeQuoteInput: (value: string) => string
}

const STATUSES: RepairStatus[] = [
  'new',
  'quoted',
  'approved',
  'in_progress',
  'ready',
  'completed',
  'collected',
  'archived',
]

export default function JobCard({
  job,
  expanded,
  toggleExpanded,
  updateStatus,
  updateQuote,
  updateNotes,
  updateRepairPerformed,
  updateJobBasics,
  statusSaveState,
  quoteSaveState,
  notesSaveState,
  repairPerformedSaveState,
  jobNumberSaveState,
  customerSaveState,
  deviceSaveState,
  setFieldState,
  formatDateTime,
  getStatusLabel,
  normalizePhone,
  normalizeQuoteInput,
}: Props) {
  const [jobNumberInput, setJobNumberInput] = useState(job.job_number?.toString() || '')
  const [customerNameInput, setCustomerNameInput] = useState(job.full_name || '')
  const [phoneInput, setPhoneInput] = useState(job.phone || '')
  const [emailInput, setEmailInput] = useState(job.email || '')
  const [deviceBrandInput, setDeviceBrandInput] = useState(job.device_brand || '')
  const [deviceModelInput, setDeviceModelInput] = useState(job.device_model || '')
  const [deviceTypeInput, setDeviceTypeInput] = useState(job.device_type || '')
  const [quoteInput, setQuoteInput] = useState(
    job.quoted_price === null || job.quoted_price === undefined ? '' : String(job.quoted_price)
  )
  const [notesInput, setNotesInput] = useState(job.internal_notes || '')
  const [repairPerformedInput, setRepairPerformedInput] = useState(job.repair_performed || '')

  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repairPerformedDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deviceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobNumberDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setJobNumberInput(job.job_number?.toString() || '')
  }, [job.job_number])

  useEffect(() => {
    setCustomerNameInput(job.full_name || '')
  }, [job.full_name])

  useEffect(() => {
    setPhoneInput(job.phone || '')
  }, [job.phone])

  useEffect(() => {
    setEmailInput(job.email || '')
  }, [job.email])

  useEffect(() => {
    setDeviceBrandInput(job.device_brand || '')
  }, [job.device_brand])

  useEffect(() => {
    setDeviceModelInput(job.device_model || '')
  }, [job.device_model])

  useEffect(() => {
    setDeviceTypeInput(job.device_type || '')
  }, [job.device_type])

  useEffect(() => {
    setQuoteInput(job.quoted_price === null || job.quoted_price === undefined ? '' : String(job.quoted_price))
  }, [job.quoted_price])

  useEffect(() => {
    setNotesInput(job.internal_notes || '')
  }, [job.internal_notes])

  useEffect(() => {
    setRepairPerformedInput(job.repair_performed || '')
  }, [job.repair_performed])

  useEffect(() => {
    return () => {
      if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
      if (repairPerformedDebounceRef.current) clearTimeout(repairPerformedDebounceRef.current)
      if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current)
      if (deviceDebounceRef.current) clearTimeout(deviceDebounceRef.current)
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current)
      if (jobNumberDebounceRef.current) clearTimeout(jobNumberDebounceRef.current)
    }
  }, [])

  function scheduleCustomerSave(nextPatch: {
    full_name?: string
    phone?: string | null
    email?: string | null
  }) {
    if (customerDebounceRef.current) clearTimeout(customerDebounceRef.current)
    setFieldState(job.id, 'customer', 'saving')
    customerDebounceRef.current = setTimeout(() => {
      void updateJobBasics(job.id, nextPatch)
    }, 450)
  }

  function scheduleDeviceSave(nextPatch: {
    device_brand?: string | null
    device_model?: string | null
    device_type?: string | null
  }) {
    if (deviceDebounceRef.current) clearTimeout(deviceDebounceRef.current)
    setFieldState(job.id, 'device', 'saving')
    deviceDebounceRef.current = setTimeout(() => {
      void updateJobBasics(job.id, nextPatch)
    }, 450)
  }

  function scheduleQuoteSave(nextValue: string) {
    if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current)
    setFieldState(job.id, 'quote', 'saving')
    quoteDebounceRef.current = setTimeout(() => {
      void updateQuote(job.id, nextValue)
    }, 450)
  }

  function scheduleJobNumberSave(nextValue: string) {
    if (jobNumberDebounceRef.current) clearTimeout(jobNumberDebounceRef.current)
    setFieldState(job.id, 'job_number', 'saving')
    jobNumberDebounceRef.current = setTimeout(() => {
      const parsed = nextValue.trim() === '' ? null : Number(nextValue)
      void updateJobBasics(job.id, { job_number: Number.isFinite(parsed as number) ? parsed : null })
    }, 450)
  }

  function scheduleNotesSave(nextValue: string) {
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current)
    setFieldState(job.id, 'notes', 'saving')
    notesDebounceRef.current = setTimeout(() => {
      void updateNotes(job.id, nextValue)
    }, 500)
  }

  function scheduleRepairPerformedSave(nextValue: string) {
    if (repairPerformedDebounceRef.current) clearTimeout(repairPerformedDebounceRef.current)
    setFieldState(job.id, 'repair_performed', 'saving')
    repairPerformedDebounceRef.current = setTimeout(() => {
      void updateRepairPerformed(job.id, nextValue)
    }, 500)
  }

  return (
    <article className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <div className={styles.jobCardIdentity}>
          <div className={styles.jobCardTitleRow}>
            <strong>#{job.job_number ?? '—'}</strong>
            <span>{job.full_name || 'No customer name'}</span>
          </div>
          <div className={styles.jobCardSubtitle}>
            {(job.device_brand || 'Unknown brand') + ' ' + (job.device_model || '')}
          </div>
          <div className={styles.jobCardMeta}>
            <span>{getStatusLabel(job.status)}</span>
            <span>•</span>
            <span>{formatDateTime(job.created_at)}</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.secondaryButton}
          onClick={(e) => {
            e.stopPropagation()
            toggleExpanded(job.id)
          }}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Status</label>
        <div className={styles.inlineFieldRow}>
          <select
            className={styles.select}
            value={job.status}
            onChange={(e) => {
              void updateStatus(job.id, e.target.value as RepairStatus)
            }}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status)}
              </option>
            ))}
          </select>
          <SaveIndicator state={statusSaveState} />
        </div>
      </div>

      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel}>Quote</label>
        <div className={styles.inlineFieldRow}>
          <input
            className={styles.input}
            value={quoteInput}
            onChange={(e) => {
              const next = normalizeQuoteInput(e.target.value)
              setQuoteInput(next)
              scheduleQuoteSave(next)
            }}
            placeholder="0.00"
            inputMode="decimal"
          />
          <SaveIndicator state={quoteSaveState} />
        </div>
      </div>

      {expanded ? (
        <div className={styles.jobCardExpanded}>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Job Number</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={jobNumberInput}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^\d]/g, '')
                  setJobNumberInput(next)
                  scheduleJobNumberSave(next)
                }}
                inputMode="numeric"
                placeholder="Job number"
              />
              <SaveIndicator state={jobNumberSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Customer Name</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={customerNameInput}
                onChange={(e) => {
                  const next = e.target.value
                  setCustomerNameInput(next)
                  scheduleCustomerSave({
                    full_name: next,
                    phone: phoneInput,
                    email: emailInput,
                  })
                }}
                placeholder="Customer name"
              />
              <SaveIndicator state={customerSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Phone</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={phoneInput}
                onChange={(e) => {
                  const next = normalizePhone(e.target.value)
                  setPhoneInput(next)
                  scheduleCustomerSave({
                    full_name: customerNameInput,
                    phone: next,
                    email: emailInput,
                  })
                }}
                placeholder="Phone"
              />
              <SaveIndicator state={customerSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Email</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={emailInput}
                onChange={(e) => {
                  const next = e.target.value
                  setEmailInput(next)
                  scheduleCustomerSave({
                    full_name: customerNameInput,
                    phone: phoneInput,
                    email: next,
                  })
                }}
                placeholder="Email"
              />
              <SaveIndicator state={customerSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Device Brand</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={deviceBrandInput}
                onChange={(e) => {
                  const next = e.target.value
                  setDeviceBrandInput(next)
                  scheduleDeviceSave({
                    device_brand: next,
                    device_model: deviceModelInput,
                    device_type: deviceTypeInput,
                  })
                }}
                placeholder="Brand"
              />
              <SaveIndicator state={deviceSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Device Model</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={deviceModelInput}
                onChange={(e) => {
                  const next = e.target.value
                  setDeviceModelInput(next)
                  scheduleDeviceSave({
                    device_brand: deviceBrandInput,
                    device_model: next,
                    device_type: deviceTypeInput,
                  })
                }}
                placeholder="Model"
              />
              <SaveIndicator state={deviceSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Device Type</label>
            <div className={styles.inlineFieldRow}>
              <input
                className={styles.input}
                value={deviceTypeInput}
                onChange={(e) => {
                  const next = e.target.value
                  setDeviceTypeInput(next)
                  scheduleDeviceSave({
                    device_brand: deviceBrandInput,
                    device_model: deviceModelInput,
                    device_type: next,
                  })
                }}
                placeholder="Type"
              />
              <SaveIndicator state={deviceSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Issue Description</label>
            <textarea
              className={styles.textarea}
              value={job.issue_description || ''}
              readOnly
            />
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Repair Performed</label>
            <div className={styles.textareaWithSave}>
              <textarea
                className={styles.textarea}
                value={repairPerformedInput}
                onChange={(e) => {
                  const next = e.target.value
                  setRepairPerformedInput(next)
                  scheduleRepairPerformedSave(next)
                }}
                placeholder="What repair work was performed?"
              />
              <SaveIndicator state={repairPerformedSaveState} />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Internal Notes</label>
            <div className={styles.textareaWithSave}>
              <textarea
                className={styles.textarea}
                value={notesInput}
                onChange={(e) => {
                  const next = e.target.value
                  setNotesInput(next)
                  scheduleNotesSave(next)
                }}
                placeholder="Internal notes"
              />
              <SaveIndicator state={notesSaveState} />
            </div>
          </div>
        </div>
      ) : null}
    </article>
  )
}