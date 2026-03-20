import jsPDF from 'jspdf'
import type { Invoice, InvoiceItem } from '../types'
import { formatDateTime } from '../utils'

export type InvoicePdfBusinessDetails = {
  name: string
  address: string
  landline: string
  mobile: string
  email: string
  abn: string
}

export type InvoicePdfPaymentDetails = {
  bankName: string
  accountName: string
  bsb: string
  accountNumber: string
  payId: string
}

type GenerateInvoicePdfParams = {
  invoice: Invoice
  items: InvoiceItem[]
  businessDetails: InvoicePdfBusinessDetails
  paymentDetails: InvoicePdfPaymentDetails
  includeInternalReferenceNotes?: boolean
  filename?: string
  businessSubtitle?: string | null
}

const COLOR_DARK: [number, number, number] = [15, 23, 42]
const COLOR_GREEN: [number, number, number] = [55, 126, 71]
const COLOR_BLUE: [number, number, number] = [37, 99, 235]

export function formatCurrency(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export function generateInvoicePdf({
  invoice,
  items,
  businessDetails,
  paymentDetails,
  includeInternalReferenceNotes = false,
  filename,
  businessSubtitle = null,
}: GenerateInvoicePdfParams) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const left = 14
  const right = pageWidth - 14
  const contentWidth = right - left
  const bottomLimit = pageHeight - 14

  let y = 14

  const addPageIfNeeded = (requiredHeight = 10) => {
    if (y + requiredHeight > bottomLimit) {
      doc.addPage()
      y = 14
    }
  }

  const drawLabelValueRow = (label: string, value: string) => {
    addPageIfNeeded(7)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(label, left, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, left + 42, y)
    y += 6
  }

  const drawHorizontalLine = () => {
    addPageIfNeeded(4)
    doc.setDrawColor(203, 213, 225)
    doc.line(left, y, right, y)
    y += 4
  }

  const drawWrappedBlock = (title: string, value: string) => {
    const lines = doc.splitTextToSize(value || '-', contentWidth)
    addPageIfNeeded(8 + lines.length * 5)
    doc.setTextColor(...COLOR_DARK)
    doc.setFont('helvetica', 'bold')
    doc.text(title, left, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(lines, left, y)
    y += lines.length * 5 + 2
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...COLOR_GREEN)
  doc.text(businessDetails.name, left, y)
  y += 7

  doc.setTextColor(...COLOR_DARK)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  if (businessSubtitle) {
    doc.text(businessSubtitle, left, y)
    y += 5
  }

  doc.text(businessDetails.address, left, y)
  y += 5
  doc.text(`Landline: ${businessDetails.landline}`, left, y)
  y += 5
  doc.text(`Mobile: ${businessDetails.mobile}`, left, y)
  y += 5
  doc.text(`Email: ${businessDetails.email}`, left, y)
  y += 5
  doc.text(`ABN: ${businessDetails.abn}`, left, y)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...COLOR_BLUE)
  doc.text('TAX INVOICE', right, 16, { align: 'right' })

  doc.setTextColor(...COLOR_DARK)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice: ${invoice.invoice_number}`, right, 23, { align: 'right' })
  doc.text(
    `Date: ${invoice.issued_at ? formatDateTime(invoice.issued_at) : formatDateTime(invoice.created_at)}`,
    right,
    29,
    { align: 'right' }
  )
  doc.text(`Status: ${invoice.status.toUpperCase()}`, right, 35, { align: 'right' })

  y = businessSubtitle ? 46 : 42
  drawHorizontalLine()

  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Bill To', left, y)
  y += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  const billToLines = [
    invoice.customer_name,
    invoice.customer_phone || '',
    invoice.customer_email || '',
    invoice.bill_to_address || '',
  ].filter(Boolean)

  for (const line of billToLines) {
    addPageIfNeeded(5)
    doc.setTextColor(...COLOR_DARK)
    doc.text(line, left, y)
    y += 5
  }

  y += 3
  drawHorizontalLine()

  addPageIfNeeded(10)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Invoice Items', left, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Description', left, y)
  doc.text('Qty', 120, y, { align: 'right' })
  doc.text('Unit Price', 155, y, { align: 'right' })
  doc.text('Line Total', right, y, { align: 'right' })
  y += 4

  doc.setDrawColor(203, 213, 225)
  doc.line(left, y, right, y)
  y += 5

  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  if (items.length === 0) {
    addPageIfNeeded(6)
    doc.text('No invoice items found.', left, y)
    y += 6
  } else {
    for (const item of items) {
      const descriptionLines = doc.splitTextToSize(item.description, 95)
      const rowHeight = Math.max(descriptionLines.length * 4.5, 5)

      addPageIfNeeded(rowHeight + 2)

      doc.setTextColor(...COLOR_DARK)
      doc.text(descriptionLines, left, y)
      doc.text(Number(item.qty).toFixed(2), 120, y, { align: 'right' })
      doc.text(formatCurrency(item.unit_price), 155, y, { align: 'right' })
      doc.text(formatCurrency(item.line_total), right, y, { align: 'right' })

      y += rowHeight + 2
    }
  }

  y += 2
  drawHorizontalLine()

  addPageIfNeeded(24)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Summary', 120, y)
  y += 6

  drawLabelValueRow(
    'Total Item Qty',
    Number(items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)).toFixed(2)
  )
  drawLabelValueRow('Subtotal', formatCurrency(invoice.subtotal))
  drawLabelValueRow('GST', formatCurrency(invoice.tax_amount))

  addPageIfNeeded(7)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.text('Total', left, y)
  doc.text(formatCurrency(invoice.total), right, y, { align: 'right' })
  y += 7

  if (invoice.customer_visible_notes) {
    y += 2
    drawHorizontalLine()
    drawWrappedBlock('Notes', invoice.customer_visible_notes)
  }

  if (includeInternalReferenceNotes && invoice.internal_reference_notes) {
    y += 2
    drawHorizontalLine()
    drawWrappedBlock('Internal Reference Notes', invoice.internal_reference_notes)
  }

  y += 2
  drawHorizontalLine()

  addPageIfNeeded(28)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Payment Details', left, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)

  drawLabelValueRow('Bank', paymentDetails.bankName)
  drawLabelValueRow('Account Name', paymentDetails.accountName)
  drawLabelValueRow('BSB', paymentDetails.bsb)
  drawLabelValueRow('Account Number', paymentDetails.accountNumber)
  drawLabelValueRow('PayID', paymentDetails.payId)

  y += 4
  addPageIfNeeded(8)
  doc.setTextColor(...COLOR_DARK)
  doc.setFontSize(9)
  doc.text('Thank you for choosing The Mobile Phone Clinic.', left, y)

  doc.save(filename || `invoice_${invoice.invoice_number}.pdf`)
}