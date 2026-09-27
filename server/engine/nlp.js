// Lightweight natural-language task understanding.
// Heuristic-based (no external API), but surprisingly capable for the student domain.
import { parse, addDays, setHours, setMinutes, isBefore, isAfter, startOfDay } from 'date-fns'

const DURATION_PATTERNS = [
  { re: /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i, mult: 60 },
  { re: /(\d+)\s*(?:minutes?|mins?|m)\b/i, mult: 1 },
  { re: /(\d+)\s*hr?\s*(\d+)\s*min?/i, mult: [60, 1] } // e.g. "1hr 30min"
]

const DAY_WORDS = {
  today: 0, tonight: 0, now: 0,
  tomorrow: 1, 'day after tomorrow': 2,
  monday: 8, tuesday: 9, wednesday: 10, thursday: 11, friday: 12, saturday: 13, sunday: 14
}
const WEEKDAY_INDEX = { monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6, sunday:0 }

const CATEGORY_KEYWORDS = {
  study: /\b(assignment|homework|study|revise|revision|read|chapter|notes|prepare|learn|practice|exam|test|quiz|paper)\b/i,
  project: /\b(project|lab|build|implement|code)\b/i,
  fitness: /\b(gym|workout|run|exercise|jog|yoga|walk|sports?)\b/i,
  personal: /\b(call|email|meeting|doctor|appointment|bank|errand|shop)\b/i,
  rest: /\b(break|nap|rest|chill|relax)\b/i
}

export function parseTaskText(text, { now = new Date(), existingCategories = [] } = {}) {
  const clean = text.trim()
  const result = {
    title: clean,
    description: '',
    category: 'study',
    estimatedMinutes: null,
    dueDate: null,
    deadline: null,
    importance: 3,
    difficulty: 3,
    autoDecompose: false,
    splitRecommendation: null
  }

  // ---- Duration ----
  let dur = 0
  for (const p of DURATION_PATTERNS) {
    const m = clean.match(p.re)
    if (!m) continue
    if (Array.isArray(p.mult)) {
      dur += parseInt(m[1]) * p.mult[0] + parseInt(m[2]) * p.mult[1]
    } else {
      dur += parseFloat(m[1]) * p.mult
    }
  }
  if (dur > 0) result.estimatedMinutes = Math.round(dur)

  // ---- Date / Deadline ----
  let due = null
  // "due Friday" / "by Friday" / "next monday"
  for (const word in DAY_WORDS) {
    const re = new RegExp(`\\b(?:due|by|on|this|next)?\\s*${word}\\b`, 'i')
    if (re.test(clean)) {
      const today = startOfDay(now)
      const currentDow = today.getDay()
      if (DAY_WORDS[word] <= 2) {
        due = addDays(today, DAY_WORDS[word])
      } else {
        const target = WEEKDAY_INDEX[word]
        let diff = target - currentDow
        if (diff <= 0) diff += 7
        due = addDays(today, diff)
      }
      // default deadline 23:00
      due = setMinutes(setHours(due, 23), 0)
      break
    }
  }
  // "next week"
  if (!due && /\bnext\s+week\b/i.test(clean)) {
    due = addDays(startOfDay(now), 7)
    due = setMinutes(setHours(due, 23), 0)
  }
  // "end of week" / "eow"
  if (!due && /\b(?:eow|end\s+of\s+(?:the\s+)?week)\b/i.test(clean)) {
    const today = startOfDay(now)
    const dow = today.getDay()
    const daysUntilSat = (6 - dow + 7) % 7
    due = setMinutes(setHours(addDays(today, daysUntilSat), 18), 0)
  }
  if (due) {
    result.dueDate = due.toISOString().slice(0, 10)
    result.deadline = due.toISOString()
  }

  // ---- Category ----
  for (const cat in CATEGORY_KEYWORDS) {
    if (CATEGORY_KEYWORDS[cat].test(clean)) { result.category = cat; break }
  }

  // ---- Big tasks → auto-decompose flag ----
  const bigTrigger = /\b(semester|final\s*exam|midterm|exam\s+s|exams|prepare\s+for\s+exams?|revise\s+(?:all|the)\s+subject|big\s+project|major\s+assignment)\b/i
  if (bigTrigger.test(clean)) {
    result.autoDecompose = true
  }
  if ((result.estimatedMinutes || 0) >= 180) {
    result.autoDecompose = true
  }

  // Difficulty heuristic
  if (/\b(hard|difficult|tough)\b/i.test(clean)) result.difficulty = 4
  if (/\b(easy|quick|simple)\b/i.test(clean)) result.difficulty = 2

  // Importance: deadlines imply high
  if (due && result.difficulty >= 3) result.importance = 4
  if (/\b(urgent|important|critical|submit|asap|today)\b/i.test(clean)) { result.importance = 5; result.difficulty = Math.max(result.difficulty, 3) }

  return result
}

