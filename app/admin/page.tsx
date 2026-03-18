'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import styles from './admin.module.css'
import useAdminSaveStates from './hooks/useAdminSaveStates'
import useAdminData from './hooks/useAdminData'
import useAdminInvoices from './hooks/useAdminInvoices'
import useAdminArchiveActions from './hooks/useAdminArchiveActions'
import useAdminDragDrop from './hooks/useAdminDragDrop'
import useAdminDerivedState from './hooks/useAdminDerivedState'
import type {
  RepairRequest,
  RepairStatus,
  StatusFilter,
  ViewMode,
} from './types'
import {
  ARCHIVE_COLUMNS,
  BOARD_COLUMNS,
  STATUSES,
  formatDateTime,
  getStatusLabel,
} from './utils'
import SummaryCard from './components/SummaryCard'
import JobCard from './components/JobCard'
type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'
type SortMode = 'newest' | 'oldest' | 'customer' | 'job_number'


export default function AdminPage() {
 
  const [showHidden, setShowHidden] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)


  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})


  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null)

  const [selectedArchiveJobIds, setSelectedArchiveJobIds] = useState<string[]>([])
  const [selectedHiddenJobIds, setSelectedHiddenJobIds] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)

  const [archiveSort, setArchiveSort] = useState<SortMode>('newest')
  const [hiddenSort, setHiddenSort] = useState<SortMode>('newest')

  const [collapsedColumns, setCollapsedColumns] = useState<Record<RepairStatus, boolean>>({
    new: false,
    quoted: false,
    approved: false,
    in_progress: false,
    ready: false,
    closed: false,
    rejected: false,
    cancelled: false,
  })

  const jobRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const {
    saveStates,
    getFieldKey,
    setFieldState,
    setFieldSaved,
  } = useAdminSaveStates()

  const {
    supabase,
    jobs,
    setJobs,
    hiddenJobs,
    setHiddenJobs,
    invoicesByJobId,
    setInvoicesByJobId,
    invoiceItemsByInvoiceId,
    setInvoiceItemsByInvoiceId,
    loading,
    error,
    setError,
    loadJobs,
    loadInvoices,
    loadInvoiceItems,
    loadAllData,
    refreshInvoiceById,
    normalizeJob,
    normalizeInvoice,
    normalizeInvoiceItem,
  } = useAdminData()

 const {
  invoiceActionStates,
  invoiceItemsActionStates,
  createInvoiceForJob,
  updateInvoiceStatusForJob,
  addInvoiceItemForInvoice,
  updateInvoiceItemForInvoice,
  deleteInvoiceItemForInvoice,
  removeInvoiceForJob,
} = useAdminInvoices({
  supabase,
  invoicesByJobId,
  setInvoicesByJobId,
  invoiceItemsByInvoiceId,
  setInvoiceItemsByInvoiceId,
  setJobs,
  setHiddenJobs,
  setHighlightedJobId,
  setError,
  loadInvoices,
  loadInvoiceItems,
  refreshInvoiceById,
  normalizeJob,
  normalizeInvoice,
})
const {
  hideJob,
  unhideJob,
  bulkHideArchiveJobs,
  bulkUnhideHiddenJobs,
  bulkUpdateArchiveStatus,
  bulkDuplicateArchiveJobs,
  bulkDeleteArchiveJobs,
  bulkDeleteHiddenJobs,
} = useAdminArchiveActions({
  supabase,
  jobs,
  hiddenJobs,
  invoicesByJobId,
  invoiceItemsByInvoiceId,
  highlightedJobId,
  selectedArchiveJobIds,
  selectedHiddenJobIds,
  setJobs,
  setHiddenJobs,
  setInvoicesByJobId,
  setInvoiceItemsByInvoiceId,
  setHighlightedJobId,
  setSelectedArchiveJobIds,
  setSelectedHiddenJobIds,
  setBulkBusy,
  setError,
  normalizeJob,
})

const {
  draggedJobId,
  dragOverStatus,
  handleDragStart,
  handleDragEnd,
  handleColumnDragOver,
  handleColumnDragLeave,
  handleColumnDrop,
} = useAdminDragDrop({
  jobs,
  updateStatus,
  setHighlightedJobId,
})

