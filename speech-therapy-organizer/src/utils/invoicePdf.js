import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_W = 612, PAGE_H = 792   // US Letter, points
const MARGIN = 50

function money(n) { return `$${(Number(n) || 0).toFixed(2)}` }
// Same UTC-shift fix as BillingTab.jsx's fmtDate — bare "YYYY-MM-DD" strings need
// forced local-midnight parsing or they display a day early west of UTC.
function fmtDate(iso) {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Try to embed the practice logo — pdf-lib only natively decodes PNG/JPG, so a
// webp/gif/svg logo is skipped here (the sidebar/Settings preview still show it
// fine, this is just a PDF-embedding limitation) rather than failing the export.
async function embedLogo(pdfDoc, logoPath) {
  if (!logoPath || !window.api) return null
  try {
    const bytes = await window.api.readFileBinary(logoPath)
    const ext = logoPath.split('.').pop().toLowerCase()
    if (ext === 'png') return await pdfDoc.embedPng(bytes)
    if (ext === 'jpg' || ext === 'jpeg') return await pdfDoc.embedJpg(bytes)
    return null
  } catch { return null }
}

// Build a one-page (auto-extends if needed) PDF invoice as bytes, ready to hand
// to the invoice:export IPC call for saving. `invoice` is a store invoice record
// (already has lineItems/total/invoiceNumber); `client` + `settings` supply the
// bill-to fallback and letterhead branding.
export async function buildInvoicePdf({ invoice, client, settings }) {
  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const logoImg = await embedLogo(pdfDoc, settings?.logoPath)

  const dark = rgb(0.1, 0.12, 0.18), muted = rgb(0.45, 0.47, 0.52), line = rgb(0.85, 0.86, 0.88)
  let y = PAGE_H - MARGIN

  const text = (str, x, yy, { size = 10, f = font, color = dark } = {}) => {
    page.drawText(String(str ?? ''), { x, y: yy, size, font: f, color })
  }
  const hr = (yy) => page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 1, color: line })

  // ── Letterhead ──
  if (logoImg) {
    const h = 36, scale = h / logoImg.height
    page.drawImage(logoImg, { x: MARGIN, y: y - h + 6, width: logoImg.width * scale, height: h })
    text(settings?.appName?.trim() || 'Speech Therapy Organizer', MARGIN + logoImg.width * scale + 10, y - 14, { size: 14, f: bold })
  } else {
    text(settings?.appName?.trim() || 'Speech Therapy Organizer', MARGIN, y - 14, { size: 16, f: bold })
  }
  text('INVOICE', PAGE_W - MARGIN - 90, y - 10, { size: 18, f: bold })
  text(`#${invoice.invoiceNumber}`, PAGE_W - MARGIN - 90, y - 28, { size: 10, color: muted })
  text(`Date: ${fmtDate(invoice.issueDate)}`, PAGE_W - MARGIN - 90, y - 42, { size: 10, color: muted })
  y -= 60
  hr(y)
  y -= 26

  // ── Bill To ──
  const billTo = invoice.billToSnapshot || {}
  text('BILL TO', MARGIN, y, { size: 9, f: bold, color: muted })
  y -= 16
  text(billTo.name || client?.name || '', MARGIN, y, { size: 12, f: bold })
  y -= 15
  const billLines = [billTo.address, billTo.contact, billTo.reference ? `Ref/Policy #: ${billTo.reference}` : null].filter(Boolean)
  for (const l of billLines) { text(l, MARGIN, y, { size: 10, color: muted }); y -= 14 }

  y -= 8
  text(`Billing period: ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, MARGIN, y, { size: 10, color: muted })
  y -= 26

  // ── Line items table ──
  const col = { date: MARGIN, desc: MARGIN + 80, dur: PAGE_W - MARGIN - 170, rate: PAGE_W - MARGIN - 110, amt: PAGE_W - MARGIN - 50 }
  text('DATE', col.date, y, { size: 9, f: bold, color: muted })
  text('DESCRIPTION', col.desc, y, { size: 9, f: bold, color: muted })
  text('DURATION', col.dur, y, { size: 9, f: bold, color: muted })
  text('RATE', col.rate, y, { size: 9, f: bold, color: muted })
  text('AMOUNT', col.amt, y, { size: 9, f: bold, color: muted })
  y -= 8
  hr(y)
  y -= 18

  const items = invoice.lineItems || []
  for (const item of items) {
    if (y < 110) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
    text(fmtDate(item.date), col.date, y, { size: 10 })
    text(item.description || 'Session', col.desc, y, { size: 10 })
    text(item.durationLabel || '—', col.dur, y, { size: 10 })
    text(item.rateLabel || '—', col.rate, y, { size: 10 })
    text(money(item.amount), col.amt, y, { size: 10 })
    y -= 18
  }
  if (items.length === 0) { text('No billable sessions in this period.', col.date, y, { size: 10, color: muted }); y -= 18 }

  y -= 6
  hr(y)
  y -= 26

  text('TOTAL', col.rate, y, { size: 12, f: bold })
  text(money(invoice.total), col.amt, y, { size: 12, f: bold })
  y -= 24

  const statusLabel = invoice.status === 'paid' ? `PAID${invoice.paidDate ? ' — ' + fmtDate(invoice.paidDate) : ''}` : 'UNPAID'
  text(statusLabel, col.rate, y, { size: 10, f: bold, color: invoice.status === 'paid' ? rgb(0.13, 0.55, 0.3) : rgb(0.75, 0.35, 0.1) })

  return pdfDoc.save()
}
