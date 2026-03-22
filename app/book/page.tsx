'use client'

import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type FormState = {
  fullName: string
  phone: string
  email: string
  brand: string
  model: string
  fault: string
  preferredContact: 'SMS' | 'Email'
  botField: string
}

type ErrorState = {
  phone: string
  email: string
  fault: string
  form: string
}

type CustomerRow = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  preferred_contact: string | null
  billing_address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const initialForm: FormState = {
  fullName: '',
  phone: '',
  email: '',
  brand: '',
  model: '',
  fault: '',
  preferredContact: 'SMS',
  botField: '',
}

const initialErrors: ErrorState = {
  phone: '',
  email: '',
  fault: '',
  form: '',
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 10)
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

export default function BookingPage() {
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<ErrorState>(initialErrors)

  const cleanedPhone = useMemo(() => normalizePhone(form.phone), [form.phone])

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))

    if (key === 'phone' && errors.phone) {
      setErrors((prev) => ({ ...prev, phone: '', form: '' }))
    }

    if (key === 'email' && errors.email) {
      setErrors((prev) => ({ ...prev, email: '', form: '' }))
    }

    if (key === 'fault' && errors.fault) {
      setErrors((prev) => ({ ...prev, fault: '', form: '' }))
    }

    if (errors.form) {
      setErrors((prev) => ({ ...prev, form: '' }))
    }
  }

  function validatePhone(phone: string) {
    const digits = normalizePhone(phone)

    if (digits.length < 8 || digits.length > 10) {
      return 'Phone number must be between 8 and 10 digits.'
    }

    if (!/^\d+$/.test(digits)) {
      return 'Phone number must contain numbers only.'
    }

    return ''
  }

  function validateEmail(email: string) {
    const trimmed = email.trim()
    if (!trimmed) return ''
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    return ok ? '' : 'Please enter a valid email address.'
  }

  function validateFault(fault: string) {
    const trimmed = fault.trim()
    if (trimmed.length < 8) {
      return 'Fault description must be at least 8 characters.'
    }
    return ''
  }

  async function findExistingCustomer(params: {
    fullName: string
    phone: string
    email: string
  }): Promise<CustomerRow | null> {
    const normalizedName = normalizeName(params.fullName)
    const normalizedPhoneValue = normalizePhone(params.phone)
    const normalizedEmailValue = normalizeEmail(params.email)

    if (normalizedPhoneValue) {
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
        .eq('phone', normalizedPhoneValue)
        .limit(1)

      if (error) throw error
      if (data?.[0]) return data[0] as CustomerRow
    }

    if (normalizedEmailValue) {
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
        .eq('email', normalizedEmailValue)
        .limit(1)

      if (error) throw error
      if (data?.[0]) return data[0] as CustomerRow
    }

    if (normalizedName) {
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
        .eq('full_name', normalizedName)
        .limit(1)

      if (error) throw error
      if (data?.[0]) return data[0] as CustomerRow
    }

    return null
  }

  async function findOrCreateCustomer(params: {
    fullName: string
    phone: string
    email: string
    preferredContact: 'SMS' | 'Email'
  }): Promise<CustomerRow> {
    const normalizedName = normalizeName(params.fullName)
    const normalizedPhoneValue = normalizePhone(params.phone)
    const normalizedEmailValue = normalizeEmail(params.email)

    const existingCustomer = await findExistingCustomer({
      fullName: normalizedName,
      phone: normalizedPhoneValue,
      email: normalizedEmailValue,
    })

    if (existingCustomer) {
      return existingCustomer
    }

    const { data, error } = await supabase
      .from('customers')
      .insert({
        full_name: normalizedName,
        phone: normalizedPhoneValue || null,
        email: normalizedEmailValue || null,
        preferred_contact: params.preferredContact,
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

    return data as CustomerRow
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    if (saving) return

    setSaving(true)
    setErrors(initialErrors)

    if (form.botField.trim()) {
      setErrors({
        ...initialErrors,
        form: 'Submission rejected.',
      })
      setSaving(false)
      return
    }

    const phoneError = validatePhone(form.phone)
    const emailError = validateEmail(form.email)
    const faultError = validateFault(form.fault)

    if (phoneError || emailError || faultError) {
      setErrors({
        phone: phoneError,
        email: emailError,
        fault: faultError,
        form: '',
      })
      setSaving(false)
      return
    }

    try {
      const normalizedFullName = normalizeName(form.fullName)
      const normalizedEmailValue = normalizeEmail(form.email)

      const customer = await findOrCreateCustomer({
        fullName: normalizedFullName,
        phone: cleanedPhone,
        email: normalizedEmailValue,
        preferredContact: form.preferredContact,
      })

      const payload = {
        customer_id: customer.id,
        full_name: normalizedFullName,
        phone: cleanedPhone,
        email: normalizedEmailValue || null,
        brand: form.brand.trim(),
        model: form.model.trim(),
        fault_description: form.fault.trim(),
        preferred_contact: form.preferredContact,
        status: 'new',
      }

      const { error } = await supabase.from('repair_requests').insert(payload)

      setSaving(false)

      if (error) {
        setErrors({
          ...initialErrors,
          form: error.message,
        })
        return
      }

      setSubmitted(true)
      setForm(initialForm)
    } catch (err) {
      setSaving(false)
      setErrors({
        ...initialErrors,
        form: err instanceof Error ? err.message : 'Failed to submit request.',
      })
    }
  }

  if (submitted) {
    return (
      <main style={pageWrapStyle}>
        <div style={heroStyle}>
          <div style={eyebrowStyle}>The Mobile Phone Clinic</div>
          <h1 style={titleStyle}>Request submitted</h1>
          <p style={subtitleStyle}>
            Your repair request has been received. We’ll review it and contact you soon.
          </p>

          <div
            style={{
              background: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: 18,
              padding: 24,
              marginTop: 20,
            }}
          >
            <p style={{ margin: 0, color: '#065f46', fontWeight: 600 }}>
              Thanks — your enquiry is now in the system.
            </p>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/" style={primaryLinkStyle}>
                Back to home
              </Link>

              <button
                type="button"
                onClick={() => setSubmitted(false)}
                style={secondaryButtonStyle}
              >
                Submit another request
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={pageWrapStyle}>
      <div style={heroStyle}>
        <div style={eyebrowStyle}>The Mobile Phone Clinic</div>
        <h1 style={titleStyle}>Request a Repair</h1>
        <p style={subtitleStyle}>
          Fast repair intake for phones, tablets, laptops and other electronics.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={cardStyle}>
        <div style={gridTwoStyle}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              placeholder="Full name"
              required
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
              placeholder="0412345678, 0395123456, 95123456"
              required
              inputMode="numeric"
              maxLength={10}
              style={fieldStyle}
            />
            {errors.phone ? <div style={errorTextStyle}>{errors.phone}</div> : null}
          </div>
        </div>

        <div style={gridTwoStyle}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              placeholder="Email (optional)"
              style={fieldStyle}
            />
            {errors.email ? <div style={errorTextStyle}>{errors.email}</div> : null}
          </div>

          <div>
            <label style={labelStyle}>Preferred contact</label>
            <select
              value={form.preferredContact}
              onChange={(e) =>
                updateField('preferredContact', e.target.value as 'SMS' | 'Email')
              }
              style={fieldStyle}
            >
              <option value="SMS">SMS</option>
              <option value="Email">Email</option>
            </select>
          </div>
        </div>

        <div style={gridTwoStyle}>
          <div>
            <label style={labelStyle}>Device brand</label>
            <input
              value={form.brand}
              onChange={(e) => updateField('brand', e.target.value)}
              placeholder="Apple, Samsung, Lenovo, HP..."
              required
              style={fieldStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Device model</label>
            <input
              value={form.model}
              onChange={(e) => updateField('model', e.target.value)}
              placeholder="iPhone 14 Pro, Galaxy S22, Yoga 7..."
              required
              style={fieldStyle}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Describe the problem</label>
          <textarea
            value={form.fault}
            onChange={(e) => updateField('fault', e.target.value)}
            placeholder="Describe the issue clearly, e.g. cracked screen, not charging, no power, boot loop, liquid damage..."
            required
            style={{ ...fieldStyle, minHeight: 140, resize: 'vertical' }}
          />
          {errors.fault ? <div style={errorTextStyle}>{errors.fault}</div> : null}
        </div>

        <input
          value={form.botField}
          onChange={(e) => updateField('botField', e.target.value)}
          style={{ display: 'none' }}
          tabIndex={-1}
          autoComplete="off"
        />

        {errors.form ? <div style={errorTextStyle}>{errors.form}</div> : null}

        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            type="submit"
            disabled={saving}
            style={{
              ...submitButtonStyle,
              opacity: saving ? 0.8 : 1,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Submitting...' : 'Submit Request'}
          </button>

          <span style={{ fontSize: 13, color: '#64748b' }}>
            By submitting, you’re sending a repair enquiry only.
          </span>
        </div>
      </form>
    </main>
  )
}

const pageWrapStyle: CSSProperties = {
  maxWidth: 980,
  margin: '0 auto',
  padding: '32px 20px 48px',
}

const heroStyle: CSSProperties = {
  marginBottom: 24,
}

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  color: '#059669',
  fontWeight: 800,
}

const titleStyle: CSSProperties = {
  fontSize: 38,
  lineHeight: 1.1,
  margin: '10px 0 10px',
  color: '#0f172a',
}

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: '#475569',
  fontSize: 16,
  lineHeight: 1.6,
}

const cardStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
  background: '#ffffff',
  borderRadius: 22,
  padding: 24,
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.05)',
}

const gridTwoStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 14,
  fontWeight: 700,
  color: '#334155',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  fontSize: 16,
  boxSizing: 'border-box',
  background: '#fff',
  color: '#0f172a',
}

const submitButtonStyle: CSSProperties = {
  background: '#059669',
  color: 'white',
  border: 0,
  borderRadius: 12,
  padding: '13px 18px',
  fontWeight: 800,
  fontSize: 15,
}

const secondaryButtonStyle: CSSProperties = {
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  cursor: 'pointer',
  fontWeight: 700,
}

const primaryLinkStyle: CSSProperties = {
  display: 'inline-block',
  padding: '12px 16px',
  borderRadius: 12,
  background: '#059669',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
}

const errorTextStyle: CSSProperties = {
  color: '#b91c1c',
  fontSize: 14,
  marginTop: 8,
}