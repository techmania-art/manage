import React from 'react'
import { format } from 'date-fns'

export default function SessionItem({ session }) {
  const type = (session.type || session.category || 'work').toLowerCase()
  const isFixed = session.fixed
  const start = session.start instanceof Date ? session.start : new Date(session.start)
  const end = session.end instanceof Date ? session.end : new Date(session.end)
  const durationMin = Math.round((end - start) / 60000)

  return (
    <div className="session">
      <div className="session-time">
        <strong>{format(start, 'h:mm a')}</strong>
        {format(end, 'h:mm a')}
      </div>
      <div className={`session-dot ${type}`}></div>
      <div>
        <div className="session-title">{session.title}</div>
        <div className="session-meta">
          {durationMin} min · {type}
          {isFixed && ' · fixed'}
        </div>
      </div>
      <div>
        {!isFixed && session.status !== 'completed' && <span className="session-tag">{session.status || 'scheduled'}</span>}
      </div>
    </div>
  )
}
