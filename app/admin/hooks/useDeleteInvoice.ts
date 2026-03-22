'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type DeleteInvoiceResult = {
  success: boolean
  error?: string
}

export default function useDeleteInvoice() {
  const [deletingInvoice, setDeletingInvoice] = useState(false)
  const [deleteInvoiceError, setDeleteInvoiceError] = useState('')

  async function deleteInvoice(invoiceId: string): Promise<DeleteInvoiceResult> {
    if (!invoiceId) {
      return { success: false, error: 'Missing invoice ID' }
    }

    setDeletingInvoice(true)
    setDeleteInvoiceError('')

    try {
      const { error } = await supabase.rpc('delete_invoice_safe', {
        p_invoice_id: invoiceId,
      })

      if (error) {
        throw new Error(error.message)
      }

      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete invoice'
      setDeleteInvoiceError(message)
      return { success: false, error: message }
    } finally {
      setDeletingInvoice(false)
    }
  }

  return {
    deletingInvoice,
    deleteInvoiceError,
    deleteInvoice,
  }
}