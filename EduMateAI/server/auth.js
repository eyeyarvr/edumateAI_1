import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from './config.js'
import { one } from './db/index.js'
import { HttpError } from './errors.js'

export const COOKIE = 'edumate_session'

export const hashPassword = (pw) => bcrypt.hash(pw, 12)
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash)

/** Throws 400 with `message` unless `password` is the user's current password. */
export async function verifyPassword(userId, password, message) {
  const user = one('SELECT password_hash FROM users WHERE id = ?', userId)
  if (!(await checkPassword(password, user.password_hash))) throw new HttpError(400, message)
}

/** Issue the session cookie. `remember` keeps it for 30 days, otherwise it ends with the browser session. */
export function startSession(res, userId, remember = true) {
  const maxAge = 30 * 24 * 3600 * 1000
  const token = jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: remember ? '30d' : '1d' })
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
    ...(remember ? { maxAge } : {}),
  })
}

export function endSession(res) {
  res.clearCookie(COOKIE, { path: '/' })
}

/** Express middleware: rejects the request unless a valid session cookie is present. */
export function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE]
  if (!token) return next(new HttpError(401, 'Please sign in to continue.'))
  try {
    const { sub } = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    const user = one('SELECT id FROM users WHERE id = ?', sub)
    if (!user) return next(new HttpError(401, 'Your account no longer exists.'))
    req.userId = user.id
    next()
  } catch {
    next(new HttpError(401, 'Your session has expired. Please sign in again.'))
  }
}

export function publicUser(id) {
  const u = one(`SELECT u.id, u.first_name, u.last_name, u.email, u.university, u.program, u.created_at,
                        s.study_reminders, s.upcoming_deadlines, s.weekly_summary
                 FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`, id)
  if (!u) return null
  return {
    id: u.id,
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    university: u.university,
    program: u.program,
    createdAt: u.created_at,
    settings: {
      studyReminders: !!u.study_reminders,
      upcomingDeadlines: !!u.upcoming_deadlines,
      weeklySummary: !!u.weekly_summary,
    },
  }
}
