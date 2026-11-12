import { createContext, useContext } from 'react'
import type { Subject, User } from './api'

export type Page = 'home' | 'subjects' | 'course' | 'study' | 'performance' | 'calendar' | 'assistant' | 'settings' | 'help'
export type Route = { page: Page; subjectId?: number; moduleId?: number }

export const routeToHash = (r: Route) => {
  if (r.page === 'course' && r.subjectId) return `#/subjects/${r.subjectId}`
  if (r.page === 'study') return `#/study${r.subjectId ? `/${r.subjectId}` : ''}${r.subjectId && r.moduleId ? `/${r.moduleId}` : ''}`
  return `#/${r.page}`
}

export function hashToRoute(hash: string): Route {
  const [page, a, b] = hash.replace(/^#\/?/, '').split('/')
  const n = (x?: string) => (x && /^\d+$/.test(x) ? Number(x) : undefined)
  if (page === 'subjects' && n(a)) return { page: 'course', subjectId: n(a) }
  if (page === 'study') return { page: 'study', subjectId: n(a), moduleId: n(b) }
  const pages: Page[] = ['home', 'subjects', 'performance', 'calendar', 'assistant', 'settings', 'help']
  return { page: pages.includes(page as Page) ? (page as Page) : 'home' }
}

export type AppState = {
  user: User
  setUser: (u: User) => void
  subjects: Subject[] | null
  reloadSubjects: () => Promise<void>
  navigate: (r: Route | Page) => void
  openAddSubject: () => void
  editSubject: (s: Subject) => void
}

export const AppContext = createContext<AppState>(null as unknown as AppState)
export const useApp = () => useContext(AppContext)