// Decompose a large exam-prep / big-project style task into subtopics.
// Returns subtopics sized so their sum ≈ totalMinutes, capped at 60 min per subtopic.
export function decomposeTask(title, totalMinutes = 180, { subject = null } = {}) {
  const subs = []
  const low = title.toLowerCase()

  const subjectMap = {
    dbms: ['Transactions', 'Normalization', 'Indexing', 'SQL Practice', 'Previous Year Papers'],
    'operating systems': ['Processes & Threads', 'Scheduling Algorithms', 'Deadlocks', 'Memory Management', 'File Systems'],
    os: ['Processes & Threads', 'Scheduling', 'Deadlocks', 'Memory Management'],
    maths: ['Problem Set Review', 'Formula Revision', 'Practice Problems', 'Previous Papers'],
    math: ['Problem Set Review', 'Formula Revision', 'Practice Problems'],
    python: ['Requirements & Design', 'Core Logic', 'Testing', 'Documentation'],
    networks: ['OSI/TCP Model', 'Routing', 'Protocols', 'Practice Questions'],
    physics: ['Key Concepts', 'Derivations', 'Numericals', 'Previous Papers'],
    chemistry: ['Reactions', 'Mechanisms', 'Numericals', 'Revision']
  }

  let topics = null
  for (const key in subjectMap) {
    if (low.includes(key)) { topics = subjectMap[key]; break }
  }
  if (!topics) {
    // generic breakdown — choose topic count based on total size
    const n = Math.min(6, Math.max(3, Math.ceil(totalMinutes / 60)))
    topics = ['Outline / Materials', 'Core Content', 'Practice Problems', 'Review & Notes']
    while (topics.length < n) topics.splice(2, 0, 'Deep work — part ' + (topics.length - 2))
  }

  // Ensure at least enough topics to fit totalMinutes in ≤60 min chunks
  const maxChunk = 60
  while (topics.length * maxChunk < totalMinutes) {
    topics.push('Additional practice (' + (topics.length + 1) + ')')
  }

  const perChunk = Math.min(maxChunk, Math.ceil(totalMinutes / topics.length))
  for (let i = 0; i < topics.length; i++) {
    subs.push({
      title: `${title.split(/[—\-–:]/)[0].trim()} — ${topics[i]}`,
      category: 'study',
      estimatedMinutes: perChunk,
      difficulty: 3,
      importance: 3
    })
  }
  return subs
}

// Parse onboarding text into user profile fields (best-effort).
export function parseOnboarding(text) {
  const out = {}
  const low = text.toLowerCase()
  const yearMatch = low.match(/(\d)(?:nd|rd|st|th)?\s*[- ]?year/)
  if (yearMatch) out.course = `${yearMatch[0]}-year Student`
  else if (low.includes('cse') || low.includes('computer')) out.course = (out.course || '') + ' CSE'
  const wakeMatch = low.match(/wake\s*(?:up)?\s*(?:at|around)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (wakeMatch) {
    let h = parseInt(wakeMatch[1]); const m = parseInt(wakeMatch[2] || '0'); const p = wakeMatch[3]
    if (p === 'pm' && h < 12) h += 12
    if (p !== 'pm' && h === 12) h = 0
    out.wake_time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
  }
  const travelMatch = low.match(/(\d+)\s*(?:min(?:ute)?s?)?\s*(?:each\s*way|travel|commute)/)
  if (travelMatch) out.commute_minutes = parseInt(travelMatch[1])
  if (/\bnight\b/.test(low)) out.productivity_window = 'night'
  else if (/\bmorning\b/.test(low)) out.productivity_window = 'morning'
  else if (/\bafternoon\b/.test(low)) out.productivity_window = 'afternoon'
  return out
}
