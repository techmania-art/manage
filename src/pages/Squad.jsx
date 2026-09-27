import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Squad() {
  const [squad, setSquad] = useState(null)
  const [goals, setGoals] = useState([])
  const [newGoal, setNewGoal] = useState('')

  useEffect(() => { refresh() }, [])
  async function refresh() { setSquad(await api.squad()); setGoals(await api.goals()) }

  async function addGoal(e) {
    e.preventDefault()
    if (!newGoal.trim()) return
    await api.addGoal({ title: newGoal })
    setNewGoal(''); refresh()
  }
  async function doneGoal(id) { await api.doneGoal(id); refresh() }

  if (!squad) return <div style={{padding:40}}>Loading squad…</div>

  return (
    <div>
      <div className="greeting">{squad.name}</div>
      <h1>Squad Mode</h1>

      <div className="card">
        <div className="card-header">
          <h3>Group Challenge</h3>
          <span className="chip">Invite: #{squad.invite_code}</span>
        </div>
        <div style={{fontSize:32, fontWeight:700, marginBottom:4}}>
          {squad.weekTotal} <span style={{fontSize:16, color:'var(--text-dim)', fontWeight:400}}>/ {squad.weekGoal} tasks this week</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{width: `${Math.min(100,(squad.weekTotal/squad.weekGoal)*100)}%`}}></div>
        </div>
        <div style={{fontSize:12, color:'var(--text-dim)', marginTop:10}}>{squad.weekGoal - squad.weekTotal} more to hit the goal! 🎯</div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>Members</h3>
          {squad.members.map(m => (
            <div key={m.display_name} className="squad-member">
              <div className="squad-avatar" style={m.is_you?{border:'2px solid var(--accent-2)'}:{}}>{m.display_name[0]}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600}}>{m.display_name} {m.is_you && <span className="chip" style={{marginLeft:4,background:'rgba(61,220,151,0.15)',color:'var(--accent-2)'}}>you</span>}</div>
                <div style={{fontSize:12, color:'var(--text-dim)'}}>🔥 {m.streak_days}-day streak · {m.tasks_completed_week} tasks this week</div>
              </div>
            </div>
          ))}
          <button className="secondary" style={{width:'100%', marginTop:10}}>+ Invite friend</button>
        </div>

        <div className="card">
          <h3>My Goals</h3>
          <form onSubmit={addGoal} style={{display:'flex', gap:8, marginBottom:14}}>
            <input placeholder="Add a goal…" value={newGoal} onChange={e=>setNewGoal(e.target.value)} />
            <button type="submit">Add</button>
          </form>
          {goals.length === 0 && <div style={{color:'var(--text-dim)', fontSize:13}}>No goals yet. What are you working toward?</div>}
          {goals.map(g => (
            <div key={g.id} className="goal-item">
              <button className={`goal-check ${g.status==='completed'?'done':''}`} onClick={()=>doneGoal(g.id)}>{g.status==='completed' && '✓'}</button>
              <div style={{flex:1, fontSize:14}} className={g.status==='completed'?'task-title done':''}>
                {g.title}
                {g.target_date && <div style={{fontSize:11,color:'var(--text-dim)'}}>Target: {g.target_date}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
