import { Router } from 'express'
import db from '../db.js'
import { parseTaskText, decomposeTask, parseOnboarding } from '../engine/nlp.js'
import { scheduleTask, scheduleTasks, negotiateLoad, rescheduleMissed, applyReschedule, priorityScore } from '../engine/scheduler.js'
import { computeDayLoad, detectPlanningDebt, updatePersonalModel, findFreeGaps } from '../engine/capacity.js'
import { weeklyConsistency, getInsights, learnedDurationForCategory, recordDailyMetrics } from '../engine/analytics.js'
import { realityMode, findFreeTimeOpportunities } from '../engine/reality.js'
import { endOfDayCheckIn, recordFailureReason, getMotivationalNudge } from '../engine/accountability.js'
import { format, addDays, parseISO, startOfDay, endOfDay, differenceInMinutes } from 'date-fns'

const r = Router()

const USER_ID = 1 // single-user MVP

// ------ User / Onboarding ------
r.get('/me', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(USER_ID)
  res.json(user)
})

r.post('/me', (req, res) => {
  const { name, course, wake_time, sleep_time, productivity_window, commute_minutes, daily_capacity_hours } = req.body
  db.prepare(`UPDATE users SET name=?, course=?, wake_time=?, sleep_time=?, productivity_window=?, commute_minutes=?, daily_capacity_hours=?, learned_capacity_hours=NULL WHERE id=?`)
    .run(name, course, wake_time, sleep_time, productivity_window, commute_minutes, daily_capacity_hours, USER_ID)
  res.json({ ok: true })
})

r.post('/onboard', (req, res) => {
  const parsed = parseOnboarding(req.body.text || '')
  if (Object.keys(parsed).length) {
    const existing = db.prepare('SELECT * FROM users WHERE id=?').get(USER_ID)
    db.prepare(`UPDATE users SET ${Object.keys(parsed).map(k=>`${k}=?`).join(',')} WHERE id=?`)
      .run(...Object.values(parsed), USER_ID)
  }
  res.json({ ok: true, parsed })
})

// ------ Tasks (natural language) ------
r.post('/tasks/parse', (req, res) => {
  const parsed = parseTaskText(req.body.text || '', { now: new Date() })
  res.json(parsed)
})

