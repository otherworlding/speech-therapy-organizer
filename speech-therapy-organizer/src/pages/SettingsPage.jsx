import React, { useState, useEffect } from 'react'

const MARKETPLACE_URL = 'https://marketplace.zoom.us/develop/create'

const WIZARD_STEPS = [
  {
    title: 'Sign in to Zoom',
    body: 'Click the button below — it opens the Zoom App Marketplace in your web browser. Sign in with the SAME Zoom account you use for therapy sessions.',
    action: { label: 'Open Zoom App Marketplace →', url: MARKETPLACE_URL },
  },
  {
    title: 'Create the connection app',
    body: 'On the Zoom page, find the box called "Server-to-Server OAuth" and click its Create button. Give it any name you like — for example "Therapy Scheduler" — and click Create again.',
  },
  {
    title: 'Copy the three codes',
    body: 'Zoom now shows a page with three codes: Account ID, Client ID, and Client Secret. Keep that browser page open and copy each code into the boxes below. (For Client Secret you may need to click "Copy" next to a hidden value.)',
  },
  {
    title: 'Add permission + activate',
    body: 'Still on the Zoom page: open the "Scopes" tab, click Add Scopes, search for "meeting", and tick "Create a meeting for a user" (meeting:write). Then go to the "Activation" tab and click Activate. Now click Test Connection below.',
  },
]

function looksValid(v) { return v.trim().length >= 8 && !/\s/.test(v.trim()) }

function fmtBackupDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const days = Math.round((Date.now() - d.getTime()) / 86400000)
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (days === 0) return `${label} (today)`
  if (days === 1) return `${label} (yesterday)`
  return `${label} (${days} days ago)`
}

