import Link from 'next/link'

export default function HomePage() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 40 }}>
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

      <h1 style={{ fontSize: 36, marginTop: 12 }}>Repair Booking</h1>

      <p style={{ color: '#475569', lineHeight: 1.6 }}>
        Submit a repair request and we’ll review it before creating a job.
      </p>

      <div style={{ marginTop: 24 }}>
        <Link
          href="/book"
          style={{
            background: '#059669',
            color: 'white',
            padding: '12px 18px',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Request a Repair
        </Link>
      </div>
    </main>
  )
}