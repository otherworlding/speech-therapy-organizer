import React, { useState } from 'react'
import { buildInvoicePdf } from '../utils/invoicePdf'
import { fmtDate, money, resolveProvider, rateTypeOf, hasRateSet, FREQUENCY_DEFAULTS, lineItemsFor, computeTotal, todayIso } from '../utils/billing'

export { resolveProvider }

function BillingSettings({ client, store }) {
  const providers = store.providers || []
  const [form, setForm] = useState({
    providerId: client.providerId || '',
    currency: client.currency || '',
    rateType: rateTypeOf(client),
    sessionRate: client.sessionRate ?? '',
    hourlyRate: client.hourlyRate ?? '',
    packageRate: client.packageRate ?? '',
    packageSize: client.packageSize ?? '',
    billingFrequency: client.billingFrequency === 'package' ? 'per-session' : (client.billingFrequency || 'per-session'),
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
      providerId: next.providerId || null,
      currency: next.currency || null,
      rateType: next.rateType,
      sessionRate: next.sessionRate === '' ? null : Number(next.sessionRate),
      hourlyRate: next.hourlyRate === '' ? null : Number(next.hourlyRate),
      packageRate: next.packageRate === '' ? null : Number(next.packageRate),
      packageSize: next.packageSize === '' ? null : Number(next.packageSize),
      billingFrequency: next.billingFrequency,
      billTo: next.billTo,
      billToInfo: { name: next.billToName, address: next.billToAddress, contact: next.billToContact, reference: next.billToReference },
    })
  }
  const provider = resolveProvider({ ...client, providerId: form.providerId || client.providerId }, providers)

  return (
    <div className="settings-card">
      <div className="settings-card-header"><h2>⚙️ Billing Settings</h2></div>
      <div className="billing-settings-grid">
        {providers.length > 1 && (
          <label>Provider
            <select value={form.providerId} onChange={e => save({ providerId: e.target.value })}>
              <option value="">Default ({providers.find(p => p.isDefault)?.name || providers[0]?.name})</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>Currency
          <select value={form.currency} onChange={e => save({ currency: e.target.value })}>
            <option value="">Default ({provider?.currency || 'USD'})</option>
            {['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'PHP', 'INR', 'MXN', 'JPY', 'NZD', 'ZAR', 'SGD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Rate type
          <select value={form.rateType} onChange={e => save({ rateType: e.target.value })}>
            <option value="session">Per session (default)</option>
            <option value="hourly">Hourly (by session duration)</option>
            <option value="package">Package (flat rate for a bundle of sessions)</option>
          </select>
        </label>
        {form.rateType === 'session' && (
          <label>Rate per session
            <input type="number" min="0" step="0.01" value={form.sessionRate}
              onChange={e => setForm(f => ({ ...f, sessionRate: e.target.value }))}
              onBlur={() => save({})} placeholder="75.00" />
          </label>
        )}
        {form.rateType === 'hourly' && (
          <label>Hourly rate
            <input type="number" min="0" step="0.01" value={form.hourlyRate}
              onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))}
              onBlur={() => save({})} placeholder="90.00" />
          </label>
        )}
        {form.rateType === 'package' && (
          <>
            <label>Package price (flat)
              <input type="number" min="0" step="0.01" value={form.packageRate}
                onChange={e => setForm(f => ({ ...f, packageRate: e.target.value }))}
                onBlur={() => save({})} placeholder="600.00" />
            </label>
            <label>Sessions per package
              <input type="number" min="1" step="1" value={form.packageSize}
                onChange={e => setForm(f => ({ ...f, packageSize: e.target.value }))}
                onBlur={() => save({})} placeholder="8" />
            </label>
          </>
        )}
        <label>Billing frequency
          <select value={form.billingFrequency} onChange={e => save({ billingFrequency: e.target.value })}>
            <option value="per-session">Per session</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
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
      {providers.length <= 1 && providers[0] && (
        <p className="settings-note" style={{ marginTop: 10 }}>Billed as <strong>{providers[0].name}</strong> — add more providers in Settings if this client bills under a different identity (e.g. an agency).</p>
      )}
    </div>
  )
}

function NewInvoiceModal({ client, store, onClose }) {
  const defaults = (FREQUENCY_DEFAULTS[client.billingFrequency] || FREQUENCY_DEFAULTS['per-session'])()
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)
  const [billTo, setBillTo] = useState(client.billTo || 'client')
  const provider = resolveProvider(client, store.providers)
  const currency = client.currency || provider?.currency || 'USD'
  const rateType = rateTypeOf(client)
  const rateSet = hasRateSet(client)
  const items = lineItemsFor(client, store.sessions || [], start, end, currency)
  const total = computeTotal(client, items)
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
      billTo, billToSnapshot, lineItems: items, total, currency,
      isPackage: rateType === 'package',
    })
    try {
      const bytes = await buildInvoicePdf({ invoice, client, provider })
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

        {!rateSet && <div className="wizard-error" style={{ marginTop: 10 }}>⚠ No rate set yet — open Billing Settings above and set a {rateType} rate first.</div>}

        <div className="invoice-preview">
          {items.length === 0 ? (
            <div className="ws-none">No sessions found for {client.name} in this date range.</div>
          ) : (
            <table className="invoice-preview-table">
              <thead><tr><th>Date</th><th>Description</th><th>Duration</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.sessionId}>
                    <td>{fmtDate(i.date)}</td><td>{i.description}</td><td>{i.durationLabel}</td><td>{i.rateLabel}</td>
                    <td>{rateType === 'package' ? '—' : money(i.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rateType === 'package' && items.length > 0 && (
            <p className="settings-note" style={{ marginTop: 8 }}>Package rate — a flat {money(client.packageRate, currency)} covers this invoice regardless of the {items.length} session{items.length === 1 ? '' : 's'} listed above.</p>
          )}
          <div className="invoice-preview-total">Total: <strong>{money(total, currency)}</strong></div>
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
  const provider = resolveProvider(client, store.providers)
  const reexport = async () => {
    setBusy(true)
    try {
      const bytes = await buildInvoicePdf({ invoice, client, provider })
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
        <strong>{money(invoice.total, invoice.currency)}</strong>
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
  const currency = client.currency || resolveProvider(client, store.providers)?.currency || 'USD'

  return (
    <div>
      <BillingSettings client={client} store={store} />

      <div className="settings-card">
        <div className="settings-card-header">
          <h2>🧾 Invoices</h2>
          <button className="btn-primary" onClick={() => setShowNew(true)}>+ New Invoice</button>
        </div>
        {unpaidTotal > 0 && <p className="settings-note">Outstanding balance: <strong>{money(unpaidTotal, currency)}</strong></p>}
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
