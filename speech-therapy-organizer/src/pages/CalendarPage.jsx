import React, { useState } from 'react'

const START_HOUR = 8   // 8:00 AM
const END_HOUR = 25    // 1:00 AM next day — global client base
const SLOT_PX = 22     // height of a 30-min slot
const DAY_MS = 86400000
const MY_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

const APPT_COLORS = ['#4f8ef7', '#34c97a', '#f7a84f', '#c97adb', '#f75f9f', '#3ec9c9', '#8fd14f', '#f7d94f']

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

function ApptModal({ appt, clients, clientColor, zoomLink, onSave, onDelete, onCancel, isNew }) {
  const [f, setF] = useState({
    clientId: appt.clientId || clients[0]?.id || '',
    time: appt.time,
    durationMins: appt.durationMins || 45,
    notes: appt.notes || '',
  })
  const [copied, setCopied] = useState(false)
  const client = clients.find(c => c.id === f.clientId)
  const current = { ...appt, ...f, durationMins: Number(f.durationMins) }
  const start = apptStart(current)
  const end = new Date(start.getTime() + current.durationMins * 60000)
  const clientTz = client?.timezone
  const tzDiffers = clientTz && clientTz !== MY_TZ

  const submit = (e) => {
    e.preventDefault()
    if (!f.clientId) return
    onSave({ ...f, durationMins: Number(f.durationMins) })
  }

  const copyInvite = async () => {
    await window.api?.copyToClipboard(buildInvitation({ appt: current, client, zoomLink }))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const emailInvite = () => {
    const subject = encodeURIComponent(`Speech Therapy Session — ${inTz(start, clientTz || MY_TZ)}`)
    const body = encodeURIComponent(buildInvitation({ appt: current, client, zoomLink }))
    const to = encodeURIComponent(client?.email || '')
    window.api?.openExternal(`mailto:${to}?subject=${subject}&body=${body}`)
  }
  const exportIcs = () => {
    const filename = `Session-${(client?.name || 'client').replace(/\s/g, '-')}-${current.date}.ics`
    window.api?.exportReport(filename, buildIcs({ appt: current, client, zoomLink }))
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

          <div className="appt-invite-row">
            <button type="button" className="btn-secondary" onClick={copyInvite}>{copied ? '✓ Copied' : '📋 Copy Invite'}</button>
            <button type="button" className="btn-secondary" onClick={emailInvite}>✉️ Email</button>
            <button type="button" className="btn-secondary" onClick={exportIcs}>📅 .ics File</button>
          </div>
          {!zoomLink && <div className="appt-tz-hint">Tip: paste your Zoom room link above the calendar so invites include it.</div>}

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

export default function CalendarPage({ store }) {
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()))
  const [openAppt, setOpenAppt] = useState(null)
  const [newSlot, setNewSlot] = useState(null)

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS))
  const todayStr = toDateStr(new Date())
  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const colHeight = (totalMinutes / 30) * SLOT_PX
  const zoomLink = store.settings?.zoomLink || ''

  const clientColor = (clientId) => {
    const idx = store.clients.findIndex(c => c.id === clientId)
    return APPT_COLORS[idx >= 0 ? idx % APPT_COLORS.length : 0]
  }

  const apptsForDay = (dateStr) => (store.appointments || []).filter(a => a.date === dateStr)

  const clickSlot = (dateStr, slotIdx) => {
    const mins = slotIdx * 30
    const h = START_HOUR + Math.floor(mins / 60)
    const m = mins % 60
    setNewSlot({ date: dateStr, time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` })
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
        <div className="cal-zoom-setting">
          <span>🎥 Zoom room link:</span>
          <input
            className="cal-zoom-input"
            placeholder="https://zoom.us/j/1234567890"
            defaultValue={zoomLink}
            onBlur={e => { if (e.target.value !== zoomLink) store.updateSettings({ zoomLink: e.target.value.trim() }) }}
          />
        </div>
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

      {newSlot && (
        <ApptModal
          appt={{ date: newSlot.date, time: newSlot.time, durationMins: 45 }}
          clients={store.clients} clientColor={clientColor} zoomLink={zoomLink} isNew
          onSave={(f) => { store.addAppointment({ ...f, date: newSlot.date }); setNewSlot(null) }}
          onCancel={() => setNewSlot(null)}
        />
      )}

      {openAppt && (
        <ApptModal
          appt={openAppt}
          clients={store.clients} clientColor={clientColor} zoomLink={zoomLink}
          onSave={(f) => { store.updateAppointment(openAppt.id, f); setOpenAppt(null) }}
          onDelete={() => { store.deleteAppointment(openAppt.id); setOpenAppt(null) }}
          onCancel={() => setOpenAppt(null)}
        />
      )}
    </div>
  )
}
