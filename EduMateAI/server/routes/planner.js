// Tasks, calendar events, AI chat, dashboard and performance analytics.
import { Router } from 'express'
import { all, findOwned, insert, one, run } from '../db/index.js'
import { HttpError } from '../errors.js'
import { date, int, oneOf, str } from '../validate.js'
import { listSubjects, quizTrend, topicAccuracy } from '../stats.js'
import { aiEnabled, chatReply } from '../ai.js'

export const plannerRouter = Router()

/** Optional `subjectId` field: null when empty, 400 when it isn't one of the user's subjects. */
function optionalSubjectId(userId, value) {
  if (!value) return null
  const id = int(value, 'subject')
  if (!one('SELECT id FROM subjects WHERE id = ? AND user_id = ?', id, userId)) throw new HttpError(400, 'Unknown subject.')
  return id
}

// ------------------------------------------------------------------- tasks
const PRIORITIES = ['Low', 'Medium', 'High']
const shapeTask = (t) => ({ id: t.id, title: t.title, dueDate: t.due_date, priority: t.priority, done: !!t.done, createdAt: t.created_at })
const taskJson = (id) => shapeTask(one('SELECT * FROM tasks WHERE id = ?', id))
const ownTask = (userId, id) => findOwned('tasks', userId, id, 'Task')

plannerRouter.get('/tasks', (req, res) => {
  res.json({ tasks: all('SELECT * FROM tasks WHERE user_id = ? ORDER BY done, due_date IS NULL, due_date, id', req.userId).map(shapeTask) })
})

plannerRouter.post('/tasks', (req, res) => {
  const id = insert('INSERT INTO tasks (user_id, title, due_date, priority) VALUES (?, ?, ?, ?)', req.userId,
    str(req.body, 'title', { required: true, max: 200 }), date(req.body, 'dueDate'),
    oneOf(req.body, 'priority', PRIORITIES, 'Medium'))
  res.status(201).json({ task: taskJson(id) })
})

plannerRouter.put('/tasks/:id', (req, res) => {
  const t = ownTask(req.userId, req.params.id)
  const b = req.body
  run('UPDATE tasks SET title = ?, due_date = ?, priority = ?, done = ? WHERE id = ?',
    b.title !== undefined ? str(b, 'title', { required: true, max: 200 }) : t.title,
    b.dueDate !== undefined ? date(b, 'dueDate') : t.due_date,
    oneOf(b, 'priority', PRIORITIES, t.priority),
    b.done !== undefined ? (b.done ? 1 : 0) : t.done, t.id)
  res.json({ task: taskJson(t.id) })
})

plannerRouter.delete('/tasks/:id', (req, res) => {
  run('DELETE FROM tasks WHERE id = ?', ownTask(req.userId, req.params.id).id)
  res.json({ ok: true })
})

// ------------------------------------------------------------------ events
const EVENT_TYPES = ['Study', 'Exam', 'Assignment', 'Reminder']
const shapeEvent = (e) => ({ id: e.id, subjectId: e.subject_id, subjectName: e.subject_name ?? null, title: e.title, date: e.event_date,
  time: e.event_time, durationMinutes: e.duration_minutes, type: e.type, notes: e.notes })
const EVENT_SELECT = 'SELECT e.*, s.name AS subject_name FROM events e LEFT JOIN subjects s ON s.id = e.subject_id'
const eventJson = (id) => shapeEvent(one(`${EVENT_SELECT} WHERE e.id = ?`, id))
const ownEvent = (userId, id) => findOwned('events', userId, id, 'Event')

function eventFields(userId, b, prev = {}) {
  const subjectId = optionalSubjectId(userId, b.subjectId)
  const time = str(b, 'time', { max: 5 }) || prev.event_time || '10:00'
  if (!/^\d{2}:\d{2}$/.test(time)) throw new HttpError(400, 'Time must be HH:MM.')
  const duration = b.durationMinutes !== undefined ? int(b.durationMinutes, 'duration') : prev.duration_minutes ?? 60
  return [subjectId, str(b, 'title', { required: true, max: 200 }), date(b, 'date', { required: true }), time,
    Math.min(duration, 24 * 60), oneOf(b, 'type', EVENT_TYPES, prev.type || 'Study'), str(b, 'notes', { max: 2000 })]
}

plannerRouter.get('/events', (req, res) => {
  const from = date(req.query, 'from') || '0000-01-01'
  const to = date(req.query, 'to') || '9999-12-31'
  res.json({ events: all(`${EVENT_SELECT} WHERE e.user_id = ? AND e.event_date BETWEEN ? AND ? ORDER BY e.event_date, e.event_time`, req.userId, from, to).map(shapeEvent) })
})

