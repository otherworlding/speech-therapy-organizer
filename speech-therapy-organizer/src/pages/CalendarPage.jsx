import React, { useState } from 'react'

const START_HOUR = 8   // 8:00 AM
const END_HOUR = 25    // 1:00 AM next day — global client base
const SLOT_PX = 22     // height of a 30-min slot
const DAY_MS = 86400000
const MY_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const APPT_COLORS = ['#4f8ef7', '#34c97a', '#f7a84f', '#c97adb', '#f75f9f', '#3ec9c9', '#8fd14f', '#f7d94f']
const BLOCK_PRESETS = ['Lunch', 'Personal', 'Admin', 'Vacation', 'Unavailable']

function toDateStr(d) { return d.toISOString().slice(0, 10) }
function mondayOf(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7 // Mon=0
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function fmtHour(h) {
  const hh24 = h % 24
  const ampm = hh24 >= 12 ? 'PM' : 'AM'
  const hh = hh24 % 12 === 0 ? 12 : hh24 % 12
  return `${hh} ${ampm}`
}
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const hh24 = h % 24
  const ampm = hh24 >= 12 ? 'PM' : 'AM'
  const hh = hh24 % 12 === 0 ? 12 : hh24 % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}
function minutesFromStart(t) {
  const [h, m] = t.split(':').map(Number)
  return (h - START_HOUR) * 60 + m
}
// Real Date for the appointment start (hours ≥24 roll into next day automatically)
function apptStart(a) {
  const [h, m] = a.time.split(':').map(Number)
  const d = new Date(a.date + 'T00:00:00')
  d.setHours(h, m, 0, 0)
  return d
}
function inTz(dateObj, tz, opts = {}) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', ...opts,
  }).format(dateObj)
}
function icsStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// wa.me needs digits only, international format
function waNumber(client) {
  const raw = client?.whatsapp || client?.phone || ''
  const digits = raw.replace(/[^\d]/g, '')
  return digits.length >= 7 ? digits : null
}

function openWhatsApp(client, text) {
  const num = waNumber(client)
  if (!num) return false
  window.api?.openExternal(`https://wa.me/${num}?text=${encodeURIComponent(text)}`)
  return true
}

function buildInvitation({ appt, client, zoomLink }) {
  const start = apptStart(appt)
  const end = new Date(start.getTime() + appt.durationMins * 60000)
  const lines = [
    `Speech Therapy Session — ${client?.name || ''}`,
    '',
    `Therapist's time (${MY_TZ.replace(/_/g, ' ')}): ${inTz(start, MY_TZ)} – ${inTz(end, MY_TZ, { weekday: undefined, month: undefined, day: undefined })}`,
  ]
  if (client?.timezone && client.timezone !== MY_TZ) {
    lines.push(`Your local time (${client.timezone.replace(/_/g, ' ')}): ${inTz(start, client.timezone)} – ${inTz(end, client.timezone, { weekday: undefined, month: undefined, day: undefined })}`)
  }
  lines.push('', `Length: ${appt.durationMins} minutes`)
  if (zoomLink) lines.push('', `Join Zoom: ${zoomLink}`)
  if (appt.notes) lines.push('', `Notes: ${appt.notes}`)
  return lines.join('\n')
}

