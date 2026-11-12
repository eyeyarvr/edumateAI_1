// Analytics queries shared by several routes.
import { all, one, run } from './db/index.js'

/** Add an entry to the user's recent-activity feed. */
export function logActivity(userId, subjectId, kind, text, meta = '') {
  run('INSERT INTO activities (user_id, subject_id, kind, text, meta) VALUES (?, ?, ?, ?, ?)', userId, subjectId, kind, text, meta)
}

const SUBJECT_STATS = `
  SELECT s.id, s.name, s.code, s.icon, s.color, s.semester, s.description, s.created_at,
    (SELECT COUNT(*) FROM modules m WHERE m.subject_id = s.id) AS modules,
    (SELECT ROUND(100.0 * SUM(a.score) / NULLIF(SUM(a.total), 0)) FROM quiz_attempts a
       WHERE a.subject_id = s.id AND a.completed_at IS NOT NULL AND a.total > 0) AS quiz_score,
    (SELECT COALESCE(SUM(ss.duration_minutes), 0) FROM study_sessions ss WHERE ss.subject_id = s.id) AS study_minutes,
    (SELECT COUNT(*) FROM study_sessions ss WHERE ss.subject_id = s.id AND ss.duration_minutes >= 1) AS sessions,
    (SELECT COUNT(*) FROM (
        SELECT a.module_id FROM quiz_attempts a WHERE a.subject_id = s.id AND a.module_id IS NOT NULL AND a.total > 0
        UNION
        SELECT f.module_id FROM flashcard_reviews r JOIN flashcards f ON f.id = r.flashcard_id
          JOIN modules m ON m.id = f.module_id WHERE m.subject_id = s.id)) AS studied_modules,
    (SELECT MAX(t) FROM (
        SELECT MAX(created_at) AS t FROM activities WHERE subject_id = s.id
        UNION ALL SELECT MAX(started_at) FROM study_sessions WHERE subject_id = s.id)) AS last_activity_at,
    (SELECT text FROM activities WHERE subject_id = s.id ORDER BY created_at DESC, id DESC LIMIT 1) AS last_activity_text
  FROM subjects s`

export function shapeSubject(r) {
  return {
    id: r.id,
    name: r.name,
    code: r.code,
    icon: r.icon,
    color: r.color,
    semester: r.semester,
    description: r.description,
    modules: r.modules,
    progress: r.modules ? Math.round((100 * r.studied_modules) / r.modules) : 0,
    quizScore: r.quiz_score ?? 0,
    studyHours: Math.round((r.study_minutes / 60) * 10) / 10,
    sessions: r.sessions,
    lastActivityAt: r.last_activity_at,
    lastActivityText: r.last_activity_text,
    createdAt: r.created_at,
  }
}

export const listSubjects = (userId) => all(`${SUBJECT_STATS} WHERE s.user_id = ? ORDER BY s.created_at, s.id`, userId).map(shapeSubject)
export const getSubject = (userId, id) => { const r = one(`${SUBJECT_STATS} WHERE s.user_id = ? AND s.id = ?`, userId, id); return r ? shapeSubject(r) : null }

/** Per-topic accuracy, optionally limited to a subject and/or a time window. */
export function topicAccuracy(userId, { subjectId, sinceDays } = {}) {
  const cond = ['a.user_id = ?']
  const args = [userId]
  if (subjectId) { cond.push('a.subject_id = ?'); args.push(subjectId) }
  if (sinceDays) { cond.push(`qa.answered_at >= datetime('now', ?)`); args.push(`-${sinceDays} days`) }
  return all(`SELECT qa.topic, a.subject_id AS subjectId, s.name AS subjectName,
                     COUNT(*) AS answered, ROUND(100.0 * SUM(qa.is_correct) / COUNT(*)) AS accuracy
              FROM quiz_answers qa JOIN quiz_attempts a ON a.id = qa.attempt_id JOIN subjects s ON s.id = a.subject_id
              WHERE ${cond.join(' AND ')} GROUP BY qa.topic, a.subject_id HAVING answered >= 2
              ORDER BY accuracy DESC, answered DESC`, ...args)
}

export function quizTrend(userId, { subjectId, limit = 6 } = {}) {
  const args = subjectId ? [userId, subjectId] : [userId]
  const rows = all(`SELECT id, completed_at, ROUND(100.0 * score / total) AS pct FROM quiz_attempts
                    WHERE user_id = ? ${subjectId ? 'AND subject_id = ?' : ''} AND completed_at IS NOT NULL AND total > 0
                    ORDER BY completed_at DESC, id DESC LIMIT ?`, ...args, limit)
  return rows.reverse().map((r) => ({ date: r.completed_at, score: r.pct }))
}
