import React, { useEffect, useState } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { api } from './api.js'
import Dashboard from './pages/Dashboard.jsx'
import Tasks from './pages/Tasks.jsx'
import Schedule from './pages/Schedule.jsx'
import Consistency from './pages/Consistency.jsx'
import Squad from './pages/Squad.jsx'
import Settings from './pages/Settings.jsx'
import Onboarding from './pages/Onboarding.jsx'
import RealityModal from './components/RealityModal.jsx'
import NegotiationModal from './components/NegotiationModal.jsx'
import CheckInModal from './components/CheckInModal.jsx'

export default function App() {
  const [user, setUser] = useState(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [realityOpen, setRealityOpen] = useState(false)
  const [negotiation, setNegotiation] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const u = await api.me()
    setUser(u)
    // Show onboarding if user is still in default state (no course)
    if (!u.course || u.course.trim() === '') {
      // don't auto-show — let dashboard's CTA invite them. But seed will have course set, so only new users.
    }
    // End-of-day check-in after 7pm if there are missed tasks
    const hour = new Date().getHours()
    if (hour >= 19) {
      const ci = await api.checkin()
      if (ci.missed.length > 0) setCheckin(ci)
    }
  }

  function handleCreateTaskResult(result) {
    if (result.ok === 'negotiate') {
      setNegotiation(result)
    }
  }

  async function handleNegotiationChoice(optionId) {
    if (!negotiation) return
    // Re-create the same task with overload accepted or other options — simplified: accept & spread
    await api.createTask({ text: document.querySelector('#task-input')?.value || negotiation.title, acceptOverload: true })
    setNegotiation(null)
    navigate('/')
  }

  if (!user) return <div style={{padding:40, color:'#9aa3bb'}}>Loading LifePilot…</div>

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-emoji">🧭</div>
          <span>LifePilot AI</span>
        </div>
        <nav className="nav">
          <div className="nav-section">Today</div>
          <NavLink to="/" end><span className="nav-icon">🏠</span> Dashboard</NavLink>
          <NavLink to="/tasks"><span className="nav-icon">✅</span> Tasks</NavLink>
          <NavLink to="/schedule"><span className="nav-icon">📅</span> Schedule</NavLink>
          <div className="nav-section">Insights</div>
          <NavLink to="/consistency"><span className="nav-icon">📊</span> Consistency</NavLink>
          <NavLink to="/squad"><span className="nav-icon">👥</span> Squad</NavLink>
          <div className="nav-section">You</div>
          <NavLink to="/settings"><span className="nav-icon">⚙️</span> Settings</NavLink>
        </nav>
        <button className="secondary" style={{width:'100%', marginTop: 24, background: 'linear-gradient(90deg,var(--accent),var(--accent-2))'}} onClick={() => setRealityOpen(true)}>
          ⚡ Reality Mode
        </button>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard user={user} onCreateResult={handleCreateTaskResult} onStartOnboarding={()=>setShowOnboarding(true)} />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/consistency" element={<Consistency />} />
          <Route path="/squad" element={<Squad />} />
          <Route path="/settings" element={<Settings user={user} onUpdate={loadUser} onStartOnboarding={()=>setShowOnboarding(true)} />} />
        </Routes>
      </main>

      {showOnboarding && <Onboarding onClose={() => { setShowOnboarding(false); loadUser() }} />}
      {realityOpen && <RealityModal onClose={() => setRealityOpen(false)} />}
      {negotiation && <NegotiationModal negotiation={negotiation} onChoose={handleNegotiationChoice} onClose={()=>setNegotiation(null)} />}
      {checkin && <CheckInModal checkin={checkin} onClose={() => setCheckin(null)} onDone={loadUser} />}
    </div>
  )
}