function buildIcs({ appt, client, zoomLink }) {
  const start = apptStart(appt)
  const end = new Date(start.getTime() + appt.durationMins * 60000)
  const desc = buildInvitation({ appt, client, zoomLink }).replace(/\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SpeechTherapyOrganizer//EN',
    'BEGIN:VEVENT',
    `UID:${appt.id || Date.now()}@speechorg`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:Speech Therapy Session${client ? ' — ' + client.name : ''}`,
    `DESCRIPTION:${desc}`,
    zoomLink ? `LOCATION:${zoomLink}` : null,
    zoomLink ? `URL:${zoomLink}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
}

function ApptModal({ appt, clients, clientColor, zoomLink, zoomCreds, onSave, onDelete, onCancel, isNew }) {
  const [f, setF] = useState({
    clientId: appt.clientId || clients[0]?.id || '',
    time: appt.time,
    durationMins: appt.durationMins || 45,
    notes: appt.notes || '',
  })
  const [zoomInfo, setZoomInfo] = useState({
    zoomMeetingId: appt.zoomMeetingId || null,
    zoomJoinUrl: appt.zoomJoinUrl || null,
    zoomStartUrl: appt.zoomStartUrl || null,
  })
  const [zoomBusy, setZoomBusy] = useState(false)
  const [zoomError, setZoomError] = useState(null)
  const [copied, setCopied] = useState(false)
  const client = clients.find(c => c.id === f.clientId)
  const current = { ...appt, ...f, ...zoomInfo, durationMins: Number(f.durationMins) }
  const start = apptStart(current)
  const end = new Date(start.getTime() + current.durationMins * 60000)
  const clientTz = client?.timezone
  const tzDiffers = clientTz && clientTz !== MY_TZ
  // Unique meeting link wins over the personal room fallback
  const effectiveLink = zoomInfo.zoomJoinUrl || zoomLink

  const submit = (e) => {
    e.preventDefault()
    if (!f.clientId) return
    onSave({ ...f, ...zoomInfo, durationMins: Number(f.durationMins) })
  }

  const createZoomMeeting = async () => {
    setZoomBusy(true); setZoomError(null)
    const result = await window.api.zoomCreateMeeting({
      creds: zoomCreds,
      topic: `Speech Therapy — ${client?.name || 'Session'}`,
      startIso: start.toISOString(),
      durationMins: current.durationMins,
      timezone: MY_TZ,
    })
    setZoomBusy(false)
    if (result.success) {
      setZoomInfo({ zoomMeetingId: result.meetingId, zoomJoinUrl: result.joinUrl, zoomStartUrl: result.startUrl })
    } else {
      setZoomError(result.error)
    }
  }

  const copyInvite = async () => {
    await window.api?.copyToClipboard(buildInvitation({ appt: current, client, zoomLink: effectiveLink }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const emailInvite = () => {
    const subject = encodeURIComponent(`Speech Therapy Session — ${inTz(start, clientTz || MY_TZ)}`)
    const body = encodeURIComponent(buildInvitation({ appt: current, client, zoomLink: effectiveLink }))
    const to = encodeURIComponent(client?.email || '')
    window.api?.openExternal(`mailto:${to}?subject=${subject}&body=${body}`)
  }
  const whatsappInvite = () => {
    openWhatsApp(client, buildInvitation({ appt: current, client, zoomLink: effectiveLink }))
  }
  const exportIcs = () => {
    const filename = `Session-${(client?.name || 'client').replace(/\s/g, '-')}-${current.date}.ics`
    window.api?.exportReport(filename, buildIcs({ appt: current, client, zoomLink: effectiveLink }))
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>
          {isNew ? 'New Appointment' : (
            <span>
              <span className="appt-dot" style={{ background: clientColor(f.clientId) }} />
              {client?.name || 'Appointment'}
            </span>
          )}
        </h2>

        <div className="appt-tz-box">
          <div className="appt-tz-row">
            <span className="appt-tz-label">You ({MY_TZ.replace(/_/g, ' ')})</span>
            <span className="appt-tz-time">{inTz(start, MY_TZ)}</span>
          </div>
          {tzDiffers && (
            <div className="appt-tz-row appt-tz-client">
              <span className="appt-tz-label">{client.name} ({clientTz.replace(/_/g, ' ')})</span>
              <span className="appt-tz-time">{inTz(start, clientTz)}</span>
            </div>
          )}
          {!clientTz && client && (
            <div className="appt-tz-hint">Set this client's time zone in Clients → ✎ to see their local time.</div>
          )}
        </div>

        <form onSubmit={submit}>
          <label>Client *
            <select value={f.clientId} onChange={e => setF(p => ({ ...p, clientId: e.target.value }))}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Start Time
            <input type="time" value={f.time} onChange={e => setF(p => ({ ...p, time: e.target.value }))} step={300} />
          </label>
          <label>Length (minutes)
            <input type="number" min="5" max="240" step="5" value={f.durationMins}
              onChange={e => setF(p => ({ ...p, durationMins: e.target.value }))} />
          </label>
          <label>Notes
            <textarea rows={2} value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
              placeholder="Focus areas, reminders…" />
          </label>

          {zoomCreds && (
            <div className="appt-zoom-box">
              {zoomInfo.zoomJoinUrl ? (
                <div className="appt-zoom-ready">
                  <span className="zoom-badge zoom-connected">✓ Unique Zoom meeting created</span>
                  <button type="button" className="btn-primary appt-start-btn"
                    onClick={() => window.api?.openExternal(zoomInfo.zoomStartUrl)}>
                    ▶ Start Meeting
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-secondary" onClick={createZoomMeeting} disabled={zoomBusy}>
                  {zoomBusy ? 'Creating…' : '🎥 Create Zoom Meeting'}
                </button>
              )}
              {zoomError && <div className="wizard-error">⚠ {zoomError}</div>}
            </div>
          )}

          <div className="appt-invite-row">
            <button type="button" className="btn-secondary" onClick={copyInvite}>{copied ? '✓ Copied' : '📋 Copy Invite'}</button>
            <button type="button" className="btn-secondary" onClick={emailInvite}>✉️ Email</button>
            <button type="button" className="btn-secondary" onClick={whatsappInvite} disabled={!waNumber(client)}
              title={waNumber(client) ? 'Open WhatsApp with the invitation filled in' : 'Add a phone/WhatsApp number to this client first'}>
              💬 WhatsApp
            </button>
            <button type="button" className="btn-secondary" onClick={exportIcs}>📅 .ics File</button>
          </div>
          {!effectiveLink && <div className="appt-tz-hint">Tip: connect Zoom in Settings (or set a room link there) so invites include a meeting link.</div>}

          <div className="form-actions">
            {!isNew && <button type="button" className="btn-danger" onClick={onDelete}>Delete</button>}
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">{isNew ? 'Add' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Personal / unavailable time block ──
function BlockModal({ block, onSave, onDelete, onCancel, isNew }) {
  const [f, setF] = useState({
    label: block.label || 'Lunch',
    time: block.time,
    durationMins: block.durationMins || 60,
    notes: block.notes || '',
  })
  const start = apptStart({ ...block, ...f })
  const submit = (e) => {
    e.preventDefault()
    onSave({ ...f, durationMins: Number(f.durationMins) })
  }
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>⛔ {isNew ? 'Block Time Off' : 'Edit Time Block'}</h2>
        <p className="appt-when">
          {new Date(block.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(f.time)}
        </p>
        <form onSubmit={submit}>
          <label>Type
            <div className="block-preset-row">
              {BLOCK_PRESETS.map(p => (
                <button key={p} type="button"
                  className={`block-preset ${f.label === p ? 'active' : ''}`}
                  onClick={() => setF(s => ({ ...s, label: p }))}>{p}</button>
              ))}
            </div>
          </label>
          <label>Label (custom reminder)
            <input value={f.label} onChange={e => setF(s => ({ ...s, label: e.target.value }))}
              placeholder="e.g. Dentist, School pickup" />
          </label>
          <label>Start Time
            <input type="time" value={f.time} onChange={e => setF(s => ({ ...s, time: e.target.value }))} step={300} />
          </label>
          <label>Length (minutes)
            <input type="number" min="5" max="600" step="5" value={f.durationMins}
              onChange={e => setF(s => ({ ...s, durationMins: e.target.value }))} />
          </label>
          <label>Notes
            <textarea rows={2} value={f.notes} onChange={e => setF(s => ({ ...s, notes: e.target.value }))}
              placeholder="Optional reminder details…" />
          </label>
          <div className="form-actions">
            {!isNew && <button type="button" className="btn-danger" onClick={onDelete}>Delete</button>}
            <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn-primary">{isNew ? 'Block Time' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Small "what kind of entry?" chooser shown when an empty slot is clicked ──
function SlotChoice({ onPick, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-slim" onClick={e => e.stopPropagation()}>
        <h2>Add to this time</h2>
        <div className="slot-choice-row">
          <button className="slot-choice-btn" onClick={() => onPick('client')}>
            <span className="slot-choice-icon">👦</span>
            <span className="slot-choice-label">Book Client</span>
            <span className="slot-choice-sub">Appointment + invitation</span>
          </button>
          <button className="slot-choice-btn" onClick={() => onPick('block')}>
            <span className="slot-choice-icon">⛔</span>
            <span className="slot-choice-label">Block Time Off</span>
            <span className="slot-choice-sub">Lunch, personal, admin…</span>
          </button>
        </div>
        <div className="form-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function CalendarPage({ store }) {
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()))
  const [openAppt, setOpenAppt] = useState(null)
  const [newSlot, setNewSlot] = useState(null)
  const [slotChoice, setSlotChoice] = useState(null)   // { date, time } awaiting client/block pick
  const [newBlock, setNewBlock] = useState(null)
  const [openBlock, setOpenBlock] = useState(null)

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS))
  const todayStr = toDateStr(new Date())
  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const colHeight = (totalMinutes / 30) * SLOT_PX
  const zoomLink = store.settings?.zoomLink || ''
  const zoom = store.settings?.zoom || {}
  const zoomCreds = zoom.connected
    ? { accountId: zoom.accountId, clientId: zoom.clientId, clientSecret: zoom.clientSecret }
    : null
  const inviteMode = store.settings?.inviteMode || 'manual'

  // Automated mode: create the Zoom meeting and open the invitation email on booking
  const saveNewAppointment = async (f) => {
    let appt = { ...f, date: newSlot.date }
    const client = store.clients.find(c => c.id === f.clientId)
    if (inviteMode === 'auto' && zoomCreds && !appt.zoomJoinUrl) {
      const result = await window.api.zoomCreateMeeting({
        creds: zoomCreds,
        topic: `Speech Therapy — ${client?.name || 'Session'}`,
        startIso: apptStart(appt).toISOString(),
        durationMins: appt.durationMins,
        timezone: MY_TZ,
      })
      if (result.success) {
        appt = { ...appt, zoomMeetingId: result.meetingId, zoomJoinUrl: result.joinUrl, zoomStartUrl: result.startUrl }
      }
    }
    store.addAppointment(appt)
    setNewSlot(null)
    if (inviteMode === 'auto') {
      const link = appt.zoomJoinUrl || zoomLink
      const start = apptStart(appt)
      const invitation = buildInvitation({ appt, client, zoomLink: link })
      // Open the channel this family actually uses
      if (client?.preferredContact === 'whatsapp' && openWhatsApp(client, invitation)) return
      const subject = encodeURIComponent(`Speech Therapy Session — ${inTz(start, client?.timezone || MY_TZ)}`)
      const to = encodeURIComponent(client?.email || '')
      window.api?.openExternal(`mailto:${to}?subject=${subject}&body=${encodeURIComponent(invitation)}`)
    }
  }

  const removeAppointment = (appt) => {
    // Best effort: also cancel the unique Zoom meeting so it doesn't linger
    if (appt.zoomMeetingId && zoomCreds) {
      window.api.zoomDeleteMeeting({ creds: zoomCreds, meetingId: appt.zoomMeetingId })
    }
    store.deleteAppointment(appt.id)
    setOpenAppt(null)
  }

  const clientColor = (clientId) => {
    const idx = store.clients.findIndex(c => c.id === clientId)
    return APPT_COLORS[idx >= 0 ? idx % APPT_COLORS.length : 0]
  }

  // Client appointments and personal blocks share the appointments array; type separates them
  const apptsForDay = (dateStr) => (store.appointments || []).filter(a => a.date === dateStr && a.type !== 'block')
  const blocksForDay = (dateStr) => (store.appointments || []).filter(a => a.date === dateStr && a.type === 'block')

  const clickSlot = (dateStr, slotIdx) => {
    const mins = slotIdx * 30
    const h = START_HOUR + Math.floor(mins / 60)
    const m = mins % 60
    setSlotChoice({ date: dateStr, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` })
  }

  const pickSlotKind = (kind) => {
    const slot = slotChoice
    setSlotChoice(null)
    if (kind === 'client') setNewSlot(slot)
    else setNewBlock({ ...slot, label: 'Lunch', durationMins: 60 })
  }

  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>Schedule</h1>
        <div className="cal-nav">
          <button className="btn-secondary" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>‹</button>
          <button className="btn-secondary" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button>
          <button className="btn-secondary" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>›</button>
          <span className="cal-range">
            {days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="cal-settings-row">
        <span className="cal-my-tz">🌐 Your time zone: <strong>{MY_TZ.replace(/_/g, ' ')}</strong></span>
        {zoomCreds ? (
          <span className="zoom-badge zoom-connected">
            🎥 Zoom connected ✓ {inviteMode === 'auto' ? '· invitations automated' : '· click-to-send invitations'}
          </span>
        ) : (
          <div className="cal-zoom-setting">
            <span>🎥 Zoom room link:</span>
            <input
              className="cal-zoom-input"
              placeholder="https://zoom.us/j/1234567890"
              defaultValue={zoomLink}
              onBlur={e => { if (e.target.value !== zoomLink) store.updateSettings({ zoomLink: e.target.value.trim() }) }}
            />
          </div>
        )}
      </div>

      <div className="cal-grid">
        <div className="cal-gutter">
          <div className="cal-day-head" />
          <div className="cal-gutter-hours" style={{ height: colHeight }}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
              <div key={i} className="cal-hour-label" style={{ top: i * 2 * SLOT_PX }}>{fmtHour(START_HOUR + i)}</div>
            ))}
          </div>
        </div>

        {days.map(day => {
          const dateStr = toDateStr(day)
          const isToday = dateStr === todayStr
          return (
            <div key={dateStr} className={`cal-day ${isToday ? 'cal-today' : ''}`}>
              <div className="cal-day-head">
                <span className="cal-day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                <span className="cal-day-num">{day.getDate()}</span>
              </div>
              <div className="cal-day-body" style={{ height: colHeight }}>
                {Array.from({ length: totalMinutes / 30 }, (_, i) => (
                  <div key={i} className="cal-slot" style={{ top: i * SLOT_PX, height: SLOT_PX }}
                    onClick={() => clickSlot(dateStr, i)} />
                ))}
                {blocksForDay(dateStr).map(b => {
                  const top = (minutesFromStart(b.time) / 30) * SLOT_PX
                  const height = Math.max((b.durationMins / 30) * SLOT_PX - 2, 12)
                  return (
                    <div key={b.id} className="cal-block" title={`${b.label} — click to edit`}
                      style={{ top, height }}
                      onClick={e => { e.stopPropagation(); setOpenBlock(b) }}>
                      <span className="cal-block-label">⛔ {b.label}</span>
                    </div>
                  )
                })}
                {apptsForDay(dateStr).map(a => {
                  const top = (minutesFromStart(a.time) / 30) * SLOT_PX
                  const height = Math.max((a.durationMins / 30) * SLOT_PX - 2, 12)
                  return (
                    <div key={a.id} className="cal-appt" title="Click for details"
                      style={{ top, height, background: clientColor(a.clientId) }}
                      onClick={e => { e.stopPropagation(); setOpenAppt(a) }}>
                      <span className="cal-appt-time">{fmtTime(a.time)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {slotChoice && (
        <SlotChoice onPick={pickSlotKind} onCancel={() => setSlotChoice(null)} />
      )}

      {newBlock && (
        <BlockModal
          block={newBlock} isNew
          onSave={(f) => { store.addAppointment({ ...f, date: newBlock.date, type: 'block' }); setNewBlock(null) }}
          onCancel={() => setNewBlock(null)}
        />
      )}

      {openBlock && (
        <BlockModal
          block={openBlock}
          onSave={(f) => { store.updateAppointment(openBlock.id, f); setOpenBlock(null) }}
          onDelete={() => { store.deleteAppointment(openBlock.id); setOpenBlock(null) }}
          onCancel={() => setOpenBlock(null)}
        />
      )}

      {newSlot && (
        <ApptModal
          appt={{ date: newSlot.date, time: newSlot.time, durationMins: 45 }}
          clients={store.clients} clientColor={clientColor} zoomLink={zoomLink} zoomCreds={zoomCreds} isNew
          onSave={saveNewAppointment}
          onCancel={() => setNewSlot(null)}
        />
      )}

      {openAppt && (
        <ApptModal
          appt={openAppt}
          clients={store.clients} clientColor={clientColor} zoomLink={zoomLink} zoomCreds={zoomCreds}
          onSave={(f) => { store.updateAppointment(openAppt.id, f); setOpenAppt(null) }}
          onDelete={() => removeAppointment(openAppt)}
          onCancel={() => setOpenAppt(null)}
        />
      )}
    </div>
  )
}
