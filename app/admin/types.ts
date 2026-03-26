export type RepairStatus =
  | 'new'
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'ready'
  | 'closed'
  | 'rejected'
  | 'cancelled'

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type SaveField =
  | 'status'
  | 'quote'
  | 'parts_cost'
  | 'notes'
  | 'repair_performed'
  | 'job_number'
  | 'customer'
  | 'device'

export type StatusFilter = 'all' | RepairStatus

export type ViewMode = 'board' | 'list' | 'details' | 'tiles'

export type Customer = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  preferred_contact: string | null
  billing_address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type RepairRequest = {
  id: string
  customer_id: string | null
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
  repair_performed: string | null
  status: RepairStatus
  preferred_contact: string | null
  internal_notes: string | null
  quoted_price: number | null
  parts_cost: number | null
  is_hidden: boolean | null
  fault_photo_url?: string | null
  last_sms_sent_at?: string | null
  last_sms_to?: string | null
  last_sms_message?: string | null
}

export type RepairRequestPhoto = {
  id: string
  repair_request_id: string
  photo_url: string
  storage_path: string | null
  sort_order: number
  created_at: string
}

export type Invoice = {
  id: string
  customer_id: string | null
  repair_request_id: string
  invoice_number: string
  status: InvoiceStatus
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  bill_to_address: string | null
  tax_mode: string | null
  tax_rate: number | null
  subtotal_ex_tax: number | null
  tax_amount: number | null
  subtotal: number | null
  total: number | null
  notes?: string | null
  customer_visible_notes?: string | null
  internal_reference_notes?: string | null
  issued_at: string | null
  paid_at: string | null
  sent_at: string | null
  sent_to_email: string | null
  last_sms_sent_at?: string | null
  last_sms_to?: string | null
  last_sms_message?: string | null
  created_at: string
  updated_at: string
}

export type InvoiceItem = {
  id: string
  invoice_id: string
  description: string
serial_imei?: string | null
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