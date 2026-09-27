// Scheduling Engine — places tasks on the calendar respecting capacity, energy windows,
// dependencies, and deadlines. Supports automatic rescheduling of missed work.
import db from '../db.js'
import { startOfDay, addDays, parseISO, format, differenceInMinutes, addMinutes, isBefore, isAfter, compareAsc } from 'date-fns'
import { computeDayLoad, findFreeGaps, estimateDailyCapacity } from './capacity.js'
import { toDate } from './timeUtils.js'

function log(taskId, event, detail) {
  db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, ?, ?)`)
    .run(taskId, event, detail)
}

function productivityScore(cap, start /* Date */, minutes) {
  // Higher = better fit for focused work
  const hr = start.getHours()
  let score = 1
  if (cap.productivityWindow === 'night' && hr >= 19 && hr <= 23) score = 1.5
  else if (cap.productivityWindow === 'morning' && hr >= 7 && hr <= 12) score = 1.5
  else if (cap.productivityWindow === 'afternoon' && hr >= 13 && hr <= 17) score = 1.5
  if (hr >= 22) score *= 0.7 // late night penalty
  if (hr >= 12 && hr <= 14) score *= 0.9 // post-lunch dip
  return score
}

// Find best placement for a block of `minutes` before deadline.
function findBestSlot(userId, taskId, minutes, deadline, opts = {}) {
  const {
    startFrom = new Date(),
    category = 'study',
    preferredDay = null,
    forceNextDay = false
  } = opts
  let day = forceNextDay ? addDays(startOfDay(startFrom), startFrom > startOfDay(startFrom) ? 1 : 0) : startOfDay(startFrom)
  // If startFrom is late today (after candidate's free window), also move cursor to next useful day
  if (!forceNextDay && startFrom.getHours() >= 22) {
    day = addDays(day, 1)
  }
  const maxLookAhead = 14
  for (let i = 0; i < maxLookAhead; i++) {
    const candidate = preferredDay ? addDays(startOfDay(preferredDay), i === 0 ? 0 : (i-1)) : addDays(day, i)
    if (deadline && candidate > startOfDay(deadline)) {
      // deadline is today; still check
    }
    const { gaps, cap } = findFreeGaps(userId, candidate)
    const load = computeDayLoad(userId, candidate)
    const maxAcceptableLoad = 75 // prefer moderate days
    const candidates = []
    for (const g of gaps) {
      const effectiveStart = g.start < startFrom ? startFrom : g.start
      if (effectiveStart >= g.end) continue
      const gapMinutes = differenceInMinutes(g.end, effectiveStart)
      if (gapMinutes < minutes) continue // must fit entirely
      const newLoad = load.loadPct + (minutes / cap.budgetMinutes) * 100
      if (newLoad > 90) continue // hard cap 90%
      if (deadline && isAfter(effectiveStart, deadline)) continue
      const ps = productivityScore(cap, effectiveStart, minutes)
      // Score: prefer lower-load days + productivity windows
      const loadScore = Math.max(0, 100 - newLoad) / 100
      // Deadline proximity: prefer days closer to (but before) deadline, rather than stacking everything today
      let deadlineScore = 0.5
      if (deadline && isFinite(deadline)) {
        const hoursUntilSlot = differenceInMinutes(effectiveStart, new Date()) / 60
        const hoursUntilDeadline = differenceInMinutes(deadline, new Date()) / 60
        if (hoursUntilDeadline > 0 && hoursUntilSlot > 0) {
          // Prefer slots at ~30-70% of the time-to-deadline (not too early, not last-minute)
          const ratio = hoursUntilSlot / hoursUntilDeadline
          const sweet = 0.6 - Math.abs(ratio - 0.55) * 1.1
          deadlineScore = Math.max(0.2, Math.min(1.2, sweet + 0.3))
        }
      }
      // Today bonus: if today has capacity, slight boost for making progress now
      const todayBonus = format(candidate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 0.1 : 0
      const score = loadScore * 1.5 + ps * 0.6 + deadlineScore * 0.8 + todayBonus
      candidates.push({ gap: { start: effectiveStart, end: g.end }, score, newLoad, size: minutes })
    }
    candidates.sort((a,b) => b.score - a.score || a.newLoad - b.newLoad)
    if (candidates.length) {
      const chosen = candidates[0]
      return {
        start: chosen.gap.start,
        end: addMinutes(chosen.gap.start, chosen.size),
        day: candidate,
        projectedLoad: Math.round(chosen.newLoad),
        score: chosen.score,
        placedMinutes: chosen.size
      }
    }
    day = addDays(day, 1)
  }
  return null
}

// Schedule a single task, splitting into chunks ≤ chunkMax minutes.
export function scheduleTask(taskId, opts = {}) {
  const result = scheduleTasks([taskId], opts)
  return result[taskId] || { error: 'Failed' }
}

// Schedule multiple tasks in a single forward pass (cursor doesn't reset between tasks).
export function scheduleTasks(taskIds, opts = {}) {
  const results = {}
  let cursor = opts.startFrom ? new Date(opts.startFrom) : new Date()
  const chunkMax = 60
  const chunks = [] // { taskId, size }

  for (const taskId of taskIds) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    if (!task) { results[taskId] = { error: 'Not found' }; continue }
    const est = task.estimated_minutes || 60
    // If task is an ai_split leaf (small subtopic), schedule as one piece.
    // Otherwise split into chunkMax blocks.
    if (task.was_auto_split === 1 && est <= chunkMax) {
      chunks.push({ taskId, task, size: est })
    } else {
      let remaining = est
      while (remaining > 0) {
        const size = Math.min(chunkMax, remaining)
        chunks.push({ taskId, task, size })
        remaining -= size
      }
    }
    results[taskId] = { placements: [] }
  }

  // Sort: by deadline, then priority
  chunks.sort((a, b) => {
    const ad = a.task.deadline ? parseISO(a.task.deadline).getTime() : Infinity
    const bd = b.task.deadline ? parseISO(b.task.deadline).getTime() : Infinity
    return ad - bd
  })

  let safety = 0
  const chunksPerTaskPerDay = {}
  const chunksPerDay = {} // total study chunks scheduled today (from schedule_sessions + placements)
  const MAX_CHUNKS_PER_DAY_TOTAL = 6 // absolute cap regardless of task
  while (chunks.length > 0 && safety < 200) {
    safety++
    const c = chunks.shift()
    // Count existing sessions for this day from DB
    const dayStart = startOfDay(cursor)
    const dayKey = format(dayStart, 'yyyy-MM-dd')
    const existingSessions = db.prepare(`
      SELECT COUNT(*) as c FROM schedule_sessions
      WHERE user_id = ? AND session_type = 'work'
        AND start_time >= ? AND start_time < ?
    `).get(c.task.user_id, dayStart.toISOString(), addDays(dayStart,1).toISOString())?.c || 0
    const placedToday = chunksPerDay[dayKey] || 0
    const totalToday = existingSessions + placedToday
    const key = `${c.taskId}:${dayKey}`
    const sameTaskToday = chunksPerTaskPerDay[key] || 0
    if (sameTaskToday >= 2 || totalToday >= MAX_CHUNKS_PER_DAY_TOTAL) {
      // jump to next morning
      cursor = addDays(dayStart, 1)
      const user = db.prepare('SELECT wake_time FROM users WHERE id = ?').get(c.task.user_id)
      const [h,m] = (user?.wake_time || '08:00').split(':').map(Number)
      cursor.setHours(h, m, 0, 0)
      chunks.unshift(c)
      continue
    }
    const deadline = c.task.deadline ? parseISO(c.task.deadline) : addDays(cursor, 21)
    const slot = findBestSlot(c.task.user_id, c.taskId, c.size, deadline, { startFrom: cursor, category: c.task.category })
    if (!slot) { results[c.taskId] = { error: 'No slot' }; continue }
    const placedDayKey = format(slot.day, 'yyyy-MM-dd')
    const pkey = `${c.taskId}:${placedDayKey}`
    chunksPerTaskPerDay[pkey] = (chunksPerTaskPerDay[pkey] || 0) + 1
    chunksPerDay[placedDayKey] = (chunksPerDay[placedDayKey] || 0) + 1
    results[c.taskId].placements.push({ size: slot.placedMinutes, ...slot })
    // Advance cursor
    const sameTaskAfter = chunksPerTaskPerDay[pkey] || 0
    const totalAfter = (db.prepare(`SELECT COUNT(*) as c FROM schedule_sessions WHERE user_id=? AND session_type='work' AND start_time>=? AND start_time<?`).get(c.task.user_id, startOfDay(slot.end).toISOString(), addDays(startOfDay(slot.end),1).toISOString())?.c || 0) + (chunksPerDay[placedDayKey]||0)
    if ((sameTaskAfter >= 2 || totalAfter >= MAX_CHUNKS_PER_DAY_TOTAL) && chunks.length > 0) {
      cursor = addDays(startOfDay(slot.end), 1)
      const user = db.prepare('SELECT wake_time FROM users WHERE id = ?').get(c.task.user_id)
      const [h,m] = (user?.wake_time || '08:00').split(':').map(Number)
      cursor.setHours(h, m, 0, 0)
    } else {
      cursor = addMinutes(slot.end, 15)
    }
  }

  // Write sessions and update tasks
  const insert = db.prepare(`INSERT INTO schedule_sessions (task_id, user_id, start_time, end_time, session_type) VALUES (?,?,?,?,'work')`)
  for (const tid of taskIds) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(tid)
    if (!task || !results[tid]?.placements?.length) continue
    const ps = results[tid].placements
    for (const p of ps) insert.run(tid, task.user_id, p.start.toISOString(), p.end.toISOString())
    const first = ps[0], last = ps[ps.length-1]
    db.prepare(`UPDATE tasks SET status='pending', scheduled_for=?, scheduled_end=? WHERE id=?`)
      .run(first.start.toISOString(), last.end.toISOString(), tid)
    log(tid, 'scheduled', `${ps.length} session(s) placed starting ${format(first.start, 'EEE MMM d HH:mm')}`)
    results[tid] = { ok: true, placements: ps }
  }
  return results
}

// Load negotiation: detect overload if adding a task would push day past threshold.
export function negotiateLoad(userId, task) {
  // Quick feasibility check across days from today until deadline
  const deadline = task.deadline ? parseISO(task.deadline) : addDays(new Date(), 7)
  const day = startOfDay(new Date())
  const overflowDays = []
  for (let i = 0; i <= Math.max(7, Math.ceil(differenceInMinutes(deadline, day) / (60*24))); i++) {
    const d = addDays(day, i)
    const load = computeDayLoad(userId, d)
    const cap = estimateDailyCapacity(userId, d)
    if (load.studyMinutes + (task.estimatedMinutes || 60) > cap.budgetMinutes) {
      overflowDays.push({ date: format(d, 'yyyy-MM-dd'), load: load.loadPct, projected: Math.round(((load.studyMinutes + (task.estimatedMinutes || 60)) / cap.budgetMinutes) * 100) })
    }
  }
  return overflowDays
}

// Automatically reschedule any missed sessions that were supposed to happen before `now`.
export function rescheduleMissed(userId, { askFirst = true } = {}) {
  const now = new Date()
  const missedSessions = db.prepare(`
    SELECT ss.*, t.title, t.estimated_minutes
    FROM schedule_sessions ss
    JOIN tasks t ON t.id = ss.task_id
    WHERE ss.user_id = ? AND ss.is_completed = 0 AND ss.end_time < ? AND ss.session_type = 'work'
    ORDER BY ss.start_time ASC
  `).all(userId, now.toISOString())

  const proposals = []
  for (const s of missedSessions) {
    const minutes = differenceInMinutes(parseISO(s.end_time), parseISO(s.start_time))
    const slot = findBestSlot(userId, s.task_id, minutes, null, { startFrom: now })
    if (slot) {
      proposals.push({ sessionId: s.id, taskId: s.task_id, title: s.title, minutes, oldStart: s.start_time, newStart: slot.start.toISOString(), newEnd: slot.end.toISOString(), newLoadPct: slot.projectedLoad })
    }
  }
  return proposals
}

export function applyReschedule(userId, proposals) {
  const del = db.prepare(`DELETE FROM schedule_sessions WHERE id = ?`)
  const ins = db.prepare(`INSERT INTO schedule_sessions (task_id, user_id, start_time, end_time, session_type, rescheduled_from) VALUES (?, ?, ?, ?, 'work', ?)`)
  const logUp = db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'rescheduled', ?)`)
  for (const p of proposals) {
    if (!p.accept) continue
    del.run(p.sessionId)
    ins.run(p.taskId, userId, p.newStart, p.newEnd, p.sessionId)
    db.prepare(`UPDATE tasks SET postponed_count = postponed_count + 1, status = 'rescheduled' WHERE id = ?`).run(p.taskId)
    logUp.run(p.taskId, `Rescheduled to ${format(parseISO(p.newStart), 'EEE MMM d HH:mm')}`)
  }
  return { ok: true }
}

// Priority score for a task (higher = more urgent/important to schedule now).
export function priorityScore(task) {
  const now = new Date()
  const due = task.deadline ? parseISO(task.deadline) : null
  let score = (task.importance || 3) * 10
  if (due) {
    const hoursLeft = differenceInMinutes(due, now) / 60
    if (hoursLeft <= 4) score += 50
    else if (hoursLeft <= 24) score += 40
    else if (hoursLeft <= 48) score += 25
    else if (hoursLeft <= 72) score += 15
    else if (hoursLeft <= 168) score += 10
  }
  score += (task.difficulty || 3) * 2
  if (task.postponed_count >= 3) score += 20 // planning debt → escalate
  return Math.round(score)
}
