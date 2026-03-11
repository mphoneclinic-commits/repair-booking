'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type RepairStatus =
  | 'new'
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'rejected'
  | 'cancelled'

type RepairRequest = {
  id: string
  job_number: string | null
  created_at: string
  full_name: string
  phone: string
  email: string | null
  brand: string
  model: string
  device_type: string | null
  fault_description: string
  status: string
  preferred_contact: string | null
  internal_notes?: string | null
  quoted_price?: number | null
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
type ViewMode = 'board' | 'list' | 'details' | 'tiles'

const statuses = [
  'all',
  'new',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'closed',
  'rejected',
  'cancelled',
] as const

const boardColumns = [
  'new',
  'quoted',
  'approved',
  'in_progress',
  'completed',
  'closed',
] as const

type StatusFilter = (typeof statuses)[number]
type SaveField = 'status' | 'quote' | 'notes'

export default function AdminPage() {
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({})

  function getFieldKey(jobId: string, field: SaveField) {
    return `${jobId}:${field}`
  }

  function setFieldState(jobId: string, field: SaveField, state: SaveState) {
    setSaveStates((prev) => ({ ...prev, [getFieldKey(jobId, field)]: state }))
  }

  function setFieldSaved(jobId: string, field: SaveField) {
    const key = getFieldKey(jobId, field)

    setSaveStates((prev) => ({ ...prev, [key]: 'saved' }))

    setTimeout(() => {
      setSaveStates((prev) => {
        if (prev[key] !== 'saved') return prev
        return { ...prev, [key]: 'idle' }
      })
    }, 1400)
  }

  function toggleExpanded(jobId: string) {
    setExpandedJobs((prev) => ({
      ...prev,
      [jobId]: !prev[jobId],
    }))
  }

  async function loadJobs() {
    setLoading(true)

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
      setError(error.message)
      setLoading(false)
      return
    }

    setJobs((data || []) as RepairRequest[])
    setError('')
    setLoading(false)
  }

  async function updateStatus(id: string, newStatus: RepairStatus) {
    const existingJob = jobs.find((job) => job.id === id)
    if (!existingJob) return

    if (existingJob.status === newStatus) {
      setFieldSaved(id, 'status')
      return
    }

    setFieldState(id, 'status', 'saving')

    const { data, error } = await supabase
      .from('repair_requests')
      .update({ status: newStatus })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) {
      setFieldState(id, 'status', 'error')
      alert(`Status update failed: ${error.message}`)
      return
    }

    const returnedStatus = data?.status as string | undefined

    if (!returnedStatus) {
      setFieldState(id, 'status', 'error')
      alert('Status update failed: database did not return a status.')
      return
    }

    setJobs((prev) =>
      prev.map((job) =>
        job.id === id ? { ...job, status: returnedStatus } : job
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
      alert(`Quote update failed: ${error.message}`)
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
      alert(`Notes update failed: ${error.message}`)
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

  useEffect(() => {
    loadJobs()
  }, [])

  const filteredJobs = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()

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
        job.internal_notes || '',
        job.quoted_price != null ? String(job.quoted_price) : '',
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = searchTerm ? haystack.includes(searchTerm) : true

      return matchesStatus && matchesSearch
    })
  }, [jobs, search, statusFilter])

  const jobsByStatus = useMemo(() => {
    return boardColumns.reduce((acc, status) => {
      acc[status] = filteredJobs.filter((job) => job.status === status)
      return acc
    }, {} as Record<(typeof boardColumns)[number], RepairRequest[]>)
  }, [filteredJobs])

  const hiddenJobs = useMemo(() => {
    return filteredJobs.filter(
      (job) =>
        !boardColumns.includes(job.status as (typeof boardColumns)[number])
    )
  }, [filteredJobs])

  return (
    <main style={{ maxWidth: 1720, margin: '0 auto', padding: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ fontSize: 32, margin: 0 }}>Admin Dashboard</h1>
          <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
            Repair bookings, workflow, quotes and internal notes
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setViewMode('board')}
            style={viewButtonStyle(viewMode === 'board')}
          >
            Job Cards
          </button>

          <button
            type="button"
            onClick={() => setViewMode('list')}
            style={viewButtonStyle(viewMode === 'list')}
          >
            List
          </button>

          <button
            type="button"
            onClick={() => setViewMode('details')}
            style={viewButtonStyle(viewMode === 'details')}
          >
            Details
          </button>

          <button
            type="button"
            onClick={() => setViewMode('tiles')}
            style={viewButtonStyle(viewMode === 'tiles')}
          >
            Tiles
          </button>

          <button type="button" onClick={loadJobs} style={buttonStyle}>
            Refresh
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, phone, job number, brand, model..."
          style={fieldStyle}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          style={fieldStyle}
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 14, color: '#475569', marginBottom: 16 }}>
        Showing {filteredJobs.length} of {jobs.length} jobs
      </p>

      {loading && <p>Loading jobs...</p>}
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {!loading && !error && filteredJobs.length === 0 && (
        <p>No matching repair requests.</p>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'board' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(290px, 1fr))',
              gap: 16,
              alignItems: 'start',
              overflowX: 'auto',
              paddingBottom: 8,
            }}
          >
            {boardColumns.map((status) => (
              <div
                key={status}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: 12,
                  minHeight: 320,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <span style={statusBadgeStyle(status)}>
                    {getStatusLabel(status)}
                  </span>

                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#475569',
                    }}
                  >
                    {jobsByStatus[status].length}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {jobsByStatus[status].length === 0 ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#64748b',
                        padding: 12,
                        borderRadius: 10,
                        border: '1px dashed #cbd5e1',
                        background: 'white',
                      }}
                    >
                      No jobs
                    </div>
                  ) : (
                    jobsByStatus[status].map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        expanded={!!expandedJobs[job.id]}
                        toggleExpanded={toggleExpanded}
                        updateStatus={updateStatus}
                        updateQuote={updateQuote}
                        updateNotes={updateNotes}
                        statusSaveState={saveStates[getFieldKey(job.id, 'status')] || 'idle'}
                        quoteSaveState={saveStates[getFieldKey(job.id, 'quote')] || 'idle'}
                        notesSaveState={saveStates[getFieldKey(job.id, 'notes')] || 'idle'}
                        setFieldState={setFieldState}
                      />
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {hiddenJobs.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 style={{ fontSize: 20, marginBottom: 12 }}>Other statuses</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {hiddenJobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    expanded={!!expandedJobs[job.id]}
                    toggleExpanded={toggleExpanded}
                    updateStatus={updateStatus}
                    updateQuote={updateQuote}
                    updateNotes={updateNotes}
                    statusSaveState={saveStates[getFieldKey(job.id, 'status')] || 'idle'}
                    quoteSaveState={saveStates[getFieldKey(job.id, 'quote')] || 'idle'}
                    notesSaveState={saveStates[getFieldKey(job.id, 'notes')] || 'idle'}
                    setFieldState={setFieldState}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'tiles' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
            gap: 14,
          }}
        >
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                background: 'white',
                padding: 14,
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  alignItems: 'center',
                }}
              >
                <strong style={{ fontSize: 14 }}>
                  {job.job_number || 'Pending'}
                </strong>
                <span style={statusBadgeStyle(job.status)}>
                  {getStatusLabel(job.status)}
                </span>
              </div>

              <p style={{ margin: '0 0 4px', fontWeight: 700 }}>
                {job.full_name}
              </p>
              <p style={{ margin: '0 0 4px', fontSize: 14 }}>{job.phone}</p>
              <p style={{ margin: '8px 0 4px', fontSize: 14 }}>
                {job.brand} {job.model}
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#475569' }}>
                {job.fault_description}
              </p>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#334155' }}>
                <strong>Booked in:</strong> {formatDateTime(job.created_at)}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
                Quote:{' '}
                <strong>
                  {job.quoted_price != null ? `$${job.quoted_price}` : '-'}
                </strong>
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'list' && (
        <div
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={thStyle}>Job</th>
                <th style={thStyle}>Customer</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Device</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Quote</th>
                <th style={thStyle}>Booked In</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={tdStyle}>{job.job_number || 'Pending'}</td>
                  <td style={tdStyle}>{job.full_name}</td>
                  <td style={tdStyle}>{job.phone}</td>
                  <td style={tdStyle}>
                    {job.brand} {job.model}
                  </td>
                  <td style={tdStyle}>
                    <span style={statusBadgeStyle(job.status)}>
                      {getStatusLabel(job.status)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {job.quoted_price != null ? `$${job.quoted_price}` : '-'}
                  </td>
                  <td style={tdStyle}>{formatDateTime(job.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && filteredJobs.length > 0 && viewMode === 'details' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredJobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              expanded={true}
              toggleExpanded={toggleExpanded}
              updateStatus={updateStatus}
              updateQuote={updateQuote}
              updateNotes={updateNotes}
              statusSaveState={saveStates[getFieldKey(job.id, 'status')] || 'idle'}
              quoteSaveState={saveStates[getFieldKey(job.id, 'quote')] || 'idle'}
              notesSaveState={saveStates[getFieldKey(job.id, 'notes')] || 'idle'}
              setFieldState={setFieldState}
            />
          ))}
        </div>
      )}
    </main>
  )
}

