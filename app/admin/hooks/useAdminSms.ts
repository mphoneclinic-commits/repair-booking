'use client'

import { useCallback, useState } from 'react'

type SendSmsArgs = {
  to: string
  message: string
  endpoint?: string
  onSuccess?: (meta: { to: string; message: string; nowIso: string }) => Promise<void> | void
}

type SmsState = 'idle' | 'sending' | 'success' | 'error'

function normalizePhone(value: string) {
  return String(value || '').replace(/\D/g, '').trim()
}

export default function useSms(defaultEndpoint = '/api/admin/send-sms-status') {
  const [smsState, setSmsState] = useState<SmsState>('idle')
  const [sendingSms, setSendingSms] = useState(false)
  const [smsError, setSmsError] = useState('')
  const [smsSuccess, setSmsSuccess] = useState('')

  const resetSmsState = useCallback(() => {
    setSmsState('idle')
    setSendingSms(false)
    setSmsError('')
    setSmsSuccess('')
  }, [])

  const sendSms = useCallback(
    async ({ to, message, endpoint, onSuccess }: SendSmsArgs) => {
      const normalizedTo = normalizePhone(to)
      const trimmedMessage = String(message || '').trim()

      if (!normalizedTo) {
        const error = 'Please enter a phone number to send the SMS to.'
        setSmsState('error')
        setSmsError(error)
        setSmsSuccess('')
        return { ok: false as const, error }
      }

      if (!trimmedMessage) {
        const error = 'Please enter an SMS message.'
        setSmsState('error')
        setSmsError(error)
        setSmsSuccess('')
        return { ok: false as const, error }
      }

      setSendingSms(true)
      setSmsState('sending')
      setSmsError('')
      setSmsSuccess('')

      try {
        const response = await fetch(endpoint || defaultEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: normalizedTo,
            message: trimmedMessage,
          }),
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

        if (onSuccess) {
          await onSuccess({
            to: normalizedTo,
            message: trimmedMessage,
            nowIso,
          })
        }

        setSmsState('success')
        setSmsSuccess(`SMS sent to ${normalizedTo}.`)
        return { ok: true as const, data, nowIso }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to send SMS'
        setSmsState('error')
        setSmsError(error)
        setSmsSuccess('')
        return { ok: false as const, error }
      } finally {
        setSendingSms(false)
      }
    },
    [defaultEndpoint]
  )

  return {
    smsState,
    sendingSms,
    smsError,
    smsSuccess,
    resetSmsState,
    sendSms,
  }
}