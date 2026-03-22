import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Invoice, InvoiceItem, RepairRequest } from '../types'
import type { BUSINESS_DETAILS, PAYMENT_DETAILS } from './invoicePdfConfig'
import { formatDateTime } from '../utils'

type BusinessDetails = typeof BUSINESS_DETAILS
type PaymentDetails = typeof PAYMENT_DETAILS

export type GenerateInvoicePdfParams = {
  invoice: Invoice
  items: InvoiceItem[]
  linkedJobs?: RepairRequest[]
  businessDetails: BusinessDetails
  paymentDetails: PaymentDetails
  includeInternalReferenceNotes?: boolean
  businessSubtitle?: string
}

function formatCurrency(value: number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

export function generateInvoicePdf({
  invoice,
  items,
  linkedJobs = [],
  businessDetails,
  paymentDetails,
  includeInternalReferenceNotes = false,
  businessSubtitle,
}: GenerateInvoicePdfParams) {
  const doc = new jsPDF()

  const COLOR_DARK: [number, number, number] = [15, 23, 42]
  const COLOR_GREEN: [number, number, number] = [55, 126, 71]
  const COLOR_BLUE: [number, number, number] = [37, 99, 235]
  const COLOR_MUTED: [number, number, number] = [100, 116, 139]

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

  const drawHorizontalLine = () => {
    addPageIfNeeded(4)
    doc.setDrawColor(...COLOR_MUTED)
    doc.line(left, y, right, y)
    y += 4
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

  if (businessSubtitle?.trim()) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...COLOR_MUTED)
    doc.text(businessSubtitle.trim(), left, y)
    y += 5
  }

  doc.setTextColor(...COLOR_DARK)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
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

  y = Math.max(y, 46)
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
    doc.text(line, left, y)
    y += 5
  }

  if (linkedJobs.length > 0) {
    y += 3
    drawHorizontalLine()

    addPageIfNeeded(10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLOR_DARK)
    doc.text('Linked Jobs', left, y)
    y += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    for (const job of linkedJobs) {
      const line = [
        job.job_number || 'Pending',
        [job.brand, job.model].filter(Boolean).join(' '),
        job.repair_performed?.trim() || job.fault_description.trim(),
      ]
        .filter(Boolean)
        .join(' • ')

      const lines = doc.splitTextToSize(line, contentWidth)
      addPageIfNeeded(lines.length * 5 + 2)
      doc.text(lines, left, y)
      y += lines.length * 5 + 2
    }
  }

  y += 2
  drawHorizontalLine()

  addPageIfNeeded(10)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Invoice Items', left, y)
  y += 7

  autoTable(doc, {
    startY: y,
    margin: { left, right },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      textColor: COLOR_DARK,
    },
    headStyles: {
      fillColor: COLOR_BLUE,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    body: items.length
      ? items.map((item) => [
          item.description,
          Number(item.qty).toFixed(2),
          formatCurrency(item.unit_price),
          formatCurrency(item.line_total),
        ])
      : [['No invoice items found.', '', '', '']],
    head: [['Description', 'Qty', 'Unit Price', 'Line Total']],
    theme: 'grid',
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  drawHorizontalLine()

  addPageIfNeeded(24)
  doc.setTextColor(...COLOR_DARK)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Summary', left, y)
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

  doc.save(`invoice_${invoice.invoice_number}.pdf`)
}