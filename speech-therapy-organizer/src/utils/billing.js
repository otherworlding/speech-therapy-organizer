// Shared billing math/formatting used by BillingTab.jsx (per-client invoices) and
// InvoiceTrackerPage.jsx (consolidated provider invoices) — kept in one place so the
// rate-type logic (session/hourly/package) only has to be right once.

export function todayIso() { return new Date().toISOString().slice(0, 10) }
export function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
export function monthStartIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }

// Bare "YYYY-MM-DD" strings (from <input type="date">) parse as UTC midnight by
// default, which shifts a day backward once displayed in a timezone behind UTC —
// force local-midnight parsing instead so the date shown always matches what was picked.
export function fmtDate(iso) {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function money(n, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0) }
  catch { return `$${(Number(n) || 0).toFixed(2)}` }
}

// A client's billing identity — falls back to the app-wide default provider, then
// to whichever provider happens to exist first, so there's always something to bill from.
export function resolveProvider(client, providers) {
  return (providers || []).find(p => p.id === client?.providerId)
    || (providers || []).find(p => p.isDefault)
    || (providers || [])[0]
    || null
}

export function rateTypeOf(client) {
  return client.rateType || (client.billingMode === 'hourly' ? 'hourly' : 'session')
}

export const FREQUENCY_DEFAULTS = {
  'per-session': () => ({ start: todayIso(), end: todayIso() }),
  weekly: () => ({ start: daysAgoIso(6), end: todayIso() }),
  monthly: () => ({ start: monthStartIso(), end: todayIso() }),
}

// Compute billable line items for a client from actual session records in a date range —
// this is the "generated from actual session data" source of truth, not the calendar.
// For package-rate clients the sessions are still itemized (for the date record) but
// carry no individual amount — the flat package price is the invoice total instead.
export function lineItemsFor(client, sessions, start, end, currency) {
  const inRange = sessions
    .filter(s => s.clientId === client.id && s.date >= start && s.date <= (end + 'T23:59:59'))
    .sort((a, b) => a.date.localeCompare(b.date))
  const rateType = rateTypeOf(client)
  return inRange.map(s => {
    const mins = Math.round((s.duration || 0) / 60)
    const desc = (s.materialsUsed || []).length
      ? (s.materialsUsed || []).slice(0, 3).map(m => m.title).join(', ') + ((s.materialsUsed || []).length > 3 ? '…' : '')
      : 'Session'
    let amount = 0, rateLabel = '—', noAmount = false
    if (rateType === 'hourly') { amount = ((s.duration || 0) / 3600) * (Number(client.hourlyRate) || 0); rateLabel = `${money(client.hourlyRate, currency)}/hr` }
    else if (rateType === 'session') { amount = Number(client.sessionRate) || 0; rateLabel = `${money(client.sessionRate, currency)}/session` }
    else { rateLabel = 'package'; noAmount = true }   // package: itemized for the record, priced as one flat line instead
    return {
      sessionId: s.id, date: s.date, description: desc,
      durationLabel: mins ? `${mins} min` : '—',
      rateLabel, amount, noAmount,
    }
  })
}

export function computeTotal(client, items) {
  if (rateTypeOf(client) === 'package') return Number(client.packageRate) || 0
  return items.reduce((sum, i) => sum + i.amount, 0)
}

export function hasRateSet(client) {
  const t = rateTypeOf(client)
  return t === 'hourly' ? !!client.hourlyRate : t === 'package' ? !!client.packageRate : !!client.sessionRate
}