function BackupsCard() {
  const [autoBackups, setAutoBackups] = useState([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)

  const refresh = () => window.api?.listAutoBackups().then(list => setAutoBackups(list || []))
  useEffect(() => { refresh() }, [])

  const restoreAuto = async (filename) => {
    if (!window.confirm(`Restore the backup from ${filename.slice(5, 15)}? Your current data will be saved as a safety copy first, then replaced.`)) return
    setBusy(true)
    const res = await window.api.restoreAutoBackup(filename)
    setBusy(false)
    if (res.success) { setStatus('✓ Restored — reload the app to see the restored data.'); refresh() }
    else setStatus(`⚠ ${res.error}`)
  }

  const backupNow = async () => {
    setBusy(true)
    const res = await window.api.backupExport()
    setBusy(false)
    if (res.success) setStatus(`✓ Backup saved to ${res.path}`)
    else if (!res.canceled) setStatus(`⚠ ${res.error}`)
  }

  const restoreFromFile = async () => {
    if (!window.confirm('Restore from a backup file? This replaces all current clients, materials, and sessions. Your current data will be saved as a safety copy first.')) return
    setBusy(true)
    const res = await window.api.backupImport()
    setBusy(false)
    if (res.success) setStatus(`✓ Restored ${res.filesRestored} file(s) — reload the app to see the restored data.`)
    else if (!res.canceled) setStatus(`⚠ ${res.error}`)
  }

  return (
    <div className="settings-card">
      <div className="settings-card-header"><h2>🗄 Backups</h2></div>
      <p className="settings-note">
        Every change is saved safely (crash-proof writes), and a dated snapshot is kept automatically
        once a day for the last {autoBackups.length ? '30' : '—'} days. Use "Back Up Everything" for a
        portable copy — e.g. before switching computers.
      </p>

      {status && <div className="fx-status" style={{ marginTop: 10 }}>{status}</div>}

      <div className="settings-divider" />
      <div className="backup-actions">
        <button className="btn-primary" onClick={backupNow} disabled={busy}>💾 Back Up Everything Now</button>
        <button className="btn-secondary" onClick={restoreFromFile} disabled={busy}>📂 Restore from Backup File…</button>
      </div>

      <div className="settings-divider" />
      <div className="settings-toggle-label" style={{ marginBottom: 8 }}>Automatic Daily Snapshots</div>
      {autoBackups.length === 0 ? (
        <p className="settings-note">No automatic snapshots yet — one is taken each day you use the app.</p>
      ) : (
        <div className="backup-list">
          {autoBackups.map(b => (
            <div key={b.filename} className="backup-row">
              <span>{fmtBackupDate(b.date)}</span>
              <button className="btn-secondary" disabled={busy} onClick={() => restoreAuto(b.filename)}>Restore this version</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage({ store }) {
  const zoom = store.settings?.zoom || {}
  const connected = !!zoom.connected
  const inviteMode = store.settings?.inviteMode || 'manual'

  const [step, setStep] = useState(0)
  const [creds, setCreds] = useState({ accountId: '', clientId: '', clientSecret: '' })
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const allFilled = looksValid(creds.accountId) && looksValid(creds.clientId) && looksValid(creds.clientSecret)

  const testConnection = async () => {
    setTesting(true); setTestError(null)
    const result = await window.api.zoomTest({
      accountId: creds.accountId.trim(), clientId: creds.clientId.trim(), clientSecret: creds.clientSecret.trim(),
    })
    setTesting(false)
    if (result.success) {
      store.updateSettings({
        zoom: {
          accountId: creds.accountId.trim(), clientId: creds.clientId.trim(), clientSecret: creds.clientSecret.trim(),
          connected: true, email: result.email, name: result.name, planType: result.planType,
        },
      })
      setWizardOpen(false)
      setCreds({ accountId: '', clientId: '', clientSecret: '' })
      setStep(0)
    } else {
      setTestError(result.error)
    }
  }

  const disconnect = () => {
    store.updateSettings({ zoom: {} })
  }

  return (
    <div className="page">
      <div className="page-header"><h1>Settings</h1></div>

      {/* ── Zoom integration ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2>🎥 Zoom Integration</h2>
          {connected && <span className="zoom-badge zoom-connected">✓ Connected</span>}
        </div>

        {!connected && !wizardOpen && (
          <div className="settings-intro">
            <p>
              Connecting Zoom builds the <strong>invitation and scheduling process right into your
              appointment calendar</strong>. When you book a client, the app creates a unique Zoom
              meeting for that session, puts the link in the invitation, and gives you a one-click
              "Start Meeting" button when it's time.
            </p>
            <p className="settings-note">
              One-time setup, about 10 minutes. You'll copy three codes from Zoom's website into this app.
              The codes are stored only on this computer.
            </p>
            <button className="btn-primary" onClick={() => setWizardOpen(true)}>Set Up Zoom Connection</button>
            <p className="settings-note" style={{ marginTop: 10 }}>
              Not ready? The calendar still works — invitations use your personal Zoom room link (set on the Schedule page).
            </p>
          </div>
        )}

        {!connected && wizardOpen && (
          <div className="zoom-wizard">
            <div className="wizard-progress">
              {WIZARD_STEPS.map((_, i) => (
                <div key={i} className={`wizard-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>{i < step ? '✓' : i + 1}</div>
              ))}
            </div>
            <h3 className="wizard-title">Step {step + 1}: {WIZARD_STEPS[step].title}</h3>
            <p className="wizard-body">{WIZARD_STEPS[step].body}</p>
            {WIZARD_STEPS[step].action && (
              <button className="btn-secondary" onClick={() => window.api.openExternal(WIZARD_STEPS[step].action.url)}>
                {WIZARD_STEPS[step].action.label}
              </button>
            )}

            {step >= 2 && (
              <div className="wizard-creds">
                <label>Account ID
                  <input value={creds.accountId} onChange={e => setCreds(c => ({ ...c, accountId: e.target.value }))} placeholder="paste Account ID here" />
                </label>
                <label>Client ID
                  <input value={creds.clientId} onChange={e => setCreds(c => ({ ...c, clientId: e.target.value }))} placeholder="paste Client ID here" />
                </label>
                <label>Client Secret
                  <input value={creds.clientSecret} onChange={e => setCreds(c => ({ ...c, clientSecret: e.target.value }))} placeholder="paste Client Secret here" />
                </label>
              </div>
            )}

            {testError && (
              <div className="wizard-error">
                ⚠ {testError}
                <div className="wizard-error-hint">Double-check the three codes, and make sure the app is Activated (Step 4).</div>
              </div>
            )}

            <div className="form-actions">
              <button className="btn-secondary" onClick={() => { setWizardOpen(false); setStep(0); setTestError(null) }}>Cancel</button>
              {step > 0 && <button className="btn-secondary" onClick={() => setStep(s => s - 1)}>‹ Back</button>}
              {step < WIZARD_STEPS.length - 1 && (
                <button className="btn-primary" onClick={() => setStep(s => s + 1)}>Next ›</button>
              )}
              {step === WIZARD_STEPS.length - 1 && (
                <button className="btn-primary" onClick={testConnection} disabled={!allFilled || testing}>
                  {testing ? 'Testing…' : '✓ Test Connection'}
                </button>
              )}
            </div>
          </div>
        )}

        {connected && (
          <div className="zoom-connected-panel">
            <div className="zoom-account-row">
              <span>Connected account:</span>
              <strong>{zoom.name || zoom.email}</strong>
              <span className="zoom-email">{zoom.email}</span>
            </div>
            <div className="zoom-account-row">
              <span>Plan:</span>
              {zoom.planType === 1 ? (
                <span className="zoom-badge zoom-warn">Basic (free) — meetings end after 40 minutes</span>
              ) : (
                <span className="zoom-badge zoom-ok">Licensed — no meeting time limit</span>
              )}
            </div>
            {zoom.planType === 1 && (
              <p className="settings-note">
                ⚠ Free Zoom cuts meetings off at 40 minutes. For 45-minute sessions, consider upgrading
                the Zoom plan, or set session length to 40 minutes or less.
              </p>
            )}

            <div className="settings-divider" />

            <div className="settings-toggle-row">
              <div>
                <div className="settings-toggle-label">Invitations</div>
                <div className="settings-note">
                  {inviteMode === 'auto'
                    ? 'Automated: booking an appointment creates the Zoom meeting and opens the invitation email — ready to send.'
                    : 'Click to send: you create the Zoom meeting and send invitations with buttons on each appointment.'}
                </div>
              </div>
              <div className="mode-switch">
                <button className={`open-mode-btn ${inviteMode === 'auto' ? 'active' : ''}`}
                  onClick={() => store.updateSettings({ inviteMode: 'auto' })}>Automated</button>
                <button className={`open-mode-btn ${inviteMode === 'manual' ? 'active' : ''}`}
                  onClick={() => store.updateSettings({ inviteMode: 'manual' })}>Click to send</button>
              </div>
            </div>

            <div className="settings-divider" />
            <button className="btn-secondary" onClick={disconnect}>Disconnect Zoom</button>
          </div>
        )}
      </div>

      {/* ── Fallback personal room link ── */}
      <div className="settings-card">
        <div className="settings-card-header"><h2>🔗 Personal Zoom Room (fallback)</h2></div>
        <p className="settings-note">
          Used in invitations when no unique meeting was created for an appointment.
        </p>
        <input
          className="cal-zoom-input" style={{ maxWidth: 420 }}
          placeholder="https://zoom.us/j/1234567890"
          defaultValue={store.settings?.zoomLink || ''}
          onBlur={e => { if (e.target.value !== (store.settings?.zoomLink || '')) store.updateSettings({ zoomLink: e.target.value.trim() }) }}
        />
      </div>

      {/* ── Backups ── */}
      <BackupsCard />
    </div>
  )
}
