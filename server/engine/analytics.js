// Analytics Engine — Consistency Profile, Recovery Score, Planning Accuracy, Weekly digest.
import db from '../db.js'
import { startOfDay, endOfDay, parseISO, differenceInHours, differenceInMinutes, addDays, format, subDays } from 'date-fns'

function dateRange(daysBack) {
  const end = endOfDay(new Date())
  const start = startOfDay(subDays(end, daysBack))
  return { start, end }
}

// Record / refresh daily metrics for a date
export function recordDailyMetrics(userId, date) {
  const dayStart = startOfDay(date); const dayEnd = endOfDay(date)
  const sessions = db.prepare(`
    SELECT ss.*, t.outcome, t.status as task_status, t.completed_at, t.estimated_minutes, t.actual_minutes
    FROM schedule_sessions ss
    LEFT JOIN tasks t ON t.id = ss.task_id
    WHERE ss.user_id = ? AND ss.session_type = 'work'
      AND ss.start_time >= ? AND ss.start_time < ?
  `).all(userId, dayStart.toISOString(), dayEnd.toISOString())

  let plannedMin = 0, completedMin = 0, onTime = 0, late = 0, skipped = 0
  for (const s of sessions) {
    const dur = differenceInMinutes(parseISO(s.end_time), parseISO(s.start_time))
    plannedMin += dur
    if (s.is_completed) {
      completedMin += dur
      if (s.outcome === 'on_time') onTime++
      else if (s.outcome === 'late') late++
    } else if (dayEnd < new Date()) {
      skipped++
    }
  }
  const totalDone = onTime + late
  const recovery = recoveryRateForDay(userId, dayStart)
  const user = db.prepare('SELECT learned_capacity_hours, daily_capacity_hours FROM users WHERE id = ?').get(userId)
  const budget = (user.learned_capacity_hours || user.daily_capacity_hours) * 60
  const loadPct = budget > 0 ? Math.min(100, Math.round((plannedMin / budget) * 100)) : 0

  db.prepare(`
    INSERT INTO daily_metrics (user_id, date, planned_minutes, completed_minutes, tasks_planned, tasks_completed_on_time, tasks_completed_late, tasks_skipped, recovery_rate, load_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET
      planned_minutes=excluded.planned_minutes, completed_minutes=excluded.completed_minutes,
      tasks_planned=excluded.tasks_planned, tasks_completed_on_time=excluded.tasks_completed_on_time,
      tasks_completed_late=excluded.tasks_completed_late, tasks_skipped=excluded.tasks_skipped,
      recovery_rate=excluded.recovery_rate, load_pct=excluded.load_pct
  `).run(userId, format(dayStart,'yyyy-MM-dd'), plannedMin, completedMin, sessions.length, onTime, late, skipped, recovery, loadPct)
}

function recoveryRateForDay(userId, dayStart) {
  // Measure recovery: of sessions missed before dayStart that were rescheduled, how many were completed within 24h?
  const dayEnd = endOfDay(dayStart)
  const missedBefore = db.prepare(`
    SELECT * FROM schedule_sessions
    WHERE user_id = ? AND is_completed = 0 AND session_type = 'work'
      AND end_time < ? AND rescheduled_from IS NOT NULL
  `).all(userId, dayStart.toISOString())
  if (missedBefore.length === 0) return null
  const reschedules = db.prepare(`
    SELECT * FROM schedule_sessions
    WHERE user_id = ? AND rescheduled_from IS NOT NULL AND start_time >= ? AND start_time < ?
  `).all(userId, dayStart.toISOString(), addDays(dayStart, 2).toISOString())
  const completed = reschedules.filter(r => r.is_completed).length
  return Math.round((completed / Math.max(1, missedBefore.length)) * 100)
}

