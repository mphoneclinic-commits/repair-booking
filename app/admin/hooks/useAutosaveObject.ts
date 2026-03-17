'use client'

import { useEffect, useRef, useState } from 'react'
import type { SaveField, SaveState } from '../types'

type UseAutosaveObjectArgs<TDraft extends Record<string, unknown>> = {
  valueFromProps: TDraft
  jobId: string
  field: SaveField
  debounceMs?: number
  setFieldState: (jobId: string, field: SaveField, state: SaveState) => void
  save: (value: TDraft) => Promise<boolean>
  isEqual?: (a: TDraft, b: TDraft) => boolean
}

function shallowObjectEqual<TDraft extends Record<string, unknown>>(a: TDraft, b: TDraft) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)

  if (aKeys.length !== bKeys.length) return false

  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false
  }

  return true
}

export default function useAutosaveObject<TDraft extends Record<string, unknown>>({
  valueFromProps,
  jobId,
  field,
  debounceMs = 900,
  setFieldState,
  save,
  isEqual = shallowObjectEqual,
}: UseAutosaveObjectArgs<TDraft>) {
  const [draft, setDraft] = useState<TDraft>(valueFromProps)
  const focusedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(valueFromProps)
    }
  }, [valueFromProps])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function flush(nextDraft?: TDraft) {
    const valueToSave = nextDraft ?? draft

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

  function handleChange<K extends keyof TDraft>(key: K, value: TDraft[K]) {
    const nextDraft = {
      ...draft,
      [key]: value,
    }

    setDraft(nextDraft)
    setFieldState(jobId, field, 'dirty')

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      void flush(nextDraft)
    }, debounceMs)
  }

  return {
    draft,
    setDraft,
    handleFocus,
    handleBlur,
    handleChange,
    flush,
    focusedRef,
  }
}