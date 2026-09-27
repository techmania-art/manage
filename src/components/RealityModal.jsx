import React, { useState, useEffect } from 'react'
import { api } from '../api.js'

const PRESETS = [30, 60, 90, 120]

export default function RealityModal({ onClose }) {
  const [minutes, setMinutes] = useState(60)
  const [plan, setPlan] = useState(null)

  async function run() {
    setPlan(null)
    const r = await api.reality(minutes)
    setPlan(r)
  }
  useEffect(() => { run() /* initial run on mount */ }, [])

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>⚡ Reality Mode</h2>
        <p style={{color:'var(--text-dim)', fontSize:14, margin:'0 0 16px'}}>
          You have N minutes right now. What should you actually do?
        </p>
        <div style={{display:'flex', gap:8, marginBottom:16}}>
          {PRESETS.map(m => (
            <button key={m} className={minutes===m?'':'ghost'} style={{flex:1}} onClick={()=>{setMinutes(m); setPlan(null)}}>{m} min</button>
          ))}
          <input type="number" min="10" max="300" value={minutes} onChange={e=>{setMinutes(parseInt(e.target.value)||60); setPlan(null)}} style={{width:90}} />
        </div>
        {!plan && <button style={{width:'100%'}} onClick={run}>Give me my plan</button>}
        {plan && (
          <>
            <div style={{fontSize:13, color:'var(--text-dim)', marginBottom:10}}>For the next {minutes} minutes:</div>
            <div className="reality-plan">
              {plan.plan.map((p, i) => (
                <div key={i} className={`reality-step ${p.buffer?'reality-buffer':''}`}>
                  {p.buffer ? <div className="reality-num" style={{background:'transparent',border:'2px dashed var(--text-dim)'}}>⏸</div> : <div className="reality-num">{i+1}</div>}
                  <div>
                    <div style={{fontWeight:600, fontSize:14}}>{p.title}</div>
                    {p.reason && <div style={{fontSize:12, color:'var(--text-dim)'}}>{p.reason}</div>}
                  </div>
                  <div style={{fontSize:14, fontWeight:600}}>{p.minutes}m</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:8}}>
              <button style={{flex:1}} onClick={onClose}>Start now</button>
              <button className="ghost" onClick={()=>setPlan(null)}>Adjust time</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
