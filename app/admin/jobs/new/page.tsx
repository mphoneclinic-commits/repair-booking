'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import styles from '../../admin.module.css'
import type { Customer } from '../../types'
import { normalizeMoneyValue } from '../../utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_PHOTO_SIZE_MB = 8
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export default function NewJobPage() {
  const router = useRouter()

  const [loadingPrefill, setLoadingPrefill] = useState(true)
  const [saving, setSaving] = useState(false)
  const [creatingCustomerInline, setCreatingCustomerInline] = useState(false)
  const [error, setError] = useState('')
  const [successJobId, setSuccessJobId] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const [duplicateJobCount, setDuplicateJobCount] = useState(0)
  const [duplicateCustomerId, setDuplicateCustomerId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null)
  const [customerId, setCustomerId] = useState('')

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerSearchResults, setCustomerSearchResults] = useState<Customer[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)

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
    async function loadPrefill() {
      if (typeof window === 'undefined') return

      const params = new URLSearchParams(window.location.search)
      const paramCustomerId = params.get('customer_id') || ''

      setCustomerId(paramCustomerId)

      try {
        if (paramCustomerId) {
          const { data, error } = await supabase
            .from('customers')
            .select(`
              id,
              full_name,
              phone,
              email,
              preferred_contact,
              billing_address,
              notes,
              is_active,
              created_at,
              updated_at
            `)
            .eq('id', paramCustomerId)
            .single()

          if (error) throw error

          const customer = (data || null) as Customer | null
          setLinkedCustomer(customer)

          if (customer) {
            setForm((prev) => ({
              ...prev,
              full_name: customer.full_name || '',
              phone: customer.phone || '',
              email: customer.email || '',
              preferred_contact: customer.preferred_contact || prev.preferred_contact || 'sms',
            }))
            setCustomerSearch(customer.full_name || '')
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load customer prefill')
      } finally {
        setLoadingPrefill(false)
      }
    }

    void loadPrefill()
  }, [])

  const normalizedPhone = useMemo(() => normalizePhone(form.phone), [form.phone])
  const normalizedEmail = useMemo(() => normalizeEmail(form.email), [form.email])
  const normalizedFullName = useMemo(() => normalizeName(form.full_name), [form.full_name])

  useEffect(() => {
    async function checkDuplicates() {
      if (customerId) {
        const { data, error } = await supabase
          .from('repair_requests')
          .select('id')
          .eq('customer_id', customerId)
          .neq('status', 'closed')
          .neq('status', 'cancelled')
          .neq('status', 'rejected')

        if (error) return

        const count = data?.length || 0

        if (count > 0) {
          setDuplicateWarning(
            `This customer already has ${count} open job${count > 1 ? 's' : ''}. Check existing jobs before creating another.`
          )
          setDuplicateJobCount(count)
          setDuplicateCustomerId(customerId)
        } else {
          setDuplicateWarning('')
          setDuplicateJobCount(0)
          setDuplicateCustomerId('')
        }

        return
      }

      if (normalizedPhone.length < 9 && !normalizedEmail && normalizedFullName.length < 2) {
        setDuplicateWarning('')
        setDuplicateJobCount(0)
        setDuplicateCustomerId('')
        return
      }

      let matchedCustomerId = ''

      if (normalizedPhone.length >= 9) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', normalizedPhone)
          .limit(1)

        matchedCustomerId = data?.[0]?.id || ''
      }

      if (!matchedCustomerId && normalizedEmail) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('email', normalizedEmail)
          .limit(1)

        matchedCustomerId = data?.[0]?.id || ''
      }

      if (!matchedCustomerId && normalizedFullName) {
        const { data } = await supabase
          .from('customers')
          .select('id')
          .eq('full_name', normalizedFullName)
          .limit(1)

        matchedCustomerId = data?.[0]?.id || ''
      }

      let query = supabase
        .from('repair_requests')
        .select('id')
        .neq('status', 'closed')
        .neq('status', 'cancelled')
        .neq('status', 'rejected')

      if (matchedCustomerId) {
        query = query.eq('customer_id', matchedCustomerId)
      } else if (normalizedPhone.length >= 9) {
        query = query.eq('phone', normalizedPhone)
      } else {
        setDuplicateWarning('')
        setDuplicateJobCount(0)
        setDuplicateCustomerId('')
        return
      }

      const { data, error } = await query

      if (error) return

      const count = data?.length || 0

      if (count > 0) {
        setDuplicateWarning(
          `Possible duplicate found: ${count} open job${count > 1 ? 's' : ''}. Check before creating another.`
        )
        setDuplicateJobCount(count)
        setDuplicateCustomerId(matchedCustomerId)
      } else {
        setDuplicateWarning('')
        setDuplicateJobCount(0)
        setDuplicateCustomerId('')
      }
    }

    const timer = window.setTimeout(() => {
      void checkDuplicates()
    }, 400)

    return () => window.clearTimeout(timer)
  }, [customerId, normalizedPhone, normalizedEmail, normalizedFullName])

  useEffect(() => {
    async function runCustomerSearch() {
      const term = customerSearch.trim()

      if (!term || linkedCustomer?.full_name === term) {
        setCustomerSearchResults([])
        return
      }

      setSearchingCustomers(true)

      const phoneTerm = normalizePhone(term)
      const emailTerm = normalizeEmail(term)

      const seen = new Map<string, Customer>()

      if (phoneTerm.length >= 4) {
        const { data } = await supabase
          .from('customers')
          .select(`
            id,
            full_name,
            phone,
            email,
            preferred_contact,
            billing_address,
            notes,
            is_active,
            created_at,
            updated_at
          `)
          .ilike('phone', `%${phoneTerm}%`)
          .limit(10)

        for (const row of (data || []) as Customer[]) {
          seen.set(row.id, row)
        }
      }

      if (emailTerm.length >= 3 && emailTerm.includes('@')) {
        const { data } = await supabase
          .from('customers')
          .select(`
            id,
            full_name,
            phone,
            email,
            preferred_contact,
            billing_address,
            notes,
            is_active,
            created_at,
            updated_at
          `)
          .ilike('email', `%${emailTerm}%`)
          .limit(10)

        for (const row of (data || []) as Customer[]) {
          seen.set(row.id, row)
        }
      }

      const { data: nameData } = await supabase
        .from('customers')
        .select(`
          id,
          full_name,
          phone,
          email,
          preferred_contact,
          billing_address,
          notes,
          is_active,
          created_at,
          updated_at
        `)
        .ilike('full_name', `%${term}%`)
        .limit(10)

      for (const row of (nameData || []) as Customer[]) {
        seen.set(row.id, row)
      }

      setCustomerSearchResults(Array.from(seen.values()).slice(0, 10))
      setSearchingCustomers(false)
    }

    const timer = window.setTimeout(() => {
      void runCustomerSearch()
    }, 300)

    return () => window.clearTimeout(timer)
  }, [customerSearch, linkedCustomer?.full_name])

  function updateField(key: keyof typeof form, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: key === 'phone' ? normalizePhone(value) : value,
    }))
  }

  function applyCustomerToForm(customer: Customer) {
    setLinkedCustomer(customer)
    setCustomerId(customer.id)
    setCustomerSearch(customer.full_name || '')
    setCustomerSearchResults([])

    setForm((prev) => ({
      ...prev,
      full_name: customer.full_name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      preferred_contact: customer.preferred_contact || prev.preferred_contact || 'sms',
    }))
  }

  function clearSelectedCustomer() {
    setLinkedCustomer(null)
    setCustomerId('')
    setCustomerSearch('')
    setCustomerSearchResults([])
  }

  async function findExistingCustomerMatch() {
    if (normalizedPhone.length >= 9) {
      const { data } = await supabase
        .from('customers')
        .select(`
          id,
          full_name,
          phone,
          email,
          preferred_contact,
          billing_address,
          notes,
          is_active,
          created_at,
          updated_at
        `)
        .eq('phone', normalizedPhone)
        .limit(1)

      if (data?.[0]) return data[0] as Customer
    }

    if (normalizedEmail) {
      const { data } = await supabase
        .from('customers')
        .select(`
          id,
          full_name,
          phone,
          email,
          preferred_contact,
          billing_address,
          notes,
          is_active,
          created_at,
          updated_at
        `)
        .eq('email', normalizedEmail)
        .limit(1)

      if (data?.[0]) return data[0] as Customer
    }

    if (normalizedFullName) {
      const { data } = await supabase
        .from('customers')
        .select(`
          id,
          full_name,
          phone,
          email,
          preferred_contact,
          billing_address,
          notes,
          is_active,
          created_at,
          updated_at
        `)
        .eq('full_name', normalizedFullName)
        .limit(1)

      if (data?.[0]) return data[0] as Customer
    }

    return null
  }

  async function createInlineCustomerIfNeeded() {
    if (customerId && linkedCustomer) return linkedCustomer

    setCreatingCustomerInline(true)

    try {
      const existing = await findExistingCustomerMatch()

      if (existing) {
        applyCustomerToForm(existing)
        return existing
      }

      if (!normalizedFullName) {
        return null
      }

      const { data, error } = await supabase
        .from('customers')
        .insert({
          full_name: normalizedFullName,
          phone: normalizedPhone || null,
          email: normalizedEmail || null,
          preferred_contact: form.preferred_contact || null,
          billing_address: null,
          notes: null,
          is_active: true,
        })
        .select(`
          id,
          full_name,
          phone,
          email,
          preferred_contact,
          billing_address,
          notes,
          is_active,
          created_at,
          updated_at
        `)
        .single()

      if (error || !data) {
        throw error || new Error('Failed to create customer')
      }

      const createdCustomer = data as Customer
      applyCustomerToForm(createdCustomer)
      return createdCustomer
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer')
      return null
    } finally {
      setCreatingCustomerInline(false)
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null

    if (!file) {
      setPhotoFile(null)
      return
    }

    const maxBytes = MAX_PHOTO_SIZE_MB * 1024 * 1024

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError('Photo must be JPG, PNG, WEBP, HEIC or HEIF.')
      setPhotoFile(null)
      return
    }

    if (file.size > maxBytes) {
      setError(`Photo must be smaller than ${MAX_PHOTO_SIZE_MB}MB.`)
      setPhotoFile(null)
      return
    }

    setError('')
    setPhotoFile(file)
  }

  async function uploadPhoto(jobId: string) {
    if (!photoFile) return null

    setUploadingPhoto(true)

    const fileExt = photoFile.name.split('.').pop() || 'jpg'
    const fileName = `${jobId}-${Date.now()}.${fileExt}`
    const filePath = fileName

    const { error: uploadError } = await supabase.storage
      .from('fault-photos')
      .upload(filePath, photoFile)

    if (uploadError) {
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

    const parsedQuote = normalizeMoneyValue(form.quoted_price)

    const cleanFullName = normalizeName(form.full_name)
    const cleanPhone = normalizePhone(form.phone)
    const cleanEmail = normalizeEmail(form.email)

    if (!cleanFullName) {
      setError('Full name is required')
      setSaving(false)
      return
    }

    if (!cleanPhone || cleanPhone.length < 9) {
      setError('Valid Australian phone number required')
      setSaving(false)
      return
    }

    if (!form.brand.trim() || !form.model.trim()) {
      setError('Brand and model are required')
      setSaving(false)
      return
    }

    if (!form.fault_description.trim() || form.fault_description.trim().length < 5) {
      setError('Please describe the fault properly')
      setSaving(false)
      return
    }

    let resolvedCustomerId = customerId || null

    const resolvedCustomer = await createInlineCustomerIfNeeded()
    if (resolvedCustomer?.id) {
      resolvedCustomerId = resolvedCustomer.id
    }

    const payload = {
      customer_id: resolvedCustomerId,
      full_name: cleanFullName,
      phone: cleanPhone,
      email: cleanEmail || null,
      brand: form.brand.trim(),
      model: form.model.trim(),
      device_type: form.device_type.trim() || null,
      serial_imei: form.serial_imei.trim() || null,
      fault_description: form.fault_description.trim(),
      preferred_contact: form.preferred_contact || null,
      quoted_price: parsedQuote,
      internal_notes: form.internal_notes.trim() || null,
      status: form.status,
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

    if (photoFile) {
      const photoUrl = await uploadPhoto(data.id)

      if (photoUrl) {
        await supabase
          .from('repair_requests')
          .update({ fault_photo_url: photoUrl })
          .eq('id', data.id)
      }
    }

    setSuccessJobId(data.id)
    setSaving(false)

    window.setTimeout(() => {
      router.push(`/admin?highlightJob=${data.id}`)
    }, 1000)
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Create New Job</h1>
          <p className={styles.pageSubtitle}>
            Search an existing customer or create one inline before booking the repair
          </p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin" className={styles.viewButton}>
            Dashboard
          </Link>
          <Link href="/admin/customers" className={styles.viewButton}>
            Customers
          </Link>
          {customerId ? (
            <Link href={`/admin/customer?id=${customerId}`} className={styles.viewButton}>
              Back to Customer
            </Link>
          ) : null}
        </div>
      </div>

      {loadingPrefill ? (
        <p className={styles.message}>Loading form...</p>
      ) : (
        <form onSubmit={handleSubmit} className={styles.customerFormCard}>
          {error ? <p className={styles.errorText}>{error}</p> : null}

          {duplicateWarning ? (
            <div className={styles.warningBanner}>
              <div>{duplicateWarning}</div>
              {duplicateJobCount > 0 && duplicateCustomerId ? (
                <div className={styles.warningBannerLinkRow}>
                  <Link
                    href={`/admin/customer?id=${encodeURIComponent(duplicateCustomerId)}`}
                    className={styles.inlineLink}
                  >
                    View existing customer jobs →
                  </Link>
                </div>
              ) : null}
            </div>
          ) : null}

          {successJobId ? (
            <div className={styles.successBanner}>
              Job created successfully. Redirecting to dashboard...
              <div className={styles.buttonRow}>
                <Link href={`/admin?highlightJob=${successJobId}`} className={styles.actionButton}>
                  Open in Dashboard Now
                </Link>
              </div>
            </div>
          ) : null}

          <div className={styles.formSectionTitle}>Customer</div>

          <div className={styles.formGrid}>
            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Find Existing Customer</label>
              <input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className={styles.field}
                placeholder="Search by name, phone or email..."
              />
              {searchingCustomers ? (
                <div className={styles.inlineMuted}>Searching customers...</div>
              ) : null}

              {customerSearchResults.length > 0 ? (
                <div className={styles.customerGrid} style={{ marginTop: 10 }}>
                  {customerSearchResults.map((customer) => (
                    <div key={customer.id} className={styles.customerCard}>
                      <div className={styles.customerCardHeader}>
                        <div>
                          <div className={styles.customerTitle}>{customer.full_name}</div>
                          <div className={styles.customerMeta}>
                            {customer.phone || '-'} {customer.email ? `• ${customer.email}` : ''}
                          </div>
                        </div>

                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => applyCustomerToForm(customer)}
                        >
                          Use Customer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {linkedCustomer ? (
              <div className={styles.customerFullWidth}>
                <div className={styles.successBanner}>
                  Using customer: <strong>{linkedCustomer.full_name}</strong>
                  <div className={styles.buttonRow}>
                    <Link
                      href={`/admin/customer?id=${linkedCustomer.id}`}
                      className={styles.actionButton}
                    >
                      Open Customer
                    </Link>
                    <button
                      type="button"
                      className={styles.actionButton}
                      onClick={clearSelectedCustomer}
                    >
                      Clear Customer
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
          </div>

          <div className={styles.formSectionTitle}>Job Details</div>

          <div className={styles.formGrid}>
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

            <div className={styles.customerFullWidth}>
              <label className={styles.smallLabel}>Fault Photo (optional)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                onChange={handlePhotoChange}
                className={styles.smallField}
                disabled={saving}
              />

              {uploadingPhoto ? <p className={styles.helperText}>Uploading photo...</p> : null}

              {photoFile && !uploadingPhoto ? (
                <p className={styles.helperText}>Selected: {photoFile.name}</p>
              ) : null}

              <p className={styles.helperText}>
                Accepted: JPG, PNG, WEBP, HEIC, HEIF. Max {MAX_PHOTO_SIZE_MB}MB.
              </p>
            </div>
          </div>

          <div className={styles.buttonRow}>
            <button
              type="button"
              className={styles.viewButton}
              onClick={() => void createInlineCustomerIfNeeded()}
              disabled={
                creatingCustomerInline ||
                !!customerId ||
                !normalizedFullName ||
                !normalizedPhone
              }
            >
              {creatingCustomerInline
                ? 'Creating Customer...'
                : customerId
                  ? 'Customer Linked'
                  : 'Create / Link Customer'}
            </button>

            <button
              type="submit"
              className={styles.actionButton}
              disabled={
                saving ||
                !form.full_name.trim() ||
                !form.phone.trim() ||
                !form.brand.trim() ||
                !form.model.trim() ||
                !form.fault_description.trim()
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