export function weeklyConsistency(userId) {
  const { start } = dateRange(7)
  const rows = db.prepare(`
    SELECT * FROM daily_metrics WHERE user_id = ? AND date >= ? ORDER BY date ASC
  `).all(userId, format(start, 'yyyy-MM-dd'))

  const totals = rows.reduce((a, r) => {
    a.planned += r.planned_minutes
    a.completed += r.completed_minutes
    a.onTime += r.tasks_completed_on_time
    a.late += r.tasks_completed_late
    a.skipped += r.tasks_skipped
    return a
  }, { planned:0, completed:0, onTime:0, late:0, skipped:0 })

  const totalTasks = totals.onTime + totals.late + totals.skipped
  const execution = totalTasks ? Math.round(((totals.onTime + totals.late) / totalTasks) * 100) : 0
  const onTimeRate = totalTasks ? Math.round((totals.onTime / totalTasks) * 100) : 0
  const lateRate = totalTasks ? Math.round((totals.late / totalTasks) * 100) : 0
  const skipRate = totalTasks ? Math.round((totals.skipped / totalTasks) * 100) : 0

  // Recovery score: of all missed sessions in last 7 days, % that were rescheduled + completed within 48h
  const weekStart = start
  const missed = db.prepare(`
    SELECT * FROM schedule_sessions
    WHERE user_id = ? AND session_type='work' AND is_completed=0 AND end_time >= ? AND end_time < ?
  `).all(userId, weekStart.toISOString(), new Date().toISOString())

  let recovered = 0
  for (const m of missed) {
    const rec = db.prepare(`
      SELECT * FROM schedule_sessions
      WHERE user_id = ? AND rescheduled_from = ? AND is_completed = 1
        AND start_time <= ?
    `).get(userId, m.id, addDays(parseISO(m.end_time), 2).toISOString())
    if (rec) recovered++
  }
  const recovery = missed.length === 0 ? 100 : Math.round((recovered / missed.length) * 100)

  // Planning accuracy: avg of actual_minutes / estimated_minutes for completed tasks
  const est = db.prepare(`
    SELECT estimated_minutes, actual_minutes FROM tasks
    WHERE user_id = ? AND status = 'completed'
      AND estimated_minutes > 0 AND actual_minutes IS NOT NULL
      AND completed_at >= ?
  `).all(userId, subDays(new Date(), 14).toISOString())
  let accuracy = 0
  if (est.length) {
    const ratios = est.map(r => Math.min(r.estimated_minutes, r.actual_minutes) / Math.max(r.estimated_minutes, r.actual_minutes))
    accuracy = Math.round((ratios.reduce((a,b)=>a+b,0) / ratios.length) * 100)
  }

  // Streak calculation
  let streak = 0
  let d = new Date()
  while (true) {
    const key = format(d, 'yyyy-MM-dd')
    const dm = db.prepare(`SELECT * FROM daily_metrics WHERE user_id = ? AND date = ?`).get(userId, key)
    if (dm && dm.tasks_completed_on_time + dm.tasks_completed_late > 0) {
      streak++; d = subDays(d, 1)
    } else {
      // if today has no completions (still in progress), allow break
      if (streak === 0 && format(d,'yyyy-MM-dd') === format(new Date(),'yyyy-MM-dd')) {
        d = subDays(d,1); continue
      }
      break
    }
  }

  // Delays (avg hours late)
  const lateTasks = db.prepare(`
    SELECT * FROM tasks WHERE user_id = ? AND outcome = 'late' AND completed_at >= ?
  `).all(userId, weekStart.toISOString())
  let avgDelay = 0
  if (lateTasks.length) {
    avgDelay = lateTasks.reduce((s,t) => s + Math.max(0, differenceInHours(parseISO(t.completed_at), parseISO(t.deadline || t.due_date))), 0) / lateTasks.length
    avgDelay = Math.round(avgDelay * 10) / 10
  }

  return {
    execution, onTimeRate, lateRate, skipRate,
    recovery, accuracy, streak, avgDelayHours: avgDelay,
    plannedHours: Math.round(totals.planned/60), completedHours: Math.round(totals.completed/60),
    tasksOnTime: totals.onTime, tasksLate: totals.late, tasksSkipped: totals.skipped
  }
}

// Estimate vs Actual learning
export function learnedDurationForCategory(userId, category) {
  const rows = db.prepare(`
    SELECT estimated_minutes, actual_minutes FROM tasks
    WHERE user_id = ? AND category = ? AND status='completed' AND actual_minutes IS NOT NULL AND actual_minutes > 0
    ORDER BY completed_at DESC LIMIT 10
  `).all(userId, category)
  if (!rows.length) return null
  const ratios = rows.map(r => r.actual_minutes / r.estimated_minutes)
  const avg = ratios.reduce((a,b)=>a+b,0) / ratios.length
  return Math.round(avg * 100) / 100 // multiplier
}

export function getInsights(userId) {
  const c = weeklyConsistency(userId)
  const insights = []
  if (c.recovery >= 85) insights.push({ type: 'positive', text: `You're getting better at recovering from missed work. Recovery rate is ${c.recovery}%.` })
  else if (c.recovery < 60) insights.push({ type: 'warning', text: 'Missed tasks are piling up. Want me to reshuffle your week?' })
  if (c.skipRate > 20) insights.push({ type: 'warning', text: 'Skip rate is high — you may be over-planning. I can lower your daily capacity.' })
  if (c.accuracy > 0 && c.accuracy < 70) insights.push({ type: 'info', text: `Your estimates are off by ~${100-c.accuracy}%. I'm adjusting future durations for you.` })
  if (c.streak >= 3) insights.push({ type: 'positive', text: `🔥 ${c.streak}-day streak! Consistency is paying off.` })
  if (insights.length === 0) insights.push({ type: 'info', text: 'Things look steady today. Add any new work and I\'ll fit it in.' })
  return insights
}
