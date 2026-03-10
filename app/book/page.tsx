'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function BookingPage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    brand: '',
    model: '',
    fault: '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <main style={{ maxWidth: 820, margin: '0 auto', padding: 40 }}>
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 16, padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Request submitted</h2>
          <p style={{ color: '#065f46' }}>
            Your repair request was received and will be reviewed.
          </p>
          <Link href="/" style={{ display: 'inline-block', marginTop: 12, color: '#065f46', fontWeight: 600 }}>
            Back to home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 40 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#059669', fontWeight: 700 }}>
        The Mobile Phone Clinic
      </div>
      <h1 style={{ fontSize: 36, marginTop: 12 }}>Book a Repair</h1>
      <p style={{ color: '#475569', lineHeight: 1.6 }}>
        Fill out the form below and we’ll review your request before turning it into a real repair job.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, background: 'white', borderRadius: 18, padding: 24, border: '1px solid #e2e8f0', marginTop: 24 }}>
        <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Full name" required style={fieldStyle} />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" required style={fieldStyle} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" style={fieldStyle} />
        <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="Device brand" required style={fieldStyle} />
        <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Device model" required style={fieldStyle} />
        <textarea value={form.fault} onChange={(e) => setForm({ ...form, fault: e.target.value })} placeholder="Describe the problem" required style={{ ...fieldStyle, minHeight: 120, resize: 'vertical' }} />
        <button type="submit" style={{ background: '#059669', color: 'white', border: 0, borderRadius: 10, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' }}>
          Submit Request
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
