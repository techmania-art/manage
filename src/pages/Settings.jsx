import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Settings({ user, onUpdate, onStartOnboarding }) {
  const [form, setForm] = useState(user)
  const [commitments, setCommitments] = useState([])
  const [newC, setNewC] = useState({ title:'', day_of_week:1, start_time:'09:00', end_time:'10:00', category:'class' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(user)
    api.commitments().then(setCommitments)
  }, [user])

  async function save(e) {
    e.preventDefault()
    await api.updateMe(form)
    setSaved(true); setTimeout(()=>setSaved(false), 2000)
    onUpdate && onUpdate()
  }
  async function addCommitment(e) {
    e.preventDefault()
    await api.addCommitment(newC)
    setCommitments(await api.commitments())
    setNewC({ title:'', day_of_week:1, start_time:'09:00', end_time:'10:00', category:'class' })
  }
  async function delCommitment(id) { await api.delCommitment(id); setCommitments(await api.commitments()) }

  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div>
      <div className="greeting">Preferences</div>
      <h1>Settings</h1>

      <div className="card">
        <div className="card-header"><h2>About You</h2><button className="small secondary" onClick={onStartOnboarding}>🔄 Re-run “Know Me” chat</button></div>
        <form onSubmit={save}>
          <div className="input-row">
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Name</label>
              <input value={form.name||''} onChange={e=>setForm({...form, name:e.target.value})} />
            </div>
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Course / Program</label>
              <input value={form.course||''} onChange={e=>setForm({...form, course:e.target.value})} />
            </div>
          </div>
          <div className="input-row">
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Wake-up time</label>
              <input type="time" value={form.wake_time||'07:00'} onChange={e=>setForm({...form, wake_time:e.target.value})} />
            </div>
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Sleep time</label>
              <input type="time" value={form.sleep_time||'23:00'} onChange={e=>setForm({...form, sleep_time:e.target.value})} />
            </div>
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Commute (min each way)</label>
              <input type="number" value={form.commute_minutes||0} onChange={e=>setForm({...form, commute_minutes:parseInt(e.target.value)||0})} />
            </div>
          </div>
          <div className="input-row">
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Most productive</label>
              <select value={form.productivity_window||'night'} onChange={e=>setForm({...form, productivity_window:e.target.value})}>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:12, color:'var(--text-dim)'}}>Daily study capacity (hours)</label>
              <input type="number" step="0.5" value={form.daily_capacity_hours||5} onChange={e=>setForm({...form, daily_capacity_hours:parseFloat(e.target.value)||5, learned_capacity_hours: null})} />
            </div>
          </div>
          {form.learned_capacity_hours && (
            <div style={{fontSize:13, color:'var(--accent-2)', marginBottom:12}}>
              🧠 AI has learned your actual capacity is ~{form.learned_capacity_hours}h (based on your behavior). Saving your capacity above will reset this.
            </div>
          )}
          <button type="submit">{saved ? '✓ Saved' : 'Save changes'}</button>
        </form>
      </div>

      <div className="card">
        <h2>Fixed Commitments</h2>
        <div style={{fontSize:13, color:'var(--text-dim)', marginBottom:14}}>Classes, gym, travel — anything that happens weekly at a fixed time.</div>
        <form onSubmit={addCommitment} style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto', gap:8, marginBottom:14}}>
          <input placeholder="Title (e.g. DBMS)" value={newC.title} onChange={e=>setNewC({...newC, title:e.target.value})} required />
          <select value={newC.day_of_week} onChange={e=>setNewC({...newC, day_of_week:parseInt(e.target.value)})}>
            {days.map((d,i)=> <option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={newC.start_time} onChange={e=>setNewC({...newC, start_time:e.target.value})} />
          <input type="time" value={newC.end_time} onChange={e=>setNewC({...newC, end_time:e.target.value})} />
          <select value={newC.category} onChange={e=>setNewC({...newC, category:e.target.value})}>
            <option value="class">Class</option>
            <option value="exercise">Exercise</option>
            <option value="break">Break</option>
            <option value="work">Work</option>
          </select>
          <button type="submit">Add</button>
        </form>
        <div>
          {commitments.map(c => (
            <div key={c.id} className="task-item">
              <span className="session-dot" style={{background: c.category==='class'?'var(--accent)':c.category==='exercise'?'var(--warn)':'var(--text-dim)', width:4, height:30, borderRadius:2}}></span>
              <div>
                <div className="task-title">{c.title}</div>
                <div className="task-meta">{days[c.day_of_week]} · {c.start_time}–{c.end_time} · {c.category}</div>
              </div>
              <button className="small ghost" onClick={()=>delCommitment(c.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{borderColor:'rgba(255,193,94,0.3)'}}>
        <h3>❤️ Well-being Layer</h3>
        <div style={{fontSize:13, color:'var(--text-dim)', lineHeight:1.6}}>
          LifePilot monitors your workload vs completion rate and will suggest lighter days when you're overloading.
          No diagnosis, no therapy — just awareness of what you can actually handle.
        </div>
      </div>
    </div>
  )
}