function JobCard({
  job,
  expanded,
  toggleExpanded,
  updateStatus,
  updateQuote,
  updateNotes,
  statusSaveState,
  quoteSaveState,
  notesSaveState,
  setFieldState,
}: {
  job: RepairRequest
  expanded: boolean
  toggleExpanded: (jobId: string) => void
  updateStatus: (id: string, newStatus: RepairStatus) => Promise<void>
  updateQuote: (id: string, price: number | null) => Promise<boolean | void>
  updateNotes: (id: string, notes: string) => Promise<boolean | void>
  statusSaveState: SaveState
  quoteSaveState: SaveState
  notesSaveState: SaveState
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
}) {
  const [localQuote, setLocalQuote] = useState(job.quoted_price?.toString() ?? '')
  const [localNotes, setLocalNotes] = useState(job.internal_notes ?? '')

  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const quoteFocusedRef = useRef(false)
  const notesFocusedRef = useRef(false)

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
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current)
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    }
  }, [])

  function normalizeQuoteInput(value: string) {
    const cleaned = value.replace(/[^\d.]/g, '')
    const firstDotIndex = cleaned.indexOf('.')

    if (firstDotIndex === -1) return cleaned

    const beforeDot = cleaned.slice(0, firstDotIndex + 1)
    const afterDot = cleaned
      .slice(firstDotIndex + 1)
      .replace(/\./g, '')
      .slice(0, 2)

    return `${beforeDot}${afterDot}`
  }

  async function flushQuote(rawValue: string) {
    const normalized = normalizeQuoteInput(rawValue).trim()
    const nextValue =
      normalized === '' ? null : Number.isNaN(Number(normalized)) ? null : Number(normalized)

    const currentDbValue = job.quoted_price ?? null

    if (nextValue === currentDbValue) {
      return
    }

    await updateQuote(job.id, nextValue)
  }

  async function flushNotes(value: string) {
    const currentDbValue = job.internal_notes ?? ''
    if (value === currentDbValue) return
    await updateNotes(job.id, value)
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

  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: 14,
        background: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 10,
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <strong style={{ fontSize: 16 }}>
          {job.job_number || 'Pending Job Number'}
        </strong>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={statusBadgeStyle(job.status)}>{getStatusLabel(job.status)}</span>
          <SaveIndicator state={statusSaveState} compact />

          <button
            type="button"
            onClick={() => toggleExpanded(job.id)}
            style={miniButtonStyle}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          background: '#f8fafc',
          padding: 10,
          marginBottom: 10,
        }}
      >
        <p style={{ margin: '0 0 6px', fontSize: 15 }}>
          <strong>{job.full_name}</strong>
        </p>

        <p style={{ margin: '0 0 4px', fontSize: 14 }}>
          <strong>Phone:</strong> {job.phone}
        </p>

        {job.email && (
          <p style={{ margin: 0, fontSize: 14 }}>
            <strong>Email:</strong> {job.email}
          </p>
        )}
      </div>

      <p
        style={{
          margin: '0 0 4px',
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        {job.brand} {job.model}
        {job.device_type ? ` • ${job.device_type}` : ''}
      </p>

      <p
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          color: '#334155',
          whiteSpace: 'pre-wrap',
        }}
      >
        {job.fault_description}
      </p>

      {!expanded ? (
        <>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#334155' }}>
            <strong>Booked in:</strong> {formatDateTime(job.created_at)}
          </p>

          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#475569' }}>
            Quote:{' '}
            <strong>{job.quoted_price != null ? `$${job.quoted_price}` : '-'}</strong>
          </p>
        </>
      ) : (
        <>
          {job.preferred_contact && (
            <p style={{ margin: '0 0 6px', fontSize: 14 }}>
              <strong>Preferred:</strong> {job.preferred_contact}
            </p>
          )}

          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#334155' }}>
            <strong>Booked in:</strong> {formatDateTime(job.created_at)}
          </p>

          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Quote ($)</label>
              <SaveIndicator state={quoteSaveState} />
            </div>

            <input
              inputMode="decimal"
              value={localQuote}
              placeholder="Enter quote"
              style={smallFieldStyle}
              onFocus={() => {
                quoteFocusedRef.current = true
              }}
              onBlur={handleQuoteBlur}
              onChange={(e) => handleQuoteChange(e.target.value)}
            />
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>Internal Notes</label>
              <SaveIndicator state={notesSaveState} />
            </div>

            <textarea
              value={localNotes}
              placeholder="Diagnostics, parts ordered, approvals, reminders..."
              style={notesStyle}
              onFocus={() => {
                notesFocusedRef.current = true
              }}
              onBlur={handleNotesBlur}
              onChange={(e) => handleNotesChange(e.target.value)}
            />
          </div>

          <div
            style={{
              marginTop: 12,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => updateStatus(job.id, 'new')}
              style={statusButtonStyle(job.status === 'new')}
            >
              New
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'quoted')}
              style={statusButtonStyle(job.status === 'quoted')}
            >
              Quoted
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'approved')}
              style={statusButtonStyle(job.status === 'approved')}
            >
              Approved
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'in_progress')}
              style={statusButtonStyle(job.status === 'in_progress')}
            >
              In Progress
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'completed')}
              style={statusButtonStyle(job.status === 'completed')}
            >
              Ready
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'closed')}
              style={statusButtonStyle(job.status === 'closed')}
            >
              Closed
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'rejected')}
              style={statusButtonStyle(job.status === 'rejected')}
            >
              Reject
            </button>

            <button
              type="button"
              onClick={() => updateStatus(job.id, 'cancelled')}
              style={statusButtonStyle(job.status === 'cancelled')}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function SaveIndicator({
  state,
  compact = false,
}: {
  state: SaveState
  compact?: boolean
}) {
  const style: CSSProperties = {
    fontSize: compact ? 11 : 12,
    minWidth: compact ? 50 : 72,
    textAlign: 'right',
  }

  if (state === 'dirty') {
    return <span style={{ ...style, color: '#475569' }}>Typing...</span>
  }

  if (state === 'saving') {
    return <span style={{ ...style, color: '#b45309' }}>Saving...</span>
  }

  if (state === 'saved') {
    return <span style={{ ...style, color: '#166534' }}>Saved</span>
  }

  if (state === 'error') {
    return <span style={{ ...style, color: '#b91c1c' }}>Save failed</span>
  }

  return <span style={{ ...style, color: '#94a3b8' }}> </span>
}

