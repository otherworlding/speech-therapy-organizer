import React, { useState } from 'react'

const START_HOUR = 8   // 8:00 AM
const END_HOUR = 19    // 7:00 PM
const SLOT_PX = 26     // height of a 30-min slot
const DAY_MS = 86400000

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
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh} ${ampm}`
}
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
}
function minutesFromStart(t) {
  const [h, m] = t.split(':').map(Number)
  return (h - START_HOUR) * 60 + m
}

function ApptModal({ appt, clients, clientColor, onSave, onDelete, onCancel, isNew }) {
  const [f, setF] = useState({
    clientId: appt.clientId || clients[0]?.id || '',
    time: appt.time,
    durationMins: appt.durationMins || 45,
    notes: appt.notes || '',
  })
  const client = clients.find(c => c.id === f.clientId)
  const submit = (e) => {
    e.preventDefault()
    if (!f.clientId) return
    onSave({ ...f, durationMins: Number(f.durationMins) })
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
        <p className="appt-when">{new Date(appt.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(f.time)}</p>
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
  const [openAppt, setOpenAppt] = useState(null)   // existing appt object
  const [newSlot, setNewSlot] = useState(null)     // { date, time }

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS))
  const todayStr = toDateStr(new Date())
  const totalMinutes = (END_HOUR - START_HOUR) * 60
  const colHeight = (totalMinutes / 30) * SLOT_PX

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

      <div className="cal-grid">
        {/* Hour gutter */}
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
                {/* Clickable empty slots */}
                {Array.from({ length: totalMinutes / 30 }, (_, i) => (
                  <div key={i} className="cal-slot" style={{ top: i * SLOT_PX, height: SLOT_PX }}
                    onClick={() => clickSlot(dateStr, i)} />
                ))}
                {/* Appointment blocks — no names shown, color only */}
                {apptsForDay(dateStr).map(a => {
                  const top = (minutesFromStart(a.time) / 30) * SLOT_PX
                  const height = Math.max((a.durationMins / 30) * SLOT_PX - 2, 14)
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
          clients={store.clients} clientColor={clientColor} isNew
          onSave={(f) => { store.addAppointment({ ...f, date: newSlot.date }); setNewSlot(null) }}
          onCancel={() => setNewSlot(null)}
        />
      )}

      {openAppt && (
        <ApptModal
          appt={openAppt}
          clients={store.clients} clientColor={clientColor}
          onSave={(f) => { store.updateAppointment(openAppt.id, f); setOpenAppt(null) }}
          onDelete={() => { store.deleteAppointment(openAppt.id); setOpenAppt(null) }}
          onCancel={() => setOpenAppt(null)}
        />
      )}
    </div>
  )
}
