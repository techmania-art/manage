import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api.js'

const PRESETS = [30, 60, 90, 120]

export default function RealityModal({ onClose }) {
  const [minutes, setMinutes] = useState(60)
  const [plan, setPlan] = useState(null)
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const timerRef = useRef(null)

  async function run() {
    setPlan(null)
    setRunning(false)
    const r = await api.reality(minutes)
    setPlan(r)
  }
  useEffect(() => { run() }, [])

  function start() {
    const first = plan.plan.find(p => !p.buffer)
    if (!first) { onClose(); return }
    setCurrentStep(0)
    setSecondsLeft(first.minutes * 60)
    setRunning(true)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          // move to next step
          setCurrentStep(i => {
            const nextIdx = i + 1
            const next = plan.plan[nextIdx]
            if (!next) {
              clearInterval(timerRef.current)
              setRunning(false)
              return i
            }
            if (next.buffer) {
              setSecondsLeft(next.minutes * 60)
              return nextIdx
            }
            setSecondsLeft(next.minutes * 60)
            return nextIdx
          })
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  function stop() {
    if (timerRef.current) clearInterval(timerRef.current)
    setRunning(false)
    onClose()
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const mm = String(Math.floor(secondsLeft/60)).padStart(2,'0')
  const ss = String(secondsLeft%60).padStart(2,'0')
  const currentItem = plan?.plan[currentStep]

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>⚡ Reality Mode</h2>

        {running && currentItem ? (
          <div style={{textAlign:'center', padding:'20px 0'}}>
            <div style={{fontSize:14, color:'var(--text-dim)', textTransform:'uppercase', letterSpacing:1}}>
              {currentItem.buffer ? 'Buffer break' : `Step ${currentStep+1} of ${plan.plan.filter(p=>!p.buffer).length}`}
            </div>
            <div style={{fontSize:18, fontWeight:600, margin:'10px 0 20px'}}>{currentItem.title}</div>
            <div style={{fontSize:72, fontWeight:700, fontVariantNumeric:'tabular-nums', background:'linear-gradient(90deg,var(--accent),var(--accent-2))', WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent'}}>
              {mm}:{ss}
            </div>
            <button className="danger" style={{width:'100%', marginTop:30}} onClick={stop}>Stop & close</button>
          </div>
        ) : (
          <>
            <p style={{color:'var(--text-dim)', fontSize:14, margin:'0 0 16px'}}>
              You have N minutes right now. What should you actually do?
            </p>
            <div style={{display:'flex', gap:8, marginBottom:16}}>
              {PRESETS.map(m => (
                <button key={m} className={minutes===m?'':'ghost'} style={{flex:1}} onClick={()=>{setMinutes(m); setPlan(null); setRunning(false)}}>{m} min</button>
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
                  <button style={{flex:1}} onClick={start}>▶ Start focus timer</button>
                  <button className="ghost" onClick={()=>{setPlan(null)}}>Adjust time</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
