'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../../admin.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

export default function NewJobPage() {
  const [loadingPrefill, setLoadingPrefill] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successJobId, setSuccessJobId] = useState('')

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    device_type: '',
    serial_imei: '',
    fault_description: '',
    preferred_contact: 'sms',
    quoted_price: '',
    internal_notes: '',
    status: 'new',
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)

    setForm((prev) => ({
      ...prev,
      full_name: params.get('full_name') || '',
      phone: params.get('phone') || '',
      email: params.get('email') || '',
    }))

    setLoadingPrefill(false)
  }, [])

  function updateField(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: key === 'phone' ? normalizePhone(value) : value,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccessJobId('')

    const payload = {
      full_name: form.full_name.trim(),
      phone: normalizePhone(form.phone),
      email: form.email.trim() || null,
      brand: form.brand.trim(),
      model: form.model.trim(),
      device_type: form.device_type.trim() || null,
      serial_imei: form.serial_imei.trim() || null,
      fault_description: form.fault_description.trim(),
      preferred_contact: form.preferred_contact || null,
      quoted_price: form.quoted_price.trim() === '' ? null : Number(form.quoted_price),
      internal_notes: form.internal_notes.trim() || null,
      status: form.status,
    }

    if (!payload.full_name || !payload.phone || !payload.brand || !payload.model || !payload.fault_description) {
      setError('Please complete name, phone, brand, model and fault description.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('repair_requests')
      .insert(payload)
      .select('id')
      .single()

    if (error || !data) {
      setError(error?.message || 'Failed to create job')
      setSaving(false)
      return
    }

    setSuccessJobId(data.id)
    setSaving(false)
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Create New Job</h1>
          <p className={styles.pageSubtitle}>Create a repair job with optional prefilled customer details</p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Dashboard
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>
        </div>
      </div>

      {loadingPrefill ? (
        <p className={styles.message}>Loading form...</p>
      ) : (
        <form onSubmit={handleSubmit} className={styles.customerFormCard}>
          {!!error && <p className={styles.errorText}>{error}</p>}

          {successJobId ? (
            <div className={styles.successBanner}>
              Job created successfully.
              <div className={styles.buttonRow}>
                <Link href={`/admin?highlightJob=${successJobId}`} className={styles.actionButton}>
                  Open in Dashboard
                </Link>
                <Link href="/admin/jobs/new" className={styles.actionButton}>
                  Create Another
                </Link>
              </div>
            </div>
          ) : null}

          <div className={styles.formGrid}>
            <div>
              <label className={styles.smallLabel}>Full Name</label>
              <input
                value={form.full_name}
                onChange={(e) => updateField('full_name', e.target.value)}
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Phone</label>
              <input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className={styles.smallField}
                inputMode="numeric"
                maxLength={10}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Email</label>
              <input
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Preferred Contact</label>
              <select
                value={form.preferred_contact}
                onChange={(e) => updateField('preferred_contact', e.target.value)}
                className={styles.smallField}
              >
                <option value="sms">SMS</option>
                <option value="phone">Phone</option>
                <option value="email">Email</option>
              </select>
            </div>

            <div>
              <label className={styles.smallLabel}>Brand</label>
              <input
                value={form.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Model</label>
              <input
                value={form.model}
                onChange={(e) => updateField('model', e.target.value)}
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Device Type</label>
              <input
                value={form.device_type}
                onChange={(e) => updateField('device_type', e.target.value)}
                className={styles.smallField}
                placeholder="Phone, tablet, laptop..."
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Serial / IMEI</label>
              <input
                value={form.serial_imei}
                onChange={(e) => updateField('serial_imei', e.target.value)}
                className={styles.smallField}
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Quoted Price</label>
              <input
                value={form.quoted_price}
                onChange={(e) => updateField('quoted_price', e.target.value)}
                className={styles.smallField}
                inputMode="decimal"
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Status</label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className={styles.smallField}
              >
                <option value="new">New</option>
                <option value="quoted">Quoted</option>
                <option value="approved">Approved</option>
                <option value="in_progress">In Progress</option>
                <option value="ready">Ready</option>
              </select>
            </div>

            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Fault Description</label>
              <textarea
                value={form.fault_description}
                onChange={(e) => updateField('fault_description', e.target.value)}
                className={styles.notesField}
              />
            </div>

            <div className={styles.customerFullWidth}>
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
      )}
    </main>
  )
}