import React, { useState } from 'react'
import { buildInvoicePdf } from '../utils/invoicePdf'

function money(n) { return `$${(Number(n) || 0).toFixed(2)}` }
// Same UTC-shift fix used in BillingTab.jsx/invoicePdf.js — bare "YYYY-MM-DD" strings
// need forced local-midnight parsing or they display a day early west of UTC.
function fmtDate(iso) {
  if (!iso) return ''
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function InvoiceTrackerRow({ invoice, client, store }) {
  const [busy, setBusy] = useState(false)
  const reexport = async () => {
    setBusy(true)
    try {
      const bytes = await buildInvoicePdf({ invoice, client, settings: store.settings })
      const name = (client?.name || 'client').replace(/\s/g, '-')
      await window.api.exportInvoicePdf(`Invoice-${invoice.invoiceNumber}-${name}.pdf`, bytes)
    } finally { setBusy(false) }
  }
  return (
    <div className="invoice-row">
      <div className="invoice-row-main">
        <span className="invoice-row-num">#{invoice.invoiceNumber}</span>
        <span className="invoice-row-client">{client?.name || 'Unknown client'}</span>
        <span>{fmtDate(invoice.periodStart)} – {fmtDate(invoice.periodEnd)}</span>
        <span className={`invoice-badge ${invoice.status}`}>{invoice.status === 'paid' ? '✓ Paid' : 'Unpaid'}</span>
      </div>
      <div className="invoice-row-right">
        <strong>{money(invoice.total)}</strong>
        <button className="btn-secondary" disabled={busy || !client} onClick={reexport}>📄 Re-export PDF</button>
        <button className="btn-secondary" onClick={() => store.markInvoicePaid(invoice.id, invoice.status !== 'paid')}>
          {invoice.status === 'paid' ? 'Mark Unpaid' : 'Mark Paid'}
        </button>
        <button className="btn-icon btn-delete" title="Delete invoice"
          onClick={() => { if (window.confirm(`Delete invoice #${invoice.invoiceNumber}? This can't be undone.`)) store.deleteInvoice(invoice.id) }}>🗑</button>
      </div>
    </div>
  )
}

export default function InvoiceTrackerPage({ store }) {
  const [clientFilter, setClientFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

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
            <InvoiceTrackerRow key={inv.id} invoice={inv} client={store.clients.find(c => c.id === inv.clientId)} store={store} />
          ))}
        </div>
      )}
    </div>
  )
}