function formatDateTime(dateString: string) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(dateString))
}

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  fontSize: 16,
  boxSizing: 'border-box',
  background: 'white',
}

const smallFieldStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 14,
  boxSizing: 'border-box',
  background: 'white',
  marginTop: 4,
}

const notesStyle: CSSProperties = {
  width: '100%',
  minHeight: 90,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  fontSize: 13,
  boxSizing: 'border-box',
  background: 'white',
  marginTop: 4,
  resize: 'vertical',
}

const buttonStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  cursor: 'pointer',
  fontWeight: 600,
}

const miniButtonStyle: CSSProperties = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 12,
}

function viewButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 8,
    border: active ? '1px solid #2563eb' : '1px solid #cbd5e1',
    background: active ? '#dbeafe' : '#f8fafc',
    cursor: 'pointer',
    fontWeight: 600,
  }
}

function statusButtonStyle(active: boolean): CSSProperties {
  return {
    padding: '7px 10px',
    borderRadius: 8,
    border: active ? '1px solid #059669' : '1px solid #cbd5e1',
    background: active ? '#d1fae5' : '#f8fafc',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  }
}

function statusBadgeStyle(status: string): CSSProperties {
  const styles: Record<string, CSSProperties> = {
    new: {
      background: '#dcfce7',
      border: '1px solid #22c55e',
      color: '#166534',
    },
    quoted: {
      background: '#dbeafe',
      border: '1px solid #3b82f6',
      color: '#1e3a8a',
    },
    approved: {
      background: '#ede9fe',
      border: '1px solid #8b5cf6',
      color: '#4c1d95',
    },
    in_progress: {
      background: '#ffedd5',
      border: '1px solid #f97316',
      color: '#7c2d12',
    },
    completed: {
      background: '#ccfbf1',
      border: '1px solid #14b8a6',
      color: '#134e4a',
    },
    closed: {
      background: '#e5e7eb',
      border: '1px solid #6b7280',
      color: '#374151',
    },
    rejected: {
      background: '#fee2e2',
      border: '1px solid #ef4444',
      color: '#7f1d1d',
    },
    cancelled: {
      background: '#f1f5f9',
      border: '1px solid #94a3b8',
      color: '#334155',
    },
  }

  return {
    padding: '4px 10px',
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    whiteSpace: 'nowrap',
    ...(styles[status] || {
      background: '#f8fafc',
      border: '1px solid #cbd5e1',
      color: '#334155',
    }),
  }
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    all: 'All statuses',
    new: 'New',
    quoted: 'Quoted',
    approved: 'Approved',
    in_progress: 'In Progress',
    completed: 'Ready',
    closed: 'Closed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  }

  return labels[status] || status
}

const thStyle: CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  color: '#475569',
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
}