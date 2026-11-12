import { Router } from 'express'
import { all, findOwned, insert, one, run } from '../db/index.js'
import { HttpError } from '../errors.js'
import { removeUploads } from '../uploads.js'
import { str } from '../validate.js'
import { getSubject, listSubjects, logActivity, quizTrend, topicAccuracy } from '../stats.js'

export const subjectsRouter = Router()

const COLORS = ['#DCFCE7', '#E0F2FE', '#F3E8FF', '#FEF3C7', '#FFE4E6', '#E0E7FF', '#CCFBF1']

export const ownSubject = (userId, id) => findOwned('subjects', userId, id, 'Subject')

const makeIcon = (name, code) => (code.split(/\s+/)[0] || name.replace(/[^A-Za-z]/g, '')).slice(0, 4).toUpperCase() || 'SUB'

/** Fields shared by create and update. icon/color fall back to `prev`, then to generated defaults. */
function subjectFields(body, prev) {
  const name = str(body, 'name', { required: true, max: 100 })
  const code = str(body, 'code', { max: 20 })
  const color = str(body, 'color', { max: 7 })
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, 'Color must be a hex value such as #DCFCE7.')
  return {
    name,
    code,
    icon: str(body, 'icon', { max: 4 }) || prev.icon || makeIcon(name, code),
    color: color || prev.color,
    semester: str(body, 'semester', { max: 40 }),
    description: str(body, 'description', { max: 1000 }),
  }
}

subjectsRouter.get('/subjects', (req, res) => {
  res.json({ subjects: listSubjects(req.userId) })
})

subjectsRouter.post('/subjects', (req, res) => {
  const count = one('SELECT COUNT(*) AS n FROM subjects WHERE user_id = ?', req.userId).n
  const f = subjectFields(req.body, { color: COLORS[count % COLORS.length] })
  const id = insert('INSERT INTO subjects (user_id, name, code, icon, color, semester, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
    req.userId, f.name, f.code, f.icon, f.color, f.semester, f.description)
  logActivity(req.userId, id, 'subject', `Created subject “${f.name}”`)
  res.status(201).json({ subject: getSubject(req.userId, id) })
})

subjectsRouter.get('/subjects/:id', (req, res) => {
  const s = ownSubject(req.userId, req.params.id)
  const subject = getSubject(req.userId, s.id)
  const topics = topicAccuracy(req.userId, { subjectId: s.id })
  const qa = one(`SELECT ROUND(100.0 * SUM(score) / NULLIF(SUM(total), 0)) AS pct FROM quiz_attempts WHERE subject_id = ? AND mode = 'qa'`, s.id)
  const cards = one(`SELECT COUNT(*) AS n FROM flashcard_reviews r JOIN flashcards f ON f.id = r.flashcard_id JOIN modules m ON m.id = f.module_id WHERE m.subject_id = ?`, s.id)
  const monthly = one(`SELECT
      ROUND(100.0 * SUM(CASE WHEN completed_at >= datetime('now','-30 days') THEN score END) / NULLIF(SUM(CASE WHEN completed_at >= datetime('now','-30 days') THEN total END), 0)) AS recent,
      ROUND(100.0 * SUM(CASE WHEN completed_at <  datetime('now','-30 days') THEN score END) / NULLIF(SUM(CASE WHEN completed_at <  datetime('now','-30 days') THEN total END), 0)) AS older
    FROM quiz_attempts WHERE subject_id = ? AND completed_at IS NOT NULL`, s.id)
  res.json({
    subject,
    analytics: {
      qaAccuracy: qa.pct ?? null,
      cardsReviewed: cards.n,
      trend: quizTrend(req.userId, { subjectId: s.id }),
      strongest: topics[0]?.topic ?? null,
      focus: topics.length > 1 ? topics.at(-1).topic : null,
      monthlyChange: monthly.recent != null && monthly.older != null ? monthly.recent - monthly.older : null,
    },
  })
})

subjectsRouter.put('/subjects/:id', (req, res) => {
  const s = ownSubject(req.userId, req.params.id)
  const f = subjectFields(req.body, s)
  run(`UPDATE subjects SET name = ?, code = ?, icon = ?, color = ?, semester = ?, description = ?, updated_at = datetime('now') WHERE id = ?`,
    f.name, f.code, f.icon, f.color, f.semester, f.description, s.id)
  res.json({ subject: getSubject(req.userId, s.id) })
})

subjectsRouter.delete('/subjects/:id', (req, res) => {
  const s = ownSubject(req.userId, req.params.id)
  const files = all('SELECT stored_name FROM modules WHERE subject_id = ? AND stored_name IS NOT NULL', s.id)
  run('DELETE FROM subjects WHERE id = ?', s.id)
  removeUploads(files.map((f) => f.stored_name))
  res.json({ ok: true })
})
