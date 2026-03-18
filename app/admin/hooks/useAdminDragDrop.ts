'use client'

import { useState } from 'react'
import type { RepairRequest, RepairStatus } from '../types'

type Params = {
  jobs: RepairRequest[]
  updateStatus: (id: string, newStatus: RepairStatus) => Promise<void>
  setHighlightedJobId: React.Dispatch<React.SetStateAction<string | null>>
}

export default function useAdminDragDrop({
  jobs,
  updateStatus,
  setHighlightedJobId,
}: Params) {
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<RepairStatus | null>(null)

  function handleDragStart(jobId: string) {
    setDraggedJobId(jobId)
    setHighlightedJobId(jobId)
  }

  function handleDragEnd() {
    setDraggedJobId(null)
    setDragOverStatus(null)
  }

  function handleColumnDragOver(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }

    if (dragOverStatus !== status) {
      setDragOverStatus(status)
    }
  }

  function handleColumnDragLeave(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    const nextTarget = event.relatedTarget as Node | null
    if (nextTarget && event.currentTarget.contains(nextTarget)) return

    if (dragOverStatus === status) {
      setDragOverStatus(null)
    }
  }

  async function handleColumnDrop(
    event: React.DragEvent<HTMLDivElement>,
    status: RepairStatus
  ) {
    event.preventDefault()

    const droppedJobId =
      draggedJobId || event.dataTransfer.getData('text/plain') || null

    setDragOverStatus(null)

    if (!droppedJobId) {
      setDraggedJobId(null)
      return
    }

    const draggedJob = jobs.find((job) => job.id === droppedJobId)
    if (!draggedJob) {
      setDraggedJobId(null)
      return
    }

    if (draggedJob.status !== status) {
      await updateStatus(droppedJobId, status)
    }

    setHighlightedJobId(droppedJobId)
    setDraggedJobId(null)
  }

  return {
    draggedJobId,
    dragOverStatus,
    handleDragStart,
    handleDragEnd,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop,
  }
}