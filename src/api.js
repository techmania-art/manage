// Tiny API helper
async function req(url, opts = {}) {
  const res = await fetch('/api' + url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  return res.json()
}
export const api = {
  me: () => req('/me'),
  updateMe: (data) => req('/me', { method: 'POST', body: data }),
  onboard: (text) => req('/onboard', { method: 'POST', body: { text } }),
  parseTask: (text) => req('/tasks/parse', { method: 'POST', body: { text } }),
  createTask: (data) => req('/tasks', { method: 'POST', body: data }),
  tasks: (status = 'pending') => req('/tasks?status=' + status),
  complete: (id, actualMinutes) => req(`/tasks/${id}/complete`, { method: 'POST', body: { actualMinutes } }),
  skip: (id) => req(`/tasks/${id}/skip`, { method: 'POST' }),
  failure: (id, reason) => req(`/tasks/${id}/failure`, { method: 'POST', body: { reason } }),
  split: (id) => req(`/tasks/${id}/split`, { method: 'POST' }),
  today: () => req('/schedule/today'),
  week: () => req('/schedule/week'),
  rescheduleProposals: () => req('/reschedule/proposals'),
  applyReschedule: (proposals) => req('/reschedule/apply', { method: 'POST', body: { proposals } }),
  opportunities: () => req('/opportunities'),
  reality: (minutes) => req('/reality', { method: 'POST', body: { minutes } }),
  planningDebt: () => req('/planning-debt'),
  consistency: () => req('/consistency'),
  insights: () => req('/insights'),
  checkin: () => req('/checkin'),
  nudge: () => req('/nudge'),
  commitments: () => req('/commitments'),
  addCommitment: (c) => req('/commitments', { method: 'POST', body: c }),
  delCommitment: (id) => req(`/commitments/${id}`, { method: 'DELETE' }),
  squad: () => req('/squad'),
  squadComplete: () => req('/squad/complete', { method: 'POST' }),
  goals: () => req('/goals'),
  addGoal: (g) => req('/goals', { method: 'POST', body: g }),
  doneGoal: (id) => req(`/goals/${id}/done`, { method: 'POST' }),
  activity: () => req('/activity')
}
