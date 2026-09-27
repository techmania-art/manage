// Accountability Partner — end-of-day check-in + failure-reason learning.
import db from '../db.js'
import { startOfDay, endOfDay, parseISO, subDays } from 'date-fns'
import { weeklyConsistency } from './analytics.js'

export function endOfDayCheckIn(userId) {
  const dayStart = startOfDay(new Date()), dayEnd = endOfDay(new Date())
  const sessions = db.prepare(`
    SELECT ss.*, t.id as taskId, t.title, t.status, t.outcome
    FROM schedule_sessions ss JOIN tasks t ON t.id = ss.task_id
    WHERE ss.user_id = ? AND ss.session_type = 'work' AND ss.start_time >= ? AND ss.start_time < ?
  `).all(userId, dayStart.toISOString(), dayEnd.toISOString())

  const completed = sessions.filter(s => s.is_completed)
  const missed = sessions.filter(s => !s.is_completed && parseISO(s.end_time) < new Date())

  return {
    completed: completed.map(s => ({ taskId: s.taskId, title: s.title })),
    missed: missed.map(s => ({ sessionId: s.id, taskId: s.taskId, title: s.title })),
    planned: sessions.length
  }
}

export function recordFailureReason(userId, taskId, reason) {
  const validReasons = ['too_tired', 'didnt_understand', 'ran_out_of_time', 'not_important', 'unexpected', 'other']
  if (!validReasons.includes(reason)) return { error: 'Invalid reason' }
  db.prepare(`UPDATE tasks SET failure_reason = ? WHERE id = ?`).run(reason, taskId)
  db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'failure_reason', ?)`)
    .run(taskId, reason)

  // Adapt: if 'ran_out_of_time' > 3 times in last week → lower planned capacity
  const since = subDays(new Date(), 7).toISOString()
  const reasons = db.prepare(`
    SELECT failure_reason FROM tasks WHERE user_id = ? AND failure_reason IS NOT NULL AND created_at >= ?
  `).all(userId, since)
  const rot = reasons.filter(r => r.failure_reason === 'ran_out_of_time').length
  if (rot >= 3) {
    const u = db.prepare('SELECT learned_capacity_hours, daily_capacity_hours FROM users WHERE id = ?').get(userId)
    const cur = u.learned_capacity_hours || u.daily_capacity_hours
    const reduced = Math.max(2, Math.round((cur - 0.5) * 10)/10)
    db.prepare('UPDATE users SET learned_capacity_hours = ? WHERE id = ?').run(reduced, userId)
    return { ok: true, adapted: true, newCapacity: reduced, message: `I noticed you've run out of time ${rot} times this week. I'm lowering your daily capacity to ${reduced}h to keep things realistic.` }
  }
  if (reason === 'didnt_understand') {
    return { ok: true, adapted: false, message: 'Got it. Want me to block out a "get help" session or split this into smaller pieces?' }
  }
  return { ok: true, adapted: false }
}

export function getMotivationalNudge(userId) {
  const c = weeklyConsistency(userId)
  if (c.streak >= 5) return `🔥 You're on a ${c.streak}-day streak — don't break it now.`
  if (c.recovery < 50) return `You've missed a few — a short 20-minute session will kick-start recovery.`
  if (c.onTimeRate >= 80) return `Strong week — ${c.onTimeRate}% on-time. Keep protecting your routine.`
  return `Let's win the next hour. Pick one small task.`
}
