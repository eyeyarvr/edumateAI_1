// Modules (uploads), flashcards, quiz questions, quiz attempts and study sessions.
import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { all, db, findOwned, insert, one, run, transaction } from '../db/index.js'
import { HttpError } from '../errors.js'
import { int, oneOf, str } from '../validate.js'
import { ownSubject } from './subjects.js'
import { aiEnabled, generateStudyMaterial } from '../ai.js'
import { logActivity } from '../stats.js'
import { FILE_TYPES, pdfPages, removeUploads, upload, uploadPath } from '../uploads.js'

export const studyRouter = Router()

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
const INSERT_FLASHCARD = 'INSERT INTO flashcards (module_id, user_id, question, answer) VALUES (?, ?, ?, ?)'
const INSERT_QUESTION = `INSERT INTO quiz_questions (module_id, user_id, question, choices, correct_index, explanation, topic, difficulty)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`

const ownModule = (userId, id) => findOwned('modules', userId, id, 'Module')
const ownCard = (userId, id) => findOwned('flashcards', userId, id, 'Flashcard')
const ownAttempt = (userId, id) => findOwned('quiz_attempts', userId, id, 'Quiz attempt')

// ---------------------------------------------------------------- modules
const MODULE_SELECT = `SELECT m.*,
    (SELECT COUNT(*) FROM flashcards f WHERE f.module_id = m.id) AS flashcards,
    (SELECT COUNT(*) FROM quiz_questions q WHERE q.module_id = m.id) AS questions
  FROM modules m`

function shapeModule(m) {
  return {
    id: m.id, subjectId: m.subject_id, title: m.title, fileName: m.file_name, fileType: m.file_type,
    sizeBytes: m.size_bytes, pages: m.pages, status: m.status, uploadedAt: m.uploaded_at,
    hasFile: Boolean(m.stored_name), hasReviewer: Boolean(m.reviewer), reviewer: m.reviewer,
    flashcards: m.flashcards ?? 0, questions: m.questions ?? 0,
  }
}

/** A module with its flashcard/question counts, shaped for the client. */
const moduleJson = (id) => shapeModule(one(`${MODULE_SELECT} WHERE m.id = ?`, id))

studyRouter.get('/subjects/:id/modules', (req, res) => {
  const s = ownSubject(req.userId, req.params.id)
  const rows = all(`${MODULE_SELECT} WHERE m.subject_id = ? ORDER BY m.uploaded_at, m.id`, s.id)
  res.json({ modules: rows.map(shapeModule) })
})

studyRouter.post('/subjects/:id/modules', upload.single('file'), (req, res) => {
  const file = req.file
  if (!file) throw new HttpError(400, 'Please choose a file to upload.')
  try {
    const s = ownSubject(req.userId, req.params.id)
    const ext = path.extname(file.originalname).toLowerCase()
    const type = FILE_TYPES[ext]
    const title = str(req.body, 'title', { max: 150 }) || path.basename(file.originalname, ext).replace(/[_-]+/g, ' ')
    const id = insert(
      `INSERT INTO modules (subject_id, user_id, title, file_name, stored_name, mime_type, file_type, size_bytes, pages, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Ready to Study')`,
      s.id, req.userId, title, file.originalname.slice(0, 200), file.filename, file.mimetype, type, file.size,
      type === 'PDF' ? pdfPages(file.path) : null,
    )
    logActivity(req.userId, s.id, 'upload', `Uploaded “${title}”`)
    res.status(201).json({ module: moduleJson(id) })
  } catch (e) {
    // Don't leave an orphaned file on disk when the request is rejected.
    fs.rmSync(file.path, { force: true })
    throw e
  }
})

studyRouter.get('/modules/:id', (req, res) => {
  res.json({ module: moduleJson(ownModule(req.userId, req.params.id).id) })
})

studyRouter.put('/modules/:id', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  run('UPDATE modules SET title = ?, reviewer = ? WHERE id = ?',
    str(req.body, 'title', { max: 150 }) || m.title,
    req.body.reviewer === undefined ? m.reviewer : str(req.body, 'reviewer', { max: 50_000 }), m.id)
  res.json({ module: moduleJson(m.id) })
})

studyRouter.delete('/modules/:id', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  run('DELETE FROM modules WHERE id = ?', m.id)
  removeUploads([m.stored_name])
  res.json({ ok: true })
})

studyRouter.get('/modules/:id/file', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  if (!m.stored_name) throw new HttpError(404, 'This sample module has no file attached. Upload your own file to preview it.')
  const file = uploadPath(m.stored_name)
  if (!fs.existsSync(file)) throw new HttpError(404, 'The file is missing from the server.')
  const isText = ['TXT', 'MD'].includes(m.file_type)
  const inline = (m.file_type === 'PDF' || isText) && req.query.download === undefined
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(m.file_name)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.type(m.file_type === 'PDF' ? 'application/pdf' : isText ? 'text/plain; charset=utf-8' : m.mime_type || 'application/octet-stream')
  res.sendFile(file)
})

