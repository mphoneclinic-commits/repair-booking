'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import styles from '../admin.module.css'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

async function handleLogin(e: React.FormEvent) {
  e.preventDefault()
  setBusy(true)
  setError('')

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setError(error.message || 'Login failed')
      setBusy(false)
      return
    }

    router.push('/admin')
    router.refresh()
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Login failed')
    setBusy(false)
  }
}

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.eyebrow}>The Mobile Phone Clinic</div>
          <h1 className={styles.pageTitle}>Admin Login</h1>
          <p className={styles.pageSubtitle}>Sign in to access the dashboard</p>
        </div>
      </div>

      <form
        onSubmit={handleLogin}
        className={styles.expandedSectionCard}
        style={{ maxWidth: 460, margin: '40px auto' }}
      >
        <div className={styles.formGrid}>
          <div>
            <label className={styles.smallLabel}>Email</label>
            <input
              className={styles.smallField}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className={styles.smallLabel}>Password</label>
            <input
              type="password"
              className={styles.smallField}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>

        {error ? <p className={styles.errorText}>{error}</p> : null}

        <div className={styles.buttonRow}>
          <button type="submit" className={styles.actionButton} disabled={busy}>
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </main>
  )
}