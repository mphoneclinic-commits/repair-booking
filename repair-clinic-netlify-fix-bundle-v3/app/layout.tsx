export const metadata = {
  title: 'The Mobile Phone Clinic',
  description: 'Repair booking form',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        {children}
      </body>
    </html>
  )
}
