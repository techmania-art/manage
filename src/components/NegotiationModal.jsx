import React from 'react'

export default function NegotiationModal({ negotiation, onChoose, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>⚠️ Let's Talk About This</h2>
        <p style={{fontSize:14, lineHeight:1.6}}>
          Adding this work will overload one or more days this week:
        </p>
        <div style={{margin:'12px 0 18px'}}>
          {negotiation.overflow && negotiation.overflow.map((d, i) => (
            <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'8px 12px', background:'var(--bg-elev)', borderRadius:8, marginBottom:6, fontSize:13}}>
              <span>{d.date}</span>
              <span>
                <span style={{color:'var(--text-dim)'}}>{d.load}% →</span>{' '}
                <span style={{color:d.projected>100?'var(--danger)':'var(--warn)', fontWeight:600}}>{d.projected}%</span>
              </span>
            </div>
          ))}
        </div>
        <p style={{fontSize:13, color:'var(--text-dim)', marginBottom:14}}>What would you prefer?</p>
        {negotiation.options.map(o => (
          <button key={o.id} className="option-card" onClick={() => onChoose(o.id)}>
            <div className="option-title">{o.label}</div>
            <div className="option-desc">{o.desc}</div>
          </button>
        ))}
        <button className="ghost small" style={{width:'100%', marginTop:8}} onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
