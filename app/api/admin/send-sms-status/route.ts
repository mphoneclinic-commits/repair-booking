import { NextRequest, NextResponse } from 'next/server'

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function toE164Australian(phone: string) {
  const digits = normalizePhone(phone)

  if (digits.startsWith('61')) {
    return `+${digits}`
  }

  if (digits.startsWith('0')) {
    return `+61${digits.slice(1)}`
  }

  return `+${digits}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      to,
      message,
    }: {
      to?: string
      message?: string
    } = body

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing "to" or "message"' },
        { status: 400 }
      )
    }

    const accountSid = process.env.CRAZYTEL_ACCOUNT_SID
    const authToken = process.env.CRAZYTEL_AUTH_TOKEN
    const fromNumber = process.env.CRAZYTEL_FROM_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json(
        { error: 'Twilio env vars are missing' },
        { status: 500 }
      )
    }

    const smsBody = new URLSearchParams()
    smsBody.set('To', toE164Australian(to))
    smsBody.set('From', fromNumber)
    smsBody.set('Body', message)

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsBody.toString(),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.message || 'Failed to send SMS',
          details: data,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sid: data.sid,
      status: data.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unexpected SMS error',
      },
      { status: 500 }
    )
  }
}