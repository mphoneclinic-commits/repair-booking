'use client'

import { useCallback, useState } from 'react'
import type { SaveField, SaveState } from '../types'

export default function useAdminSaveStates() {
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  const getFieldKey = useCallback((jobId: string, field: SaveField) => {
    return `${jobId}:${field}`
  }, [])

  const setFieldState = useCallback(
    (jobId: string, field: SaveField, state: SaveState) => {
      setSaveStates((prev) => ({
        ...prev,
        [getFieldKey(jobId, field)]: state,
      }))
    },
    [getFieldKey]
  )

  const setFieldSaved = useCallback(
    (jobId: string, field: SaveField) => {
      const key = getFieldKey(jobId, field)

      setSaveStates((prev) => ({
        ...prev,
        [key]: 'saved',
      }))

      window.setTimeout(() => {
        setSaveStates((prev) => {
          if (prev[key] !== 'saved') return prev
          return {
            ...prev,
            [key]: 'idle',
          }
        })
      }, 1300)
    },
    [getFieldKey]
  )

  return {
    saveStates,
    getFieldKey,
    setFieldState,
    setFieldSaved,
  }
}