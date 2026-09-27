import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { api } from '../api.js'
import SessionItem from '../components/SessionItem.jsx'

export default function Schedule() {
  const [week, setWeek] = useState(null)
  const [proposals, setProposals] = useState([])
  const [selected, setSelected] = useState(0)
  const [accepted, setAccepted] = useState({})

  async function refresh() {
    const w = await api.week()
    setWeek(w)
    setProposals(await api.rescheduleProposals())
  }
  useEffect(() => { refresh() }, [])

  async function applyReschedule() {
    const list = proposals.map(p => ({ ...p, accept: accepted[p.sessionId] !== false }))
    await api.applyReschedule(list)
    setProposals([])
    refresh()
  }

  function toggleAccept(id) {
    setAccepted(s => ({ ...s, [id]: s[id] === false ? true : false }))
  }

  async function completeSession(taskId) {
    await api.complete(taskId)
    await api.squadComplete()
    refresh()
  }

  async function skipSession(taskId) {
    if (!confirm('Skip this task?')) return
    await api.skip(taskId)
    refresh()
  }

  if (!week) return <div style={{padding:40}}>Loading schedule…</div>

  const today = week[selected]

  return (
    <div>
      <div className="greeting">Your week</div>
      <h1>Schedule</h1>

      {proposals.length > 0 && (
        <div className="insight-banner warning">
          <div className="insight-icon">↻</div>
          <div className="insight-text">
            <strong>{proposals.length} missed session(s) detected</strong>
            I found new slots for them. Review and accept:
            <div style={{marginTop:10, display:'flex', flexDirection:'column', gap:6}}>
              {proposals.map(p => (
                <label key={p.sessionId} style={{display:'flex', gap:10, alignItems:'center', fontSize:13, cursor:'pointer'}}>
                  <input type="checkbox" defaultChecked onChange={()=>toggleAccept(p.sessionId)} />
                  <span style={{flex:1}}>
                    <strong>{p.title}</strong> ({p.minutes}m) → {format(new Date(p.newStart), 'EEE h:mm a')}
                    <span style={{color:'var(--text-dim)', marginLeft:8}}>new load: {p.newLoadPct}%</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="insight-actions">
              <button className="small" onClick={applyReschedule}>Apply selected</button>
              <button className="small ghost" onClick={()=>setProposals([])}>Ignore</button>
            </div>
          </div>
        </div>
      )}

      <div className="week-grid" style={{marginBottom: 24}}>
        {week.map((d, i) => (
          <div key={i} className="week-day" style={selected===i?{border:'2px solid var(--accent)',cursor:'pointer'}:{cursor:'pointer'}} onClick={()=>setSelected(i)}>
            <div className="week-day-name">{format(new Date(d.date+'T00:00:00'),'EEE')}</div>
            <div className="week-day-date">{new Date(d.date+'T00:00:00').getDate()}</div>
            <div style={{fontSize:11, color:'var(--text-dim)'}}>{Math.round(d.studyMinutes/60*10)/10}h</div>
            <div className={`week-day-load load-badge load-${d.color}`}>{d.loadPct}%</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{format(new Date(today.date+'T00:00:00'), 'EEEE, MMMM d')}</h2>
          <span className={`load-badge load-${today.color}`}>{today.level} · {today.loadPct}%</span>
        </div>
        <div className="load-bar" style={{marginBottom: 20}}>
          <div className="load-bar-fill" style={{width: `${Math.min(100,today.loadPct)}%`, background: today.color==='red'?'var(--red)':today.color==='orange'?'var(--orange)':today.color==='yellow'?'var(--yellow)':'var(--green)'}}></div>
        </div>
        {today.sessions.length === 0 && <div style={{color:'var(--text-dim)'}}>Nothing scheduled.</div>}
        {today.sessions.map((s,i) => (
          <div key={i} style={{position:'relative'}}>
            <SessionItem session={s} />
            {s.taskId && !s.fixed && s.status !== 'completed' && parseISO(s.end) > new Date() && (
              <div style={{position:'absolute', right:0, top:10, display:'flex', gap:6}}>
                <button className="small ghost" onClick={()=>skipSession(s.taskId)}>Skip</button>
                <button className="small" onClick={()=>completeSession(s.taskId)}>Done</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
