// Capacity / Load Engine
// Computes daily budgets, detects overload, and updates the personal capacity model from behaviour.
import db from '../db.js'
import { startOfDay, endOfDay, parseISO, differenceInMinutes, addMinutes, format } from 'date-fns'
import { toDate, mins } from './timeUtils.js'

function minsToString(m) {
  const h = Math.floor(m / 60), r = m % 60
  return `${h}h ${r}m`
}

export function getFixedBlocks(userId, day /*Date*/) {
  const dow = day.getDay()
  const commitments = db.prepare(
    `SELECT * FROM fixed_commitments WHERE user_id = ? AND day_of_week = ?`
  ).all(userId, dow)
  return commitments.map(c => ({
    type: c.category,
    title: c.title,
    start: toDate(day, c.start_time),
    end: toDate(day, c.end_time)
  }))
}

// Estimate study capacity for a given day (in minutes), considering commute, classes, sleep, preferences.
export function estimateDailyCapacity(userId, day /*Date*/) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  const wake = toDate(day, user.wake_time)
  const sleep = toDate(day, user.sleep_time)
  if (sleep <= wake) {
    // next day sleep; interpret same-day sleep as 23:59
  }
  const awakeMinutes = Math.max(0, differenceInMinutes(sleep <= wake ? addMinutes(endOfDay(day), -1) : sleep, wake))
  const fixed = getFixedBlocks(userId, day)
  const committedMinutes = fixed.reduce((sum, b) => sum + differenceInMinutes(b.end, b.start), 0)
  const commute = user.commute_minutes * 2 // round trip
  const essentials = 60 // meals, shower, etc.

  // learned vs default
  const capacityHrs = user.learned_capacity_hours ?? user.daily_capacity_hours
  let studyBudget = Math.round(capacityHrs * 60)

  // Day-of-week adjustment: weekends typically more
  const dow = day.getDay()
  if (dow === 0 || dow === 6) studyBudget = Math.round(studyBudget * 1.4)

  // But cannot exceed the free awake minutes minus essentials
  const freeTime = awakeMinutes - committedMinutes - commute - essentials
  const capped = Math.max(30, Math.min(studyBudget, freeTime))
  return {
    budgetMinutes: capped,
    awakeMinutes,
    committedMinutes,
    commuteMinutes: commute,
    freeMinutes: freeTime,
    wake,
    sleep,
    productivityWindow: user.productivity_window
  }
}

// Compute current load on a given day
export function computeDayLoad(userId, day) {
  const dayStart = startOfDay(day)
  const cap = estimateDailyCapacity(userId, day)
  const fixed = getFixedBlocks(userId, day)

  const scheduled = db.prepare(`
    SELECT ss.*, t.title, t.category as task_category, t.status
    FROM schedule_sessions ss
    LEFT JOIN tasks t ON t.id = ss.task_id
    WHERE ss.user_id = ?
      AND ss.start_time >= ? AND ss.start_time < ?
  `).all(userId, dayStart.toISOString(), addMinutes(dayStart, 24*60).toISOString())

  const studyMinutes = scheduled
    .filter(s => s.session_type === 'work')
    .reduce((s, x) => s + differenceInMinutes(parseISO(x.end_time), parseISO(x.start_time)), 0)

  const loadPct = cap.budgetMinutes > 0 ? (studyMinutes / cap.budgetMinutes) * 100 : 0

  let level, color
  if (loadPct < 50) { level = 'Low'; color = 'green' }
  else if (loadPct < 75) { level = 'Moderate'; color = 'yellow' }
  else if (loadPct < 95) { level = 'Heavy'; color = 'orange' }
  else { level = 'Overloaded'; color = 'red' }

  return {
    date: format(day, 'yyyy-MM-dd'),
    budgetMinutes: cap.budgetMinutes,
    studyMinutes,
    fixedMinutes: cap.committedMinutes + cap.commuteMinutes,
    loadPct: Math.round(loadPct),
    level, color,
    sessions: [...fixed.map(b => ({ ...b, fixed: true })), ...scheduled.map(s => ({
      title: s.title || '(work)',
      start: parseISO(s.start_time),
      end: parseISO(s.end_time),
      type: s.session_type,
      fixed: false,
      taskId: s.task_id,
      status: s.status
    }))].sort((a,b) => a.start - b.start)
  }
}

// Find free gaps in a day that are >= minMinutes
export function findFreeGaps(userId, day, minMinutes = 15, existingSessions = null) {
  const cap = estimateDailyCapacity(userId, day)
  if (!existingSessions) existingSessions = computeDayLoad(userId, day).sessions
  const gaps = []
  let cursor = cap.wake
  for (const s of existingSessions) {
    if (s.start > cursor && differenceInMinutes(s.start, cursor) >= minMinutes) {
      gaps.push({ start: cursor, end: s.start, minutes: differenceInMinutes(s.start, cursor) })
    }
    if (s.end > cursor) cursor = s.end
  }
  const dayEnd = cap.sleep
  if (dayEnd > cursor && differenceInMinutes(dayEnd, cursor) >= minMinutes) {
    gaps.push({ start: cursor, end: dayEnd, minutes: differenceInMinutes(dayEnd, cursor) })
  }
  return { gaps, cap }
}

// Update personal capacity model based on recent behaviour.
export function updatePersonalModel(userId) {
  // Look at last 14 days of completed work
  const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  const rows = db.prepare(`
    SELECT date, completed_minutes FROM daily_metrics
    WHERE user_id = ? AND date >= ? AND completed_minutes > 0
    ORDER BY date DESC LIMIT 14
  `).all(userId, twoWeeksAgo.toISOString().slice(0,10))

  if (rows.length < 3) return // not enough data
  // Weighted moving average (recent matters more)
  let weighted = 0, totalW = 0
  rows.forEach((r, i) => {
    const w = rows.length - i
    weighted += r.completed_minutes * w
    totalW += w
  })
  const avg = weighted / totalW
  const learnedHrs = Math.round((avg / 60) * 2) / 2 // round to 0.5
  db.prepare(`UPDATE users SET learned_capacity_hours = ? WHERE id = ?`).run(learnedHrs, userId)
  return learnedHrs
}

// Detect planning debt (postponed N times)
export function detectPlanningDebt(userId) {
  return db.prepare(`
    SELECT * FROM tasks
    WHERE user_id = ? AND status IN ('pending','rescheduled') AND postponed_count >= 3
    ORDER BY postponed_count DESC
  `).all(userId)
}

export { minsToString }
