// Typed client for the EduMate API (served under /api — proxied by Vite in development).
import { useCallback, useEffect, useRef, useState } from 'react'

export type User = {
  id: number
  firstName: string
  lastName: string
  email: string
  university: string
  program: string
  createdAt: string
  settings: { studyReminders: boolean; upcomingDeadlines: boolean; weeklySummary: boolean }
}

export type Subject = {
  id: number
  name: string
  code: string
  icon: string
  color: string
  semester: string
  description: string
  modules: number
  progress: number
  quizScore: number
  studyHours: number
  sessions: number
  lastActivityAt: string | null
  lastActivityText: string | null
  createdAt: string
}

export type SubjectAnalytics = {
  qaAccuracy: number | null
  cardsReviewed: number
  trend: { date: string; score: number }[]
  strongest: string | null
  focus: string | null
  monthlyChange: number | null
}

export type Module = {
  id: number
  subjectId: number
  title: string
  fileName: string
  fileType: string
  sizeBytes: number
  pages: number | null
  status: 'Processing' | 'Ready to Study' | 'Failed'
  uploadedAt: string
  hasFile: boolean
  hasReviewer: boolean
  reviewer: string
  flashcards: number
  questions: number
}

export type Flashcard = { id: number; question: string; answer: string; lastResult: 'known' | 'review' | null }
export type Question = { id: number; question: string; choices: string[]; topic: string; difficulty: 'Easy' | 'Medium' | 'Hard'; correctIndex?: number; explanation?: string }
export type AnswerResult = { correct: boolean; correctIndex: number; correctAnswer: string; explanation: string; score: number; total: number }
export type Task = { id: number; title: string; dueDate: string | null; priority: 'Low' | 'Medium' | 'High'; done: boolean; createdAt: string }
export type CalendarEvent = { id: number; subjectId: number | null; subjectName: string | null; title: string; date: string; time: string; durationMinutes: number; type: 'Study' | 'Exam' | 'Assignment' | 'Reminder'; notes: string }
export type ChatMessage = { id: number; role: 'user' | 'ai'; content: string; createdAt: string }
export type Activity = { id: number; kind: string; text: string; meta: string; createdAt: string; subjectName: string | null }
export type Recommendation = { topic: string; accuracy: number; subjectId: number; subjectName: string; moduleId: number | null; moduleTitle: string | null } | null
export type TopicStat = { topic: string; subjectId: number; subjectName: string; answered: number; accuracy: number }
export type Performance = {
  stats: {
    overallProgress: number; averageQuizScore: number; quizScoreChange: number | null; quizzesCompleted: number
    qaAnswered: number; qaAccuracy: number; cardsReviewed: number; cardsMastered: number; studySessions: number; studyHours: number
  }
  history: { date: string; score: number }[]
  subjects: { id: number; name: string; progress: number }[]
  strongest: TopicStat[]
  weakest: TopicStat[]
  recommendation: Recommendation
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData
  let res: Response
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that the API is running (npm run dev:full).')
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) onUnauthorized?.()
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`)
  }
  return data as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T = { ok: true }>(url: string, body?: unknown) => request<T>('DELETE', url, body),

  /** Fire-and-forget request that survives page unload (used to close study sessions). */
  beacon(url: string) {
    fetch(`/api${url}`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {})
  },
}

/** Load data from the API with loading/error state and a reload function. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(url))
  const latest = useRef(url)
  latest.current = url

  const reload = useCallback(async () => {
    if (!url) return
    setLoading(true)
    try {
      const result = await api.get<T>(url)
      if (latest.current === url) { setData(result); setError(null) }
    } catch (e) {
      if (latest.current === url) setError((e as Error).message)
    } finally {
      if (latest.current === url) setLoading(false)
    }
  }, [url])

  useEffect(() => { setData(null); reload() }, [reload])
  return { data, setData, error, loading, reload }
}

// ---------------------------------------------------------------- formatting
/** SQLite datetime('now') values are UTC without a zone marker. */
export const parseDate = (s: string) => new Date(s.includes('T') || s.length <= 10 ? s : s.replace(' ', 'T') + 'Z')

export function timeAgo(s: string | null) {
  if (!s) return ''
  const diff = (Date.now() - parseDate(s).getTime()) / 1000
  if (diff < 60) return 'just now'
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week'], [2592000, 'month'], [31536000, 'year']]
  let label = ''
  for (let i = units.length - 1; i >= 0; i--) {
    const [secs, name] = units[i]
    if (diff >= secs) { const n = Math.floor(diff / secs); label = n === 1 && name === 'day' ? 'yesterday' : `${n} ${name}${n > 1 ? 's' : ''} ago`; break }
  }
  return label
}

export const localDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fromDateKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
export const formatDay = (k: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => fromDateKey(k).toLocaleDateString(undefined, opts)
export const formatTime = (t: string) => { const [h, m] = t.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) }

export function dueLabel(k: string | null) {
  if (!k) return 'No due date'
  const today = localDateKey(new Date())
  const tomorrow = localDateKey(new Date(Date.now() + 86400000))
  if (k === today) return 'Today'
  if (k === tomorrow) return 'Tomorrow'
  if (k < today) return `Overdue · ${formatDay(k)}`
  return formatDay(k)
}

/** Save text as a Markdown file; `name` is turned into a safe file name. */
export function downloadMarkdown(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w]+/g, '_')}.md` }).click()
  URL.revokeObjectURL(url)
}

/** Dashboard endpoint for the student's local "today" (the server only knows UTC). */
export const dashboardUrl = () => `/dashboard?today=${localDateKey(new Date())}`

export const formatBytes = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
export const initials = (u: Pick<User, 'firstName' | 'lastName'>) => ((u.firstName[0] || '') + (u.lastName[0] || '')).toUpperCase() || '?'
