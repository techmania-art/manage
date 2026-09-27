import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, 'lifepilot.db'))
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT 'Student',
  course TEXT DEFAULT '',
  wake_time TEXT DEFAULT '07:00',
  sleep_time TEXT DEFAULT '23:00',
  productivity_window TEXT DEFAULT 'night', -- morning, afternoon, night
  commute_minutes INTEGER DEFAULT 0,
  daily_capacity_hours REAL DEFAULT 5.0,
  learned_capacity_hours REAL DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixed_commitments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  day_of_week INTEGER NOT NULL, -- 0=Sun..6=Sat
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  category TEXT DEFAULT 'class'
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'study',
  estimated_minutes INTEGER DEFAULT 60,
  actual_minutes INTEGER DEFAULT NULL,
  due_date TEXT,
  deadline TEXT,
  priority REAL DEFAULT 0,
  importance REAL DEFAULT 3, -- 1-5
  difficulty REAL DEFAULT 3, -- 1-5
  parent_id INTEGER DEFAULT NULL REFERENCES tasks(id),
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, skipped, cancelled, rescheduled, ai_split
  outcome TEXT DEFAULT NULL,   -- on_time, late, skipped, cancelled
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT NULL,
  scheduled_for TEXT DEFAULT NULL, -- ISO datetime start
  scheduled_end TEXT DEFAULT NULL,
  postponed_count INTEGER DEFAULT 0,
  was_auto_split INTEGER DEFAULT 0,
  failure_reason TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS schedule_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  session_type TEXT DEFAULT 'work', -- work, commute, class, exercise, buffer, free, sleep
  is_completed INTEGER DEFAULT 0,
  rescheduled_from INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS task_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  event TEXT NOT NULL, -- created, split, scheduled, rescheduled, completed, skipped, postponed
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  target_date TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS squads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS squad_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id INTEGER REFERENCES squads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  display_name TEXT NOT NULL,
  streak_days INTEGER DEFAULT 0,
  tasks_completed_week INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  date TEXT NOT NULL,
  planned_minutes INTEGER DEFAULT 0,
  completed_minutes INTEGER DEFAULT 0,
  tasks_planned INTEGER DEFAULT 0,
  tasks_completed_on_time INTEGER DEFAULT 0,
  tasks_completed_late INTEGER DEFAULT 0,
  tasks_skipped INTEGER DEFAULT 0,
  recovery_rate REAL DEFAULT 0,
  load_pct REAL DEFAULT 0,
  UNIQUE(user_id, date)
);
`)

// seed a default user if none
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
if (userCount === 0) {
  db.prepare(`INSERT INTO users (name, course, wake_time, sleep_time, productivity_window, commute_minutes, daily_capacity_hours)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('Rahul', 'B.Tech CSE — Year 2', '07:30', '23:30', 'night', 45, 5.0)

  // Seed sample fixed commitments (Mon-Fri 9-4 classes)
  const insert = db.prepare(`INSERT INTO fixed_commitments (user_id, title, day_of_week, start_time, end_time, category) VALUES (?, ?, ?, ?, ?, ?)`)
  const classes = [
    ['DBMS', 1, '09:00', '10:30'],
    ['Operating Systems', 1, '10:45', '12:15'],
    ['Lunch', 1, '12:15', '13:00'],
    ['Maths', 1, '13:00', '14:30'],
    ['Python Lab', 1, '14:45', '16:00'],
    ['DBMS', 2, '09:00', '10:30'],
    ['Networks', 2, '10:45', '12:15'],
    ['Lunch', 2, '12:15', '13:00'],
    ['OS Lab', 2, '13:00', '14:30'],
    ['Python', 2, '14:45', '16:00'],
    ['Maths', 3, '09:00', '10:30'],
    ['DBMS', 3, '10:45', '12:15'],
    ['Lunch', 3, '12:15', '13:00'],
    ['Networks', 3, '13:00', '14:30'],
    ['OS', 3, '14:45', '16:00'],
    ['Python', 4, '09:00', '10:30'],
    ['Maths', 4, '10:45', '12:15'],
    ['Lunch', 4, '12:15', '13:00'],
    ['DBMS Lab', 4, '13:00', '14:30'],
    ['Networks', 4, '14:45', '16:00'],
    ['OS', 5, '09:00', '10:30'],
    ['Python', 5, '10:45', '12:15'],
    ['Lunch', 5, '12:15', '13:00'],
    ['Maths', 5, '13:00', '14:30'],
    ['Seminar', 5, '14:45', '16:00']
  ]
  for (const [title, day, st, et] of classes) insert.run(1, title, day, st, et, title === 'Lunch' ? 'break' : 'class')

  // Seed sample squad
  const squadInfo = db.prepare(`INSERT INTO squads (name, invite_code) VALUES (?, ?)`).run('CSE Warriors', 'CSE2024')
  const memberInsert = db.prepare(`INSERT INTO squad_members (squad_id, user_id, display_name, streak_days, tasks_completed_week) VALUES (?, ?, ?, ?, ?)`)
  memberInsert.run(squadInfo.lastInsertRowid, 1, 'Rahul (you)', 4, 12)
  memberInsert.run(squadInfo.lastInsertRowid, null, 'Arun', 5, 16)
  memberInsert.run(squadInfo.lastInsertRowid, null, 'Anu', 4, 14)
  memberInsert.run(squadInfo.lastInsertRowid, null, 'Rahul', 3, 9)
}

export default db
