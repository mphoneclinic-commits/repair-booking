'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  RepairRequest,
  RepairRequestPhoto,
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_PHOTOS = 10
const MAX_PHOTO_SIZE_MB = 8
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'

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
  draggableEnabled = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  invoice,
  invoiceItems,
  invoiceActionState,
  invoiceItemsActionState,
  createInvoiceForJob,
  updateInvoiceStatusForJob,
  addInvoiceItemForInvoice,
  updateInvoiceItemForInvoice,
  deleteInvoiceItemForInvoice,
  removeInvoiceForJob,
  highlighted = false,
  cardRef,
  onSelectCard,
  compact = false,
  onDuplicateJob,
  selectable = false,
  selected = false,
  onToggleSelected,
  onHideJob,
  onUnhideJob,
}: {
  job: RepairRequest
  expanded: boolean
  toggleExpanded: (jobId: string) => void
  updateStatus: (id: string, newStatus: RepairStatus) => Promise<void>
  updateQuote: (id: string, price: number | null) => Promise<boolean>
  updateNotes: (id: string, notes: string) => Promise<boolean>
  updateRepairPerformed: (id: string, value: string) => Promise<boolean>
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
  ) => Promise<boolean>
  statusSaveState: SaveState
  quoteSaveState: SaveState
  notesSaveState: SaveState
  repairPerformedSaveState: SaveState
  jobNumberSaveState: SaveState
  customerSaveState: SaveState
  deviceSaveState: SaveState
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
  draggableEnabled?: boolean
  isDragging?: boolean
  onDragStart?: (jobId: string) => void
  onDragEnd?: () => void
  invoice: Invoice | null
  invoiceItems: InvoiceItem[]
  invoiceActionState: InvoiceActionState
  invoiceItemsActionState: InvoiceItemsActionState
  createInvoiceForJob: (job: RepairRequest) => Promise<void>
  updateInvoiceStatusForJob: (invoiceId: string, status: InvoiceStatus) => Promise<void>
  addInvoiceItemForInvoice: (invoiceId: string) => Promise<void>
  updateInvoiceItemForInvoice: (
    invoiceId: string,
    itemId: string,
    updates: Partial<Pick<InvoiceItem, 'description' | 'qty' | 'unit_price'>>
  ) => Promise<void>
  deleteInvoiceItemForInvoice: (invoiceId: string, itemId: string) => Promise<void>
  removeInvoiceForJob: (job: RepairRequest) => Promise<void>
  highlighted?: boolean
  cardRef?: (el: HTMLDivElement | null) => void
  onSelectCard?: (jobId: string) => void
  compact?: boolean
  onDuplicateJob?: (job: RepairRequest) => Promise<void>
  selectable?: boolean
  selected?: boolean
  onToggleSelected?: (jobId: string) => void
  onHideJob?: (jobId: string) => Promise<void>
  onUnhideJob?: (jobId: string) => Promise<void>
}) {
  const [localQuote, setLocalQuote] = useState(job.quoted_price?.toString() ?? '')
  const [localNotes, setLocalNotes] = useState(job.internal_notes ?? '')
  const [localRepairPerformed, setLocalRepairPerformed] = useState(job.repair_performed ?? '')
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
    serial_imei: job.serial_imei ?? '',
    fault_description: job.fault_description,
  })

  const [jobPhotos, setJobPhotos] = useState<RepairRequestPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [photoSuccess, setPhotoSuccess] = useState('')
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null)

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repairPerformedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jobNumberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const customerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deviceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const quoteFocusedRef = useRef(false)
  const notesFocusedRef = useRef(false)
  const repairPerformedFocusedRef = useRef(false)
  const jobNumberFocusedRef = useRef(false)
  const customerFocusedRef = useRef(false)
  const deviceFocusedRef = useRef(false)

  useEffect(() => {
    if (!quoteFocusedRef.current) setLocalQuote(job.quoted_price?.toString() ?? '')
  }, [job.quoted_price])

  useEffect(() => {
    if (!notesFocusedRef.current) setLocalNotes(job.internal_notes ?? '')
  }, [job.internal_notes])

  useEffect(() => {
    if (!repairPerformedFocusedRef.current) {
      setLocalRepairPerformed(job.repair_performed ?? '')
    }
  }, [job.repair_performed])

  useEffect(() => {
    if (!jobNumberFocusedRef.current) setLocalJobNumber(job.job_number ?? '')
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
        serial_imei: job.serial_imei ?? '',
        fault_description: job.fault_description,
      })
    }
  }, [job.brand, job.model, job.device_type, job.serial_imei, job.fault_description])

  useEffect(() => {
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
      if (repairPerformedTimerRef.current) clearTimeout(repairPerformedTimerRef.current)
      if (jobNumberTimerRef.current) clearTimeout(jobNumberTimerRef.current)
      if (customerTimerRef.current) clearTimeout(customerTimerRef.current)
      if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!expanded) return
    void loadJobPhotos()
  }, [expanded, job.id])

  async function loadJobPhotos() {
    setLoadingPhotos(true)
    setUploadError('')

    const { data, error } = await supabase
      .from('repair_request_photos')
      .select(`
        id,
        repair_request_id,
        photo_url,
        storage_path,
        sort_order,
        created_at
      `)
      .eq('repair_request_id', job.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      setUploadError('Failed to load photos: ' + error.message)
      setLoadingPhotos(false)
      return
    }

    const normalized = ((data || []) as RepairRequestPhoto[]).map((photo) => ({
      ...photo,
      sort_order: Number(photo.sort_order ?? 0),
      storage_path: photo.storage_path ?? null,
    }))

    setJobPhotos(normalized)
    setLoadingPhotos(false)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null

    if (!file) {
      setPhotoFile(null)
      return
    }

    const maxBytes = MAX_PHOTO_SIZE_MB * 1024 * 1024

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setUploadError('Photo must be JPG, PNG, WEBP, HEIC or HEIF.')
      setPhotoFile(null)
      return
    }

    if (file.size > maxBytes) {
      setUploadError(`Photo must be smaller than ${MAX_PHOTO_SIZE_MB}MB.`)
      setPhotoFile(null)
      return
    }

    if (jobPhotos.length >= MAX_PHOTOS) {
      setUploadError(`Maximum ${MAX_PHOTOS} photos allowed for one job.`)
      setPhotoFile(null)
      return
    }

    setUploadError('')
    setPhotoSuccess('')
    setPhotoFile(file)
  }

  async function handlePhotoUpload() {
    if (!photoFile) return

    if (jobPhotos.length >= MAX_PHOTOS) {
      setUploadError(`Maximum ${MAX_PHOTOS} photos allowed for one job.`)
      return
    }

    setUploadingPhoto(true)
    setUploadError('')
    setPhotoSuccess('')

    const fileExt = photoFile.name.split('.').pop() || 'jpg'
    const fileName = `${job.id}-${Date.now()}.${fileExt}`
    const filePath = `fault-photos/${fileName}`

    const { error: storageUploadError } = await supabase.storage
      .from('fault-photos')
      .upload(filePath, photoFile)

    if (storageUploadError) {
      setUploadError('Photo upload failed: ' + storageUploadError.message)
      setUploadingPhoto(false)
      return
    }

    const { data: urlData } = supabase.storage.from('fault-photos').getPublicUrl(filePath)

    const publicUrl = urlData.publicUrl
    const nextSortOrder =
      jobPhotos.length > 0 ? Math.max(...jobPhotos.map((photo) => photo.sort_order)) + 1 : 0

    const { data: insertedPhoto, error: insertError } = await supabase
      .from('repair_request_photos')
      .insert({
        repair_request_id: job.id,
        photo_url: publicUrl,
        storage_path: filePath,
        sort_order: nextSortOrder,
      })
      .select(`
        id,
        repair_request_id,
        photo_url,
        storage_path,
        sort_order,
        created_at
      `)
      .single()

    if (insertError || !insertedPhoto) {
      setUploadError('Failed to save photo record: ' + (insertError?.message || 'Unknown error'))
      setUploadingPhoto(false)
      return
    }

    const normalizedPhoto: RepairRequestPhoto = {
      ...(insertedPhoto as RepairRequestPhoto),
      storage_path: insertedPhoto.storage_path ?? null,
      sort_order: Number(insertedPhoto.sort_order ?? 0),
    }

    setJobPhotos((prev) => [...prev, normalizedPhoto])
    setPhotoFile(null)
    setUploadingPhoto(false)
    setPhotoSuccess('Photo uploaded.')
  }

  async function handleDeletePhoto(photo: RepairRequestPhoto) {
    const confirmed = window.confirm('Delete this photo?')
    if (!confirmed) return

    setDeletingPhotoId(photo.id)
    setUploadError('')
    setPhotoSuccess('')

    if (photo.storage_path) {
      const { error: storageDeleteError } = await supabase.storage
        .from('fault-photos')
        .remove([photo.storage_path])

      if (storageDeleteError) {
        setUploadError('Failed to delete photo file: ' + storageDeleteError.message)
        setDeletingPhotoId(null)
        return
      }
    }

    const { error: deleteRowError } = await supabase
      .from('repair_request_photos')
      .delete()
      .eq('id', photo.id)

    if (deleteRowError) {
      setUploadError('Failed to delete photo record: ' + deleteRowError.message)
      setDeletingPhotoId(null)
      return
    }

    setJobPhotos((prev) => prev.filter((item) => item.id !== photo.id))
    setDeletingPhotoId(null)
    setPhotoSuccess('Photo deleted.')
  }

  async function flushQuote(rawValue: string) {
    const normalized = normalizeQuoteInput(rawValue).trim()
    const nextValue = normalized === '' ? null : Number(normalized)
    const currentDbValue = job.quoted_price ?? null

    if (nextValue === currentDbValue) {
      setFieldState(job.id, 'quote', 'idle')
      return
    }

    setFieldState(job.id, 'quote', 'saving')
    const success = await updateQuote(job.id, nextValue)

    if (!success) {
      setFieldState(job.id, 'quote', 'error')
    } else {
      setFieldState(job.id, 'quote', 'saved')
      setTimeout(() => setFieldState(job.id, 'quote', 'idle'), 1300)
    }
  }

  async function flushNotes(value: string) {
    const currentDbValue = job.internal_notes ?? ''
    if (value === currentDbValue) {
      setFieldState(job.id, 'notes', 'idle')
      return
    }

    setFieldState(job.id, 'notes', 'saving')
    const success = await updateNotes(job.id, value)

    if (!success) {
      setFieldState(job.id, 'notes', 'error')
    } else {
      setFieldState(job.id, 'notes', 'saved')
      setTimeout(() => setFieldState(job.id, 'notes', 'idle'), 1300)
    }
  }

  async function flushRepairPerformed(value: string) {
    const currentDbValue = job.repair_performed ?? ''
    if (value === currentDbValue) {
      setFieldState(job.id, 'repair_performed', 'idle')
      return
    }

    setFieldState(job.id, 'repair_performed', 'saving')
    const success = await updateRepairPerformed(job.id, value)

    if (!success) {
      setFieldState(job.id, 'repair_performed', 'error')
    } else {
      setFieldState(job.id, 'repair_performed', 'saved')
      setTimeout(() => setFieldState(job.id, 'repair_performed', 'idle'), 1300)
    }
  }

  async function flushJobNumber(value: string) {
    const trimmed = value.trim()
    const currentDbValue = job.job_number ?? ''

    if (trimmed === currentDbValue) {
      setFieldState(job.id, 'job_number', 'idle')
      return
    }

    setFieldState(job.id, 'job_number', 'saving')
    const success = await updateJobBasics(job.id, { job_number: trimmed || null }, 'job_number')

    if (!success) {
      setFieldState(job.id, 'job_number', 'error')
    } else {
      setFieldState(job.id, 'job_number', 'saved')
      setTimeout(() => setFieldState(job.id, 'job_number', 'idle'), 1300)
    }
  }

  async function flushCustomer(nextDraft: { full_name: string; phone: string; email: string }) {
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

    setFieldState(job.id, 'customer', 'saving')
    const success = await updateJobBasics(
      job.id,
      { full_name: fullName, phone, email: email || null },
      'customer'
    )

    if (!success) {
      setFieldState(job.id, 'customer', 'error')
    } else {
      setFieldState(job.id, 'customer', 'saved')
      setTimeout(() => setFieldState(job.id, 'customer', 'idle'), 1300)
    }
  }

  async function flushDevice(nextDraft: {
    brand: string
    model: string
    device_type: string
    serial_imei: string
    fault_description: string
  }) {
    const brand = nextDraft.brand.trim()
    const model = nextDraft.model.trim()
    const deviceType = nextDraft.device_type.trim()
    const serialImei = nextDraft.serial_imei.trim()
    const fault = nextDraft.fault_description.trim()

    const currentBrand = job.brand
    const currentModel = job.model
    const currentType = job.device_type ?? ''
    const currentSerialImei = job.serial_imei ?? ''
    const currentFault = job.fault_description

    if (
      brand === currentBrand &&
      model === currentModel &&
      deviceType === currentType &&
      serialImei === currentSerialImei &&
      fault === currentFault
    ) {
      setFieldState(job.id, 'device', 'idle')
      return
    }

    if (!brand || !model || fault.length < 3) {
      setFieldState(job.id, 'device', 'error')
      return
    }

    setFieldState(job.id, 'device', 'saving')
    const success = await updateJobBasics(
      job.id,
      {
        brand,
        model,
        device_type: deviceType || null,
        serial_imei: serialImei || null,
        fault_description: fault,
      },
      'device'
    )

    if (!success) {
      setFieldState(job.id, 'device', 'error')
    } else {
      setFieldState(job.id, 'device', 'saved')
      setTimeout(() => setFieldState(job.id, 'device', 'idle'), 1300)
    }
  }

  function handleQuoteChange(value: string) {
    const normalized = normalizeQuoteInput(value)
    setLocalQuote(normalized)
    setFieldState(job.id, 'quote', 'dirty')

    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
    quoteTimerRef.current = setTimeout(() => void flushQuote(normalized), 700)
  }

  function handleNotesChange(value: string) {
    setLocalNotes(value)
    setFieldState(job.id, 'notes', 'dirty')

    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => void flushNotes(value), 900)
  }

  function handleRepairPerformedChange(value: string) {
    setLocalRepairPerformed(value)
    setFieldState(job.id, 'repair_performed', 'dirty')

    if (repairPerformedTimerRef.current) clearTimeout(repairPerformedTimerRef.current)
    repairPerformedTimerRef.current = setTimeout(() => void flushRepairPerformed(value), 900)
  }

  function handleJobNumberChange(value: string) {
    setLocalJobNumber(value)
    setFieldState(job.id, 'job_number', 'dirty')

    if (jobNumberTimerRef.current) clearTimeout(jobNumberTimerRef.current)
    jobNumberTimerRef.current = setTimeout(() => void flushJobNumber(value), 700)
  }

  function handleCustomerDraftChange(key: 'full_name' | 'phone' | 'email', value: string) {
    const next = {
      ...customerDraft,
      [key]: key === 'phone' ? normalizePhone(value) : value,
    }

    setCustomerDraft(next)
    setFieldState(job.id, 'customer', 'dirty')

    if (customerTimerRef.current) clearTimeout(customerTimerRef.current)
    customerTimerRef.current = setTimeout(() => void flushCustomer(next), 900)
  }

  function handleDeviceDraftChange(
    key: 'brand' | 'model' | 'device_type' | 'serial_imei' | 'fault_description',
    value: string
  ) {
    const next = {
      ...deviceDraft,
      [key]: value,
    }

    setDeviceDraft(next)
    setFieldState(job.id, 'device', 'dirty')

    if (deviceTimerRef.current) clearTimeout(deviceTimerRef.current)
    deviceTimerRef.current = setTimeout(() => void flushDevice(next), 900)
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

  async function handleRepairPerformedBlur() {
    repairPerformedFocusedRef.current = false
    if (repairPerformedTimerRef.current) clearTimeout(repairPerformedTimerRef.current)
    await flushRepairPerformed(localRepairPerformed)
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
    const quoteText = job.quoted_price != null ? `$${job.quoted_price}` : 'your quoted amount'
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

  function handleSelectCard() {
    onSelectCard?.(job.id)
  }

  const compactSummary = (
    <div className={`${styles.collapsedBlock} ${compact ? styles.collapsedBlockCompact : ''}`}>
      {selectable ? (
        <div className={styles.archiveSelectRow}>
          <label className={styles.archiveCheckboxLabel}>
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelected?.(job.id)}
              onClick={(e) => e.stopPropagation()}
            />
            <span>Select</span>
          </label>
        </div>
      ) : null}

      <div>
        <div className={styles.sectionLabel}>Customer</div>
        <p className={styles.customerName}>{job.full_name}</p>
      </div>

      <div>
        <div className={styles.sectionLabel}>Device</div>
        <p className={styles.deviceTitle}>
          {job.brand} {job.model}
          {job.device_type ? ` • ${job.device_type}` : ''}
        </p>
      </div>

      <div className={styles.compactMetaRow}>
        <div>
          <div className={styles.sectionLabel}>Job</div>
          <p className={styles.metaText}>{job.job_number || 'Pending'}</p>
        </div>
        <div>
          <div className={styles.sectionLabel}>Quote</div>
          <p className={styles.metaText}>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</p>
        </div>
      </div>

      {job.serial_imei ? (
        <div>
          <div className={styles.sectionLabel}>Serial / IMEI</div>
          <p className={styles.metaText}>{job.serial_imei}</p>
        </div>
      ) : null}

      <div>
        <div className={styles.sectionLabel}>Booked</div>
        <p className={styles.metaText}>{formatDateTime(job.created_at)}</p>
      </div>
    </div>
  )

  const isArchiveStatus =
    job.status === 'closed' || job.status === 'rejected' || job.status === 'cancelled'

  return (
    <div
      ref={cardRef}
      className={`${styles.jobCard} ${styles[`jobCard_${job.status}`]} ${
        draggableEnabled ? styles.jobCardDraggable : ''
      } ${isDragging ? styles.jobCardDragging : ''} ${
        highlighted ? styles.jobCardHighlighted : ''
      } ${compact ? styles.jobCardCompact : ''} ${selected ? styles.jobCardSelected : ''}`}
      draggable={draggableEnabled}
      onDragStart={handleCardDragStart}
      onDragEnd={handleCardDragEnd}
      onClick={handleSelectCard}
    >
      <div className={`${styles.cardTopRow} ${compact ? styles.cardTopRowCompact : ''}`}>
        <div className={styles.cardTopLeft}>
          <div className={styles.sectionLabel}>Job Number</div>
          <div className={styles.jobNumberDisplay}>{job.job_number || 'Pending Job Number'}</div>
        </div>

        <div className={styles.cardActions}>
          <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
            {getStatusLabel(job.status)}
          </span>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(job.id)
              onSelectCard?.(job.id)
            }}
            className={styles.miniButton}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {!expanded ? (
        compact ? (
          compactSummary
        ) : (
          <div className={styles.collapsedBlock}>
            <div>
              <div className={styles.sectionLabel}>Customer</div>
              <p className={styles.customerName}>{job.full_name}</p>
            </div>

            <div>
              <div className={styles.sectionLabel}>Phone</div>
              <p className={styles.phoneText}>{job.phone}</p>
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
              <p className={styles.metaText}>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</p>
            </div>
          </div>
        )
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
                    onSelectCard?.(job.id)
                  }}
                  onBlur={() => void handleJobNumberBlur()}
                  onChange={(e) => handleJobNumberChange(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
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
                      ['ready', 'Ready'],
                      ['closed', 'Closed'],
                      ['rejected', 'Reject'],
                      ['cancelled', 'Cancel'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectCard?.(job.id)
                        void updateStatus(job.id, value)
                      }}
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
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('full_name', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
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
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('phone', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Email</label>
                  <input
                    value={customerDraft.email}
                    className={styles.smallField}
                    onFocus={() => {
                      customerFocusedRef.current = true
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleCustomerBlur()}
                    onChange={(e) => handleCustomerDraftChange('email', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Preferred Contact</label>
                  <div className={styles.readOnlyValue}>{job.preferred_contact || '-'}</div>
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
                        onSelectCard?.(job.id)
                      }}
                      onBlur={() => void handleDeviceBlur()}
                      onChange={(e) => handleDeviceDraftChange('brand', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div>
                    <label className={styles.smallLabel}>Model</label>
                    <input
                      value={deviceDraft.model}
                      className={styles.smallField}
                      onFocus={() => {
                        deviceFocusedRef.current = true
                        onSelectCard?.(job.id)
                      }}
                      onBlur={() => void handleDeviceBlur()}
                      onChange={(e) => handleDeviceDraftChange('model', e.target.value)}
                      onClick={(e) => e.stopPropagation()}
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
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleDeviceBlur()}
                    onChange={(e) => handleDeviceDraftChange('device_type', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Serial / IMEI</label>
                  <input
                    value={deviceDraft.serial_imei}
                    placeholder="Serial number or IMEI"
                    className={styles.smallField}
                    onFocus={() => {
                      deviceFocusedRef.current = true
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleDeviceBlur()}
                    onChange={(e) => handleDeviceDraftChange('serial_imei', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div>
                  <label className={styles.smallLabel}>Fault Description</label>
                  <textarea
                    value={deviceDraft.fault_description}
                    className={styles.notesField}
                    onFocus={() => {
                      deviceFocusedRef.current = true
                      onSelectCard?.(job.id)
                    }}
                    onBlur={() => void handleDeviceBlur()}
                    onChange={(e) => handleDeviceDraftChange('fault_description', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <label className={styles.expandedSectionTitle}>Repair Performed</label>
                <SaveIndicator state={repairPerformedSaveState} />
              </div>

              <textarea
                value={localRepairPerformed}
                placeholder="Screen replacement, battery replacement, charging port repair, housing swap..."
                className={styles.notesField}
                onFocus={() => {
                  repairPerformedFocusedRef.current = true
                  onSelectCard?.(job.id)
                }}
                onBlur={() => void handleRepairPerformedBlur()}
                onChange={(e) => handleRepairPerformedChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
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
                  onSelectCard?.(job.id)
                }}
                onBlur={() => void handleQuoteBlur()}
                onChange={(e) => handleQuoteChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectCard?.(job.id)
                    openSms(buildQuoteSms())
                  }}
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
                placeholder="Diagnostics, parts ordered, supplier info, reminders, private workshop notes..."
                className={styles.notesField}
                onFocus={() => {
                  notesFocusedRef.current = true
                  onSelectCard?.(job.id)
                }}
                onBlur={() => void handleNotesBlur()}
                onChange={(e) => handleNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />

              <div className={styles.buttonRow}>
                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectCard?.(job.id)
                    openSms(buildReadySms())
                  }}
                >
                  Ready for Pickup SMS
                </button>

                {onDuplicateJob ? (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectCard?.(job.id)
                      void onDuplicateJob(job)
                    }}
                  >
                    Duplicate Job
                  </button>
                ) : null}

                {isArchiveStatus ? (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectCard?.(job.id)
                      void onHideJob?.(job.id)
                    }}
                  >
                    Hide Job
                  </button>
                ) : null}

                {job.is_hidden ? (
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectCard?.(job.id)
                      void onUnhideJob?.(job.id)
                    }}
                  >
                    Unhide Job
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.expandedSectionCard}>
              <div className={styles.inputTopRow}>
                <div className={styles.expandedSectionTitle}>
                  Fault Photos ({jobPhotos.length}/{MAX_PHOTOS})
                </div>
                {loadingPhotos ? <span className={styles.uploadingText}>Loading...</span> : null}
              </div>

              {jobPhotos.length > 0 ? (
                <div className={styles.faultPhotoGallery}>
                  {jobPhotos.slice(0, 4).map((photo) => (
                    <div key={photo.id} className={styles.faultPhotoThumbCard}>
                      <a
                        href={photo.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.button}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <img
                          src={photo.photo_url}
                          alt="Fault photo"
                          className={styles.faultPhotoThumbnail}
                        />
                      </a>

                      <div className={styles.faultPhotoThumbActions}>
                        <a
                          href={photo.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.photoActionButton}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open
                        </a>

                        <button
                          type="button"
                          className={styles.miniDangerButton}
                          disabled={deletingPhotoId === photo.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            void handleDeletePhoto(photo)
                          }}
                        >
                          {deletingPhotoId === photo.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  ))}

                  {jobPhotos.length > 4 ? (
                    <div className={styles.morePhotosBadge}>+{jobPhotos.length - 4} more</div>
                  ) : null}
                </div>
              ) : (
                <p className={styles.noPhotoText}>No photos uploaded yet</p>
              )}

              <div className={styles.faultPhotoUploadArea}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={handlePhotoChange}
                  disabled={uploadingPhoto || jobPhotos.length >= MAX_PHOTOS}
                  className={styles.faultPhotoInput}
                />

                {photoFile ? (
                  <div className={styles.faultPhotoSelectedRow}>
                    <span className={styles.faultPhotoSelectedName}>Selected: {photoFile.name}</span>
                    <button
                      type="button"
                      onClick={() => void handlePhotoUpload()}
                      disabled={uploadingPhoto}
                      className={styles.actionButton}
                    >
                      {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                    </button>
                  </div>
                ) : null}

                <p className={styles.helperText}>
                  JPG, PNG, WEBP, HEIC, HEIF. Max {MAX_PHOTO_SIZE_MB}MB each. Up to {MAX_PHOTOS}{' '}
                  photos.
                </p>

                {photoSuccess ? <p className={styles.successText}>{photoSuccess}</p> : null}
                {uploadError ? <p className={styles.errorText}>{uploadError}</p> : null}
              </div>
            </div>

            <div onClick={(e) => e.stopPropagation()}>
              <InvoicePanel
                invoice={invoice}
                items={invoiceItems}
                actionState={invoiceActionState}
                itemsActionState={invoiceItemsActionState}
                onCreateInvoice={() => createInvoiceForJob(job)}
                onUpdateInvoiceStatus={(status) => {
                  if (!invoice) return Promise.resolve()
                  return updateInvoiceStatusForJob(invoice.id, status)
                }}
                onAddInvoiceItem={() => {
                  if (!invoice) return Promise.resolve()
                  return addInvoiceItemForInvoice(invoice.id)
                }}
                onUpdateInvoiceItem={(itemId, updates) => {
                  if (!invoice) return Promise.resolve()
                  return updateInvoiceItemForInvoice(invoice.id, itemId, updates)
                }}
                onDeleteInvoiceItem={(itemId) => {
                  if (!invoice) return Promise.resolve()
                  return deleteInvoiceItemForInvoice(invoice.id, itemId)
                }}
                onRemoveInvoice={() => removeInvoiceForJob(job)}
              />
            </div>
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