const {
  filteredJobs,
  filteredHiddenJobs,
  jobsByStatus,
  sortedArchiveJobsByStatus,
  sortedHiddenJobs,
  summary,
  archiveJobs,
} = useAdminDerivedState({
  jobs,
  hiddenJobs,
  invoicesByJobId,
  search,
  statusFilter,
  archiveSort,
  hiddenSort,
})

  function toggleExpanded(jobId: string) {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }))
    setHighlightedJobId(jobId)
  }

  function selectJobCard(jobId: string) {
    setHighlightedJobId(jobId)
  }

  function toggleArchiveSelected(jobId: string) {
    setSelectedArchiveJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    )
    setHighlightedJobId(jobId)
  }

  function toggleHiddenSelected(jobId: string) {
    setSelectedHiddenJobIds((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    )
    setHighlightedJobId(jobId)
  }

  function clearArchiveSelection() {
    setSelectedArchiveJobIds([])
  }

  function clearHiddenSelection() {
    setSelectedHiddenJobIds([])
  }

  function toggleColumnCollapsed(status: RepairStatus) {
    setCollapsedColumns((prev) => ({
      ...prev,
      [status]: !prev[status],
    }))
  }

  function scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }


  async function duplicateJob(sourceJob: RepairRequest) {
    setError('')

    const { data, error } = await supabase
      .from('repair_requests')
      .insert({
        job_number: null,
        full_name: sourceJob.full_name,
        phone: sourceJob.phone,
        email: sourceJob.email,
        brand: sourceJob.brand,
        model: sourceJob.model,
        device_type: sourceJob.device_type,
        serial_imei: sourceJob.serial_imei,
        fault_description: sourceJob.fault_description,
        status: 'new',
        preferred_contact: sourceJob.preferred_contact,
        internal_notes: sourceJob.internal_notes,
        quoted_price: sourceJob.quoted_price,
        is_hidden: false,
        fault_photo_url: sourceJob.fault_photo_url ?? null,
      })
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
        serial_imei,
        fault_description,
        status,
        preferred_contact,
        internal_notes,
        quoted_price,
        is_hidden,
        fault_photo_url
      `)
      .single()

    if (error || !data) {
      setError(error?.message || 'Failed to duplicate job')
      return
    }

    const newJob = normalizeJob(data as RepairRequest)

    setJobs((prev) => [newJob, ...prev])
    setExpandedJobs((prev) => ({
      ...prev,
      [newJob.id]: true,
    }))
    setHighlightedJobId(newJob.id)

    window.setTimeout(() => {
      const el = jobRefs.current[newJob.id]
      if (el) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }, 150)
  }

  
  
  async function updateStatus(id: string, newStatus: RepairStatus) {
    const existingJob =
      jobs.find((job) => job.id === id) || hiddenJobs.find((job) => job.id === id)

    if (!existingJob) return

    if (existingJob.status === newStatus) {
      setFieldSaved(id, 'status')
      return
    }

    setFieldState(id, 'status', 'saving')

    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, status: newStatus } : job))
    )
    setHiddenJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, status: newStatus } : job))
    )

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ status: newStatus })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error || !data?.status) {
      void loadJobs()
      setFieldState(id, 'status', 'error')
      return
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, status: data.status as RepairStatus } : job
      )
    )
    setHiddenJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, status: data.status as RepairStatus } : job
      )
    )

    setFieldSaved(id, 'status')
  }

async function updateRepairPerformed(id: string, repairPerformed: string) {
  setFieldState(id, 'repair_performed', 'saving')

  const { data, error } = await supabase
    .from('repair_requests')
    .update({ repair_performed: repairPerformed })
    .eq('id', id)
    .select('id, repair_performed')
    .single()

  if (error) {
    setFieldState(id, 'repair_performed', 'error')
    return false
  }

  const nextValue =
    typeof data?.repair_performed === 'string'
      ? data.repair_performed
      : data?.repair_performed ?? ''

  setJobs((prev) =>
    prev.map((job) =>
      job.id === id ? { ...job, repair_performed: nextValue } : job
    )
  )

  setHiddenJobs((prev) =>
    prev.map((job) =>
      job.id === id ? { ...job, repair_performed: nextValue } : job
    )
  )

  setFieldSaved(id, 'repair_performed')
  return true
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

    setHiddenJobs((prev) =>
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

    const nextNotes =
      typeof data?.internal_notes === 'string'
        ? data.internal_notes
        : data?.internal_notes ?? ''

    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, internal_notes: nextNotes } : job))
    )
    setHiddenJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, internal_notes: nextNotes } : job))
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
        | 'serial_imei'
        | 'fault_description'
      >
    >,
    field: 'job_number' | 'customer' | 'device'
  ) {
    setFieldState(id, field, 'saving')

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
        serial_imei,
        fault_description
      `)
      .single()

    if (error || !data) {
      setFieldState(id, field, 'error')
      return false
    }

    const patch = {
      job_number: data.job_number ?? null,
      full_name: data.full_name,
      phone: data.phone,
      email: data.email ?? null,
      brand: data.brand,
      model: data.model,
      device_type: data.device_type ?? null,
      serial_imei: data.serial_imei ?? null,
      fault_description: data.fault_description,
    }

    setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)))
    setHiddenJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...patch } : job))
    )

    setFieldSaved(id, field)
    return true
  }
