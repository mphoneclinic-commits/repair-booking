import { NextRequest, NextResponse } from 'next/server'

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function toCrazytelNumber(phone: string) {
  const digits = normalizePhone(phone)

  if (digits.startsWith('61')) {
    return `0${digits.slice(2)}`
  }

  return digits
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

    const apiKey = process.env.CRAZYTEL_API_KEY
    const fromNumber = process.env.CRAZYTEL_FROM_NUMBER

    if (!apiKey || !fromNumber) {
      return NextResponse.json(
        { error: 'Crazytel env vars are missing' },
        { status: 500 }
      )
    }

    const response = await fetch('https://sms.crazytel.net.au/api/v1/sms/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: toCrazytelNumber(to),
        from: fromNumber,
        message,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data?.message || data?.error || 'Failed to send SMS',
          details: data,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data,
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