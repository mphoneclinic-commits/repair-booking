'use client'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from './admin.module.css'
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  RepairRequest,
  RepairStatus,
  SaveField,
  SaveState,
  StatusFilter,
  ViewMode,
} from './types'
import {
  ARCHIVE_COLUMNS,
  BOARD_COLUMNS,
  getStatusLabel,
  STATUSES,
  formatDateTime,
} from './utils'
import SummaryCard from './components/SummaryCard'
import JobCard from './components/JobCard'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
type InvoiceActionState = 'idle' | 'saving' | 'error'
type InvoiceItemsActionState = 'idle' | 'saving' | 'error'
type SortMode = 'newest' | 'oldest' | 'customer' | 'job_number'
function sortJobs(list: RepairRequest[], sortMode: SortMode) {
  const copy = [...list]
  copy.sort((a, b) => {
    if (sortMode === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    }
    if (sortMode === 'oldest') {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }
    if (sortMode === 'customer') {
      return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' })
    }
    const aJob = a.job_number || ''
    const bJob = b.job_number || ''
    return aJob.localeCompare(bJob, undefined, { numeric: true, sensitivity: 'base' })
  })
  return copy
}
export default function AdminPage() {
  const [jobs, setJobs] = useState<RepairRequest[]>([])
  const [hiddenJobs, setHiddenJobs] = useState<RepairRequest[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [invoicesByJobId, setInvoicesByJobId] = useState<Record<string, Invoice>>({})
  const [invoiceItemsByInvoiceId, setInvoiceItemsByInvoiceId] = useState<
    Record<string, InvoiceItem[]>
  >({})
  const [invoiceActionStates, setInvoiceActionStates] = useState<
    Record<string, InvoiceActionState>
  >({})
  const [invoiceItemsActionStates, setInvoiceItemsActionStates] = useState<
    Record<string, InvoiceItemsActionState>
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
  function setInvoiceItemsActionState(invoiceId: string, state: InvoiceItemsActionState) {
    setInvoiceItemsActionStates((prev) => ({
      ...prev,
      [invoiceId]: state,
    }))
  }
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
  async function duplicateJob(sourceJob: RepairRequest) {
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
        is_hidden
      `)
      .single()
    if (error || !data) {
      setError(error?.message || 'Failed to duplicate job')
      return
    }
    const newJob = {
      ...(data as RepairRequest),
      internal_notes: data.internal_notes ?? '',
      quoted_price: data.quoted_price ?? null,
      serial_imei: data.serial_imei ?? null,
      is_hidden: Boolean(data.is_hidden),
    }
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
  async function hideJob(id: string) {
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobToHide = jobs.find((job) => job.id === id)
    if (!jobToHide) return
    setJobs((prev) => prev.filter((job) => job.id !== id))
    setHiddenJobs((prev) => [{ ...jobToHide, is_hidden: true }, ...prev])
    setSelectedArchiveJobIds((prev) => prev.filter((jobId) => jobId !== id))
    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .eq('id', id)
    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      return
    }
    if (highlightedJobId === id) {
      setHighlightedJobId(null)
    }
  }
  async function unhideJob(id: string) {
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobToUnhide = hiddenJobs.find((job) => job.id === id)
    if (!jobToUnhide) return
    setHiddenJobs((prev) => prev.filter((job) => job.id !== id))
    setJobs((prev) => [{ ...jobToUnhide, is_hidden: false }, ...prev])
    setSelectedHiddenJobIds((prev) => prev.filter((jobId) => jobId !== id))
    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .eq('id', id)
    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      return
    }
    setHighlightedJobId(id)
  }
  async function bulkHideArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return
    setBulkBusy(true)
    setError('')
    const selectedSet = new Set(selectedArchiveJobIds)
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobsToHide = jobs.filter((job) => selectedSet.has(job.id))
    setJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
    setHiddenJobs((prev) => [
      ...jobsToHide.map((job) => ({ ...job, is_hidden: true })),
      ...prev,
    ])
    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: true })
      .in('id', selectedArchiveJobIds)
    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      setBulkBusy(false)
      return
    }
    if (highlightedJobId && selectedSet.has(highlightedJobId)) {
      setHighlightedJobId(null)
    }
    setSelectedArchiveJobIds([])
    setBulkBusy(false)
  }
  async function bulkUnhideHiddenJobs() {
    if (selectedHiddenJobIds.length === 0) return
    setBulkBusy(true)
    setError('')
    const selectedSet = new Set(selectedHiddenJobIds)
    const previousVisible = jobs
    const previousHidden = hiddenJobs
    const jobsToUnhide = hiddenJobs.filter((job) => selectedSet.has(job.id))
    setHiddenJobs((prev) => prev.filter((job) => !selectedSet.has(job.id)))
    setJobs((prev) => [
      ...jobsToUnhide.map((job) => ({ ...job, is_hidden: false })),
      ...prev,
    ])
    const { error } = await supabase
      .from('repair_requests')
      .update({ is_hidden: false })
      .in('id', selectedHiddenJobIds)
    if (error) {
      setJobs(previousVisible)
      setHiddenJobs(previousHidden)
      setError(error.message)
      setBulkBusy(false)
      return
    }
    setSelectedHiddenJobIds([])
    setBulkBusy(false)
  }
  async function bulkUpdateArchiveStatus(targetStatus: RepairStatus) {
    if (selectedArchiveJobIds.length === 0) return
    setBulkBusy(true)
    setError('')
    const selectedSet = new Set(selectedArchiveJobIds)
    const previousJobs = jobs
    setJobs((prev) =>
      prev.map((job) =>
        selectedSet.has(job.id) ? { ...job, status: targetStatus } : job
      )
    )
    const { error } = await supabase
      .from('repair_requests')
      .update({ status: targetStatus })
      .in('id', selectedArchiveJobIds)
    if (error) {
      setJobs(previousJobs)
      setError(error.message)
      setBulkBusy(false)
      return
    }
    setSelectedArchiveJobIds([])
    setBulkBusy(false)
  }
  async function bulkDuplicateArchiveJobs() {
    if (selectedArchiveJobIds.length === 0) return
    setBulkBusy(true)
    setError('')
    const selectedJobs = jobs.filter((job) => selectedArchiveJobIds.includes(job.id))
    const inserts = selectedJobs.map((job) => ({
      job_number: null,
      full_name: job.full_name,
      phone: job.phone,
      email: job.email,
      brand: job.brand,
      model: job.model,
      device_type: job.device_type,
      serial_imei: job.serial_imei,
      fault_description: job.fault_description,
      status: 'new' as RepairStatus,
      preferred_contact: job.preferred_contact,
      internal_notes: job.internal_notes,
      quoted_price: job.quoted_price,
      is_hidden: false,
    }))
    const { data, error } = await supabase
      .from('repair_requests')
      .insert(inserts)
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
        is_hidden
      `)
    if (error) {
      setError(error.message)
      setBulkBusy(false)
      return
    }
    const newJobs = ((data || []) as RepairRequest[]).map((job) => ({
      ...job,
      internal_notes: job.internal_notes ?? '',
      quoted_price: job.quoted_price ?? null,
      serial_imei: job.serial_imei ?? null,
      is_hidden: Boolean(job.is_hidden),
    }))
    setJobs((prev) => [...newJobs, ...prev])
    setExpandedJobs((prev) => {
      const next = { ...prev }
      for (const job of newJobs) next[job.id] = false
      return next
    })
    setSelectedArchiveJobIds([])
    if (newJobs[0]) setHighlightedJobId(newJobs[0].id)
    setBulkBusy(false)
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
        serial_imei,
        fault_description,
        status,
        preferred_contact,
        internal_notes,
        quoted_price,
        is_hidden,
	fault_photo_url
`)
      .order('created_at', { ascending: false })
    if (error) throw error
    const allJobs = ((data || []) as RepairRequest[]).map((job) => ({
      ...job,
      internal_notes: job.internal_notes ?? '',
      quoted_price: job.quoted_price ?? null,
      serial_imei: job.serial_imei ?? null,
      is_hidden: Boolean(job.is_hidden),
    }))
    setJobs(allJobs.filter((job) => !job.is_hidden))
    setHiddenJobs(allJobs.filter((job) => job.is_hidden))
    setExpandedJobs((prev) => {
      const next = { ...prev }
      for (const job of allJobs) {
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
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
    if (error) throw error
    const latestByJob: Record<string, Invoice> = {}
    for (const raw of (data || []) as Invoice[]) {
      if (!latestByJob[raw.repair_request_id]) {
        latestByJob[raw.repair_request_id] = {
          ...raw,
          tax_rate: Number(raw.tax_rate ?? 0),
          subtotal_ex_tax: Number(raw.subtotal_ex_tax ?? 0),
          tax_amount: Number(raw.tax_amount ?? 0),
          subtotal: Number(raw.subtotal ?? 0),
          total: Number(raw.total ?? 0),
        }
      }
    }
    setInvoicesByJobId(latestByJob)
  }
  async function loadInvoiceItems() {
    const { data, error } = await supabase
      .from('invoice_items')
      .select(`
        id,
        invoice_id,
        description,
        qty,
        unit_price,
        line_total,
        sort_order,
        created_at
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    const grouped: Record<string, InvoiceItem[]> = {}
    for (const item of (data || []) as InvoiceItem[]) {
      const invoiceId = item.invoice_id
      if (!grouped[invoiceId]) grouped[invoiceId] = []
      grouped[invoiceId].push({
        ...item,
        qty: Number(item.qty ?? 0),
        unit_price: Number(item.unit_price ?? 0),
        line_total: Number(item.line_total ?? 0),
        sort_order: Number(item.sort_order ?? 0),
      })
    }
    setInvoiceItemsByInvoiceId(grouped)
  }
  async function refreshInvoiceById(invoiceId: string) {
    const { data: invoiceData, error: invoiceError } = await supabase
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
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .eq('id', invoiceId)
      .single()
    if (invoiceError || !invoiceData) {
      throw invoiceError || new Error('Failed to refresh invoice')
    }
    const normalizedInvoice: Invoice = {
      ...(invoiceData as Invoice),
      tax_rate: Number(invoiceData.tax_rate ?? 0),
      subtotal_ex_tax: Number(invoiceData.subtotal_ex_tax ?? 0),
      tax_amount: Number(invoiceData.tax_amount ?? 0),
      subtotal: Number(invoiceData.subtotal ?? 0),
      total: Number(invoiceData.total ?? 0),
    }
    const { data: itemsData, error: itemsError } = await supabase
      .from('invoice_items')
      .select(`
        id,
        invoice_id,
        description,
        qty,
        unit_price,
        line_total,
        sort_order,
        created_at
      `)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (itemsError) {
      throw itemsError
    }
    const normalizedItems = ((itemsData || []) as InvoiceItem[]).map((item) => ({
      ...item,
      qty: Number(item.qty ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      line_total: Number(item.line_total ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    }))
    setInvoicesByJobId((prev) => ({
      ...prev,
      [normalizedInvoice.repair_request_id]: normalizedInvoice,
    }))
    setInvoiceItemsByInvoiceId((prev) => ({
      ...prev,
      [invoiceId]: normalizedItems,
    }))
  }
  async function loadAllData() {
    setLoading(true)
    setError('')
    try {
      await Promise.all([loadJobs(), loadInvoices(), loadInvoiceItems()])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data'
      setError(message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    loadAllData() // Initial full load
    // Realtime channel for automatic updates
    const channel = supabase
      .channel('admin-dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'repair_requests' },
        (payload) => {
          console.log('Repair change detected:', payload) // optional debug
          void loadJobs() // Reload jobs on any change
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        (payload) => {
          console.log('Invoice change detected:', payload) // optional debug
          void loadInvoices() // Reload invoices on any change
        }
      )
      .subscribe()
    // Cleanup on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, []) // Empty deps → runs once on mount
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
    setJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...patch } : job))
    )
    setHiddenJobs((prev) =>
      prev.map((job) => (job.id === id ? { ...job, ...patch } : job))
    )
    setFieldSaved(id, field)
    return true
  }
  async function createInvoiceForJob(job: RepairRequest) {
    const existing = invoicesByJobId[job.id]
    if (existing) {
      setError(`Job ${job.job_number || job.id} already has invoice ${existing.invoice_number}`)
      return
    }
    setInvoiceActionState(job.id, 'saving')
    setError('')
    const { data: invoiceNumberData, error: invoiceNumberError } = await supabase.rpc(
      'generate_invoice_number'
    )
    if (invoiceNumberError || !invoiceNumberData) {
      setInvoiceActionState(job.id, 'error')
      setError(invoiceNumberError?.message || 'Failed to generate invoice number')
      return
    }
    const invoiceNumber = String(invoiceNumberData)
    const amount = Number(job.quoted_price ?? 0)
    const defaultDescription = `Repair service for ${job.brand} ${job.model}`.trim()
    const nowIso = new Date().toISOString()
    const { data: insertedInvoice, error: invoiceInsertError } = await supabase
      .from('invoices')
      .insert({
        repair_request_id: job.id,
        invoice_number: invoiceNumber,
        status: 'issued',
        customer_name: job.full_name,
        customer_phone: job.phone,
        customer_email: job.email,
        tax_mode: 'exclusive',
        tax_rate: 0.1,
        subtotal_ex_tax: amount,
        tax_amount: 0,
        subtotal: amount,
        total: amount,
        notes: job.internal_notes || null,
        issued_at: nowIso,
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
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .single()
    if (invoiceInsertError || !insertedInvoice) {
      setInvoiceActionState(job.id, 'error')
      if (invoiceInsertError?.message?.toLowerCase().includes('duplicate')) {
        setError('This job already has an invoice and cannot be invoiced again.')
      } else {
        setError(invoiceInsertError?.message || 'Failed to create invoice')
      }
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
      setError(itemInsertError.message || 'Failed to create invoice item')
      return
    }
    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: insertedInvoice.id,
    })
    if (recalcError) {
      await supabase.from('invoice_items').delete().eq('invoice_id', insertedInvoice.id)
      await supabase.from('invoices').delete().eq('id', insertedInvoice.id)
      setInvoiceActionState(job.id, 'error')
      setError(recalcError.message || 'Failed to recalculate invoice totals')
      return
    }
    const { data: updatedJob, error: closeJobError } = await supabase
      .from('repair_requests')
      .update({ status: 'closed' })
      .eq('id', job.id)
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
        is_hidden
      `)
      .single()
    if (closeJobError || !updatedJob) {
      setInvoiceActionState(job.id, 'error')
      setError(closeJobError?.message || 'Invoice created but failed to close job')
      return
    }
    const normalizedUpdatedJob: RepairRequest = {
      ...(updatedJob as RepairRequest),
      internal_notes: updatedJob.internal_notes ?? '',
      quoted_price: updatedJob.quoted_price ?? null,
      serial_imei: updatedJob.serial_imei ?? null,
      is_hidden: Boolean(updatedJob.is_hidden),
    }
    setJobs((prev) =>
      prev.map((existingJob) =>
        existingJob.id === job.id ? normalizedUpdatedJob : existingJob
      )
    )
    setHiddenJobs((prev) =>
      prev.map((existingJob) =>
        existingJob.id === job.id ? normalizedUpdatedJob : existingJob
      )
    )
    try {
      await refreshInvoiceById(insertedInvoice.id)
      setInvoiceActionState(job.id, 'idle')
      setInvoiceItemsActionState(insertedInvoice.id, 'idle')
      setHighlightedJobId(job.id)
    } catch (err) {
      setInvoiceActionState(job.id, 'error')
      setError(err instanceof Error ? err.message : 'Failed to refresh invoice')
    }
  }
  async function updateInvoiceStatusForJob(invoiceId: string, status: InvoiceStatus) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return
    setInvoiceActionState(invoice.repair_request_id, 'saving')
    setError('')
    const nowIso = new Date().toISOString()
    const updates: {
      status: InvoiceStatus
      issued_at?: string | null
      paid_at?: string | null
    } = { status }
    if (status === 'issued') {
      updates.issued_at = invoice.issued_at || nowIso
      updates.paid_at = null
    }
    if (status === 'paid') {
      updates.issued_at = invoice.issued_at || nowIso
      updates.paid_at = nowIso
    }
    if (status === 'void') {
      updates.issued_at = invoice.issued_at || nowIso
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
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .single()
    if (error || !data) {
      setInvoiceActionState(invoice.repair_request_id, 'error')
      setError(error?.message || 'Failed to update invoice status')
      return
    }
    setInvoicesByJobId((prev) => ({
      ...prev,
      [invoice.repair_request_id]: {
        ...(data as Invoice),
        tax_rate: Number(data.tax_rate ?? 0),
        subtotal_ex_tax: Number(data.subtotal_ex_tax ?? 0),
        tax_amount: Number(data.tax_amount ?? 0),
        subtotal: Number(data.subtotal ?? 0),
        total: Number(data.total ?? 0),
      },
    }))
    setInvoiceActionState(invoice.repair_request_id, 'idle')
    setHighlightedJobId(invoice.repair_request_id)
  }
  async function addInvoiceItemForInvoice(invoiceId: string) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    if (!invoice) return
    const currentItems = invoiceItemsByInvoiceId[invoiceId] || []
    setInvoiceItemsActionState(invoiceId, 'saving')
    const nextSortOrder =
      currentItems.length > 0
        ? Math.max(...currentItems.map((item) => item.sort_order)) + 1
        : 0
    const { error } = await supabase.from('invoice_items').insert({
      invoice_id: invoiceId,
      description: 'New item',
      qty: 1,
      unit_price: 0,
      line_total: 0,
      sort_order: nextSortOrder,
    })
    if (error) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: invoiceId,
    })
    if (recalcError) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    try {
      await refreshInvoiceById(invoiceId)
      setInvoiceItemsActionState(invoiceId, 'idle')
      setHighlightedJobId(invoice.repair_request_id)
    } catch {
      setInvoiceItemsActionState(invoiceId, 'error')
    }
  }
  async function updateInvoiceItemForInvoice(
    invoiceId: string,
    itemId: string,
    updates: Partial<Pick<InvoiceItem, 'description' | 'qty' | 'unit_price'>>
  ) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    setInvoiceItemsActionState(invoiceId, 'saving')
    const safeUpdates = {
      ...(updates.description !== undefined
        ? { description: updates.description.trim() || 'Item' }
        : {}),
      ...(updates.qty !== undefined
        ? { qty: Number.isFinite(updates.qty) ? updates.qty : 0 }
        : {}),
      ...(updates.unit_price !== undefined
        ? { unit_price: Number.isFinite(updates.unit_price) ? updates.unit_price : 0 }
        : {}),
    }
    const { error } = await supabase
      .from('invoice_items')
      .update(safeUpdates)
      .eq('id', itemId)
    if (error) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: invoiceId,
    })
    if (recalcError) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    try {
      await refreshInvoiceById(invoiceId)
      setInvoiceItemsActionState(invoiceId, 'idle')
      if (invoice) setHighlightedJobId(invoice.repair_request_id)
    } catch {
      setInvoiceItemsActionState(invoiceId, 'error')
    }
  }
  async function deleteInvoiceItemForInvoice(invoiceId: string, itemId: string) {
    const invoice = Object.values(invoicesByJobId).find((item) => item.id === invoiceId)
    setInvoiceItemsActionState(invoiceId, 'saving')
    const { error } = await supabase.from('invoice_items').delete().eq('id', itemId)
    if (error) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    const { error: recalcError } = await supabase.rpc('recalculate_invoice_totals', {
      p_invoice_id: invoiceId,
    })
    if (recalcError) {
      setInvoiceItemsActionState(invoiceId, 'error')
      return
    }
    try {
      await refreshInvoiceById(invoiceId)
      setInvoiceItemsActionState(invoiceId, 'idle')
      if (invoice) setHighlightedJobId(invoice.repair_request_id)
    } catch {
      setInvoiceItemsActionState(invoiceId, 'error')
    }
  }
  async function removeInvoiceForJob(job: RepairRequest) {
    const existingInvoice = invoicesByJobId[job.id]
    if (!existingInvoice) return
    setInvoiceActionState(job.id, 'saving')
    setError('')
    const { error: deleteItemsError } = await supabase
      .from('invoice_items')
      .delete()
      .eq('invoice_id', existingInvoice.id)
    if (deleteItemsError) {
      setInvoiceActionState(job.id, 'error')
      setError(deleteItemsError.message || 'Failed to delete invoice items')
      return
    }
    const { error: deleteInvoiceError } = await supabase
      .from('invoices')
      .delete()
      .eq('id', existingInvoice.id)
    if (deleteInvoiceError) {
      setInvoiceActionState(job.id, 'error')
      setError(deleteInvoiceError.message || 'Failed to delete invoice')
      return
    }
    const { data: updatedJob, error: reopenJobError } = await supabase
      .from('repair_requests')
      .update({ status: 'ready' })
      .eq('id', job.id)
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
        is_hidden
      `)
      .single()
    if (reopenJobError || !updatedJob) {
      setInvoiceActionState(job.id, 'error')
      setError(reopenJobError?.message || 'Invoice removed but failed to reopen job')
      return
    }
    const normalizedUpdatedJob: RepairRequest = {
      ...(updatedJob as RepairRequest),
      internal_notes: updatedJob.internal_notes ?? '',
      quoted_price: updatedJob.quoted_price ?? null,
      serial_imei: updatedJob.serial_imei ?? null,
      is_hidden: Boolean(updatedJob.is_hidden),
    }
    setInvoicesByJobId((prev) => {
      const next = { ...prev }
      delete next[job.id]
      return next
    })
    setInvoiceItemsByInvoiceId((prev) => {
      const next = { ...prev }
      delete next[existingInvoice.id]
      return next
    })
    setJobs((prev) =>
      prev.map((existingJob) =>
        existingJob.id === job.id ? normalizedUpdatedJob : existingJob
      )
    )
    setHiddenJobs((prev) =>
      prev.map((existingJob) =>
        existingJob.id === job.id ? normalizedUpdatedJob : existingJob
      )
    )
    await loadInvoices()
    await loadInvoiceItems()
    setInvoiceActionState(job.id, 'idle')
    setHighlightedJobId(job.id)
  }
  function handleDragStart(jobId: string) {
    setDraggedJobId(jobId)
    setHighlightedJobId(jobId)
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
    setHighlightedJobId(droppedJobId)
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
        job.serial_imei || '',
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
  const filteredHiddenJobs = useMemo(() => {
    const term = search.trim().toLowerCase()
    return hiddenJobs.filter((job) => {
      const haystack = [
        job.job_number || '',
        job.full_name,
        job.phone,
        job.email || '',
        job.brand,
        job.model,
        job.device_type || '',
        job.serial_imei || '',
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
      return term ? haystack.includes(term) : true
    })
  }, [hiddenJobs, search, invoicesByJobId])
  const jobsByStatus = useMemo(() => {
    const allColumnStatuses = [...BOARD_COLUMNS, ...ARCHIVE_COLUMNS]
    return allColumnStatuses.reduce((acc, status) => {
      acc[status] = filteredJobs.filter((job) => job.status === status)
      return acc
    }, {} as Record<RepairStatus, RepairRequest[]>)
  }, [filteredJobs])
  const sortedArchiveJobsByStatus = useMemo(() => {
    return ARCHIVE_COLUMNS.reduce((acc, status) => {
      acc[status] = sortJobs(jobsByStatus[status] || [], archiveSort)
      return acc
    }, {} as Record<RepairStatus, RepairRequest[]>)
  }, [jobsByStatus, archiveSort])
  const sortedHiddenJobs = useMemo(() => {
    return sortJobs(filteredHiddenJobs, hiddenSort)
  }, [filteredHiddenJobs, hiddenSort])
  const summary = useMemo(() => {
    const totalJobs = filteredJobs.length
    const quotedCount = filteredJobs.filter((j) => j.status === 'quoted').length
    const inProgressCount = filteredJobs.filter((j) => j.status === 'in_progress').length
    const readyCount = filteredJobs.filter((j) => j.status === 'ready').length
    const quotedValue = filteredJobs.reduce((sum, j) => sum + (j.quoted_price ?? 0), 0)
    const invoiceCount = filteredJobs.filter((j) => !!invoicesByJobId[j.id]).length
    return {
      totalJobs,
      quotedCount,
      inProgressCount,
      readyCount,
      quotedValue,
      invoiceCount,
      hiddenCount: filteredHiddenJobs.length,
    }
  }, [filteredJobs, filteredHiddenJobs, invoicesByJobId])
  const archiveJobs = useMemo(
    () => filteredJobs.filter((job) => ARCHIVE_COLUMNS.includes(job.status)),
    [filteredJobs]
  )
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
                  onClick={async () => {
                    if (selectedArchiveJobIds.length === 0) return
                    if (!window.confirm(`Are you sure you want to delete ${selectedArchiveJobIds.length} selected jobs? This cannot be undone.`)) return
                    setBulkBusy(true)
                    setError('')
                    const { error } = await supabase
                      .from('repair_requests')
                      .delete()
                      .in('id', selectedArchiveJobIds)
                    if (error) {
                      setError(error.message)
                      setBulkBusy(false)
                      return
                    }
                    void loadAllData()
                    setSelectedArchiveJobIds([])
                    setBulkBusy(false)
                  }}
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
                              updateJobBasics={updateJobBasics}
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
                updateJobBasics={updateJobBasics}
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
                onClick={async () => {
                  if (selectedHiddenJobIds.length === 0) return
                  if (!window.confirm(`Are you sure you want to delete ${selectedHiddenJobIds.length} selected jobs? This cannot be undone.`)) return
                  setBulkBusy(true)
                  setError('')
                  const { error } = await supabase
                    .from('repair_requests')
                    .delete()
                    .in('id', selectedHiddenJobIds)
                  if (error) {
                    setError(error.message)
                    setBulkBusy(false)
                    return
                  }
                  void loadAllData()
                  setSelectedHiddenJobIds([])
                  setBulkBusy(false)
                }}
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
                    updateJobBasics={updateJobBasics}
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
    </main>
  )
}