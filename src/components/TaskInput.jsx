import React, { useState } from 'react'
import { api } from '../api.js'

export default function TaskInput({ onCreated, onCreateResult }) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!text.trim()) return
    setLoading(true)
    const result = await api.createTask({ text })
    setLoading(false)
    setText(''); setParsed(null)
    if (result.ok === 'negotiate') {
      onCreateResult && onCreateResult(result)
    } else {
      onCreated && onCreated()
    }
  }

  async function handleParse() {
    if (!text.trim()) return
    const p = await api.parseTask(text)
    setParsed(p)
  }

  const chips = [
    'DBMS assignment due Friday (3h)',
    'Maths test Wednesday',
    'Gym 45 min tonight',
    'Prepare for semester exams'
  ]

  return (
    <form className="task-input-wrap" onSubmit={handleSubmit}>
      <textarea
        id="task-input"
        placeholder="Tell me what you need to get done… (e.g. “I need to finish the DBMS assignment by Friday — about 5 hours”)"
        value={text}
        onChange={e => { setText(e.target.value); setParsed(null) }}
        onBlur={handleParse}
        rows={2}
      />
      {parsed && (parsed.dueDate || parsed.estimatedMinutes) && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0'}}>
          {parsed.estimatedMinutes && <span className="chip">⏱ ~{parsed.estimatedMinutes} min</span>}
          {parsed.dueDate && <span className="chip">📅 Due {parsed.dueDate}</span>}
          <span className="chip">🏷 {parsed.category}</span>
          {parsed.autoDecompose && <span className="chip" style={{background:'rgba(255,193,94,0.15)',color:'var(--warn)'}}>⚡ AI will auto-split</span>}
        </div>
      )}
      <div className="task-actions">
        <div className="quick-btns">
          {chips.map(c => (
            <button type="button" key={c} className="chip" onClick={() => setText(c)}>{c}</button>
          ))}
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Adding…' : '➕ Add & Schedule'}
        </button>
      </div>
    </form>
  )
}
