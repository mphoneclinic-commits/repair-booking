 function buildInvoiceSms() {
    if (!invoice) return ''

    const customerName = invoice.customer_name.split(' ')[0] || invoice.customer_name
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || window.location.origin
    const publicInvoiceUrl = `${baseUrl}/invoice/toCustomer?id=${invoice.id}`

    return `Hi ${customerName}, your invoice ${invoice.invoice_number} for ${formatCurrency(
      invoice.total
    )} is ready. View it here: ${publicInvoiceUrl}`
  }

  function buildPaidReminderSms() {
    if (!invoice) return ''

    const customerName = invoice.customer_name.split(' ')[0] || invoice.customer_name
    return `Hi ${customerName}, this is a reminder that invoice ${invoice.invoice_number} for ${formatCurrency(
      invoice.total
    )} is outstanding. Please contact The Mobile Phone Clinic if you have any questions.`
  }

  async function sendInvoiceSms(messageOverride?: string) {
    if (!invoice) return

    const to = String(sendToPhone || '').replace(/\D/g, '').trim()
    const message = (messageOverride ?? smsMessage).trim()

    if (!to) {
      setSmsSendError('Please enter a phone number to send the SMS to.')
      setSmsSendSuccess('')
      return
    }

    if (!message) {
      setSmsSendError('Please enter an SMS message.')
      setSmsSendSuccess('')
      return
    }

    setSendingSms(true)
    setSmsSendError('')
    setSmsSendSuccess('')
    setError('')
    setSuccessMessage('')

    try {
      const response = await fetch('/.netlify/functions/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      })

      const rawText = await response.text()
      let data: any = {}

      try {
        data = rawText ? JSON.parse(rawText) : {}
      } catch {
        throw new Error(rawText || 'Server returned invalid response')
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to send SMS')
      }

      const nowIso = new Date().toISOString()

      const { error: updateError } = await supabase
        .from('invoices')
        .update({
          last_sms_sent_at: nowIso,
          last_sms_to: to,
          last_sms_message: message,
        })
        .eq('id', invoice.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      setInvoice((prev) =>
        prev
          ? {
              ...prev,
              last_sms_sent_at: nowIso,
              last_sms_to: to,
              last_sms_message: message,
            }
          : null
      )

      setSmsSendSuccess(`SMS sent to ${to}.`)
      setSuccessMessage(' SMS sent successfully.')
    } catch (err) {
      setSmsSendError(err instanceof Error ? err.message : 'Failed to send invoice SMS')
    } finally {
      setSendingSms(false)
    }
  }
