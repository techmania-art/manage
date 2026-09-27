// Time utilities shared across engines
import {
  parse, format, addMinutes, differenceInMinutes,
  startOfDay, endOfDay, setHours, setMinutes,
  isBefore, isAfter, areIntervalsOverlapping
} from 'date-fns'

export function toDate(day, timeStr) {
  // day is a Date (startOfDay), timeStr "HH:MM"
  const [h, m] = timeStr.split(':').map(Number)
  return setMinutes(setHours(day, h), m)
}

export function mins(t) {
  // "HH:MM" -> minutes from midnight
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function fromMins(mins) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function minutesBetween(a, b) {
  return differenceInMinutes(b, a)
}

export function overlap(aStart, aEnd, bStart, bEnd) {
  return areIntervalsOverlapping({ start: aStart, end: aEnd }, { start: bStart, end: bEnd })
}

export function makeInterval(start, minutes) {
  return { start, end: addMinutes(start, minutes) }
}

export { parse, format, addMinutes, startOfDay, endOfDay, isBefore, isAfter, setHours, setMinutes }
