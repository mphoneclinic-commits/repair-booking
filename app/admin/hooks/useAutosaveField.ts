'use client'

import { useEffect, useRef, useState } from 'react'
import type { SaveField, SaveState } from '../types'

type UseAutosaveFieldArgs<TValue> = {
  valueFromProps: TValue
  jobId: string
  field: SaveField
  debounceMs?: number
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
  save: (value: TValue) => Promise<boolean>
  isEqual?: (a: TValue, b: TValue) => boolean
}

export default function useAutosaveField<TValue>({
  valueFromProps,
  jobId,
  field,
  debounceMs = 800,
  setFieldState,
  save,
  isEqual = Object.is,
}: UseAutosaveFieldArgs<TValue>) {
  const [value, setValue] = useState<TValue>(valueFromProps)
  const focusedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!focusedRef.current) {
      setValue(valueFromProps)
    }
  }, [valueFromProps])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function flush(nextValue?: TValue) {
    const valueToSave = nextValue ?? value

    if (isEqual(valueToSave, valueFromProps)) {
      setFieldState(jobId, field, 'idle')
      return true
    }

    setFieldState(jobId, field, 'saving')
    const success = await save(valueToSave)

    if (!success) {
      setFieldState(jobId, field, 'error')
      return false
    }

    setFieldState(jobId, field, 'saved')
    window.setTimeout(() => {
      setFieldState(jobId, field, 'idle')
    }, 1300)

    return true
  }

  function handleFocus() {
    focusedRef.current = true
  }

  async function handleBlur() {
    focusedRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    await flush()
  }

  function handleChange(nextValue: TValue) {
    setValue(nextValue)
    setFieldState(jobId, field, 'dirty')

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flush(nextValue)
    }, debounceMs)
  }

  return {
    value,
    setValue,
    handleFocus,
    handleBlur,
    handleChange,
    flush,
    focusedRef,
  }
}