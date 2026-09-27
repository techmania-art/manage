import React, { useState } from 'react'
import { api } from '../api.js'

const REASONS = [
  { id: 'too_tired', label: '😴 Too tired', desc: 'Energy was low' },
  { id: 'didnt_understand', label: '🤷 Didn\'t understand it', desc: 'Got stuck on the material' },
  { id: 'ran_out_of_time', label: '⏰ Ran out of time', desc: 'The day slipped away' },
  { id: 'not_important', label: '🤔 Not important anymore', desc: 'Priorities changed' },
  { id: 'unexpected', label: '⚡ Something came up', desc: 'Unexpected event' },
  { id: 'other', label: '✍️ Other', desc: 'Something else' }
]

export default function CheckInModal({ checkin, onClose, onDone }) {
  const [step, setStep] = useState(0)
  const [reasonMsg, setReasonMsg] = useState('')
  const [finished, setFinished] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)

  async function pickReason(reasonId, taskId) {
    const r = await api.failure(taskId, reasonId)
    if (r.message) setReasonMsg(prev => prev ? prev + '\n' + r.message : r.message)
    if (step + 1 < checkin.missed.length) {
      setStep(step + 1)
    } else {
      setFinished(true)
    }
  }

  async function goodNight() {
    setRescheduling(true)
    // Fetch reschedule proposals for anything missed today and accept them
    const proposals = await api.rescheduleProposals()
    const toAccept = proposals.map(p => ({ ...p, accept: true }))
    if (toAccept.length > 0) await api.applyReschedule(toAccept)
    onClose()
    onDone && onDone()
  }

  async function skipAll() {
    for (const m of checkin.missed) {
      await api.skip(m.taskId)
    }
    onClose(); onDone && onDone()
  }

  const current = !finished ? checkin.missed[step] : null

  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>🌙 End-of-day Check-in</h2>
        <p style={{fontSize:14, color:'var(--text-dim)'}}>
          You planned {checkin.planned} things today. You completed <strong style={{color:'var(--accent-2)'}}>{checkin.completed.length}</strong>.
        </p>
        {checkin.completed.length > 0 && (
          <div style={{margin:'10px 0', maxHeight:100, overflowY:'auto'}}>
            {checkin.completed.map(c => (
              <div key={c.taskId} style={{fontSize:13, padding:'4px 0'}}>✅ {c.title}</div>
            ))}
          </div>
        )}
        {current ? (
          <>
            <div style={{fontSize:12, color:'var(--text-dim)', marginTop:8}}>
              {step + 1} of {checkin.missed.length} missed
            </div>
            <div style={{fontSize:15, fontWeight:600, marginTop:6, marginBottom:8}}>❌ {current.title} wasn't completed. Why?</div>
            <div className="failure-reasons">
              {REASONS.map(r => (
                <button key={r.id} className="option-card" onClick={()=>pickReason(r.id, current.taskId)}>
                  <div className="option-title">{r.label}</div>
                  <div className="option-desc">{r.desc}</div>
                </button>
              ))}
            </div>
            <button className="ghost small" style={{width:'100%', marginTop:10}} onClick={() => {
              if (step + 1 < checkin.missed.length) setStep(step+1); else setFinished(true)
            }}>Skip this question</button>
          </>
        ) : (
          <>
            {reasonMsg && <div className="insight-banner" style={{marginTop:16}}>
              <div className="insight-icon">🧠</div>
              <div className="insight-text" style={{whiteSpace:'pre-line'}}>{reasonMsg}</div>
            </div>}
            <p style={{fontSize:13, color:'var(--text-dim)', marginTop:12}}>I'll reshuffle what makes sense for tomorrow. Get some rest — tomorrow's a fresh start. 💤</p>
            <div style={{display:'flex', gap:8, marginTop:16}}>
              <button style={{flex:1}} disabled={rescheduling} onClick={goodNight}>
                {rescheduling ? 'Rescheduling…' : 'Good night'}
              </button>
              <button className="ghost" onClick={skipAll}>Skip remaining</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
