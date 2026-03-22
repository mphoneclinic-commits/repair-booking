'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import styles from '../../admin.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

export default function NewCustomerPage() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [preferredContact, setPreferredContact] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function createCustomer(goToNewJob: boolean) {
    setSaving(true)
    setError('')

    const cleanName = fullName.trim()
    const cleanPhone = normalizePhone(phone)
    const cleanEmail = email.trim().toLowerCase()
    const cleanPreferredContact = preferredContact.trim()
    const cleanBillingAddress = billingAddress.trim()
    const cleanNotes = notes.trim()

    if (!cleanName) {
      setError('Full name is required.')
      setSaving(false)
      return
    }

    const { data, error: insertError } = await supabase
      .from('customers')
      .insert({
        full_name: cleanName,
        phone: cleanPhone || null,
        email: cleanEmail || null,
        preferred_contact: cleanPreferredContact || null,
        billing_address: cleanBillingAddress || null,
        notes: cleanNotes || null,
        is_active: true,
      })
      .select('id')
      .single()

    if (insertError || !data) {
      setError(insertError?.message || 'Failed to create customer')
      setSaving(false)
      return
    }

    if (goToNewJob) {
      window.location.href = `/admin/jobs/new?customer_id=${data.id}`
      return
    }

    window.location.href = `/admin/customer?id=${data.id}`
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Add New Customer</h1>
          <p className={styles.pageSubtitle}>Create a customer record without creating a job</p>
        </div>

        <div className={styles.toolbar}>
          <Link href="/admin/customers" className={styles.viewButton}>
            Back to Customers
          </Link>
          <Link href="/admin" className={styles.viewButton}>
            Dashboard
          </Link>
        </div>
      </div>

      {error ? <p className={styles.errorText}>{error}</p> : null}

      <div className={styles.adminFormCard}>
        <div className={styles.formGrid}>
          <div>
            <label className={styles.smallLabel}>Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={styles.field}
              placeholder="Customer full name"
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(normalizePhone(e.target.value))}
              className={styles.field}
              placeholder="0411..."
              inputMode="numeric"
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.field}
              placeholder="customer@email.com"
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Preferred Contact</label>
            <input
              value={preferredContact}
              onChange={(e) => setPreferredContact(e.target.value)}
              className={styles.field}
              placeholder="SMS, phone, email"
            />
          </div>

          <div className={styles.customerFullWidth}>
            <label className={styles.smallLabel}>Billing Address</label>
            <textarea
              value={billingAddress}
              onChange={(e) => setBillingAddress(e.target.value)}
              className={styles.notesField}
              placeholder="Billing address"
            />
          </div>

          <div className={styles.customerFullWidth}>
            <label className={styles.smallLabel}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={styles.notesField}
              placeholder="Customer notes"
            />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => void createCustomer(false)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Customer'}
          </button>

          <button
            type="button"
            className={styles.viewButton}
            onClick={() => void createCustomer(true)}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save and Create Job'}
          </button>
        </div>
      </div>
    </main>
  )
}