r.post('/tasks', (req, res) => {
  const body = req.body
  let title, estimatedMinutes, category, dueDate, deadline, importance, difficulty, auto
  if (body.text) {
    const p = parseTaskText(body.text, { now: new Date() })
    title = p.title; estimatedMinutes = p.estimatedMinutes || 60; category = p.category
    dueDate = p.dueDate; deadline = p.deadline; importance = p.importance; difficulty = p.difficulty
    auto = p.autoDecompose
  } else {
    title = body.title; estimatedMinutes = body.estimatedMinutes || 60; category = body.category || 'study'
    dueDate = body.dueDate; deadline = body.deadline; importance = body.importance || 3; difficulty = body.difficulty || 3
  }

  // Adjust estimate based on learned multiplier if available
  const mult = learnedDurationForCategory(USER_ID, category)
  if (mult) estimatedMinutes = Math.round(estimatedMinutes * mult)

  const info = db.prepare(`INSERT INTO tasks
    (user_id, title, category, estimated_minutes, due_date, deadline, importance, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(USER_ID, title, category, estimatedMinutes, dueDate, deadline, importance, difficulty)
  const taskId = info.lastInsertRowid
  db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'created', ?)`).run(taskId, `Natural lang + heuristics, est ${estimatedMinutes}m`)

  // Auto decompose if big
  let subtasks = []
  if (auto && estimatedMinutes >= 180) {
    const subs = decomposeTask(title, estimatedMinutes)
    const insSub = db.prepare(`INSERT INTO tasks (user_id, title, category, estimated_minutes, due_date, deadline, importance, difficulty, parent_id, was_auto_split, status) VALUES (?,?,?,?,?,?,?,?,?,1,'pending')`)
    for (const s of subs) {
      const r = insSub.run(USER_ID, s.title, s.category, s.estimatedMinutes, dueDate, deadline, s.importance, s.difficulty, taskId)
      subtasks.push(r.lastInsertRowid)
    }
    db.prepare(`UPDATE tasks SET was_auto_split = 1, status='ai_split' WHERE id=?`).run(taskId)
    db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'split', ?)`).run(taskId, `AI decomposed big task into ${subs.length} parts`)
  }

  // Load negotiation check: when decomposed, the "effective added minutes" per day is a chunk (60m max),
  // but if we're scheduling many subtasks it will spread across days. So trigger negotiation only if the
  // task fits a single-chunk scenario or if spreading will overload too many days.
  const scheduleEstimate = subtasks.length ? 60 : estimatedMinutes // worst-case single-day addition
  const target = { estimatedMinutes: scheduleEstimate, deadline }
  const overflow = negotiateLoad(USER_ID, target)

  if (overflow.length && !body.acceptOverload) {
    return res.json({ ok: 'negotiate', taskId, overflow, options: [
      { id: 'heavy', label: 'Keep days heavy', desc: 'Schedule as-is, accepting heavier days.' },
      { id: 'spread', label: 'Spread across more days', desc: 'Use extra buffer days to keep loads moderate.' },
      { id: 'start_today', label: 'Start today', desc: 'Begin now to avoid tomorrow\'s overload.' },
      { id: 'redistribute', label: 'Let AI reshuffle everything', desc: 'Move other tasks around to make room.' }
    ], subtasks })
  }

  // Schedule main task (or subtasks) in a single pass so work distributes across days
  const toSchedule = subtasks.length ? subtasks : [taskId]
  scheduleTasks(toSchedule, body.startFrom ? { startFrom: new Date(body.startFrom) } : {})
  updatePersonalModel(USER_ID)
  res.json({ ok: true, taskId, scheduled: toSchedule })
})

r.get('/tasks', (req, res) => {
  const status = req.query.status || 'pending'
  let tasks
  if (status === 'all') {
    tasks = db.prepare(`SELECT * FROM tasks WHERE user_id = ? ORDER BY COALESCE(deadline, due_date, created_at) ASC`).all(USER_ID)
  } else {
    tasks = db.prepare(`SELECT * FROM tasks WHERE user_id = ? AND status IN ('pending','rescheduled','in_progress','ai_split') ORDER BY COALESCE(deadline, due_date, created_at) ASC`).all(USER_ID)
  }
  // attach computed priority
  tasks = tasks.map(t => ({ ...t, priorityScore: priorityScore(t) }))
  res.json(tasks)
})

r.post('/tasks/:id/complete', (req, res) => {
  const id = req.params.id
  const actual = req.body.actualMinutes || null
  const now = new Date().toISOString()
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  if (!task) return res.status(404).json({ error: 'nope' })
  const due = task.deadline || (task.due_date ? task.due_date + 'T23:00:00.000Z' : null)
  const outcome = due && parseISO(now) <= parseISO(due) ? 'on_time' : (due ? 'late' : 'on_time')
  db.prepare(`UPDATE tasks SET status='completed', completed_at=?, actual_minutes=?, outcome=? WHERE id=?`)
    .run(now, actual, outcome, id)
  db.prepare(`UPDATE schedule_sessions SET is_completed=1 WHERE task_id=?`).run(id)
  db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'completed', ?)`).run(id, outcome)

  // Update daily metrics for today
  recordDailyMetrics(USER_ID, new Date())
  updatePersonalModel(USER_ID)
  recordDailyMetrics(USER_ID, new Date())
  res.json({ ok: true, outcome })
})

r.post('/tasks/:id/skip', (req, res) => {
  const id = req.params.id
  db.prepare(`UPDATE tasks SET status='skipped', outcome='skipped' WHERE id=?`).run(id)
  db.prepare(`DELETE FROM schedule_sessions WHERE task_id=? AND is_completed=0`).run(id)
  db.prepare(`INSERT INTO task_log (task_id, event, detail) VALUES (?, 'skipped', '')`).run(id)
  res.json({ ok: true })
})

r.post('/tasks/:id/failure', (req, res) => {
  const id = req.params.id
  const result = recordFailureReason(USER_ID, id, req.body.reason)
  res.json(result)
})

r.post('/tasks/:id/split', (req, res) => {
  const id = req.params.id
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
  const est = task.estimated_minutes || 120
  const subs = decomposeTask(task.title, est)
  const insSub = db.prepare(`INSERT INTO tasks (user_id, title, category, estimated_minutes, due_date, deadline, importance, difficulty, parent_id, was_auto_split, status) VALUES (?,?,?,?,?,?,?,?,?,1,'pending')`)
  const ids = []
  for (const s of subs) {
    const r = insSub.run(USER_ID, s.title, s.category, s.estimatedMinutes, task.due_date, task.deadline, s.importance, s.difficulty, id)
    ids.push(r.lastInsertRowid)
  }
  db.prepare(`UPDATE tasks SET status='ai_split', was_auto_split=1 WHERE id=?`).run(id)
  scheduleTasks(ids)
  res.json({ ok: true, subtasks: ids })
})

// ------ Schedule ------
function serializeDay(load) {
  return {
    ...load,
    sessions: load.sessions.map(s => ({
      ...s,
      start: (s.start instanceof Date) ? s.start.toISOString() : s.start,
      end: (s.end instanceof Date) ? s.end.toISOString() : s.end
    }))
  }
}

