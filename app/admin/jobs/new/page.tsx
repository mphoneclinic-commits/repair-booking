'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../../admin.module.css'
import type { RepairStatus } from '../../types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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

export default function NewJobPage() {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [createdJobId, setCreatedJobId] = useState<string | null>(null)

  const [form, setForm] = useState({
    job_number: '',
    full_name: '',
    phone: '',
    email: '',
    preferred_contact: 'sms',
    brand: '',
    model: '',
    device_type: '',
    serial_imei: '',
    fault_description: '',
    internal_notes: '',
    quoted_price: '',
    status: 'new' as RepairStatus,
  })

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccessMessage('')
    setCreatedJobId(null)

    const fullName = form.full_name.trim()
    const phone = form.phone.replace(/\D/g, '').slice(0, 10)
    const email = form.email.trim()
    const brand = form.brand.trim()
    const model = form.model.trim()
    const deviceType = form.device_type.trim()
    const serialImei = form.serial_imei.trim()
    const faultDescription = form.fault_description.trim()
    const internalNotes = form.internal_notes.trim()
    const quotedPrice =
      form.quoted_price.trim() === '' ? null : Number(form.quoted_price.trim())

    if (!fullName || phone.length < 8 || !brand || !model || faultDescription.length < 3) {
      setError('Please fill in the required fields correctly.')
      setSaving(false)
      return
    }

    if (quotedPrice !== null && Number.isNaN(quotedPrice)) {
      setError('Quoted price must be a valid number.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('repair_requests')
      .insert({
        job_number: form.job_number.trim() || null,
        full_name: fullName,
        phone,
        email: email || null,
        preferred_contact: form.preferred_contact || null,
        brand,
        model,
        device_type: deviceType || null,
        serial_imei: serialImei || null,
        fault_description: faultDescription,
        internal_notes: internalNotes || null,
        quoted_price: quotedPrice,
        status: form.status,
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      setError(error?.message || 'Failed to create job.')
      setSaving(false)
      return
    }

    setCreatedJobId(data.id)
    setSuccessMessage('Job created successfully.')

    setForm({
      job_number: '',
      full_name: '',
      phone: '',
      email: '',
      preferred_contact: 'sms',
      brand: '',
      model: '',
      device_type: '',
      serial_imei: '',
      fault_description: '',
      internal_notes: '',
      quoted_price: '',
      status: 'new',
    })

    setSaving(false)
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Create Job</h1>
          <p className={styles.pageSubtitle}>
            Add a repair job directly from the dashboard
          </p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Back to Admin
          </Link>
          <Link href="/admin/invoices" className={styles.viewButton}>
            View Invoices
          </Link>
        </div>
      </div>

      {error ? <p className={styles.errorText}>{error}</p> : null}
      {successMessage ? <p className={styles.successText}>{successMessage}</p> : null}

      {createdJobId ? (
        <div className={styles.buttonRow}>
          <Link href={`/admin?highlightJob=${createdJobId}`} className={styles.actionButton}>
            Open New Job in Dashboard
          </Link>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className={styles.adminFormCard}>
        <div className={styles.formSectionTitle}>Customer</div>

        <div className={styles.formGrid}>
          <div>
            <label className={styles.smallLabel}>Full Name</label>
            <input
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
              className={styles.field}
              required
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              inputMode="numeric"
              maxLength={10}
              className={styles.field}
              required
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Email</label>
            <input
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              className={styles.field}
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Preferred Contact</label>
            <select
              value={form.preferred_contact}
              onChange={(e) => updateField('preferred_contact', e.target.value)}
              className={styles.field}
            >
              <option value="sms">SMS</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>

        <div className={styles.formSectionTitle}>Job & Device</div>

        <div className={styles.formGrid}>
          <div>
            <label className={styles.smallLabel}>Job Number</label>
            <input
              value={form.job_number}
              onChange={(e) => updateField('job_number', e.target.value)}
              className={styles.field}
              placeholder="Optional"
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Status</label>
            <select
              value={form.status}
              onChange={(e) => updateField('status', e.target.value as RepairStatus)}
              className={styles.field}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.smallLabel}>Brand</label>
            <input
              value={form.brand}
              onChange={(e) => updateField('brand', e.target.value)}
              className={styles.field}
              required
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Model</label>
            <input
              value={form.model}
              onChange={(e) => updateField('model', e.target.value)}
              className={styles.field}
              required
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Device Type</label>
            <input
              value={form.device_type}
              onChange={(e) => updateField('device_type', e.target.value)}
              className={styles.field}
              placeholder="Phone, tablet, laptop..."
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Serial / IMEI</label>
            <input
              value={form.serial_imei}
              onChange={(e) => updateField('serial_imei', e.target.value)}
              className={styles.field}
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Quoted Price</label>
            <input
              value={form.quoted_price}
              onChange={(e) => updateField('quoted_price', e.target.value)}
              className={styles.field}
              inputMode="decimal"
              placeholder="Optional"
            />
          </div>
        </div>

        <div className={styles.formSectionTitle}>Details</div>

        <div className={styles.formGrid}>
          <div>
            <label className={styles.smallLabel}>Fault Description</label>
            <textarea
              value={form.fault_description}
              onChange={(e) => updateField('fault_description', e.target.value)}
              className={styles.notesField}
              required
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Internal Notes</label>
            <textarea
              value={form.internal_notes}
              onChange={(e) => updateField('internal_notes', e.target.value)}
              className={styles.notesField}
            />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button type="submit" className={styles.actionButton} disabled={saving}>
            {saving ? 'Creating...' : 'Create Job'}
          </button>
        </div>
      </form>
    </main>
  )
}