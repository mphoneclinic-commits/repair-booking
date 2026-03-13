import type { Handler } from '@netlify/functions'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void'
type InvoiceTaxMode = 'exclusive' | 'inclusive' | 'none'

type Invoice = {
  id: string
  repair_request_id: string
  invoice_number: string
  status: InvoiceStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  bill_to_address: string | null
  tax_mode: InvoiceTaxMode
  tax_rate: number
  subtotal_ex_tax: number
  tax_amount: number
  subtotal: number
  total: number
  notes: string | null
  issued_at: string | null
  paid_at: string | null
  sent_at: string | null
  sent_to_email: string | null
  created_at: string
  updated_at: string
}

type InvoiceItem = {
  id: string
  invoice_id: string
  description: string
  qty: number
  unit_price: number
  line_total: number
  sort_order: number
  created_at: string
}

type RepairRequest = {
  id: string
  job_number: string | null
  created_at: string
  full_name: string
  phone: string
  email: string | null
  brand: string
  model: string
  device_type: string | null
  fault_description: string
  status: string
  preferred_contact: string | null
  internal_notes: string | null
  quoted_price: number | null
}

function formatDateTime(dateString: string | null) {
  if (!dateString) return '-'

  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(dateString))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildInvoiceHtml(invoice: Invoice, job: RepairRequest, items: InvoiceItem[]) {
  const taxLabel =
    invoice.tax_mode === 'none'
      ? 'Tax'
      : `GST (${(Number(invoice.tax_rate ?? 0) * 100).toFixed(0)}%)`

  const invoiceTitle = invoice.tax_mode === 'none' ? 'Invoice' : 'Tax Invoice'

  const itemRows = items.length
    ? items
        .map(
          (item) => `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${escapeHtml(item.description)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${Number(item.qty).toFixed(2)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(item.unit_price).toFixed(2)}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">$${Number(item.line_total).toFixed(2)}</td>
            </tr>
          `
        )
        .join('')
    : `
      <tr>
        <td colspan="4" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b;">
          No invoice items found.
        </td>
      </tr>
    `

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:24px;color:#0f172a;">
    <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="padding:28px;border-bottom:2px solid #e2e8f0;display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;">
        <div>
          <div style="font-size:28px;font-weight:800;">The Mobile Phone Clinic</div>
          <div style="margin-top:6px;color:#64748b;">Device Repairs & Diagnostics</div>
          <div style="margin-top:4px;color:#64748b;">Melbourne, Victoria</div>
        </div>

        <div style="text-align:right;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#2563eb;">${escapeHtml(invoiceTitle)}</div>
          <div style="margin-top:8px;font-size:22px;font-weight:800;">${escapeHtml(invoice.invoice_number)}</div>
          <div style="margin-top:10px;font-size:12px;font-weight:800;border:1px solid #cbd5e1;border-radius:999px;padding:6px 12px;display:inline-block;">
            ${escapeHtml(invoice.status.toUpperCase())}
          </div>
        </div>
      </div>

      <div style="padding:28px;">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;">
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#f8fafc;">
            <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Bill To</div>
            <div style="margin-top:10px;font-size:17px;font-weight:700;">${escapeHtml(invoice.customer_name)}</div>
            <div style="margin-top:6px;color:#334155;">${escapeHtml(invoice.customer_phone)}</div>
            <div style="margin-top:6px;color:#334155;">${escapeHtml(invoice.customer_email || '-')}</div>
            ${invoice.bill_to_address ? `<div style="margin-top:6px;color:#334155;">${escapeHtml(invoice.bill_to_address)}</div>` : ''}
          </div>

          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#f8fafc;">
            <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Invoice Details</div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;gap:12px;"><span>Created</span><strong>${escapeHtml(formatDateTime(invoice.created_at))}</strong></div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;gap:12px;"><span>Issued</span><strong>${escapeHtml(formatDateTime(invoice.issued_at))}</strong></div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;gap:12px;"><span>Paid</span><strong>${escapeHtml(formatDateTime(invoice.paid_at))}</strong></div>
            <div style="margin-top:10px;display:flex;justify-content:space-between;gap:12px;"><span>Tax Mode</span><strong>${escapeHtml(invoice.tax_mode)}</strong></div>
          </div>
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Repair Reference</div>
          <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;">
            <div style="margin-bottom:8px;"><strong>Job Number:</strong> ${escapeHtml(job.job_number || 'Pending')}</div>
            <div style="margin-bottom:8px;"><strong>Device:</strong> ${escapeHtml(`${job.brand} ${job.model}${job.device_type ? ` • ${job.device_type}` : ''}`)}</div>
            <div style="margin-bottom:8px;"><strong>Fault:</strong> ${escapeHtml(job.fault_description)}</div>
            <div><strong>Repair Status:</strong> ${escapeHtml(job.status)}</div>
          </div>
        </div>

        <div style="margin-top:24px;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Invoice Items</div>
          <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:12px;text-align:left;border-bottom:1px solid #e2e8f0;">Description</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;">Qty</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;">Unit Price</th>
                <th style="padding:12px;text-align:right;border-bottom:1px solid #e2e8f0;">Line Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>

        <div style="margin-top:24px;display:flex;justify-content:flex-end;">
          <div style="width:100%;max-width:360px;border:1px solid #dbe3ee;border-radius:14px;padding:16px;background:#f8fafc;">
            <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;"><span>Subtotal ex Tax</span><strong>$${Number(invoice.subtotal_ex_tax).toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;"><span>${escapeHtml(taxLabel)}</span><strong>$${Number(invoice.tax_amount).toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;"><span>Subtotal</span><strong>$${Number(invoice.subtotal).toFixed(2)}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px;padding:14px 0 8px;border-top:2px solid #cbd5e1;font-size:18px;"><span>Total</span><strong>$${Number(invoice.total).toFixed(2)}</strong></div>
          </div>
        </div>

        ${
          invoice.notes
            ? `
            <div style="margin-top:24px;">
              <div style="font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Notes</div>
              <div style="border:1px solid #e2e8f0;border-radius:14px;padding:16px;white-space:pre-wrap;line-height:1.6;">${escapeHtml(invoice.notes)}</div>
            </div>
          `
            : ''
        }

        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;line-height:1.6;">
          <div>Thank you for choosing The Mobile Phone Clinic.</div>
        </div>
      </div>
    </div>
  </div>
  `
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {}
    const invoiceId = body.invoiceId as string | undefined

    if (!invoiceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing invoiceId' }),
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing Supabase server credentials' }),
      }
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        id,
        repair_request_id,
        invoice_number,
        status,
        customer_name,
        customer_phone,
        customer_email,
        bill_to_address,
        tax_mode,
        tax_rate,
        subtotal_ex_tax,
        tax_amount,
        subtotal,
        total,
        notes,
        issued_at,
        paid_at,
        sent_at,
        sent_to_email,
        created_at,
        updated_at
      `)
      .eq('id', invoiceId)
      .single()

    if (invoiceError || !invoiceData) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Invoice not found' }),
      }
    }

    const invoice: Invoice = {
      ...(invoiceData as Invoice),
      tax_rate: Number(invoiceData.tax_rate ?? 0),
      subtotal_ex_tax: Number(invoiceData.subtotal_ex_tax ?? 0),
      tax_amount: Number(invoiceData.tax_amount ?? 0),
      subtotal: Number(invoiceData.subtotal ?? 0),
      total: Number(invoiceData.total ?? 0),
    }

    const sendTo = invoice.customer_email?.trim()

    if (!sendTo) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invoice customer email is missing' }),
      }
    }

    const { data: itemData, error: itemError } = await supabase
      .from('invoice_items')
      .select(`
        id,
        invoice_id,
        description,
        qty,
        unit_price,
        line_total,
        sort_order,
        created_at
      `)
      .eq('invoice_id', invoiceId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to load invoice items' }),
      }
    }

    const items = ((itemData || []) as InvoiceItem[]).map((item) => ({
      ...item,
      qty: Number(item.qty ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      line_total: Number(item.line_total ?? 0),
      sort_order: Number(item.sort_order ?? 0),
    }))

    const { data: jobData, error: jobError } = await supabase
      .from('repair_requests')
      .select(`
        id,
        job_number,
        created_at,
        full_name,
        phone,
        email,
        brand,
        model,
        device_type,
        fault_description,
        status,
        preferred_contact,
        internal_notes,
        quoted_price
      `)
      .eq('id', invoice.repair_request_id)
      .single()

    if (jobError || !jobData) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to load related repair job' }),
      }
    }

    const job = jobData as RepairRequest

    const smtpHost = process.env.SMTP_HOST
    const smtpPort = Number(process.env.SMTP_PORT || '465')
    const smtpSecure = String(process.env.SMTP_SECURE || 'true') === 'true'
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS
    const smtpFrom = process.env.SMTP_FROM

    if (!smtpHost || !smtpUser || !smtpPass || !smtpFrom) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing SMTP configuration' }),
      }
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    const subject = `Invoice ${invoice.invoice_number} - The Mobile Phone Clinic`
    const html = buildInvoiceHtml(invoice, job, items)

    await transporter.sendMail({
      from: smtpFrom,
      to: sendTo,
      subject,
      html,
    })

    const nowIso = new Date().toISOString()

    await supabase
      .from('invoices')
      .update({
        sent_at: nowIso,
        sent_to_email: sendTo,
      })
      .eq('id', invoiceId)

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        sentTo: sendTo,
        sentAt: nowIso,
      }),
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown send failure',
      }),
    }
  }
}

export { handler }