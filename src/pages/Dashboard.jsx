import React, { useEffect, useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { api } from '../api.js'
import TaskInput from '../components/TaskInput.jsx'
import SessionItem from '../components/SessionItem.jsx'

export default function Dashboard({ user, onCreateResult, onStartOnboarding }) {
  const [today, setToday] = useState(null)
  const [insights, setInsights] = useState([])
  const [consistency, setConsistency] = useState(null)
  const [opportunities, setOpportunities] = useState([])
  const [debt, setDebt] = useState([])
  const [squad, setSquad] = useState(null)
  const [nudge, setNudge] = useState('')

  async function refresh() {
    const [t, ins, c, opps, d, sq, nd] = await Promise.all([
      api.today(), api.insights(), api.consistency(),
      api.opportunities(), api.planningDebt(), api.squad(), api.nudge()
    ])
    setToday(t); setInsights(ins); setConsistency(c); setOpportunities(opps); setDebt(d); setSquad(sq); setNudge(nd.text)
  }

  useEffect(() => { refresh() }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  async function applyOpportunity(opp) {
    // Quick-accept: create tasks for the suggested items
    for (const s of opp.suggestions) {
      await api.createTask({ title: s.title, estimatedMinutes: s.minutes, category: 'study' })
    }
    refresh()
  }

  async function handleSplit(tsk) {
    await api.split(tsk.id); refresh()
  }

  return (
    <div>
      <div className="greeting">{greeting}, {user.name} 👋</div>
      <h1>Here's your day</h1>

      {insights.length > 0 && (
        <div className={`insight-banner ${insights[0].type}`}>
          <div className="insight-icon">{insights[0].type === 'warning' ? '⚠️' : insights[0].type === 'positive' ? '✨' : '💡'}</div>
          <div className="insight-text">
            <strong>AI Insight</strong>
            {insights[0].text}
            <div className="insight-actions">
              <button className="small" onClick={() => window.location.hash = '#/schedule'}>View schedule</button>
              <button className="small ghost" onClick={refresh}>Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <TaskInput onCreated={() => { refresh() }} onCreateResult={onCreateResult} />

      <div className="grid cols-3" style={{ marginBottom: 20 }}>
        {today && (
          <div className="card">
            <div className="card-header">
              <h3>Today's Load</h3>
              <span className={`load-badge load-${today.color}`}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'currentColor'}}></span>
                {today.level}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{today.loadPct}%</div>
            <div className="load-bar">
              <div className="load-bar-fill" style={{width: `${Math.min(100,today.loadPct)}%`, background: today.color === 'red' ? 'var(--red)' : today.color === 'orange' ? 'var(--orange)' : today.color === 'yellow' ? 'var(--yellow)' : 'var(--green)'}}></div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
              {Math.round(today.studyMinutes/60*10)/10}h planned · {Math.round(today.budgetMinutes/60*10)/10}h capacity
            </div>
          </div>
        )}
        {consistency && (
          <div className="card">
            <h3>This Week</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="metric"><div className="metric-value">{consistency.onTimeRate}%</div><div className="metric-label">On-time</div></div>
              <div className="metric"><div className="metric-value">{consistency.recovery}%</div><div className="metric-label">Recovery</div></div>
              <div className="metric"><div className="metric-value">🔥{consistency.streak}</div><div className="metric-label">Streak</div></div>
              <div className="metric"><div className="metric-value">{consistency.accuracy || '—'}%</div><div className="metric-label">Accuracy</div></div>
            </div>
          </div>
        )}
        {squad && (
          <div className="card">
            <div className="card-header"><h3>{squad.name}</h3><span className="chip">#{squad.invite_code}</span></div>
            {squad.members.slice(0,3).map(m => (
              <div key={m.display_name} className="squad-member">
                <div className="squad-avatar">{m.display_name[0]}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{m.display_name} {m.is_you ? '(you)' : ''}</div>
                  <div style={{fontSize:11,color:'var(--text-dim)'}}>🔥 {m.streak_days}-day streak</div>
                </div>
              </div>
            ))}
            <div style={{fontSize:12,color:'var(--text-dim)',marginTop:8}}>Challenge: {squad.weekTotal}/{squad.weekGoal} tasks</div>
            <div className="progress-bar"><div className="progress-fill" style={{width: `${Math.min(100,(squad.weekTotal/squad.weekGoal)*100)}%`}}></div></div>
          </div>
        )}
      </div>

      {debt.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>⚠️ Planning Debt Detected</h3>
          </div>
          {debt.slice(0,2).map(d => (
            <div key={d.id} className="debt-card">
              <div style={{fontWeight:600, marginBottom:4}}>{d.title}</div>
              <div style={{fontSize:13,color:'var(--text-dim)',marginBottom:10}}>
                Postponed {d.postponed_count} times. This may be too large or unclear.
              </div>
              <button className="small" onClick={() => handleSplit(d)}>Break into smaller steps</button>
            </div>
          ))}
        </div>
      )}

      {opportunities.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>⏰ Free Time Detected</h3></div>
          {opportunities.slice(0,2).map((opp, i) => (
            <div key={i} className="free-win">
              <div className="free-win-time">
                {format(opp.start, 'h:mm a')} – {format(opp.end, 'h:mm a')} ({Math.round(opp.minutes/60*10)/10}h open)
              </div>
              <div className="free-win-title">I found {opp.suggestions.length} task{opp.suggestions.length>1?'s':''} that fit:</div>
              <div className="free-win-suggest">
                {opp.suggestions.map((s,j) => <div key={j}>• {s.title} — {s.minutes} min</div>)}
              </div>
              <div style={{marginTop:10, display:'flex', gap:8}}>
                <button className="small" onClick={() => applyOpportunity(opp)}>Auto-fill this window</button>
                <button className="small ghost">Skip</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-2">
        <div className="card">
          <div className="card-header"><h3>Today's Schedule</h3><span className="chip">{nudge}</span></div>
          {today && today.sessions && today.sessions.length === 0 && <div style={{color:'var(--text-dim)',fontSize:14}}>Nothing scheduled yet. Add a task above!</div>}
          {today && today.sessions && today.sessions
            .filter(s => s.end > new Date(Date.now() - 60*60*1000))
            .map((s, i) => <SessionItem key={i} session={s} onComplete={refresh} />)}
        </div>

        <div className="card">
          <div className="card-header"><h3>Up Next</h3></div>
          <UpcomingList onRefresh={refresh} />
        </div>
      </div>
    </div>
  )
}

function UpcomingList({ onRefresh }) {
  const [tasks, setTasks] = useState([])
  useEffect(() => { load() }, [])
  async function load() { setTasks(await api.tasks()) }
  async function toggle(t) {
    await api.complete(t.id)
    await api.squadComplete()
    load(); onRefresh && onRefresh()
  }
  return (
    <div>
      {tasks.length === 0 && <div style={{color:'var(--text-dim)',fontSize:14}}>No pending tasks. Nice work!</div>}
      {tasks.slice(0,8).map(t => (
        <div key={t.id} className="task-item">
          <button className={`task-check ${t.status==='completed'?'done':''}`} onClick={() => toggle(t)}>✓</button>
          <div>
            <div className="task-title">{t.title}</div>
            <div className="task-meta">
              <span className="priority-dot" style={{background: t.priorityScore > 60 ? 'var(--danger)' : t.priorityScore > 40 ? 'var(--warn)' : 'var(--accent-2)'}}></span>
              {t.category} · {Math.round((t.estimated_minutes||0)/60*10)/10}h
              {t.deadline && <> · Due {format(parseISO(t.deadline), 'EEE MMM d')}</>}
              {t.postponed_count > 0 && <> · ↻ {t.postponed_count}</>}
            </div>
          </div>
          <button className="small ghost" onClick={()=>toggle(t)}>Done</button>
        </div>
      ))}
    </div>
  )
}
