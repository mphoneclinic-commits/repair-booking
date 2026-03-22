'use client'

import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type DeleteResult = {
  success: boolean
  error?: string
}

export default function useDeleteRepairRequests() {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function deleteRepairRequests(jobIds: string[]): Promise<DeleteResult> {
    if (jobIds.length === 0) {
      return { success: true }
    }

    setDeleting(true)
    setDeleteError('')

    try {
      const { data: photoRows, error: photoFetchError } = await supabase
        .from('repair_request_photos')
        .select('storage_path')
        .in('repair_request_id', jobIds)

      if (photoFetchError) {
        throw new Error(photoFetchError.message)
      }

      const storagePaths = (photoRows || [])
        .map((row) => row.storage_path)
        .filter((path): path is string => Boolean(path))

      const { error: rpcError } = await supabase.rpc('delete_repair_requests_safe', {
        job_ids: jobIds,
      })

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('fault-photos')
          .remove(storagePaths)

        if (storageError) {
          throw new Error(
            `Deleted DB rows, but failed to remove photo files: ${storageError.message}`
          )
        }
      }

      return { success: true }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete repair request(s)'
      setDeleteError(message)
      return { success: false, error: message }
    } finally {
      setDeleting(false)
    }
  }

  async function deleteSingle(jobId: string): Promise<DeleteResult> {
    return deleteRepairRequests([jobId])
  }

  async function deleteBulk(jobIds: string[]): Promise<DeleteResult> {
    return deleteRepairRequests(jobIds)
  }

  return {
    deleting,
    deleteError,
    deleteSingle,
    deleteBulk,
  }
}