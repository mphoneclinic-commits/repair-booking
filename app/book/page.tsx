'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function BookingPage() {
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    fault: '',
    preferredContact: 'SMS',
    botField: '',
  })

  async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  setSaving(true)
  setError('')

  if (form.botField.trim()) {
    setError('Submission rejected.')
    setSaving(false)
    return
  }

  const cleanPhone = form.phone.replace(/\D/g, '')

  if (cleanPhone.length < 8 || cleanPhone.length > 10) {
    setError('Phone number must be between 8 and 10 digits.')
    setSaving(false)
    return
  }

  const cleanFault = form.fault.trim()

  if (cleanFault.length < 8) {
    setError('Fault description must be at least 8 characters.')
    setSaving(false)
    return
  }

  const { error } = await supabase.from('repair_requests').insert({
    full_name: form.fullName.trim(),
    phone: cleanPhone,
    email: form.email.trim() || null,
    brand: form.brand.trim(),
    model: form.model.trim(),
    fault_description: cleanFault,
    preferred_contact: form.preferredContact,
    status: 'new',
  })

  setSaving(false)

  if (error) {
    setError(error.message)
    return
  }

  setSubmitted(true)
}

  if (submitted) {
    return (
      <main style={{ maxWidth: 820, margin: '0 auto', padding: 40 }}>
        <div
          style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Request submitted</h2>
          <p style={{ color: '#065f46' }}>
            Your repair request was received and will be reviewed.
          </p>
          <Link
            href="/"
            style={{
              display: 'inline-block',
              marginTop: 12,
              color: '#065f46',
              fontWeight: 600,
            }}
          >
            Back to home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 40 }}>
      <div
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: '#059669',
          fontWeight: 700,
        }}
      >
        The Mobile Phone Clinic
      </div>

      <h1 style={{ fontSize: 36, marginTop: 12 }}>Book a Repair</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: 14,
          background: 'white',
          borderRadius: 18,
          padding: 24,
          border: '1px solid #e2e8f0',
          marginTop: 24,
        }}
      >
        <input
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          placeholder="Full name"
          required
          style={fieldStyle}
        />

       <input
 	 value={form.phone}
  	 onChange={(e) => setForm({ ...form, phone: e.target.value })}
 	 placeholder="Phone"
 	 required
 	 inputMode="numeric"
 	 maxLength={14}
	 style={fieldStyle}
	/>

        <input
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="Email"
          style={fieldStyle}
        />

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Preferred contact
          </label>
          <select
            value={form.preferredContact}
            onChange={(e) =>
              setForm({ ...form, preferredContact: e.target.value })
            }
            style={fieldStyle}
          >
            <option value="SMS">SMS</option>
            <option value="Email">Email</option>
          </select>
        </div>

        <input
          value={form.brand}
          onChange={(e) => setForm({ ...form, brand: e.target.value })}
          placeholder="Device brand"
          required
          style={fieldStyle}
        />

        <input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder="Device model"
          required
          style={fieldStyle}
        />

        <textarea
          value={form.fault}
          onChange={(e) => setForm({ ...form, fault: e.target.value })}
          placeholder="Describe the problem, e.g. screen cracked, not charging, no sign of life, boots logo 	  then shuts down"
          required
          style={{ ...fieldStyle, minHeight: 120, resize: 'vertical' }}
        />

        <input
          value={form.botField}
          onChange={(e) => setForm({ ...form, botField: e.target.value })}
          style={{ display: 'none' }}
          tabIndex={-1}
          autoComplete="off"
        />

        {error ? (
          <div style={{ color: '#b91c1c', fontSize: 14 }}>{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          style={{
            background: '#059669',
            color: 'white',
            border: 0,
            borderRadius: 10,
            padding: '12px 18px',

            fontWeight: 700,
            cursor: 'pointer',          }}
        >
          {saving ? 'Submitting...' : 'Submit Request'}
        </button>
      </form>
    </main>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  fontSize: 16,
  boxSizing: 'border-box',
}