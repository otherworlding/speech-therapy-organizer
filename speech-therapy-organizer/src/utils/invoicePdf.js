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
  // A client can override the letterhead (agency work, self-employed side clients,
  // etc.) via Settings → Per-Client Branding — falls back to the shared default.
  const custom = client?.customBranding?.enabled ? client.customBranding : null
  const brandName = (custom?.businessName?.trim()) || settings?.appName?.trim() || 'Speech Therapy Organizer'
  const brandLogoPath = custom ? custom.logoPath : settings?.logoPath
  const logoImg = await embedLogo(pdfDoc, brandLogoPath)

  const dark = rgb(0.1, 0.12, 0.18), muted = rgb(0.45, 0.47, 0.52), line = rgb(0.85, 0.86, 0.88)
  let y = PAGE_H - MARGIN

  const text = (str, x, yy, { size = 10, f = font, color = dark } = {}) => {
    page.drawText(String(str ?? ''), { x, y: yy, size, font: f, color })
  }
  // Right-align text so its right edge lands at `xRight` — used for the numeric columns
  // so varying-width amounts (RATE, AMOUNT, TOTAL) line up instead of drifting left/right.
  const textRight = (str, xRight, yy, { size = 10, f = font, color = dark } = {}) => {
    const s = String(str ?? '')
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, { size, f, color })
  }
  // Truncate with an ellipsis so a long description can never run into the next
  // column — the actual bug seen in the first real invoice export (overlapping text).
  const truncateToWidth = (str, maxWidth, f, size) => {
    let s = String(str ?? '')
    if (f.widthOfTextAtSize(s, size) <= maxWidth) return s
    while (s.length > 1 && f.widthOfTextAtSize(s + '…', size) > maxWidth) s = s.slice(0, -1)
    return s + '…'
  }
  const hr = (yy) => page.drawLine({ start: { x: MARGIN, y: yy }, end: { x: PAGE_W - MARGIN, y: yy }, thickness: 1, color: line })

  // ── Letterhead ──
  if (logoImg) {
    const h = 36, scale = h / logoImg.height
    page.drawImage(logoImg, { x: MARGIN, y: y - h + 6, width: logoImg.width * scale, height: h })
    text(brandName, MARGIN + logoImg.width * scale + 10, y - 14, { size: 14, f: bold })
  } else {
    text(brandName, MARGIN, y - 14, { size: 16, f: bold })
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
  // Address may be a multi-line mailing address (from a textarea) — split it out
  // into its own lines rather than running it together with contact/reference.
  const billLines = [
    ...String(billTo.address || '').split('\n').map(l => l.trim()).filter(Boolean),
    billTo.contact, billTo.reference ? `Ref/Policy #: ${billTo.reference}` : null,
  ].filter(Boolean)
  for (const l of billLines) { text(l, MARGIN, y, { size: 10, color: muted }); y -= 14 }

  y -= 8
  text(`Billing period: ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, MARGIN, y, { size: 10, color: muted })
  y -= 26

  // ── Line items table ──
  // Fixed column geometry with real gaps between columns (the original version packed
  // DESCRIPTION right up against DURATION/RATE/AMOUNT with no reserved width, so any
  // description longer than ~2 words visibly overlapped the numeric columns).
  const usableRight = PAGE_W - MARGIN
  const col = {
    date: MARGIN, desc: MARGIN + 75,
    durRight: usableRight - 155, rateRight: usableRight - 75, amtRight: usableRight,
  }
  const descMaxWidth = (col.durRight - 60) - col.desc - 10   // leaves room for the DURATION column itself

  text('DATE', col.date, y, { size: 9, f: bold, color: muted })
  text('DESCRIPTION', col.desc, y, { size: 9, f: bold, color: muted })
  textRight('DURATION', col.durRight, y, { size: 9, f: bold, color: muted })
  textRight('RATE', col.rateRight, y, { size: 9, f: bold, color: muted })
  textRight('AMOUNT', col.amtRight, y, { size: 9, f: bold, color: muted })
  y -= 8
  hr(y)
  y -= 18

  const items = invoice.lineItems || []
  for (const item of items) {
    if (y < 110) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN }
    text(fmtDate(item.date), col.date, y, { size: 10 })
    text(truncateToWidth(item.description || 'Session', descMaxWidth, font, 10), col.desc, y, { size: 10 })
    textRight(item.durationLabel || '—', col.durRight, y, { size: 10 })
    textRight(item.rateLabel || '—', col.rateRight, y, { size: 10 })
    textRight(money(item.amount), col.amtRight, y, { size: 10 })
    y -= 18
  }
  if (items.length === 0) { text('No billable sessions in this period.', col.date, y, { size: 10, color: muted }); y -= 18 }

  y -= 6
  hr(y)
  y -= 26

  text('TOTAL', col.rateRight - bold.widthOfTextAtSize('TOTAL', 12), y, { size: 12, f: bold })
  textRight(money(invoice.total), col.amtRight, y, { size: 12, f: bold })
  y -= 24

  const statusLabel = invoice.status === 'paid' ? `PAID${invoice.paidDate ? ' — ' + fmtDate(invoice.paidDate) : ''}` : 'UNPAID'
  const statusColor = invoice.status === 'paid' ? rgb(0.13, 0.55, 0.3) : rgb(0.75, 0.35, 0.1)
  textRight(statusLabel, col.amtRight, y, { size: 10, f: bold, color: statusColor })

  return pdfDoc.save()
}
