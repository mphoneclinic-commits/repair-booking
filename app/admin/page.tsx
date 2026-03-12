'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from './admin.module.css'
import type {
  Invoice,
  InvoiceStatus,
  RepairRequest,
  RepairStatus,
  SaveField,
  SaveState,
  StatusFilter,
  ViewMode,
} from './types'
import { BOARD_COLUMNS, getStatusLabel, STATUSES, formatDateTime } from './utils'
import SummaryCard from './components/SummaryCard'
import JobCard from './components/JobCard'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type InvoiceActionState = 'idle' | 'saving' | 'error'

export default function AdminPage() {
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [invoicesByJobId, setInvoicesByJobId] = useState<Record<string, Invoice>>({})
  const [invoiceActionStates, setInvoiceActionStates] = useState<
    Record<string, InvoiceActionState>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<RepairStatus | null>(null)

  function getFieldKey(jobId: string, field: SaveField) {
    return `${jobId}:${field}`
  }

  function setFieldState(jobId: string, field: SaveField, state: SaveState) {
    setSaveStates((prev) => ({
      ...prev,
      [getFieldKey(jobId, field)]: state,
    }))
  }

  function setFieldSaved(jobId: string, field: SaveField) {
    const key = getFieldKey(jobId, field)

    setSaveStates((prev) => ({
      ...prev,
      [key]: 'saved',
    }))

    window.setTimeout(() => {
      setSaveStates((prev) => {
        if (prev[key] !== 'saved') return prev
        return {
          ...prev,
          [key]: 'idle',
        }
      })
    }, 1300)
  }

  function setInvoiceActionState(jobId: string, state: InvoiceActionState) {
    setInvoiceActionStates((prev) => ({
      ...prev,
      [jobId]: state,
    }))
  }

  function toggleExpanded(jobId: string) {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }))
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from('repair_requests')
      .select(`
        id,
        job_number,
        created_at,
        full_name,
        phone,
        email,
        brand,
        model,
        device_type,
        fault_description,
        status,
        preferred_contact,
        internal_notes,
        quoted_price
      `)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const safeJobs = ((data || []) as RepairRequest[]).map((job) => ({
      ...job,
      internal_notes: job.internal_notes ?? '',
      quoted_price: job.quoted_price ?? null,
    }))

    setJobs(safeJobs)

    setExpandedJobs((prev) => {
      const next = { ...prev }
      for (const job of safeJobs) {
        if (!(job.id in next)) next[job.id] = false
      }
      return next
    })
  }

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
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const latestByJob: Record<string, Invoice> = {}

    for (const raw of (data || []) as Invoice[]) {
      if (!latestByJob[raw.repair_request_id]) {
        latestByJob[raw.repair_request_id] = {
          ...raw,
          subtotal: Number(raw.subtotal ?? 0),
          total: Number(raw.total ?? 0),
        }
      }
    }

    setInvoicesByJobId(latestByJob)
  }

  async function loadAllData() {
    setLoading(true)
    setError('')

    try {
      await Promise.all([loadJobs(), loadInvoices()])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAllData()
  }, [])

  async function updateStatus(id: string, newStatus: RepairStatus) {
    const existingJob = jobs.find((job) => job.id === id)
    if (!existingJob) return

    if (existingJob.status === newStatus) {
      setFieldSaved(id, 'status')
      return
    }

    setFieldState(id, 'status', 'saving')

    const previousJobs = jobs

    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, status: newStatus } : job))
    )

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ status: newStatus })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error || !data?.status) {
      setJobs(previousJobs)
      setFieldState(id, 'status', 'error')
      return
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, status: data.status as RepairStatus } : job
      )
    )

    setFieldSaved(id, 'status')
  }

  async function updateQuote(id: string, price: number | null) {
    setFieldState(id, 'quote', 'saving')

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ quoted_price: price })
      .eq('id', id)
      .select('id, quoted_price')
      .single()

    if (error) {
      setFieldState(id, 'quote', 'error')
      return false
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? {
              ...job,
              quoted_price:
                typeof data?.quoted_price === 'number' ? data.quoted_price : null,
            }
          : job
      )
    )

    setFieldSaved(id, 'quote')
    return true
  }

  async function updateNotes(id: string, notes: string) {
    setFieldState(id, 'notes', 'saving')

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ internal_notes: notes })
      .eq('id', id)
      .select('id, internal_notes')
      .single()

    if (error) {
      setFieldState(id, 'notes', 'error')
      return false
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? {
              ...job,
              internal_notes:
                typeof data?.internal_notes === 'string'
                  ? data.internal_notes
                  : data?.internal_notes ?? '',
            }
          : job
      )
    )

    setFieldSaved(id, 'notes')
    return true
  }

  async function updateJobBasics(
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
  ) {
    setFieldState(id, field, 'saving')

    const previousJobs = jobs

    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...updates } : job))
    )

    const { data, error } = await supabase
      .from('repair_requests')
      .update(updates)
      .eq('id', id)
      .select(`
        id,
        job_number,
        full_name,
        phone,
        email,
        brand,
        model,
        device_type,
        fault_description
      `)
      .single()

    if (error || !data) {
      setJobs(previousJobs)
      setFieldState(id, field, 'error')
      return false
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id
          ? {
              ...job,
              job_number: data.job_number ?? null,
              full_name: data.full_name,
              phone: data.phone,
              email: data.email ?? null,
              brand: data.brand,
              model: data.model,
              device_type: data.device_type ?? null,
              fault_description: data.fault_description,
            }
          : job
      )
    )

    setFieldSaved(id, field)
    return true
  }

  async function createInvoiceForJob(job: RepairRequest) {
    const existing = invoicesByJobId[job.id]
    if (existing) return

    setInvoiceActionState(job.id, 'saving')

    const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc(
      'generate_invoice_number'
    )

    if (invoiceNumberError || !invoiceNumberData) {
      setInvoiceActionState(job.id, 'error')
      return
    }

    const invoiceNumber = String(invoiceNumberData)
    const amount = Number(job.quoted_price ?? 0)
    const defaultDescription = `Repair service for ${job.brand} ${job.model}`.trim()

    const { data: insertedInvoice, error: invoiceInsertError } = await supabase
      .from('invoices')
      .insert({
        repair_request_id: job.id,
        invoice_number: invoiceNumber,
        status: 'draft',
        customer_name: job.full_name,
        customer_phone: job.phone,
        customer_email: job.email,
        subtotal: amount,
        total: amount,
        notes: job.internal_notes || null,
      })
      .select(`
        id,
        repair_request_id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        customer_email,
        bill_to_address,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        created_at,
        updated_at
      `)
      .single()

    if (invoiceInsertError || !insertedInvoice) {
      setInvoiceActionState(job.id, 'error')
      return
    }

    const { error: itemInsertError } = await supabase.from('invoice_items').insert({
      invoice_id: insertedInvoice.id,
      description: defaultDescription,
      qty: 1,
      unit_price: amount,
      line_total: amount,
      sort_order: 0,
    })

    if (itemInsertError) {
      await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
      setInvoiceActionState(job.id, 'error')
      return
    }

    setInvoicesByJobId((prev) => ({
      ...prev,
      [job.id]: {
        ...(insertedInvoice as Invoice),
        subtotal: Number(insertedInvoice.subtotal ?? 0),
        total: Number(insertedInvoice.total ?? 0),
      },
    }))

    setInvoiceActionState(job.id, 'idle')
  }

  async function updateInvoiceStatusForJob(invoiceId: string, status: InvoiceStatus) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return

    setInvoiceActionState(invoice.repair_request_id, 'saving')

    const updates: {
      status: InvoiceStatus
      issued_at?: string | null
      paid_at?: string | null
    } = { status }

    if (status === 'issued') {
      updates.issued_at = new Date().toISOString()
    }

    if (status === 'paid') {
      updates.paid_at = new Date().toISOString()
      if (!invoice.issued_at) {
        updates.issued_at = new Date().toISOString()
      }
    }

    if (status === 'void') {
      updates.paid_at = null
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', invoiceId)
      .select(`
        id,
        repair_request_id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        customer_email,
        bill_to_address,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        created_at,
        updated_at
      `)
      .single()

    if (error || !data) {
      setInvoiceActionState(invoice.repair_request_id, 'error')
      return
    }

    setInvoicesByJobId((prev) => ({
      ...prev,
      [invoice.repair_request_id]: {
        ...(data as Invoice),
        subtotal: Number(data.subtotal ?? 0),
        total: Number(data.total ?? 0),
      },
    }))

    setInvoiceActionState(invoice.repair_request_id, 'idle')
  }

  function handleDragStart(jobId: string) {
    setDraggedJobId(jobId)
  }

  function handleDragEnd() {
    setDraggedJobId(null)
    setDragOverStatus(null)
  }

  function handleColumnDragOver(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    if (dragOverStatus !== status) {
      setDragOverStatus(status)
    }
  }

  function handleColumnDragLeave(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return

    if (dragOverStatus === status) {
      setDragOverStatus(null)
    }
  }

  async function handleColumnDrop(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    event.preventDefault()

    const droppedJobId =
      draggedJobId || event.dataTransfer.getData('text/plain') || null

    setDragOverStatus(null)

    if (!droppedJobId) {
      setDraggedJobId(null)
      return
    }

    const draggedJob = jobs.find((job) => job.id === droppedJobId)
    if (!draggedJob) {
      setDraggedJobId(null)
      return
    }

    if (draggedJob.status !== status) {
      await updateStatus(droppedJobId, status)
    }

    setDraggedJobId(null)
  }

  const filteredJobs = useMemo(() => {
    const term = search.trim().toLowerCase()

    return jobs.filter((job) => {
      const matchesStatus =
        statusFilter === 'all' ? true : job.status === statusFilter

      const haystack = [
        job.job_number || '',
        job.full_name,
        job.phone,
        job.email || '',
        job.brand,
        job.model,
        job.device_type || '',
        job.fault_description,
        job.status,
        job.preferred_contact || '',
        job.internal_notes || '',
        job.quoted_price != null ? String(job.quoted_price) : '',
        invoicesByJobId[job.id]?.invoice_number || '',
        invoicesByJobId[job.id]?.status || '',
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = term ? haystack.includes(term) : true

      return matchesStatus && matchesSearch
    })
  }, [jobs, search, statusFilter, invoicesByJobId])

  const jobsByStatus = useMemo(() => {
    return BOARD_COLUMNS.reduce((acc, status) => {
      acc[status] = filteredJobs.filter((job) => job.status === status)
      return acc
    }, {} as Record<RepairStatus, RepairRequest[]>)
  }, [filteredJobs])

  const hiddenJobs = useMemo(() => {
    return filteredJobs.filter((job) => !BOARD_COLUMNS.includes(job.status))
  }, [filteredJobs])

  const summary = useMemo(() => {
    const totalJobs = filteredJobs.length
    const quotedCount = filteredJobs.filter((j) => j.status === 'quoted').length
    const inProgressCount = filteredJobs.filter((j) => j.status === 'in_progress').length
    const readyCount = filteredJobs.filter((j) => j.status === 'completed').length
    const quotedValue = filteredJobs.reduce((sum, j) => sum + (j.quoted_price ?? 0), 0)
    const invoiceCount = filteredJobs.filter((j) => !!invoicesByJobId[j.id]).length

    return {
      totalJobs,
      quotedCount,
      inProgressCount,
      readyCount,
      quotedValue,
      invoiceCount,
    }
  }, [filteredJobs, invoicesByJobId])

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Admin Dashboard</h1>
          <p className={styles.pageSubtitle}>
            Repair jobs, quotes, notes, editing and workflow management
          </p>
        </div>

        <div className={styles.toolbar}>
          {(['board', 'list', 'details', 'tiles'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`${styles.viewButton} ${
                viewMode === mode ? styles.viewButtonActive : ''
              }`}
            >
              {mode === 'board'
                ? 'Job Cards'
                : mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}

          <button type="button" onClick={() => void loadAllData()} className={styles.button}>
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.summaryGrid}>
        <SummaryCard label="Visible Jobs" value={String(summary.totalJobs)} />
        <SummaryCard label="Quoted" value={String(summary.quotedCount)} />
        <SummaryCard label="In Progress" value={String(summary.inProgressCount)} />
        <SummaryCard label="Ready" value={String(summary.readyCount)} />
        <SummaryCard label="Invoices" value={String(summary.invoiceCount)} />
        <SummaryCard label="Quoted Value" value={`$${summary.quotedValue.toFixed(2)}`} />
      </div>

      <div className={styles.filtersWrap}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, phone, job number, device, notes, invoice..."
          className={styles.field}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className={styles.field}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.statsBar}>
        Showing <strong>{filteredJobs.length}</strong> of <strong>{jobs.length}</strong> jobs
      </div>

      {loading && <p className={styles.message}>Loading jobs...</p>}
      {!!error && <p className={styles.errorText}>{error}</p>}
      {!loading && !error && filteredJobs.length === 0 && (
        <p className={styles.message}>No matching repair requests.</p>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'board' && (
        <>
          <div className={styles.boardWrap}>
            {BOARD_COLUMNS.map((status) => (
              <div
                key={status}
                className={`${styles.column} ${
                  dragOverStatus === status ? styles.columnDragOver : ''
                }`}
                onDragOver={(e) => handleColumnDragOver(e, status)}
                onDragLeave={(e) => handleColumnDragLeave(e, status)}
                onDrop={(e) => void handleColumnDrop(e, status)}
              >
                <div className={styles.columnHeaderSticky}>
                  <div className={styles.columnHeader}>
                    <span
                      className={`${styles.statusBadge} ${styles[`status_${status}`]}`}
                    >
                      {getStatusLabel(status)}
                    </span>
                    <span className={styles.columnCount}>
                      {jobsByStatus[status]?.length || 0}
                    </span>
                  </div>
                </div>

                <div className={styles.columnCardsWrap}>
                  {(jobsByStatus[status] || []).length === 0 ? (
                    <div className={styles.emptyColumn}>No jobs</div>
                  ) : (
                    (jobsByStatus[status] || []).map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        expanded={!!expandedJobs[job.id]}
                        toggleExpanded={toggleExpanded}
                        updateStatus={updateStatus}
                        updateQuote={updateQuote}
                        updateNotes={updateNotes}
                        updateJobBasics={updateJobBasics}
                        statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
                        quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
                        notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
                        jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
                        customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
                        deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
                        setFieldState={setFieldState}
                        draggableEnabled
                        isDragging={draggedJobId === job.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        invoice={invoicesByJobId[job.id] ?? null}
                        invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                        createInvoiceForJob={createInvoiceForJob}
                        updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {hiddenJobs.length > 0 && (
            <section className={styles.otherStatusesSection}>
              <h2 className={styles.sectionTitle}>Other statuses</h2>
              <div className={styles.listGrid}>
                {hiddenJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    expanded={!!expandedJobs[job.id]}
                    toggleExpanded={toggleExpanded}
                    updateStatus={updateStatus}
                    updateQuote={updateQuote}
                    updateNotes={updateNotes}
                    updateJobBasics={updateJobBasics}
                    statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
                    quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
                    notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
                    jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
                    customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
                    deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
                    setFieldState={setFieldState}
                    draggableEnabled
                    isDragging={draggedJobId === job.id}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    invoice={invoicesByJobId[job.id] ?? null}
                    invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                    createInvoiceForJob={createInvoiceForJob}
                    updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'tiles' && (
        <div className={styles.tilesGrid}>
          {filteredJobs.map((job) => (
            <div key={job.id} className={styles.tile}>
              <div className={styles.tileHeader}>
                <strong>{job.job_number || 'Pending'}</strong>
                <span
                  className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}
                >
                  {getStatusLabel(job.status)}
                </span>
              </div>

              <p className={styles.tileName}>{job.full_name}</p>
              <p className={styles.tileText}>{job.phone}</p>
              <p className={styles.tileDevice}>
                {job.brand} {job.model}
              </p>
              <p className={styles.tileText}>{job.fault_description}</p>
              <p className={styles.tileText}>
                <strong>Booked:</strong> {formatDateTime(job.created_at)}
              </p>
              <p className={styles.tileText}>
                <strong>Quote:</strong> {job.quoted_price != null ? `$${job.quoted_price}` : '-'}
              </p>
              <p className={styles.tileText}>
                <strong>Invoice:</strong>{' '}
                {invoicesByJobId[job.id]?.invoice_number || '-'}
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'list' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Device</th>
                <th>Status</th>
                <th>Quote</th>
                <th>Invoice</th>
                <th>Booked In</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.job_number || 'Pending'}</td>
                  <td>{job.full_name}</td>
                  <td>{job.phone}</td>
                  <td>
                    {job.brand} {job.model}
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}
                    >
                      {getStatusLabel(job.status)}
                    </span>
                  </td>
                  <td>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</td>
                  <td>{invoicesByJobId[job.id]?.invoice_number || '-'}</td>
                  <td>{formatDateTime(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'details' && (
        <div className={styles.listGrid}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={!!expandedJobs[job.id]}
              toggleExpanded={toggleExpanded}
              updateStatus={updateStatus}
              updateQuote={updateQuote}
              updateNotes={updateNotes}
              updateJobBasics={updateJobBasics}
              statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
              quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
              notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
              jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
              customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
              deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
              setFieldState={setFieldState}
              invoice={invoicesByJobId[job.id] ?? null}
              invoiceActionState={invoiceActionStates[job.id] || 'idle'}
              createInvoiceForJob={createInvoiceForJob}
              updateInvoiceStatusForJob={updateInvoiceStatusForJob}
            />
          ))}
        </div>
      )}
    </main>
  )
}