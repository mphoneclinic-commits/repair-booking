'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import styles from '../admin.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

export default function NewJobPage() {
  const router = useRouter()

  const [loadingPrefill, setLoadingPrefill] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successJobId, setSuccessJobId] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const [duplicateJobCount, setDuplicateJobCount] = useState(0)
  const [customerKeyForDuplicates, setCustomerKeyForDuplicates] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

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
      full_name: params.get('full_name') || prev.full_name,
      phone: params.get('phone') || prev.phone,
      email: params.get('email') || prev.email,
    }))
    setLoadingPrefill(false)
  }, [])

  // Duplicate check
  useEffect(() => {
    const phone = normalizePhone(form.phone)
    if (phone.length < 9) {
      setDuplicateWarning('')
      setDuplicateJobCount(0)
      setCustomerKeyForDuplicates('')
      return
    }

    const checkDuplicates = async () => {
      const { count, error } = await supabase
        .from('repair_requests')
        .select('id', { count: 'exact', head: true })
        .eq('phone', phone)
        .neq('status', 'closed')
        .neq('status', 'cancelled')
        .neq('status', 'rejected')

      if (error) {
        console.warn('Duplicate check failed:', error)
        return
      }

      if (count && count > 0) {
        const key = `phone:${phone}`
        setDuplicateWarning(
          `Warning: This phone already has ${count} open job${count > 1 ? 's' : ''}.`
        )
        setDuplicateJobCount(count)
        setCustomerKeyForDuplicates(key)
      } else {
        setDuplicateWarning('')
        setDuplicateJobCount(0)
        setCustomerKeyForDuplicates('')
      }
    }

    const timer = setTimeout(checkDuplicates, 500)
    return () => clearTimeout(timer)
  }, [form.phone])

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: key === 'phone' ? normalizePhone(value) : value,
    }))
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPhotoFile(file)
    }
  }

  async function uploadPhoto(jobId: string) {
    if (!photoFile) return null

    setUploadingPhoto(true)
    const fileExt = photoFile.name.split('.').pop()
    const fileName = `${jobId}-${Date.now()}.${fileExt}`
    const filePath = `fault-photos/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('fault-photos')
      .upload(filePath, photoFile)

    if (uploadError) {
      console.error('Photo upload failed:', uploadError)
      setError('Photo upload failed, but job was created.')
      setUploadingPhoto(false)
      return null
    }

    const { data: urlData } = supabase.storage.from('fault-photos').getPublicUrl(filePath)
    setUploadingPhoto(false)
    return urlData.publicUrl
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

    if (!payload.full_name) {
      setError('Full name is required')
      setSaving(false)
      return
    }
    if (!payload.phone || payload.phone.length < 9) {
      setError('Valid Australian phone number required (e.g. 0412345678)')
      setSaving(false)
      return
    }
    if (!payload.brand || !payload.model) {
      setError('Brand and model are required')
      setSaving(false)
      return
    }
    if (!payload.fault_description || payload.fault_description.length < 10) {
      setError('Please describe the fault in detail')
      setSaving(false)
      return
    }

    if (duplicateJobCount > 0) {
      setError(
        `Cannot create job: Phone has ${duplicateJobCount} open job${duplicateJobCount > 1 ? 's' : ''}.`
      )
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('repair_requests')
      .insert(payload)
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Failed to create job')
      setSaving(false)
      return
    }

    let photoUrl = null
    if (photoFile) {
      photoUrl = await uploadPhoto(data.id)
      if (photoUrl) {
        await supabase
          .from('repair_requests')
          .update({ fault_photo_url: photoUrl })
          .eq('id', data.id)
      }
    }

    setSuccessJobId(data.id)
    setSaving(false)

    setTimeout(() => {
      router.push(`/admin?highlightJob=${data.id}`)
    }, 2000)
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Create New Job</h1>
          <p className={styles.pageSubtitle}>
            Create a repair job with optional prefilled customer details
          </p>
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
          {error && <p className={styles.errorText}>{error}</p>}

          {duplicateWarning && (
            <div style={{ background: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '10px', marginBottom: '16px' }}>
              {duplicateWarning}
              {duplicateJobCount > 0 && customerKeyForDuplicates && (
                <div style={{ marginTop: '8px' }}>
                  <Link
                    href={`/admin/customer?key=${encodeURIComponent(customerKeyForDuplicates)}`}
                    style={{ color: '#1e3a8a', fontWeight: 700, textDecoration: 'underline' }}
                  >
                    View existing jobs for this customer →
                  </Link>
                </div>
              )}
            </div>
          )}

          {successJobId ? (
            <div className={styles.successBanner}>
              Job created successfully! Redirecting to dashboard...
              <div className={styles.buttonRow}>
                <Link
                  href={`/admin?highlightJob=${successJobId}`}
                  className={styles.actionButton}
                >
                  Open in Dashboard Now
                </Link>
                <Link href="/admin/jobs/new" className={styles.actionButton}>
                  Create Another
                </Link>
              </div>
            </div>
          ) : null}

          <div className={styles.formGrid}>
            <div>
              <label className={styles.smallLabel}>Full Name *</label>
              <input
                value={form.full_name}
                onChange={(e) => updateField('full_name', e.target.value)}
                className={styles.smallField}
                required
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Phone *</label>
              <input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className={styles.smallField}
                inputMode="numeric"
                maxLength={10}
                required
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
              <label className={styles.smallLabel}>Brand *</label>
              <input
                value={form.brand}
                onChange={(e) => updateField('brand', e.target.value)}
                className={styles.smallField}
                required
              />
            </div>

            <div>
              <label className={styles.smallLabel}>Model *</label>
              <input
                value={form.model}
                onChange={(e) => updateField('model', e.target.value)}
                className={styles.smallField}
                required
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
              <label className={styles.smallLabel}>Fault Description *</label>
              <textarea
                value={form.fault_description}
                onChange={(e) => updateField('fault_description', e.target.value)}
                className={styles.notesField}
                required
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

            {/* Photo Upload Field */}
            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Fault Photo (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className={styles.smallField}
                disabled={saving}
              />
              {uploadingPhoto && <p style={{ marginTop: '8px' }}>Uploading photo...</p>}
              {photoFile && !uploadingPhoto && (
                <p style={{ marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                  Selected: {photoFile.name}
                </p>
              )}
            </div>
          </div>

          <div className={styles.buttonRow}>
            <button
              type="submit"
              className={styles.actionButton}
              disabled={
                saving ||
                !form.full_name.trim() ||
                !form.phone.trim() ||
                !form.brand.trim() ||
                !form.model.trim() ||
                !form.fault_description.trim() ||
                duplicateJobCount > 0
              }
            >
              {saving ? 'Creating Job...' : 'Create Job'}
            </button>
          </div>
        </form>
      )}
    </main>
  )
}