plannerRouter.post('/events', (req, res) => {
  const id = insert('INSERT INTO events (user_id, subject_id, title, event_date, event_time, duration_minutes, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    req.userId, ...eventFields(req.userId, req.body))
  res.status(201).json({ event: eventJson(id) })
})

plannerRouter.put('/events/:id', (req, res) => {
  const e = ownEvent(req.userId, req.params.id)
  run('UPDATE events SET subject_id = ?, title = ?, event_date = ?, event_time = ?, duration_minutes = ?, type = ?, notes = ? WHERE id = ?',
    ...eventFields(req.userId, req.body, e), e.id)
  res.json({ event: eventJson(e.id) })
})

plannerRouter.delete('/events/:id', (req, res) => {
  run('DELETE FROM events WHERE id = ?', ownEvent(req.userId, req.params.id).id)
  res.json({ ok: true })
})

// -------------------------------------------------------------------- chat
const CHAT_SELECT = 'SELECT id, role, content, created_at AS createdAt FROM chat_messages'

plannerRouter.get('/chat', (req, res) => {
  const messages = all(`${CHAT_SELECT} WHERE user_id = ? ORDER BY id DESC LIMIT 100`, req.userId).reverse()
  res.json({ messages, aiEnabled: aiEnabled() })
})

plannerRouter.post('/chat', async (req, res) => {
  const content = str(req.body, 'content', { required: true, max: 4000 })
  const subjectId = optionalSubjectId(req.userId, req.body.subjectId)
  const history = all('SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 12', req.userId).reverse()
  const reply = await chatReply(req.userId, subjectId, history, content)
  const save = (role, text) => insert('INSERT INTO chat_messages (user_id, subject_id, role, content) VALUES (?, ?, ?, ?)', req.userId, subjectId, role, text)
  const ids = [save('user', content), save('ai', reply)]
  res.json({ messages: all(`${CHAT_SELECT} WHERE id IN (?, ?) ORDER BY id`, ...ids) })
})

plannerRouter.delete('/chat', (req, res) => {
  run('DELETE FROM chat_messages WHERE user_id = ?', req.userId)
  res.json({ ok: true })
})

// --------------------------------------------------------------- dashboard
function recommendation(userId) {
  // Prefer what happened recently; fall back to all-time history.
  const pickWeakest = (topics) => topics.filter((t) => t.accuracy < 80).at(-1)
  const weakest = pickWeakest(topicAccuracy(userId, { sinceDays: 30 })) ?? pickWeakest(topicAccuracy(userId))
  if (!weakest) return null
  const m = one(`SELECT m.id, m.title FROM quiz_questions q JOIN modules m ON m.id = q.module_id
                 WHERE q.user_id = ? AND q.topic = ? AND m.subject_id = ? ORDER BY m.uploaded_at DESC LIMIT 1`, userId, weakest.topic, weakest.subjectId)
  return { topic: weakest.topic, accuracy: weakest.accuracy, subjectId: weakest.subjectId, subjectName: weakest.subjectName, moduleId: m?.id ?? null, moduleTitle: m?.title ?? null }
}

plannerRouter.get('/dashboard', (req, res) => {
  // The client sends its local date; the server's UTC date can be a day off for the student.
  const today = date(req.query, 'today') || new Date().toISOString().slice(0, 10)
  res.json({
    recommendation: recommendation(req.userId),
    activities: all(`SELECT a.id, a.kind, a.text, a.meta, a.created_at AS createdAt, s.name AS subjectName FROM activities a
                     LEFT JOIN subjects s ON s.id = a.subject_id WHERE a.user_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT 6`, req.userId),
    upcoming: all(`${EVENT_SELECT} WHERE e.user_id = ? AND e.event_date >= ? ORDER BY e.event_date, e.event_time LIMIT 5`, req.userId, today).map(shapeEvent),
  })
})

// ------------------------------------------------------------- performance
plannerRouter.get('/performance', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 3650)
  const since = `-${days} days`
  const u = req.userId
  const q = one(`SELECT COUNT(*) AS n, ROUND(100.0 * SUM(score) / NULLIF(SUM(total), 0)) AS pct FROM quiz_attempts
                 WHERE user_id = ? AND mode = 'quiz' AND completed_at >= datetime('now', ?) AND total > 0`, u, since)
  const prevWeek = one(`SELECT ROUND(100.0 * SUM(score) / NULLIF(SUM(total), 0)) AS pct FROM quiz_attempts
                 WHERE user_id = ? AND completed_at < datetime('now','-7 days') AND completed_at >= datetime('now', ?) AND total > 0`, u, since)
  const qa = one(`SELECT COUNT(*) AS n, ROUND(100.0 * SUM(qa.is_correct) / NULLIF(COUNT(*), 0)) AS pct FROM quiz_answers qa
                  JOIN quiz_attempts a ON a.id = qa.attempt_id WHERE a.user_id = ? AND a.mode = 'qa' AND qa.answered_at >= datetime('now', ?)`, u, since)
  const cards = one(`SELECT COUNT(*) AS n, COUNT(DISTINCT CASE WHEN result = 'known' THEN flashcard_id END) AS mastered
                     FROM flashcard_reviews WHERE user_id = ? AND reviewed_at >= datetime('now', ?)`, u, since)
  const sessions = one(`SELECT COUNT(*) AS n, COALESCE(SUM(duration_minutes), 0) AS minutes FROM study_sessions
                        WHERE user_id = ? AND started_at >= datetime('now', ?) AND duration_minutes >= 1`, u, since)
  const subjects = listSubjects(u)
  const overall = subjects.length ? Math.round(subjects.reduce((n, s) => n + s.progress, 0) / subjects.length) : 0
  const topics = topicAccuracy(u, { sinceDays: days })

  res.json({
    stats: {
      overallProgress: overall,
      averageQuizScore: q.pct ?? 0,
      quizScoreChange: q.pct != null && prevWeek.pct != null ? q.pct - prevWeek.pct : null,
      quizzesCompleted: q.n,
      qaAnswered: qa.n,
      qaAccuracy: qa.pct ?? 0,
      cardsReviewed: cards.n,
      cardsMastered: cards.mastered,
      studySessions: sessions.n,
      studyHours: Math.round((sessions.minutes / 60) * 10) / 10,
    },
    history: quizTrend(u, { limit: 10 }),
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, progress: s.progress })),
    strongest: topics.slice(0, 3),
    weakest: topics.filter((t) => t.accuracy < 80).slice(-3).reverse(),
    recommendation: recommendation(u),
  })
})
