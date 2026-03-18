import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      to,
      customerName,
      invoiceNumber,
      invoiceUrl,
      total,
    }: {
      to?: string
      customerName?: string
      invoiceNumber?: string
      invoiceUrl?: string
      total?: string
    } = body

    if (!to || !invoiceNumber || !invoiceUrl) {
      return NextResponse.json(
        { error: 'Missing required email fields' },
        { status: 400 }
      )
    }

    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 465)
    const secure = String(process.env.SMTP_SECURE || 'true') === 'true'
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.SMTP_FROM || process.env.SMTP_USER

    if (!host || !user || !pass || !from) {
      return NextResponse.json(
        { error: 'SMTP env vars are missing on server' },
        { status: 500 }
      )
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    })

    const safeName = customerName?.trim() || 'Customer'
    const safeTotal = total || ''

    const subject = `Invoice ${invoiceNumber} - The Mobile Phone Clinic`

    const text = [
      `Hi ${safeName},`,
      '',
      `Your invoice ${invoiceNumber} is ready.`,
      safeTotal ? `Total: ${safeTotal}` : '',
      '',
      `View invoice: ${invoiceUrl}`,
      '',
      'Thank you for choosing The Mobile Phone Clinic.',
    ]
      .filter(Boolean)
      .join('\n')

    const html = `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin-bottom: 8px;">The Mobile Phone Clinic</h2>
        <p>Hi ${safeName},</p>
        <p>Your invoice <strong>${invoiceNumber}</strong> is ready.</p>
        ${safeTotal ? `<p><strong>Total:</strong> ${safeTotal}</p>` : ''}
        <p>
          <a
            href="${invoiceUrl}"
            style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;"
          >
            View Invoice
          </a>
        </p>
        <p>Thank you for choosing The Mobile Phone Clinic.</p>
      </div>
    `

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    })

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
    })
  } catch (error) {
    console.error('send-invoice-email route error:', error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected email error',
      },
      { status: 500 }
    )
  }
}