r.get('/schedule/today', (req, res) => {
  const today = new Date()
  const load = computeDayLoad(USER_ID, today)
  recordDailyMetrics(USER_ID, today)
  res.json(serializeDay(load))
})

r.get('/schedule/week', (req, res) => {
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(startOfDay(new Date()), i)
    days.push(serializeDay(computeDayLoad(USER_ID, d)))
  }
  res.json(days)
})

// ------ Rescheduling / Missed work ------
r.get('/reschedule/proposals', (req, res) => {
  const proposals = rescheduleMissed(USER_ID)
  res.json(proposals.map(p => ({
    ...p,
    newStart: p.newStart.toISOString(),
    newEnd: p.newEnd.toISOString()
  })))
})

r.post('/reschedule/apply', (req, res) => {
  const result = applyReschedule(USER_ID, req.body.proposals || [])
  res.json(result)
})

// ------ Free time / Insights ------
r.get('/opportunities', (req, res) => {
  const opp = findFreeTimeOpportunities(USER_ID, new Date())
  res.json(opp.map(o => ({
    ...o,
    start: o.start.toISOString(),
    end: o.end.toISOString()
  })))
})

r.post('/reality', (req, res) => {
  const mins = parseInt(req.body.minutes || 60)
  res.json(realityMode(USER_ID, mins))
})

r.get('/planning-debt', (req, res) => {
  res.json(detectPlanningDebt(USER_ID))
})

// ------ Consistency / Dashboard ------
r.get('/consistency', (req, res) => {
  res.json(weeklyConsistency(USER_ID))
})

r.get('/insights', (req, res) => {
  res.json(getInsights(USER_ID))
})

r.get('/checkin', (req, res) => {
  res.json(endOfDayCheckIn(USER_ID))
})

r.get('/nudge', (req, res) => {
  res.json({ text: getMotivationalNudge(USER_ID) })
})

// ------ Fixed commitments ------
r.get('/commitments', (req, res) => {
  res.json(db.prepare(`SELECT * FROM fixed_commitments WHERE user_id=? ORDER BY day_of_week, start_time`).all(USER_ID))
})
r.post('/commitments', (req, res) => {
  const { title, day_of_week, start_time, end_time, category } = req.body
  db.prepare(`INSERT INTO fixed_commitments (user_id, title, day_of_week, start_time, end_time, category) VALUES (?,?,?,?,?,?)`)
    .run(USER_ID, title, day_of_week, start_time, end_time, category || 'class')
  res.json({ ok: true })
})
r.delete('/commitments/:id', (req, res) => {
  db.prepare(`DELETE FROM fixed_commitments WHERE id=? AND user_id=?`).run(req.params.id, USER_ID)
  res.json({ ok: true })
})

// ------ Squad / Friends ------
r.get('/squad', (req, res) => {
  const member = db.prepare(`SELECT * FROM squad_members WHERE user_id=?`).get(USER_ID)
  if (!member) return res.json(null)
  const squad = db.prepare(`SELECT * FROM squads WHERE id=?`).get(member.squad_id)
  const members = db.prepare(`SELECT display_name, streak_days, tasks_completed_week, CASE WHEN user_id=? THEN 1 ELSE 0 END as is_you FROM squad_members WHERE squad_id=? ORDER BY streak_days DESC`).all(USER_ID, squad.id)
  const total = members.reduce((s,m)=>s+m.tasks_completed_week,0)
  res.json({ ...squad, members, weekTotal: total, weekGoal: 50 })
})

r.post('/squad/complete', (req, res) => {
  // simulate incrementing user's weekly count
  db.prepare(`UPDATE squad_members SET tasks_completed_week = tasks_completed_week + 1 WHERE user_id=?`).run(USER_ID)
  res.json({ ok: true })
})

// ------ Goals ------
r.get('/goals', (req, res) => {
  res.json(db.prepare(`SELECT * FROM goals WHERE user_id=? ORDER BY status, target_date`).all(USER_ID))
})
r.post('/goals', (req, res) => {
  const info = db.prepare(`INSERT INTO goals (user_id, title, target_date) VALUES (?,?,?)`).run(USER_ID, req.body.title, req.body.target_date || null)
  res.json({ ok: true, id: info.lastInsertRowid })
})
r.post('/goals/:id/done', (req, res) => {
  db.prepare(`UPDATE goals SET status='completed' WHERE id=? AND user_id=?`).run(req.params.id, USER_ID)
  res.json({ ok: true })
})

// ------ Task log (activity) ------
r.get('/activity', (req, res) => {
  res.json(db.prepare(`SELECT l.*, t.title FROM task_log l JOIN tasks t ON t.id = l.task_id ORDER BY l.created_at DESC LIMIT 50`).all())
})

export default r