// ------------------------------------------------------------- AI generate
studyRouter.post('/modules/:id/generate', async (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  const subject = one('SELECT name FROM subjects WHERE id = ?', m.subject_id)
  run("UPDATE modules SET status = 'Processing' WHERE id = ?", m.id)
  let out
  try {
    out = await generateStudyMaterial(m, subject.name)
  } catch (e) {
    run("UPDATE modules SET status = 'Ready to Study' WHERE id = ?", m.id)
    throw e
  }
  transaction(() => {
    const card = db.prepare(INSERT_FLASHCARD)
    const q = db.prepare(INSERT_QUESTION)
    for (const f of out.flashcards) card.run(m.id, req.userId, String(f.question).slice(0, 500), String(f.answer).slice(0, 2000))
    for (const x of out.questions) {
      q.run(m.id, req.userId, String(x.question).slice(0, 1000), JSON.stringify(x.choices.map(String).slice(0, 6)),
        x.correctIndex, String(x.explanation || '').slice(0, 2000), String(x.topic || 'General').slice(0, 60),
        DIFFICULTIES.includes(x.difficulty) ? x.difficulty : 'Medium')
    }
    run("UPDATE modules SET reviewer = ?, status = 'Ready to Study' WHERE id = ?", out.reviewer, m.id)
    logActivity(req.userId, m.subject_id, 'reviewer', `Generated study materials for “${m.title}”`)
  })
  res.json({ flashcards: out.flashcards.length, questions: out.questions.length, grounded: out.grounded })
})

studyRouter.get('/ai/status', (_req, res) => res.json({ enabled: aiEnabled() }))

// --------------------------------------------------------------- flashcards
studyRouter.get('/modules/:id/flashcards', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  const cards = all(`SELECT f.id, f.question, f.answer,
      (SELECT result FROM flashcard_reviews r WHERE r.flashcard_id = f.id ORDER BY r.reviewed_at DESC, r.id DESC LIMIT 1) AS lastResult
    FROM flashcards f WHERE f.module_id = ? ORDER BY f.id`, m.id)
  res.json({ flashcards: cards })
})

studyRouter.post('/modules/:id/flashcards', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  const id = insert(INSERT_FLASHCARD, m.id, req.userId,
    str(req.body, 'question', { required: true, max: 500 }), str(req.body, 'answer', { required: true, max: 2000 }))
  res.status(201).json({ flashcard: one('SELECT id, question, answer, NULL AS lastResult FROM flashcards WHERE id = ?', id) })
})

studyRouter.delete('/flashcards/:id', (req, res) => {
  run('DELETE FROM flashcards WHERE id = ?', ownCard(req.userId, req.params.id).id)
  res.json({ ok: true })
})

studyRouter.post('/flashcards/:id/review', (req, res) => {
  const c = ownCard(req.userId, req.params.id)
  const result = oneOf(req.body, 'result', ['known', 'review'])
  if (!result) throw new HttpError(400, 'Result is required.')
  run('INSERT INTO flashcard_reviews (flashcard_id, user_id, result) VALUES (?, ?, ?)', c.id, req.userId, result)
  res.json({ ok: true })
})

// ----------------------------------------------------------- quiz questions
const shapeQuestion = (q, withAnswer = false) => ({
  id: q.id, question: q.question, choices: JSON.parse(q.choices), topic: q.topic, difficulty: q.difficulty,
  ...(withAnswer ? { correctIndex: q.correct_index, explanation: q.explanation } : {}),
})

studyRouter.get('/modules/:id/questions', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  const difficulty = oneOf(req.query, 'difficulty', [...DIFFICULTIES, 'Any'], 'Any')
  // Clamp to 1–100: SQLite treats a negative LIMIT as "no limit".
  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 50, 1), 100)
  // Prefer the requested difficulty, then fill with the rest so small banks still work.
  const rows = all(`SELECT * FROM quiz_questions WHERE module_id = ?
    ORDER BY CASE WHEN ? = 'Any' OR difficulty = ? THEN 0 ELSE 1 END, ${req.query.shuffle ? 'RANDOM()' : 'id'} LIMIT ?`,
    m.id, difficulty, difficulty, limit)
  // Answers are only revealed when explicitly managing the bank.
  res.json({ questions: rows.map((q) => shapeQuestion(q, req.query.withAnswers !== undefined)) })
})

studyRouter.post('/modules/:id/questions', (req, res) => {
  const m = ownModule(req.userId, req.params.id)
  const choices = Array.isArray(req.body.choices) ? req.body.choices.map((c) => String(c).trim()).filter(Boolean) : []
  if (choices.length < 2 || choices.length > 6) throw new HttpError(400, 'Provide between 2 and 6 answer choices.')
  const correct = int(req.body.correctIndex, 'correct answer')
  if (correct >= choices.length) throw new HttpError(400, 'Pick which choice is correct.')
  const id = insert(INSERT_QUESTION,
    m.id, req.userId, str(req.body, 'question', { required: true, max: 1000 }), JSON.stringify(choices), correct,
    str(req.body, 'explanation', { max: 2000 }), str(req.body, 'topic', { max: 60 }) || 'General',
    oneOf(req.body, 'difficulty', DIFFICULTIES, 'Medium'))
  res.status(201).json({ question: shapeQuestion(one('SELECT * FROM quiz_questions WHERE id = ?', id), true) })
})

