// "Reality Mode" — given N minutes right now, return the optimal next actions.
import db from '../db.js'
import { parseISO, addMinutes, differenceInMinutes } from 'date-fns'
import { priorityScore } from './scheduler.js'
import { findFreeGaps } from './capacity.js'

export function realityMode(userId, minutesAvailable, now = new Date()) {
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','rescheduled','in_progress')
    ORDER BY deadline ASC
  `).all(userId)

  // score each task
  const scored = tasks.map(t => ({
    ...t,
    score: priorityScore(t),
    remainingMin: remainingWork(t)
  })).filter(t => t.remainingMin > 0)
  scored.sort((a,b) => b.score - a.score)

  const plan = []
  let budget = minutesAvailable
  for (const t of scored) {
    if (budget <= 0) break
    // Pick a chunk size: small for first slot, but respect task size
    const chunk = Math.min(budget, 60, t.remainingMin)
    plan.push({
      taskId: t.id,
      title: t.title,
      minutes: chunk,
      category: t.category,
      reason: reasonFor(t)
    })
    budget -= chunk
  }
  if (budget >= 10) plan.push({ buffer: true, minutes: budget, title: 'Buffer / Short break' })
  return { minutesAvailable, plan, startedAt: now }
}

function remainingWork(task) {
  // If task is scheduled but sessions not started yet, count estimated.
  // Otherwise use estimated_minutes.
  return task.estimated_minutes || 60
}

function reasonFor(t) {
  if (!t.deadline) return 'Important'
  const hoursLeft = differenceInMinutes(parseISO(t.deadline), new Date()) / 60
  if (hoursLeft <= 24) return `Due soon — ${Math.round(hoursLeft)}h left`
  if (hoursLeft <= 72) return `Due in ~${Math.round(hoursLeft/24)} days`
  if (t.postponed_count >= 3) return 'Planning debt — worth starting now'
  return 'Fits this window'
}

export function findFreeTimeOpportunities(userId, day = new Date()) {
  // Look for free windows and suggest filling with best tasks.
  const { gaps, cap } = findFreeGaps(userId, day, 30)
  const tasks = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','rescheduled')
  `).all(userId)
  const scored = tasks.map(t => ({ ...t, score: priorityScore(t) })).sort((a,b)=>b.score - a.score)

  const opportunities = []
  for (const g of gaps) {
    // Only suggest windows not too close to start (next 12 hours)
    if (g.start < new Date()) continue
    if ((g.start - new Date()) > 1000*60*60*12) break // far future — stop
    const usable = g.minutes - (g.minutes >= 60 ? 15 : 0)
    if (usable < 30) continue
    const suggestions = []
    let b = usable
    for (const t of scored) {
      const sz = Math.min(b, 60, t.estimated_minutes || 60)
      if (sz < 20) continue
      suggestions.push({ taskId: t.id, title: t.title, minutes: sz })
      b -= sz
      if (b < 15) break
    }
    if (suggestions.length) {
      opportunities.push({ start: g.start, end: g.end, minutes: g.minutes, suggestions })
    }
  }
  return opportunities
}
