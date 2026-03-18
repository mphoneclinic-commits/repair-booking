export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await req.json()
    const to = String(body?.to || '').trim()
    const message = String(body?.message || '').trim()

    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, message' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const apiKey = process.env.CRAZYTEL_API_KEY
    const from = process.env.CRAZYTEL_FROM_NUMBER

    if (!apiKey || !from) {
      return new Response(
        JSON.stringify({ error: 'Server SMS configuration missing' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const crazytelRes = await fetch('https://sms.crazytel.net.au/api/v1/sms/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from,
        message,
      }),
    })

    const contentType = crazytelRes.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
      ? await crazytelRes.json()
      : await crazytelRes.text()

    if (!crazytelRes.ok) {
      return new Response(
        JSON.stringify({
          error: 'Crazytel request failed',
          provider_status: crazytelRes.status,
          provider_response: data,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Unexpected server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}