studyRouter.delete('/questions/:id', (req, res) => {
  run('DELETE FROM quiz_questions WHERE id = ?', findOwned('quiz_questions', req.userId, req.params.id, 'Question').id)
  res.json({ ok: true })
})

// ------------------------------------------------------------ quiz attempts
studyRouter.post('/attempts', (req, res) => {
  const m = ownModule(req.userId, req.body.moduleId)
  const mode = oneOf(req.body, 'mode', ['quiz', 'qa'], 'quiz')
  const id = insert('INSERT INTO quiz_attempts (user_id, subject_id, module_id, mode, difficulty) VALUES (?, ?, ?, ?, ?)',
    req.userId, m.subject_id, m.id, mode, oneOf(req.body, 'difficulty', DIFFICULTIES, 'Medium'))
  res.status(201).json({ attemptId: id })
})

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Lenient grading for typed answers: exact phrase, or most of the key words present. */
function gradeText(answer, correct) {
  const a = ` ${norm(answer)} `
  const c = norm(correct)
  if (!c) return false
  if (a.includes(` ${c} `) || a.replace(/ /g, '').includes(c.replace(/ /g, ''))) return true
  const keys = c.split(' ').filter((w) => w.length > 2)
  if (!keys.length) return false
  return keys.filter((w) => a.includes(` ${w} `)).length / keys.length >= 0.6
}

const percent = (score, total) => (total ? Math.round((100 * score) / total) : 0)

studyRouter.post('/attempts/:id/answers', (req, res) => {
  const a = ownAttempt(req.userId, req.params.id)
  if (a.completed_at) throw new HttpError(400, 'This quiz is already finished.')
  const q = findOwned('quiz_questions', req.userId, int(req.body.questionId, 'question'), 'Question')
  if (one('SELECT id FROM quiz_answers WHERE attempt_id = ? AND question_id = ?', a.id, q.id)) throw new HttpError(409, 'You already answered this question.')
  const choices = JSON.parse(q.choices)
  let correct
  let chosen = null
  let text = null
  if (req.body.answerText !== undefined) {
    text = str(req.body, 'answerText', { required: true, max: 2000 })
    correct = gradeText(text, choices[q.correct_index])
  } else {
    chosen = int(req.body.chosenIndex, 'choice')
    correct = chosen === q.correct_index
  }
  run('INSERT INTO quiz_answers (attempt_id, question_id, topic, chosen_index, answer_text, is_correct) VALUES (?, ?, ?, ?, ?, ?)', a.id, q.id, q.topic, chosen, text, correct ? 1 : 0)
  run('UPDATE quiz_attempts SET score = score + ?, total = total + 1 WHERE id = ?', correct ? 1 : 0, a.id)
  const totals = one('SELECT score, total FROM quiz_attempts WHERE id = ?', a.id)
  res.json({ correct, correctIndex: q.correct_index, correctAnswer: choices[q.correct_index], explanation: q.explanation, ...totals })
})

studyRouter.post('/attempts/:id/complete', (req, res) => {
  const a = ownAttempt(req.userId, req.params.id)
  if (!a.completed_at) {
    run("UPDATE quiz_attempts SET completed_at = datetime('now') WHERE id = ?", a.id)
    if (a.total > 0) {
      const m = one('SELECT title FROM modules WHERE id = ?', a.module_id)
      logActivity(req.userId, a.subject_id, 'quiz', `Completed ${a.mode === 'qa' ? 'Q&A' : 'Quiz'}: ${m?.title ?? 'module'}`, `Score ${percent(a.score, a.total)}%`)
    }
  }
  const done = one('SELECT score, total FROM quiz_attempts WHERE id = ?', a.id)
  res.json({ ...done, percent: percent(done.score, done.total) })
})

// ----------------------------------------------------------- study sessions
studyRouter.post('/sessions', (req, res) => {
  const m = ownModule(req.userId, req.body.moduleId)
  const id = insert('INSERT INTO study_sessions (user_id, subject_id, module_id) VALUES (?, ?, ?)', req.userId, m.subject_id, m.id)
  res.status(201).json({ sessionId: id })
})

// Called when the student leaves study mode. Duration is measured on the server and capped at 4 hours.
studyRouter.post('/sessions/:id/end', (req, res) => {
  const s = findOwned('study_sessions', req.userId, req.params.id, 'Session')
  if (!s.ended_at) {
    run(`UPDATE study_sessions SET ended_at = datetime('now'),
           duration_minutes = MIN(240, ROUND((julianday('now') - julianday(started_at)) * 1440, 1)) WHERE id = ?`, s.id)
  }
  res.json({ ok: true })
})
