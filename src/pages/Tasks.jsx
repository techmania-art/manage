import React, { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { api } from '../api.js'
import TaskInput from '../components/TaskInput.jsx'

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [filter, setFilter] = useState('pending')

  async function refresh() { setTasks(await api.tasks(filter === 'all' ? 'all' : 'pending')) }
  useEffect(() => { refresh() }, [filter])

  async function toggle(t) {
    const input = prompt('How many minutes did you actually spend? (Cancel = use estimate)', t.estimated_minutes || '')
    if (input === null) {
      await api.complete(t.id, null)
    } else {
      const n = parseInt(input)
      await api.complete(t.id, isNaN(n) ? null : n)
    }
    await api.squadComplete()
    refresh()
  }
  async function skip(t) {
    if (!confirm('Skip this task? It won\'t count as completed.')) return
    await api.skip(t); refresh()
  }
  async function split(t) { await api.split(t); refresh() }

  const priorityColor = (s) => s > 60 ? 'var(--danger)' : s > 40 ? 'var(--warn)' : 'var(--accent-2)'

  return (
    <div>
      <div className="greeting">All tasks</div>
      <h1>Your Task List</h1>
      <TaskInput onCreated={refresh} />
      <div style={{display:'flex', gap:8, marginBottom:16}}>
        <button className={`chip ${filter==='pending'?'':'ghost'}`} style={filter==='pending'?{background:'var(--accent)', color:'white'}:{}} onClick={()=>setFilter('pending')}>Pending</button>
        <button className={`chip ${filter==='all'?'':'ghost'}`} style={filter==='all'?{background:'var(--accent)', color:'white'}:{}} onClick={()=>setFilter('all')}>All</button>
      </div>
      <div className="card">
        {tasks.length === 0 && <div style={{color:'var(--text-dim)'}}>Nothing here. Add a task above to get started.</div>}
        {tasks.map(t => (
          <div key={t.id} className="task-item">
            <button className={`task-check ${t.status==='completed'?'done':''}`} onClick={() => t.status !== 'completed' && toggle(t)}>
              {t.status==='completed' && '✓'}
            </button>
            <div>
              <div className={`task-title ${t.status==='completed'?'done':''}`}>
                <span className="priority-dot" style={{background: priorityColor(t.priorityScore)}}></span>
                {t.title}
                {t.was_auto_split ? <span className="chip" style={{marginLeft:8,background:'rgba(124,92,255,0.15)',color:'var(--accent)'}}>AI split</span> : null}
              </div>
              <div className="task-meta">
                {t.category} · est {Math.round((t.estimated_minutes||0)/60*10)/10}h
                {t.deadline && <> · Due {format(parseISO(t.deadline), 'EEE MMM d, h:mm a')}</>}
                {t.postponed_count > 0 && <> · ↻ postponed {t.postponed_count}×</>}
                {t.outcome && <> · outcome: {t.outcome.replace('_',' ')}</>}
                {t.failure_reason && <> · 📝 {t.failure_reason.replace('_',' ')}</>}
              </div>
            </div>
            <div style={{display:'flex', gap:6}}>
              {t.status !== 'completed' && t.status !== 'ai_split' && (t.estimated_minutes||0) >= 90 && (
                <button className="small ghost" onClick={()=>split(t)}>Split</button>
              )}
              {t.status !== 'completed' && t.status !== 'skipped' && t.status !== 'ai_split' && (
                <button className="small ghost" onClick={()=>skip(t)}>Skip</button>
              )}
              {t.status !== 'completed' && t.status !== 'ai_split' && (
                <button className="small" onClick={()=>toggle(t)}>Done</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