useEffect(() => {
  function handleScroll() {
    setShowBackToTop(window.scrollY > 320)
  }

  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()

  return () => {
    window.removeEventListener('scroll', handleScroll)
  }
}, [])

useEffect(() => {
  void loadAllData()
}, [loadAllData])

useEffect(() => {
  if (typeof window === 'undefined') return
  if (loading) return

  const params = new URLSearchParams(window.location.search)
  const highlightJob = params.get('highlightJob')
  if (!highlightJob) return

  setHighlightedJobId(highlightJob)
  setExpandedJobs((prev) => ({
    ...prev,
    [highlightJob]: true,
  }))

  window.setTimeout(() => {
    const el = jobRefs.current[highlightJob]
    if (el) {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, 150)

  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.delete('highlightJob')
  window.history.replaceState({}, '', nextUrl.toString())
}, [loading])
 
   useEffect(() => {
    const archiveIds = new Set(archiveJobs.map((job) => job.id))
    setSelectedArchiveJobIds((prev) => prev.filter((id) => archiveIds.has(id)))
  }, [archiveJobs])

  useEffect(() => {
    const hiddenIds = new Set(filteredHiddenJobs.map((job) => job.id))
    setSelectedHiddenJobIds((prev) => prev.filter((id) => hiddenIds.has(id)))
  }, [filteredHiddenJobs])

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
          <Link href="/admin/jobs/new" className={styles.viewButton}>
            New Job
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            View Invoices
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>

          {(['board', 'list', 'details', 'tiles'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`${styles.viewButton} ${
                viewMode === mode ? styles.viewButtonActive : ''
              }`}
            >
              {mode === 'board' ? 'Job Cards' : mode.charAt(0).toUpperCase() + mode.slice(1)}
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
        <SummaryCard label="Hidden Jobs" value={String(summary.hiddenCount)} />
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
        Showing <strong>{filteredJobs.length}</strong> visible jobs of{' '}
        <strong>{jobs.length}</strong> active records
      </div>

      {loading && <p className={styles.message}>Loading jobs...</p>}
      {!!error && <p className={styles.errorText}>{error}</p>}
      {!loading && !error && filteredJobs.length === 0 && !showHidden && (
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
                } ${collapsedColumns[status] ? styles.columnCollapsed : ''}`}
                onDragOver={(e) => handleColumnDragOver(e, status)}
                onDragLeave={(e) => handleColumnDragLeave(e, status)}
                onDrop={(e) => void handleColumnDrop(e, status)}
              >
                <div className={styles.columnHeaderSticky}>
                  <div className={styles.columnHeader}>
                    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                      {getStatusLabel(status)}
                    </span>

                    <div className={styles.columnHeaderActions}>
                      <span className={styles.columnCount}>
                        {jobsByStatus[status]?.length || 0}
                      </span>
                      <button
                        type="button"
                        className={styles.columnToggleButton}
                        onClick={() => toggleColumnCollapsed(status)}
                      >
                        {collapsedColumns[status] ? 'Expand' : 'Minimise'}
                      </button>
                    </div>
                  </div>
                </div>

                {!collapsedColumns[status] && (
                  <div className={styles.columnCardsWrap}>
                    {(jobsByStatus[status] || []).length === 0 ? (
                      <div className={styles.emptyColumn}>No jobs</div>
                    ) : (
                      (jobsByStatus[status] || []).map((job) => {
                        const invoice = invoicesByJobId[job.id] ?? null
                        const invoiceItems = invoice
                          ? invoiceItemsByInvoiceId[invoice.id] || []
                          : []

                        return (
                          <JobCard
                            key={job.id}
                            job={job}
                            expanded={!!expandedJobs[job.id]}
                            toggleExpanded={toggleExpanded}
                            updateStatus={updateStatus}
                            updateQuote={updateQuote}
                            updateNotes={updateNotes}
updateRepairPerformed={updateRepairPerformed}
                            updateJobBasics={updateJobBasics}
repairPerformedSaveState={saveStates[`${job.id}:repair_performed`] || 'idle'}
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
                            invoice={invoice}
                            invoiceItems={invoiceItems}
                            invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                            invoiceItemsActionState={
                              invoice ? invoiceItemsActionStates[invoice.id] || 'idle' : 'idle'
                            }
                            createInvoiceForJob={createInvoiceForJob}
                            updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                            addInvoiceItemForInvoice={addInvoiceItemForInvoice}
                            updateInvoiceItemForInvoice={updateInvoiceItemForInvoice}
                            deleteInvoiceItemForInvoice={deleteInvoiceItemForInvoice}
                            removeInvoiceForJob={removeInvoiceForJob}
                            highlighted={highlightedJobId === job.id}
                            cardRef={(el) => {
                              jobRefs.current[job.id] = el
                            }}
                            onSelectCard={selectJobCard}
                            onDuplicateJob={duplicateJob}
                            onHideJob={hideJob}
                            onUnhideJob={unhideJob}
                          />
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <section className={styles.otherStatusesSection}>
            <div className={styles.archiveHeader}>
              <h2 className={styles.sectionTitle}>Archive statuses</h2>
              <p className={styles.archiveSubtitle}>
                Closed, rejected and cancelled jobs in a tighter view.
              </p>
            </div>

            <div className={styles.bulkBar}>
              <div className={styles.bulkBarText}>
                Selected archive jobs: <strong>{selectedArchiveJobIds.length}</strong>
              </div>

              <div className={styles.bulkBarActions}>
                <button
                  type="button"
                  className={`${styles.actionButton} ${
                    showHidden ? styles.viewButtonActive : ''
                  }`}
                  onClick={() => setShowHidden((prev) => !prev)}
                >
                  {showHidden ? 'Hide Hidden Jobs' : 'Show Hidden Jobs'}
                </button>

                <select
                  value={archiveSort}
                  onChange={(e) => setArchiveSort(e.target.value as SortMode)}
                  className={styles.compactSelect}
                >
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="customer">Sort: Customer</option>
                  <option value="job_number">Sort: Job Number</option>
                </select>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void bulkUpdateArchiveStatus('new')}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  {bulkBusy ? 'Working...' : 'Reopen to New'}
                </button>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void bulkUpdateArchiveStatus('ready')}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  {bulkBusy ? 'Working...' : 'Move to Ready'}
                </button>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void bulkDuplicateArchiveJobs()}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  {bulkBusy ? 'Working...' : 'Duplicate Selected'}
                </button>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void bulkHideArchiveJobs()}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  {bulkBusy ? 'Working...' : 'Hide Selected'}
                </button>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={() => void bulkDeleteArchiveJobs()}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  {bulkBusy ? 'Deleting...' : 'Delete Selected'}
                </button>

                <button
                  type="button"
                  className={styles.actionButton}
                  onClick={clearArchiveSelection}
                  disabled={bulkBusy || selectedArchiveJobIds.length === 0}
                >
                  Clear Selection
                </button>
              </div>
            </div>

            <div className={styles.archiveGrid}>
              {ARCHIVE_COLUMNS.map((status) => (
                <div
                  key={status}
                  className={`${styles.column} ${
                    collapsedColumns[status] ? styles.columnCollapsed : ''
                  }`}
                >
                  <div className={styles.columnHeaderSticky}>
                    <div className={styles.columnHeader}>
                      <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
                        {getStatusLabel(status)}
                      </span>

                      <div className={styles.columnHeaderActions}>
                        <span className={styles.columnCount}>
                          {sortedArchiveJobsByStatus[status]?.length || 0}
                        </span>
                        <button
                          type="button"
                          className={styles.columnToggleButton}
                          onClick={() => toggleColumnCollapsed(status)}
                        >
                          {collapsedColumns[status] ? 'Expand' : 'Minimise'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {!collapsedColumns[status] && (
                    <div className={styles.columnCardsWrap}>
                      {(sortedArchiveJobsByStatus[status] || []).length === 0 ? (
                        <div className={styles.emptyColumn}>No jobs</div>
                      ) : (
                        (sortedArchiveJobsByStatus[status] || []).map((job) => {
                          const invoice = invoicesByJobId[job.id] ?? null
                          const invoiceItems = invoice
                            ? invoiceItemsByInvoiceId[invoice.id] || []
                            : []

                          return (
                            <JobCard
                              key={job.id}
                              job={job}
                              expanded={!!expandedJobs[job.id]}
                              toggleExpanded={toggleExpanded}
                              updateStatus={updateStatus}
                              updateQuote={updateQuote}
                              updateNotes={updateNotes}
updateRepairPerformed={updateRepairPerformed}
                              updateJobBasics={updateJobBasics}
repairPerformedSaveState={saveStates[`${job.id}:repair_performed`] || 'idle'}
                              statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
                              quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
                              notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
                              jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
                              customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
                              deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
                              setFieldState={setFieldState}
                              invoice={invoice}
                              invoiceItems={invoiceItems}
                              invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                              invoiceItemsActionState={
                                invoice ? invoiceItemsActionStates[invoice.id] || 'idle' : 'idle'
                              }
                              createInvoiceForJob={createInvoiceForJob}
                              updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                              addInvoiceItemForInvoice={addInvoiceItemForInvoice}
                              updateInvoiceItemForInvoice={updateInvoiceItemForInvoice}
                              deleteInvoiceItemForInvoice={deleteInvoiceItemForInvoice}
                              removeInvoiceForJob={removeInvoiceForJob}
                              highlighted={highlightedJobId === job.id}
                              cardRef={(el) => {
                                jobRefs.current[job.id] = el
                              }}
                              onSelectCard={selectJobCard}
                              compact
                              onDuplicateJob={duplicateJob}
                              selectable
                              selected={selectedArchiveJobIds.includes(job.id)}
                              onToggleSelected={toggleArchiveSelected}
                              onHideJob={hideJob}
                              onUnhideJob={unhideJob}
                            />
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'tiles' && (
        <div className={styles.tilesGrid}>
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className={`${styles.tile} ${
                highlightedJobId === job.id ? styles.jobCardHighlighted : ''
              }`}
              onClick={() => setHighlightedJobId(job.id)}
            >
              <div className={styles.tileHeader}>
                <strong>{job.job_number || 'Pending'}</strong>
                <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
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
                <strong>Invoice:</strong> {invoicesByJobId[job.id]?.invoice_number || '-'}
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
                <tr
                  key={job.id}
                  className={highlightedJobId === job.id ? styles.tableRowHighlighted : ''}
                  onClick={() => setHighlightedJobId(job.id)}
                >
                  <td>{job.job_number || 'Pending'}</td>
                  <td>{job.full_name}</td>
                  <td>{job.phone}</td>
                  <td>
                    {job.brand} {job.model}
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${job.status}`]}`}>
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
          {filteredJobs.map((job) => {
            const invoice = invoicesByJobId[job.id] ?? null
            const invoiceItems = invoice ? invoiceItemsByInvoiceId[invoice.id] || [] : []

            return (
              <JobCard
                key={job.id}
                job={job}
                expanded={!!expandedJobs[job.id]}
                toggleExpanded={toggleExpanded}
                updateStatus={updateStatus}
                updateQuote={updateQuote}
                updateNotes={updateNotes}
updateRepairPerformed={updateRepairPerformed}
                updateJobBasics={updateJobBasics}
repairPerformedSaveState={saveStates[`${job.id}:repair_performed`] || 'idle'}
                statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
                quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
                notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
                jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
                customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
                deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
                setFieldState={setFieldState}
                invoice={invoice}
                invoiceItems={invoiceItems}
                invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                invoiceItemsActionState={
                  invoice ? invoiceItemsActionStates[invoice.id] || 'idle' : 'idle'
                }
                createInvoiceForJob={createInvoiceForJob}
                updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                addInvoiceItemForInvoice={addInvoiceItemForInvoice}
                updateInvoiceItemForInvoice={updateInvoiceItemForInvoice}
                deleteInvoiceItemForInvoice={deleteInvoiceItemForInvoice}
                removeInvoiceForJob={removeInvoiceForJob}
                highlighted={highlightedJobId === job.id}
                cardRef={(el) => {
                  jobRefs.current[job.id] = el
                }}
                onSelectCard={selectJobCard}
                onDuplicateJob={duplicateJob}
                onHideJob={hideJob}
                onUnhideJob={unhideJob}
              />
            )
          })}
        </div>
      )}

      {showHidden && (
        <section className={styles.otherStatusesSection}>
          <div className={styles.archiveHeader}>
            <h2 className={styles.sectionTitle}>Hidden jobs</h2>
            <p className={styles.archiveSubtitle}>
              Hidden from the main dashboard but still kept in the database.
            </p>
          </div>

          <div className={styles.bulkBar}>
            <div className={styles.bulkBarText}>
              Selected hidden jobs: <strong>{selectedHiddenJobIds.length}</strong>
            </div>

            <div className={styles.bulkBarActions}>
              <select
                value={hiddenSort}
                onChange={(e) => setHiddenSort(e.target.value as SortMode)}
                className={styles.compactSelect}
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="customer">Sort: Customer</option>
                <option value="job_number">Sort: Job Number</option>
              </select>

              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void bulkUnhideHiddenJobs()}
                disabled={bulkBusy || selectedHiddenJobIds.length === 0}
              >
                {bulkBusy ? 'Working...' : 'Unhide Selected'}
              </button>

              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void bulkDeleteHiddenJobs()}
                disabled={bulkBusy || selectedHiddenJobIds.length === 0}
              >
                {bulkBusy ? 'Deleting...' : 'Delete Selected'}
              </button>

              <button
                type="button"
                className={styles.miniButton}
                onClick={clearHiddenSelection}
                disabled={bulkBusy || selectedHiddenJobIds.length === 0}
              >
                Clear Selection
              </button>
            </div>
          </div>

          {sortedHiddenJobs.length === 0 ? (
            <p className={styles.message}>No hidden jobs.</p>
          ) : (
            <div className={styles.archiveGrid}>
              {sortedHiddenJobs.map((job) => {
                const invoice = invoicesByJobId[job.id] ?? null
                const invoiceItems = invoice ? invoiceItemsByInvoiceId[invoice.id] || [] : []

                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    expanded={!!expandedJobs[job.id]}
                    toggleExpanded={toggleExpanded}
                    updateStatus={updateStatus}
                    updateQuote={updateQuote}
                    updateNotes={updateNotes}
updateRepairPerformed={updateRepairPerformed}
                    updateJobBasics={updateJobBasics}
repairPerformedSaveState={saveStates[`${job.id}:repair_performed`] || 'idle'}
                    statusSaveState={saveStates[`${job.id}:status`] || 'idle'}
                    quoteSaveState={saveStates[`${job.id}:quote`] || 'idle'}
                    notesSaveState={saveStates[`${job.id}:notes`] || 'idle'}
                    jobNumberSaveState={saveStates[`${job.id}:job_number`] || 'idle'}
                    customerSaveState={saveStates[`${job.id}:customer`] || 'idle'}
                    deviceSaveState={saveStates[`${job.id}:device`] || 'idle'}
                    setFieldState={setFieldState}
                    invoice={invoice}
                    invoiceItems={invoiceItems}
                    invoiceActionState={invoiceActionStates[job.id] || 'idle'}
                    invoiceItemsActionState={
                      invoice ? invoiceItemsActionStates[invoice.id] || 'idle' : 'idle'
                    }
                    createInvoiceForJob={createInvoiceForJob}
                    updateInvoiceStatusForJob={updateInvoiceStatusForJob}
                    addInvoiceItemForInvoice={addInvoiceItemForInvoice}
                    updateInvoiceItemForInvoice={updateInvoiceItemForInvoice}
                    deleteInvoiceItemForInvoice={deleteInvoiceItemForInvoice}
                    removeInvoiceForJob={removeInvoiceForJob}
                    highlighted={highlightedJobId === job.id}
                    cardRef={(el) => {
                      jobRefs.current[job.id] = el
                    }}
                    onSelectCard={selectJobCard}
                    compact
                    selectable
                    selected={selectedHiddenJobIds.includes(job.id)}
                    onToggleSelected={toggleHiddenSelected}
                    onDuplicateJob={duplicateJob}
                    onHideJob={hideJob}
                    onUnhideJob={unhideJob}
                  />
                )
              })}
            </div>
          )}
        </section>
      )}

      {showBackToTop ? (
        <button type="button" className={styles.backToTopButton} onClick={scrollToTop}>
          ↑ Top
        </button>
      ) : null}
    </main>
  )
}