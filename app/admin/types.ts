export type RepairStatus =
  | 'new'
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'ready'
  | 'closed'
  | 'rejected'
  | 'cancelled'

export type RepairRequest = {
  id: string
  job_number: string | null
  created_at: string
  full_name: string
  phone: string
  email: string | null
  brand: string
  model: string
  device_type: string | null
  serial_imei: string | null
  fault_description: string
  status: RepairStatus
  preferred_contact: string | null
  internal_notes: string | null
  quoted_price: number | null
  is_hidden: boolean
  fault_photo_url?: string | null
}

export type RepairRequestPhoto = {
  id: string
  repair_request_id: string
  photo_url: string
  storage_path: string | null
  sort_order: number
  created_at: string
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'

export type Invoice = {
  id: string
  repair_request_id: string
  invoice_number: string
  status: InvoiceStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  bill_to_address: string | null
  tax_mode?: string | null
  tax_rate: number
  subtotal_ex_tax: number
  tax_amount: number
  subtotal: number
  total: number
  notes: string | null
  customer_visible_notes: string | null
  internal_reference_notes: string | null
  issued_at: string | null
  paid_at: string | null
  sent_at?: string | null
  sent_to_email?: string | null
  created_at: string
  updated_at: string
}

export type InvoiceItem = {
  id: string
  invoice_id: string
  description: string
  qty: number
  unit_price: number
  line_total: number
  sort_order: number
  created_at: string
}

export type InvoiceRepairLink = {
  id: string
  invoice_id: string
  repair_request_id: string
  created_at: string
}

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type ViewMode = 'board' | 'list' | 'details' | 'tiles'

export type StatusFilter = 'all' | RepairStatus

export type SaveField =
  | 'status'
  | 'quote'
  | 'notes'
  | 'job_number'
  | 'customer'
  | 'device'