'use client'

import jsPDF from 'jspdf'
import type { Invoice, InvoiceItem } from '../types'

type BusinessDetails = {
  name: string
  address: string
  landline: string
  mobile: string
  email: string
  abn: string
}

type PaymentDetails = {
  bankName: string
  accountName: string
  bsb: string
  accountNumber: string
  payId: string
}

type Args = {
  invoice: Invoice
  items: InvoiceItem[]
  businessDetails: BusinessDetails
  paymentDetails: PaymentDetails
  formatCurrency: (value: number | null | undefined) => string
  formatDateTime: (value: string | null | undefined) => string
}

export default function generateInvoicePdf({
  invoice,
  items,
  businessDetails,
  paymentDetails,
  formatCurrency,
  formatDateTime,
}: Args) {
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

  const descriptionX = left
  const qtyX = 120
  const unitPriceX = 155
  const lineTotalX = right
  const descriptionWidth = qtyX - descriptionX - 8

  let y = 14

  const addPageIfNeeded = (requiredHeight = 10) => {
    if (y + requiredHeight > bottomLimit) {
      doc.addPage()
      y = 14
    }
  }

  const drawLabelValueRow = (label: string, value: string) => {
    addPageIfNeeded(7)
    doc.setFont('helvetica', 'bold')
    doc.text(label, left, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, left + 42, y)
    y += 6
  }

  const drawHorizontalLine = () => {
    addPageIfNeeded(4)
    doc.line(left, y, right, y)
    y += 4
  }

  const drawWrappedBlock = (title: string, value: string) => {
    const lines = doc.splitTextToSize(value || '-', contentWidth)
    addPageIfNeeded(8 + lines.length * 5)
    doc.setFont('helvetica', 'bold')
    doc.text(title, left, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.text(lines, left, y)
    y += lines.length * 5 + 2
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(businessDetails.name, left, y)
  y += 7

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
  doc.text('TAX INVOICE', right, 16, { align: 'right' })

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

  y = 46
  drawHorizontalLine()

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
    doc.text(String(line), left, y)
    y += 5
  }

  y += 3
  drawHorizontalLine()

  addPageIfNeeded(10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Invoice Items', left, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Description', descriptionX, y)
  doc.text('Qty', qtyX, y, { align: 'right' })
  doc.text('Unit Price', unitPriceX, y, { align: 'right' })
  doc.text('Line Total', lineTotalX, y, { align: 'right' })
  y += 4

  doc.line(left, y, right, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  if (items.length === 0) {
    addPageIfNeeded(6)
    doc.text('No invoice items found.', left, y)
    y += 6
  } else {
    for (const item of items) {
      const descriptionLines = doc.splitTextToSize(item.description || '', descriptionWidth)
      const rowHeight = Math.max(descriptionLines.length * 4.5, 5)

      addPageIfNeeded(rowHeight + 2)

      doc.text(descriptionLines, descriptionX, y)
      doc.text(Number(item.qty ?? 0).toFixed(2), qtyX, y, { align: 'right' })
      doc.text(formatCurrency(item.unit_price), unitPriceX, y, { align: 'right' })
      doc.text(formatCurrency(item.line_total), lineTotalX, y, { align: 'right' })

      y += rowHeight + 2
    }
  }

  y += 2
  drawHorizontalLine()

  addPageIfNeeded(24)
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
  doc.setFont('helvetica', 'bold')
  doc.text('Total', left, y)
  doc.text(formatCurrency(invoice.total), right, y, { align: 'right' })
  y += 7

  if (invoice.customer_visible_notes) {
    y += 2
    drawHorizontalLine()
    drawWrappedBlock('Notes', invoice.customer_visible_notes)
  }

  if (invoice.internal_reference_notes) {
    y += 2
    drawHorizontalLine()
    drawWrappedBlock('Internal Reference Notes', invoice.internal_reference_notes)
  }

  y += 2
  drawHorizontalLine()

  addPageIfNeeded(28)
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
  doc.setFontSize(9)
  doc.text('Thank you for choosing The Mobile Phone Clinic.', left, y)

  doc.save(`invoice_${invoice.invoice_number}.pdf`)
}