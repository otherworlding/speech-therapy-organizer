import React, { useState } from 'react'
import { buildInvoicePdf } from '../utils/invoicePdf'

function todayIso() { return new Date().toISOString().slice(0, 10) }
function daysAgoIso(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function monthStartIso() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
// Bare "YYYY-MM-DD" strings (from <input type="date">) parse as UTC midnight by
// default, which shifts a day backward once displayed in a timezone behind UTC —
// force local-midnight parsing instead so the date shown always matches what was picked.
function fmtDate(iso) {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function money(n) { return `$${(Number(n) || 0).toFixed(2)}` }

const FREQUENCY_DEFAULTS = {
  'per-session': () => ({ start: todayIso(), end: todayIso() }),
  weekly: () => ({ start: daysAgoIso(6), end: todayIso() }),
  monthly: () => ({ start: monthStartIso(), end: todayIso() }),
  package: () => ({ start: daysAgoIso(30), end: todayIso() }),
}

// Compute billable line items for a client from actual session records in a date range —
// this is the "generated from actual session data" source of truth, not the calendar.
function lineItemsFor(client, sessions, start, end) {
  const inRange = sessions
    .filter(s => s.clientId === client.id && s.date >= start && s.date <= (end + 'T23:59:59'))
    .sort((a, b) => a.date.localeCompare(b.date))
  const hourly = client.billingMode === 'hourly'
  return inRange.map(s => {
    const mins = Math.round((s.duration || 0) / 60)
    const desc = (s.materialsUsed || []).length
      ? (s.materialsUsed || []).slice(0, 3).map(m => m.title).join(', ') + ((s.materialsUsed || []).length > 3 ? '…' : '')
      : 'Session'
    const amount = hourly ? ((s.duration || 0) / 3600) * (Number(client.hourlyRate) || 0) : (Number(client.sessionRate) || 0)
    return {
      sessionId: s.id, date: s.date, description: desc,
      durationLabel: mins ? `${mins} min` : '—',
      rateLabel: hourly ? `${money(client.hourlyRate)}/hr` : `${money(client.sessionRate)}/session`,
      amount,
    }
  })
}

function BillingSettings({ client, store }) {
  const [form, setForm] = useState({
    billingMode: client.billingMode || 'flat',
    sessionRate: client.sessionRate ?? '',
    hourlyRate: client.hourlyRate ?? '',
    billingFrequency: client.billingFrequency || 'per-session',
    billTo: client.billTo || 'client',
    billToName: client.billToInfo?.name || '',
    billToAddress: client.billToInfo?.address || '',
    billToContact: client.billToInfo?.contact || '',
    billToReference: client.billToInfo?.reference || '',
  })
  const save = (patch) => {
    const next = { ...form, ...patch }
    setForm(next)
    store.updateClient(client.id, {
      billingMode: next.billingMode,
      sessionRate: next.sessionRate === '' ? null : Number(next.sessionRate),
      hourlyRate: next.hourlyRate === '' ? null : Number(next.hourlyRate),
      billingFrequency: next.billingFrequency,
      billTo: next.billTo,
      billToInfo: { name: next.billToName, address: next.billToAddress, contact: next.billToContact, reference: next.billToReference },
    })
  }
  return (
    <div className="settings-card">
      <div className="settings-card-header"><h2>⚙️ Billing Settings</h2></div>
      <div className="billing-settings-grid">
        <label>Rate basis
          <select value={form.billingMode} onChange={e => save({ billingMode: e.target.value })}>
            <option value="flat">Flat rate per session (default)</option>
            <option value="hourly">Hourly (by session duration)</option>
          </select>
        </label>
        {form.billingMode === 'flat' ? (
          <label>Rate per session ($)
            <input type="number" min="0" step="0.01" value={form.sessionRate}
              onChange={e => setForm(f => ({ ...f, sessionRate: e.target.value }))}
              onBlur={() => save({})} placeholder="75.00" />
          </label>
        ) : (
          <label>Hourly rate ($/hr)
            <input type="number" min="0" step="0.01" value={form.hourlyRate}
              onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
              onBlur={() => save({})} placeholder="90.00" />
          </label>
        )}
        <label>Billing frequency
          <select value={form.billingFrequency} onChange={e => save({ billingFrequency: e.target.value })}>
            <option value="per-session">Per session</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="package">Package of sessions</option>
          </select>
        </label>
        <label>Bill to
          <select value={form.billTo} onChange={e => save({ billTo: e.target.value })}>
            <option value="client">Client / family</option>
            <option value="other">Insurance provider / agency</option>
          </select>
        </label>
      </div>
      {form.billTo === 'other' && (
        <div className="billing-settings-grid" style={{ marginTop: 10 }}>
          <label>Agency / provider name
            <input value={form.billToName} onChange={e => setForm(f => ({ ...f, billToName: e.target.value }))} onBlur={() => save({})} placeholder="Bright Path Insurance" />
          </label>
          <label>Reference / policy #
            <input value={form.billToReference} onChange={e => setForm(f => ({ ...f, billToReference: e.target.value }))} onBlur={() => save({})} placeholder="POL-12345" />
          </label>
          <label>Address
            <input value={form.billToAddress} onChange={e => setForm(f => ({ ...f, billToAddress: e.target.value }))} onBlur={() => save({})} placeholder="123 Main St, Springfield" />
          </label>
          <label>Contact (email/phone)
            <input value={form.billToContact} onChange={e => setForm(f => ({ ...f, billToContact: e.target.value }))} onBlur={() => save({})} placeholder="billing@brightpath.example" />
          </label>
        </div>
      )}
      <p className="settings-note" style={{ marginTop: 10 }}>
        "Package of sessions" and "Per session" both work the same way here — pick whatever date
        range covers what you're billing for when generating an invoice below.
      </p>
    </div>
  )
}

function NewInvoiceModal({ client, store, onClose }) {
  const defaults = (FREQUENCY_DEFAULTS[client.billingFrequency] || FREQUENCY_DEFAULTS['per-session'])()
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)
  const [billTo, setBillTo] = useState(client.billTo || 'client')
  const rateSet = client.billingMode === 'hourly' ? !!client.hourlyRate : !!client.sessionRate
  const items = lineItemsFor(client, store.sessions || [], start, end)
  const total = items.reduce((sum, i) => sum + i.amount, 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const generate = async () => {
    if (!rateSet) { setStatus('⚠ Set a rate in Billing Settings first.'); return }
    setBusy(true)
    const billToSnapshot = billTo === 'other'
      ? { name: client.billToInfo?.name || 'Insurance/Agency', address: client.billToInfo?.address, contact: client.billToInfo?.contact, reference: client.billToInfo?.reference }
      : { name: client.contactName || client.name, address: client.mailingAddress || '', contact: client.email || client.phone || '', reference: '' }
    const invoice = store.addInvoice({
      clientId: client.id, issueDate: todayIso(), periodStart: start, periodEnd: end,
      billTo, billToSnapshot, lineItems: items, total,
    })
    try {
      const bytes = await buildInvoicePdf({ invoice, client, settings: store.settings })
      const filename = `Invoice-${invoice.invoiceNumber}-${client.name.replace(/\s/g, '-')}.pdf`
      const res = await window.api.exportInvoicePdf(filename, bytes)
      setBusy(false)
      if (res?.success) { setStatus(`✓ Saved to ${res.path}`); setTimeout(onClose, 1200) }
      else if (!res?.canceled) setStatus('⚠ Could not save the PDF.')
      else setStatus('Invoice saved — PDF export was canceled. You can re-export it from the invoice list.')
    } catch (e) {
      setBusy(false)
      setStatus(`⚠ ${e.message}`)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h2>New Invoice — {client.name}</h2>
        <div className="billing-settings-grid">
          <label>Period start
            <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label>Period end
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </label>
          <label>Bill to
            <select value={billTo} onChange={e => setBillTo(e.target.value)}>
              <option value="client">Client / family</option>
              <option value="other">Insurance provider / agency{!client.billToInfo?.name ? ' (not set up)' : ''}</option>
            </select>
          </label>
        </div>

        {!rateSet && <div className="wizard-error" style={{ marginTop: 10 }}>⚠ No rate set yet — open Billing Settings above and set a {client.billingMode === 'hourly' ? 'hourly' : 'per-session'} rate first.</div>}

        <div className="invoice-preview">
          {items.length === 0 ? (
            <div className="ws-none">No sessions found for {client.name} in this date range.</div>
          ) : (
            <table className="invoice-preview-table">
              <thead><tr><th>Date</th><th>Description</th><th>Duration</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.sessionId}>
                    <td>{fmtDate(i.date)}</td><td>{i.description}</td><td>{i.durationLabel}</td><td>{i.rateLabel}</td><td>{money(i.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="invoice-preview-total">Total: <strong>{money(total)}</strong></div>
        </div>

        {status && <div className="fx-status" style={{ marginTop: 10 }}>{status}</div>}

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || !rateSet} onClick={generate}>
            {busy ? 'Generating…' : '🧾 Generate PDF Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InvoiceRow({ invoice, client, store }) {
  const [busy, setBusy] = useState(false)
  const reexport = async () => {
    setBusy(true)
    try {
      const bytes = await buildInvoicePdf({ invoice, client, settings: store.settings })
      await window.api.exportInvoicePdf(`Invoice-${invoice.invoiceNumber}-${client.name.replace(/\s/g, '-')}.pdf`, bytes)
    } finally { setBusy(false) }
  }
  return (
    <div className="invoice-row">
      <div className="invoice-row-main">
        <span className="invoice-row-num">#{invoice.invoiceNumber}</span>
        <span>{fmtDate(invoice.periodStart)} – {fmtDate(invoice.periodEnd)}</span>
        <span className={`invoice-badge ${invoice.status}`}>{invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'}</span>
      </div>
      <div className="invoice-row-right">
        <strong>{money(invoice.total)}</strong>
        <button className="btn-secondary" disabled={busy} onClick={reexport}>📄 Re-export PDF</button>
        <button className="btn-secondary" onClick={() => store.markInvoicePaid(invoice.id, invoice.status !== 'paid')}>
          {invoice.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
        </button>
        <button className="btn-icon btn-delete" title="Delete invoice"
          onClick={() => { if (window.confirm(`Delete invoice #${invoice.invoiceNumber}? This can't be undone.`)) store.deleteInvoice(invoice.id) }}>🗑</button>
      </div>
    </div>
  )
}

export default function BillingTab({ store, client }) {
  const [showNew, setShowNew] = useState(false)
  const invoices = [...(store.invoices || [])].filter(i => i.clientId === client.id).sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))
  const unpaidTotal = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.total || 0), 0)

  return (
    <div>
      <BillingSettings client={client} store={store} />

      <div className="settings-card">
        <div className="settings-card-header">
          <h2>🧾 Invoices</h2>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Invoice</button>
        </div>
        {unpaidTotal > 0 && <p className="settings-note">Outstanding balance: <strong>{money(unpaidTotal)}</strong></p>}
        {invoices.length === 0 ? (
          <p className="settings-note">No invoices generated yet for {client.name}.</p>
        ) : (
          <div className="invoice-list">
            {invoices.map(inv => <InvoiceRow key={inv.id} invoice={inv} client={client} store={store} />)}
          </div>
        )}
      </div>

      {showNew && <NewInvoiceModal client={client} store={store} onClose={() => setShowNew(false)} />}
    </div>
  )
}
