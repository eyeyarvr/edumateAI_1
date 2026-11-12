import { Router } from 'express'
import { all, insert, one, run, transaction } from '../db/index.js'
import { HttpError } from '../errors.js'
import { checkPassword, endSession, hashPassword, publicUser, requireAuth, startSession, verifyPassword } from '../auth.js'
import { removeUploads } from '../uploads.js'
import { email, newPassword, str } from '../validate.js'

export const authRouter = Router()

// Very small in-memory brute-force guard: 10 failed logins per email+IP per 15 minutes.
const WINDOW_MS = 15 * 60_000
const failures = new Map()
function tooManyAttempts(key) {
  const entry = failures.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > WINDOW_MS) { failures.delete(key); return false }
  return entry.count >= 10
}
// Drop expired entries so the map can't grow without bound.
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS
  for (const [key, entry] of failures) if (entry.first < cutoff) failures.delete(key)
}, WINDOW_MS).unref()
function recordFailure(key) {
  const entry = failures.get(key) || { count: 0, first: Date.now() }
  entry.count++
  failures.set(key, entry)
}

authRouter.post('/auth/signup', async (req, res) => {
  const fullName = str(req.body, 'fullName', { required: true, max: 120 })
  const mail = email(req.body)
  const password = newPassword(req.body, 'password')
  if (one('SELECT id FROM users WHERE email = ?', mail)) throw new HttpError(409, 'An account with this email already exists. Try signing in.')

  const [first, ...rest] = fullName.split(/\s+/)
  const hash = await hashPassword(password)
  const id = transaction(() => {
    const userId = insert('INSERT INTO users (first_name, last_name, email, password_hash) VALUES (?, ?, ?, ?)', first, rest.join(' '), mail, hash)
    run('INSERT INTO user_settings (user_id) VALUES (?)', userId)
    return userId
  })
  startSession(res, id, true)
  res.status(201).json({ user: publicUser(id) })
})

authRouter.post('/auth/login', async (req, res) => {
  const mail = email(req.body)
  const password = str(req.body, 'password', { required: true, max: 200 })
  const key = `${mail}|${req.ip}`
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many failed attempts. Please wait 15 minutes and try again.')

  const user = one('SELECT id, password_hash FROM users WHERE email = ?', mail)
  if (!user || !(await checkPassword(password, user.password_hash))) {
    recordFailure(key)
    throw new HttpError(401, 'Incorrect email or password.')
  }
  failures.delete(key)
  startSession(res, user.id, req.body.remember !== false)
  res.json({ user: publicUser(user.id) })
})

authRouter.post('/auth/logout', (_req, res) => {
  endSession(res)
  res.json({ ok: true })
})

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.userId) })
})

// ----- Profile & settings -----
authRouter.put('/me', requireAuth, (req, res) => {
  const b = req.body
  run(`UPDATE users SET first_name = ?, last_name = ?, university = ?, program = ?, updated_at = datetime('now') WHERE id = ?`,
    str(b, 'firstName', { required: true, max: 60 }), str(b, 'lastName', { max: 60 }),
    str(b, 'university', { max: 120 }), str(b, 'program', { max: 120 }), req.userId)
  if (b.settings && typeof b.settings === 'object') {
    const s = b.settings
    run(`INSERT INTO user_settings (user_id, study_reminders, upcoming_deadlines, weekly_summary) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET study_reminders = excluded.study_reminders,
           upcoming_deadlines = excluded.upcoming_deadlines, weekly_summary = excluded.weekly_summary`,
      req.userId, s.studyReminders ? 1 : 0, s.upcomingDeadlines ? 1 : 0, s.weeklySummary ? 1 : 0)
  }
  res.json({ user: publicUser(req.userId) })
})

authRouter.put('/me/password', requireAuth, async (req, res) => {
  const current = str(req.body, 'currentPassword', { required: true, max: 200 })
  const next = newPassword(req.body, 'newPassword', 'New password')
  await verifyPassword(req.userId, current, 'Your current password is incorrect.')
  run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", await hashPassword(next), req.userId)
  res.json({ ok: true })
})

authRouter.delete('/me', requireAuth, async (req, res) => {
  const password = str(req.body, 'password', { required: true, max: 200 })
  await verifyPassword(req.userId, password, 'Password is incorrect.')
  const files = all('SELECT stored_name FROM modules WHERE user_id = ? AND stored_name IS NOT NULL', req.userId)
  run('DELETE FROM users WHERE id = ?', req.userId) // cascades to every table
  removeUploads(files.map((f) => f.stored_name))
  endSession(res)
  res.json({ ok: true })
})
