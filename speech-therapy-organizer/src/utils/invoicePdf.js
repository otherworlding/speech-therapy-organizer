import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE_W = 612, PAGE_H = 792   // US Letter, points
const MARGIN = 50

function money(n, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0) }
  catch { return `$${(Number(n) || 0).toFixed(2)}` }
}
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

// Consecutive-run grouping by clientName, for a consolidated provider invoice —
// line items are already sorted client-then-date when the invoice is generated.
function groupByClient(items) {
  const groups = []
  for (const item of items) {
    const last = groups[groups.length - 1]
    if (last && last.clientName === (item.clientName || '')) last.items.push(item)
    else groups.push({ clientName: item.clientName || '', items: [item] })
  }
  return groups
}

// Build a one-page (auto-extends if needed) PDF invoice as bytes, ready to hand to the
// invoice:export IPC call for saving.
// `invoice` — a store invoice record (lineItems/total/invoiceNumber/currency/isPackage,
//   and for a consolidated invoice each line item also carries `clientName`).
// `client` — the single billed client (per-client invoices only; omit for a provider invoice).
// `provider` — the billing identity: name/logo/currency/billFrom, resolved by the caller
//   (BillingTab's resolveProvider, or the selected provider for a consolidated invoice).
export async function buildInvoicePdf({ invoice, client, provider }) {
  const pdfDoc = await PDFDocument.create()
  let page = pdfDoc.addPage([PAGE_W, PAGE_H])
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const brandName = provider?.name?.trim() || 'Speech Therapy Organizer'
  const logoImg = await embedLogo(pdfDoc, provider?.logoPath)
  const currency = invoice.currency || provider?.currency || 'USD'

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
  const newPageIfNeeded = () => { if (y < 110) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN } }

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

  // ── From (provider bill-from) / Bill To — two columns ──
  const colX = { from: MARGIN, to: PAGE_W / 2 + 10 }
  const topY = y
  const bf = provider?.billFrom || {}
  text('FROM', colX.from, y, { size: 9, f: bold, color: muted })
  const billTo = invoice.billToSnapshot || {}
  text('BILL TO', colX.to, y, { size: 9, f: bold, color: muted })
  y -= 16
  let yFrom = y, yTo = y
  text(brandName, colX.from, yFrom, { size: 12, f: bold }); yFrom -= 15
  text(billTo.name || client?.name || '', colX.to, yTo, { size: 12, f: bold }); yTo -= 15
  const fromLines = [...String(bf.address || '').split('\n').map(l => l.trim()).filter(Boolean), bf.contact, bf.email, bf.phone].filter(Boolean)
  for (const l of fromLines) { text(l, colX.from, yFrom, { size: 10, color: muted }); yFrom -= 14 }
  // Address may be a multi-line mailing address (from a textarea) — split it out
  // into its own lines rather than running it together with contact/reference.
  const toLines = [
    ...String(billTo.address || '').split('\n').map(l => l.trim()).filter(Boolean),
    billTo.contact, billTo.reference ? `Ref/Policy #: ${billTo.reference}` : null,
  ].filter(Boolean)
  for (const l of toLines) { text(l, colX.to, yTo, { size: 10, color: muted }); yTo -= 14 }
  y = Math.min(yFrom, yTo) - 8

  text(`Billing period: ${fmtDate(invoice.periodStart)} – ${fmtDate(invoice.periodEnd)}`, MARGIN, y, { size: 10, color: muted })
  y -= 26

  // ── Line items table ──
  // Fixed column geometry with real gaps between columns (an earlier version packed
  // DESCRIPTION right up against DURATION/RATE/AMOUNT with no reserved width, so any
  // description longer than ~2 words visibly overlapped the numeric columns).
  const usableRight = PAGE_W - MARGIN
  const col = {
    date: MARGIN, desc: MARGIN + 75,
    durRight: usableRight - 155, rateRight: usableRight - 75, amtRight: usableRight,
  }
  const descMaxWidth = (col.durRight - 60) - col.desc - 10   // leaves room for the DURATION column itself

  const drawHeader = () => {
    text('DATE', col.date, y, { size: 9, f: bold, color: muted })
    text('DESCRIPTION', col.desc, y, { size: 9, f: bold, color: muted })
    textRight('DURATION', col.durRight, y, { size: 9, f: bold, color: muted })
    textRight('RATE', col.rateRight, y, { size: 9, f: bold, color: muted })
    textRight('AMOUNT', col.amtRight, y, { size: 9, f: bold, color: muted })
    y -= 8
    hr(y)
    y -= 18
  }
  const drawItemRow = (item) => {
    newPageIfNeeded()
    text(fmtDate(item.date), col.date, y, { size: 10 })
    text(truncateToWidth(item.description || 'Session', descMaxWidth, font, 10), col.desc, y, { size: 10 })
    textRight(item.durationLabel || '—', col.durRight, y, { size: 10 })
    textRight(item.rateLabel || '—', col.rateRight, y, { size: 10 })
    textRight((invoice.isPackage || item.noAmount) ? '—' : money(item.amount, currency), col.amtRight, y, { size: 10 })
    y -= 18
  }

  const items = invoice.lineItems || []
  drawHeader()

  if (invoice.kind === 'provider') {
    // Consolidated invoice — group line items under a bold client-name subheader,
    // each showing that client's actual session dates, with a per-client subtotal.
    const groups = groupByClient(items)
    if (groups.length === 0) { text('No billable sessions in this period.', col.date, y, { size: 10, color: muted }); y -= 18 }
    for (const g of groups) {
      newPageIfNeeded()
      text(g.clientName || 'Client', col.date, y, { size: 10, f: bold }); y -= 16
      for (const item of g.items) drawItemRow(item)
      if (!invoice.isPackage) {
        const subtotal = g.items.reduce((s, i) => s + (i.amount || 0), 0)
        newPageIfNeeded()
        textRight(`Subtotal — ${money(subtotal, currency)}`, col.amtRight, y, { size: 9, color: muted })
        y -= 18
      }
      y -= 4
    }
  } else {
    if (items.length === 0) { text('No billable sessions in this period.', col.date, y, { size: 10, color: muted }); y -= 18 }
    for (const item of items) drawItemRow(item)
  }

  y -= 6
  hr(y)
  y -= 26

  text('TOTAL', col.rateRight - bold.widthOfTextAtSize('TOTAL', 12), y, { size: 12, f: bold })
  textRight(money(invoice.total, currency), col.amtRight, y, { size: 12, f: bold })
  y -= 24

  const statusLabel = invoice.status === 'paid' ? `PAID${invoice.paidDate ? ' — ' + fmtDate(invoice.paidDate) : ''}` : 'UNPAID'
  const statusColor = invoice.status === 'paid' ? rgb(0.13, 0.55, 0.3) : rgb(0.75, 0.35, 0.1)
  textRight(statusLabel, col.amtRight, y, { size: 10, f: bold, color: statusColor })

  return pdfDoc.save()
}
