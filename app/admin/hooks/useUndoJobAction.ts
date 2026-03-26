'use client'

import { useCallback, useEffect, useState } from 'react'
import type { InvoiceStatus, RepairStatus } from '../types'

type StatusUndoAction = {
  type: 'status'
  jobId: string
  previousStatus: RepairStatus
  nextStatus: RepairStatus
}

type HideUndoAction = {
  type: 'hide'
  jobId: string
  wasHidden: boolean
}

type InvoiceStatusUndoAction = {
  type: 'invoice_status'
  invoiceId: string
  previousStatus: InvoiceStatus
  nextStatus: InvoiceStatus
}

export type UndoJobAction =
  | StatusUndoAction
  | HideUndoAction
  | InvoiceStatusUndoAction
  | null

type UseUndoJobActionParams = {
  undoStatusChange: (jobId: string, previousStatus: RepairStatus) => Promise<void>
  undoHideChange: (jobId: string, wasHidden: boolean) => Promise<void>
  undoInvoiceStatusChange?: (
    invoiceId: string,
    previousStatus: InvoiceStatus
  ) => Promise<void>
  setError: (message: string) => void
  setSuccessMessage: (message: string) => void
}

export default function useUndoJobAction({
  undoStatusChange,
  undoHideChange,
  undoInvoiceStatusChange,
  setError,
  setSuccessMessage,
}: UseUndoJobActionParams) {
  const [lastAction, setLastAction] = useState<UndoJobAction>(null)
  const [undoing, setUndoing] = useState(false)

  const clearLastAction = useCallback(() => {
    setLastAction(null)
  }, [])

  const recordStatusChange = useCallback(
    (jobId: string, previousStatus: RepairStatus, nextStatus: RepairStatus) => {
      setLastAction({
        type: 'status',
        jobId,
        previousStatus,
        nextStatus,
      })
    },
    []
  )

  const recordHideChange = useCallback((jobId: string, wasHidden: boolean) => {
    setLastAction({
      type: 'hide',
      jobId,
      wasHidden,
    })
  }, [])

  const recordInvoiceStatusChange = useCallback(
    (invoiceId: string, previousStatus: InvoiceStatus, nextStatus: InvoiceStatus) => {
      setLastAction({
        type: 'invoice_status',
        invoiceId,
        previousStatus,
        nextStatus,
      })
    },
    []
  )

  const undoLastAction = useCallback(async () => {
    if (!lastAction || undoing) return

    setUndoing(true)
    setError('')
    setSuccessMessage('')

    try {
      if (lastAction.type === 'status') {
        await undoStatusChange(lastAction.jobId, lastAction.previousStatus)
        setSuccessMessage('Reverted last status change.')
      } else if (lastAction.type === 'hide') {
        await undoHideChange(lastAction.jobId, lastAction.wasHidden)
        setSuccessMessage(lastAction.wasHidden ? 'Reverted last unhide.' : 'Reverted last hide.')
      } else if (lastAction.type === 'invoice_status') {
        if (!undoInvoiceStatusChange) {
          throw new Error('Invoice status undo is not available.')
        }
        await undoInvoiceStatusChange(lastAction.invoiceId, lastAction.previousStatus)
        setSuccessMessage('Reverted last invoice status change.')
      }

      setLastAction(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to undo last action')
    } finally {
      setUndoing(false)
    }
  }, [
    lastAction,
    undoing,
    undoStatusChange,
    undoHideChange,
    undoInvoiceStatusChange,
    setError,
    setSuccessMessage,
  ])

  useEffect(() => {
    function handleUndoShortcut(e: KeyboardEvent) {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z'
      if (!isUndo) return

      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()

      const isTypingTarget =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable

      if (isTypingTarget) return
      if (!lastAction || undoing) return

      e.preventDefault()
      void undoLastAction()
    }

    window.addEventListener('keydown', handleUndoShortcut)
    return () => {
      window.removeEventListener('keydown', handleUndoShortcut)
    }
  }, [lastAction, undoing, undoLastAction])

  return {
    lastAction,
    undoing,
    setLastAction,
    clearLastAction,
    recordStatusChange,
    recordHideChange,
    recordInvoiceStatusChange,
    undoLastAction,
  }
}