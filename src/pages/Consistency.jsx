import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Consistency() {
  const [c, setC] = useState(null)
  const [debt, setDebt] = useState([])
  const [activity, setActivity] = useState([])

  useEffect(() => {
    api.consistency().then(setC)
    api.planningDebt().then(setDebt)
    api.activity().then(setActivity)
  }, [])

  if (!c) return <div style={{padding:40}}>Loading…</div>

  const metrics = [
    { label: 'Execution', value: c.execution + '%', sub: 'Tasks you attempted' },
    { label: 'On-time', value: c.onTimeRate + '%', sub: `${c.tasksOnTime} on time` },
    { label: 'Recovery', value: c.recovery + '%', sub: 'Bounce-back rate' },
    { label: 'Planning accuracy', value: (c.accuracy||0) + '%', sub: 'Estimate vs actual' },
    { label: 'Late', value: c.lateRate + '%', sub: `${c.tasksLate} late` },
    { label: 'Skipped', value: c.skipRate + '%', sub: `${c.tasksSkipped} skipped` },
    { label: 'Streak', value: '🔥' + c.streak, sub: 'days in a row' },
    { label: 'Avg delay', value: c.avgDelayHours + 'h', sub: 'for late tasks' }
  ]

  return (
    <div>
      <div className="greeting">Your Consistency Profile</div>
      <h1>How you're doing</h1>

      <div className="card">
        <h3>This Week at a Glance</h3>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 20, marginTop: 8}}>
          {metrics.map(m => (
            <div key={m.label} className="metric" style={{textAlign:'center'}}>
              <div className="metric-value">{m.value}</div>
              <div className="metric-label">{m.label}</div>
              <div style={{fontSize:11, color:'var(--text-dim)', marginTop:2}}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>What this means</h3>
          <div style={{fontSize:14, lineHeight:1.7, color:'var(--text-dim)'}}>
            {c.recovery >= 85 && <p><strong style={{color:'var(--accent-2)'}}>✨ Great recovery.</strong> You're bouncing back quickly from missed work — that's a sustainable productivity pattern.</p>}
            {c.onTimeRate >= 80 && <p><strong style={{color:'var(--accent-2)'}}>✓ Strong on-time rate.</strong> Your estimates are mostly working.</p>}
            {(c.accuracy||0) < 70 && (c.accuracy||0) > 0 && <p><strong style={{color:'var(--warn)'}}>⚡ Estimates are off.</strong> I'm adjusting your future time estimates based on past actuals.</p>}
            {c.skipRate > 20 && <p><strong style={{color:'var(--danger)'}}>⚠️ High skip rate.</strong> You may be over-planning. I can lower your daily capacity so plans are more realistic.</p>}
            {c.streak >= 3 && <p><strong>🔥 {c.streak}-day streak.</strong> Consistency beats intensity.</p>}
            <p style={{marginTop:12}}>Planned: {c.plannedHours}h · Completed: {c.completedHours}h this week.</p>
          </div>
        </div>

        <div className="card">
          <h3>Planning Debt</h3>
          {debt.length === 0 && <div style={{color:'var(--text-dim)', fontSize:14}}>No planning debt. Good work keeping things clear.</div>}
          {debt.map(d => (
            <div key={d.id} className="debt-card">
              <div style={{fontWeight:600, fontSize:14}}>{d.title}</div>
              <div style={{fontSize:12, color:'var(--text-dim)', marginTop:4}}>Postponed {d.postponed_count}× · est {Math.round((d.estimated_minutes||0)/60*10)/10}h</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Activity Log</h3>
        {activity.slice(0,15).map(a => (
          <div key={a.id} style={{padding:'8px 0', fontSize:13, borderBottom:'1px solid rgba(255,255,255,0.04)', display:'flex', gap:12}}>
            <span style={{color:'var(--text-dim)', width: 120}}>{new Date(a.created_at).toLocaleString()}</span>
            <span style={{width: 100, textTransform:'uppercase', fontSize:11, letterSpacing:0.5, color:'var(--accent)'}}>{a.event.replace('_',' ')}</span>
            <span style={{flex:1}}>{a.title}{a.detail && <> — {a.detail}</>}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
