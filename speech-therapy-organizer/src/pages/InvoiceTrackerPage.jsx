import React, { useState } from 'react'
import { buildInvoicePdf } from '../utils/invoicePdf'
import { fmtDate, money, resolveProvider, lineItemsFor, computeTotal, todayIso, daysAgoIso, monthStartIso } from '../utils/billing'

function InvoiceTrackerRow({ invoice, client, provider, store }) {
  const [busy, setBusy] = useState(false)
  const isProvider = invoice.kind === 'provider'
  const reexport = async () => {
    setBusy(true)
    try {
      const bytes = await buildInvoicePdf({ invoice, client, provider })
      const name = (isProvider ? provider?.name : client?.name) || 'invoice'
      await window.api.exportInvoicePdf(`Invoice-${invoice.invoiceNumber}-${name.replace(/\s/g, '-')}.pdf`, bytes)
    } finally { setBusy(false) }
  }
  return (
    <div className="invoice-row">
      <div className="invoice-row-main">
        <span className="invoice-row-num">#{invoice.invoiceNumber}</span>
        <span className="invoice-row-client">
          {isProvider ? `🏢 ${provider?.name || 'Provider'} — ${(invoice.clientIds || []).length} client${(invoice.clientIds || []).length === 1 ? '' : 's'}` : (client?.name || 'Unknown client')}
        </span>
        <span>{fmtDate(invoice.periodStart)} – {fmtDate(invoice.periodEnd)}</span>
        <span className={`invoice-badge ${invoice.status}`}>{invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'}</span>
      </div>
      <div className="invoice-row-right">
        <strong>{money(invoice.total, invoice.currency)}</strong>
        <button className="btn-secondary" disabled={busy || (!client && !isProvider)} onClick={reexport}>📄 Re-export PDF</button>
        <button className="btn-secondary" onClick={() => store.markInvoicePaid(invoice.id, invoice.status !== 'paid')}>
          {invoice.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
        </button>
        <button className="btn-icon btn-delete" title="Delete invoice"
          onClick={() => { if (window.confirm(`Delete invoice #${invoice.invoiceNumber}? This can't be undone.`)) store.deleteInvoice(invoice.id) }}>🗑</button>
      </div>
    </div>
  )
}

const FREQ_DEFAULTS = {
  'per-session': () => ({ start: todayIso(), end: todayIso() }),
  weekly: () => ({ start: daysAgoIso(6), end: todayIso() }),
  monthly: () => ({ start: monthStartIso(), end: todayIso() }),
}

// Combine every client billed to one provider into a single periodic invoice —
// for a therapist subcontracted by an agency who bills that agency once per
// week/month for all their clients' sessions, itemized by client with real dates.
function ProviderInvoiceModal({ provider, store, onClose }) {
  const clients = store.clients.filter(c => resolveProvider(c, store.providers)?.id === provider.id)
  const defaults = FREQ_DEFAULTS.weekly()
  const [start, setStart] = useState(defaults.start)
  const [end, setEnd] = useState(defaults.end)
  const [billTo, setBillTo] = useState({ name: '', address: '', contact: '', reference: '' })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const currency = provider.currency || 'USD'

  const groups = clients.map(c => {
    const items = lineItemsFor(c, store.sessions || [], start, end, currency).map(i => ({ ...i, clientName: c.name }))
    return { client: c, items, subtotal: computeTotal(c, items) }
  }).filter(g => g.items.length > 0)
  const total = groups.reduce((s, g) => s + g.subtotal, 0)
  const allLineItems = groups.flatMap(g => {
    const rateType = g.client.rateType || (g.client.billingMode === 'hourly' ? 'hourly' : 'session')
    if (rateType === 'package') {
      return [...g.items, { clientName: g.client.name, date: end, description: `Package rate (${g.client.packageSize || ''} sessions)`.trim(), durationLabel: '—', rateLabel: 'package', amount: g.subtotal, noAmount: false }]
    }
    return g.items
  })

  const generate = async () => {
    if (groups.length === 0) { setStatus('⚠ No billable sessions for any client under this provider in this range.'); return }
    setBusy(true)
    const invoice = store.addInvoice({
      kind: 'provider', providerId: provider.id, clientIds: groups.map(g => g.client.id),
      issueDate: todayIso(), periodStart: start, periodEnd: end,
      billTo: 'other', billToSnapshot: billTo, lineItems: allLineItems, total, currency,
    })
    try {
      const bytes = await buildInvoicePdf({ invoice, provider })
      const res = await window.api.exportInvoicePdf(`Invoice-${invoice.invoiceNumber}-${provider.name.replace(/\s/g, '-')}.pdf`, bytes)
      setBusy(false)
      if (res?.success) { setStatus(`✓ Saved to ${res.path}`); setTimeout(onClose, 1200) }
      else if (!res?.canceled) setStatus('⚠ Could not save the PDF.')
      else setStatus('Invoice saved — PDF export was canceled. You can re-export it from the list below.')
    } catch (e) {
      setBusy(false)
      setStatus(`⚠ ${e.message}`)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h2>New Consolidated Invoice — {provider.name}</h2>
        <div className="billing-settings-grid">
          <label>Period start
            <input type="date" value={start} onChange={e => setStart(e.target.value)} />
          </label>
          <label>Period end
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="billing-settings-grid" style={{ marginTop: 10 }}>
          <label>Bill to (name)
            <input value={billTo.name} onChange={e => setBillTo(b => ({ ...b, name: e.target.value }))} placeholder="Agency name" />
          </label>
          <label>Reference / contract #
            <input value={billTo.reference} onChange={e => setBillTo(b => ({ ...b, reference: e.target.value }))} placeholder="optional" />
          </label>
          <label>Address
            <input value={billTo.address} onChange={e => setBillTo(b => ({ ...b, address: e.target.value }))} placeholder="123 Main St, Springfield" />
          </label>
          <label>Contact (email/phone)
            <input value={billTo.contact} onChange={e => setBillTo(b => ({ ...b, contact: e.target.value }))} placeholder="billing@agency.example" />
          </label>
        </div>

        <div className="invoice-preview">
          {groups.length === 0 ? (
            <div className="ws-none">No clients under {provider.name} have billable sessions in this range.</div>
          ) : groups.map(g => (
            <div key={g.client.id} style={{ marginBottom: 14 }}>
              <div className="provider-group-name">{g.client.name}</div>
              <table className="invoice-preview-table">
                <thead><tr><th>Date</th><th>Description</th><th>Duration</th><th>Rate</th><th>Amount</th></tr></thead>
                <tbody>
                  {g.items.map(i => (
                    <tr key={i.sessionId}>
                      <td>{fmtDate(i.date)}</td><td>{i.description}</td><td>{i.durationLabel}</td><td>{i.rateLabel}</td>
                      <td>{i.noAmount ? '—' : money(i.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="invoice-preview-total" style={{ fontSize: 13 }}>Subtotal — {g.client.name}: <strong>{money(g.subtotal, currency)}</strong></div>
            </div>
          ))}
          <div className="invoice-preview-total">Grand Total: <strong>{money(total, currency)}</strong></div>
        </div>

        {status && <div className="fx-status" style={{ marginTop: 10 }}>{status}</div>}

        <div className="form-actions">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || groups.length === 0} onClick={generate}>
            {busy ? 'Generating…' : '🧾 Generate Consolidated PDF Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InvoiceTrackerPage({ store }) {
  const [clientFilter, setClientFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [providerModal, setProviderModal] = useState(null)

  const consolidatingProviders = (store.providers || []).filter(p => p.consolidateInvoices)

  const all = store.invoices || []
  let invoices = clientFilter === 'all' ? all : all.filter(i => i.clientId === clientFilter)
  if (statusFilter !== 'all') invoices = invoices.filter(i => i.status === statusFilter)
  invoices = [...invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''))

  const totalAll = all.reduce((s, i) => s + (i.total || 0), 0)
  const totalPaid = all.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0)
  const totalUnpaid = totalAll - totalPaid

  return (
    <div className="page">
      <div className="page-header">
        <h1>🧾 Invoice Tracker</h1>
      </div>

      <div className="invoice-summary-row">
        <div className="invoice-summary-card">
          <div className="invoice-summary-label">Total Invoiced</div>
          <div className="invoice-summary-value">{money(totalAll)}</div>
        </div>
        <div className="invoice-summary-card">
          <div className="invoice-summary-label">Paid</div>
          <div className="invoice-summary-value paid">{money(totalPaid)}</div>
        </div>
        <div className="invoice-summary-card">
          <div className="invoice-summary-label">Outstanding</div>
          <div className="invoice-summary-value unpaid">{money(totalUnpaid)}</div>
        </div>
      </div>

      {/* Consolidated (agency) invoicing — only shown once a provider opts in via Settings */}
      <div className="settings-card">
        <div className="settings-card-header"><h2>🏢 Consolidated Provider Invoices</h2></div>
        {consolidatingProviders.length === 0 ? (
          <p className="settings-note">
            No provider is set up to combine clients onto one invoice yet. Enable
            "Combine all clients billed to this provider" on a provider in Settings → Providers
            — useful if you're subcontracted by an agency and bill them once per period for
            several clients' sessions.
          </p>
        ) : (
          <div className="backup-actions">
            {consolidatingProviders.map(p => (
              <button key={p.id} className="btn-primary" onClick={() => setProviderModal(p)}>+ New Invoice for {p.name}</button>
            ))}
          </div>
        )}
      </div>

      <div className="filter-bar">
        <select className="search-input" value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="all">All Clients</option>
          {store.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="filter-tabs">
          {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid']].map(([k, label]) => (
            <button key={k} className={`filter-tab ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{label}</button>
          ))}
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🧾</div>
          <p>
            {clientFilter !== 'all' || statusFilter !== 'all'
              ? 'No invoices match this filter.'
              : "No invoices yet — generate one from a client's Billing tab."}
          </p>
        </div>
      ) : (
        <div className="invoice-list">
          {invoices.map(inv => (
            <InvoiceTrackerRow key={inv.id} invoice={inv}
              client={store.clients.find(c => c.id === inv.clientId)}
              provider={(store.providers || []).find(p => p.id === inv.providerId)}
              store={store} />
          ))}
        </div>
      )}

      {providerModal && <ProviderInvoiceModal provider={providerModal} store={store} onClose={() => setProviderModal(null)} />}
    </div>
  )
}
