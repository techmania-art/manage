import React, { useState } from 'react'
import { api } from '../api.js'

const steps = [
  { ai: "Hey! Before I organize your life, I need to understand how you live. What do you study?" },
  { ai: "Nice! What time do you normally wake up and go to sleep?" },
  { ai: "When are you most productive — morning, afternoon, or at night?" },
  { ai: "How much time do you spend commuting or travelling each day?" },
  { ai: "What are your fixed commitments (classes, work, gym) on a typical day?" },
  { ai: "How much focused study time can you realistically handle on a normal day?" },
  { ai: "Finally — what's one goal you're working toward right now?" }
]

export default function Onboarding({ onClose }) {
  const [step, setStep] = useState(0)
  const [messages, setMessages] = useState([{ who: 'ai', text: steps[0].ai }])
  const [input, setInput] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!input.trim()) return
    const newMessages = [...messages, { who: 'user', text: input }]
    setMessages(newMessages)
    await api.onboard(input)
    setInput('')
    if (step < steps.length - 1) {
      const next = step + 1
      setTimeout(() => {
        setMessages(m => [...m, { who: 'ai', text: steps[next].ai }])
        setStep(next)
      }, 400)
    } else {
      setSubmitted(true)
      setTimeout(() => {
        setMessages(m => [...m, { who: 'ai', text: "Perfect — I've learned your rhythm. Now let me build your plan. If I get anything wrong, you can tweak it in Settings anytime." }])
      }, 500)
    }
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding">
        <div style={{textAlign:'center', marginBottom:20}}>
          <div style={{fontSize:40}}>🧭</div>
          <h1 style={{marginBottom:4}}>Welcome to LifePilot</h1>
          <div style={{color:'var(--text-dim)'}}>Let me get to know you — it takes about a minute.</div>
        </div>
        <div style={{maxHeight:'55vh', overflowY:'auto', marginBottom:16}}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-bubble ${m.who}`}>{m.text}</div>
          ))}
        </div>
        {!submitted ? (
          <form onSubmit={submit} style={{display:'flex', gap:8}}>
            <input autoFocus value={input} onChange={e=>setInput(e.target.value)} placeholder="Type naturally…" />
            <button type="submit">Send</button>
          </form>
        ) : (
          <button style={{width:'100%'}} onClick={onClose}>Let's go →</button>
        )}
        <div style={{textAlign:'center', marginTop:12}}>
          <button className="ghost small" onClick={onClose}>Skip setup — use defaults</button>
        </div>
      </div>
    </div>
  )
}
