import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Bell, BookOpen, Bot, BrainCircuit, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Home, LogOut, Menu, Settings, X,
} from 'lucide-react'
import { api, CalendarEvent, dashboardUrl, formatDay, fromDateKey, initials, setUnauthorizedHandler, Subject, User } from './api'
import { AppContext, AppState, hashToRoute, Page, Route, routeToHash, useApp } from './app-context'
import { Button, Loading, Logo, Modal, ToastProvider, useToast } from './ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import SubjectsPage from './pages/Subjects'
import CoursePage from './pages/Course'
import StudyPage from './pages/Study'
import PerformancePage from './pages/Performance'
import CalendarPage from './pages/Calendar'
import AssistantPage from './pages/Assistant'
import SettingsPage from './pages/Settings'
import HelpPage from './pages/Help'

const navGroups = [
  {
    label: 'Workspace',
    items: [
      { id: 'home' as Page, label: 'Home', icon: Home },
      { id: 'subjects' as Page, label: 'My Subjects', icon: BookOpen },
      { id: 'study' as Page, label: 'Study Tools', icon: BrainCircuit },
      { id: 'performance' as Page, label: 'My Performance', icon: BarChart3 },
      { id: 'calendar' as Page, label: 'Calendar', icon: CalendarDays },
    ],
  },
  { label: 'Assistance', items: [{ id: 'assistant' as Page, label: 'AI Assistant', icon: Bot }] },
  {
    label: 'Preferences',
    items: [
      { id: 'settings' as Page, label: 'Settings', icon: Settings },
      { id: 'help' as Page, label: 'Help & Support', icon: CircleHelp },
    ],
  },
]

/** A course page belongs to "My Subjects" in the navigation. */
const isActive = (page: Page, item: Page) => page === item || (page === 'course' && item === 'subjects')

const SUBJECT_COLORS = ['#DCFCE7', '#E0F2FE', '#F3E8FF', '#FEF3C7', '#FFE4E6', '#E0E7FF', '#CCFBF1']

function Sidebar({ page, collapsed, setCollapsed, logout }: { page: Page; collapsed: boolean; setCollapsed: (v: boolean) => void; logout: () => void }) {
  const { user, navigate } = useApp()
  return (
    <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-slate-200 bg-white transition-all duration-300 lg:flex lg:flex-col ${collapsed ? 'w-[84px]' : 'w-[248px]'}`}>
      <div className="flex h-20 items-center justify-between px-5">
        <Logo compact={collapsed} />
        {!collapsed && <button onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ChevronLeft size={18} /></button>}
      </div>
      {collapsed && <button onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="mx-auto mb-2 rounded-lg p-2 text-slate-400 hover:bg-slate-100"><ChevronRight size={18} /></button>}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && <div className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[.14em] text-slate-400">{group.label}</div>}
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = isActive(page, item.id)
                return (
                  <button title={collapsed ? item.label : undefined} key={item.id} onClick={() => navigate(item.id)}
                    className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${active ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'} ${collapsed ? 'justify-center' : ''}`}>
                    <Icon size={19} className={active ? 'text-green-600' : 'text-slate-400 group-hover:text-green-600'} />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-3">
        <div className={`flex items-center gap-3 rounded-xl p-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-green-100 text-sm font-bold text-green-700">{initials(user)}</div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-800">{user.firstName} {user.lastName}</div>
                <div className="truncate text-[11px] text-slate-400">{user.email}</div>
              </div>
              <button onClick={logout} title="Log out" aria-label="Log out" className="text-slate-400 hover:text-red-500"><LogOut size={17} /></button>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}

function Header({ title, onMenu, logout }: { title: string; onMenu: () => void; logout: () => void }) {
  const { user, navigate } = useApp()
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null)
  const [upcoming, setUpcoming] = useState<CalendarEvent[] | null>(null)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  useEffect(() => {
    if (menu === 'bell' || upcoming === null) api.get<{ upcoming: CalendarEvent[] }>(dashboardUrl()).then((d) => setUpcoming(d.upcoming)).catch(() => setUpcoming([]))
  }, [menu]) // eslint-disable-line react-hooks/exhaustive-deps

  // Event dates are local calendar days; parse them as such (new Date('YYYY-MM-DD') would be UTC).
  const soon = (upcoming ?? []).filter((e) => (fromDateKey(e.date).getTime() - Date.now()) / 86400000 <= 7)
  return (
    <header className="sticky top-0 z-30 flex h-18 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-7">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} aria-label="Open menu" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu size={21} /></button>
        <div>
          <div className="text-base font-bold text-slate-900">{title}</div>
          <div className="hidden text-xs text-slate-400 sm:block">{today}</div>
        </div>
      </div>
      <div className="relative flex items-center gap-2">
        <button onClick={() => setMenu(menu === 'bell' ? null : 'bell')} aria-label="Upcoming deadlines" className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-500 hover:bg-slate-50">
          <Bell size={19} />
          {soon.length > 0 && <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-green-500" />}
        </button>
        <button onClick={() => setMenu(menu === 'user' ? null : 'user')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1.5 pr-3">
          <div className="grid size-8 place-items-center rounded-lg bg-green-100 text-xs font-bold text-green-700">{initials(user)}</div>
          <ChevronDown size={14} className="hidden text-slate-400 sm:block" />
        </button>
        {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />}
        {menu === 'bell' && (
          <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            <div className="mb-2 px-2 text-xs font-extrabold uppercase tracking-wider text-slate-400">Next 7 days</div>
            {soon.length === 0 && <p className="px-2 py-4 text-sm text-slate-400">Nothing due this week.</p>}
            {soon.map((e) => (
              <button key={e.id} onClick={() => { setMenu(null); navigate('calendar') }} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-xs font-bold">{formatDay(e.date, { day: 'numeric' })}</div>
                <div className="min-w-0"><div className="truncate text-sm font-bold text-slate-800">{e.title}</div><div className="text-[11px] text-slate-400">{e.type} · {formatDay(e.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div>
              </button>
            ))}
          </div>
        )}
        {menu === 'user' && (
          <div className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
            <div className="border-b border-slate-100 px-3 pb-2 pt-1"><div className="truncate text-sm font-bold">{user.firstName} {user.lastName}</div><div className="truncate text-[11px] text-slate-400">{user.email}</div></div>
            <button onClick={() => { setMenu(null); navigate('settings') }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Settings size={15} /> Settings</button>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><LogOut size={15} /> Log out</button>
          </div>
        )}
      </div>
    </header>
  )
}

/** Create / edit subject dialog. */
function SubjectForm({ subject, onClose, onSaved }: { subject: Subject | null; onClose: () => void; onSaved: (s: Subject) => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: subject?.name ?? '', code: subject?.code ?? '', semester: subject?.semester ?? '', description: subject?.description ?? '', color: subject?.color ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const year = new Date().getFullYear()
  const semesters = [`1st Semester ${year}-${year + 1}`, `2nd Semester ${year - 1}-${year}`, `Summer ${year}`, `Spring ${year}`, `Fall ${year}`]
  if (form.semester && !semesters.includes(form.semester)) semesters.unshift(form.semester)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { subject: saved } = subject
        ? await api.put<{ subject: Subject }>(`/subjects/${subject.id}`, form)
        : await api.post<{ subject: Subject }>('/subjects', form)
      toast(subject ? 'Subject updated' : 'Subject created')
      onSaved(saved)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={subject ? 'Edit subject' : 'Add a new subject'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="field">Subject name<input autoFocus required maxLength={100} value={form.name} onChange={set('name')} className="input mt-2" placeholder="e.g. Organic Chemistry" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Course code<input maxLength={20} value={form.code} onChange={set('code')} className="input mt-2" placeholder="CHEM 201" /></label>
          <label className="field">Semester<select value={form.semester} onChange={set('semester')} className="input mt-2"><option value="">—</option>{semesters.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <div className="field">Card colour
          <div className="mt-2 flex gap-2">{SUBJECT_COLORS.map((c) => (
            <button type="button" key={c} onClick={() => setForm({ ...form, color: c })} aria-label={`Colour ${c}`} className={`size-8 rounded-lg border-2 ${form.color === c ? 'border-green-600' : 'border-transparent'}`} style={{ background: c }} />
          ))}</div>
        </div>
        <label className="field">Description<textarea maxLength={1000} value={form.description} onChange={set('description')} className="input mt-2 min-h-20 py-3" placeholder="What will you study?" /></label>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{subject ? 'Save changes' : 'Create subject'}</Button></div>
      </form>
    </Modal>
  )
}

function Workspace({ user, setUser, logout }: { user: User; setUser: (u: User) => void; logout: () => void }) {
  const [route, setRoute] = useState<Route>(() => hashToRoute(window.location.hash))
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('edumate.sidebar') === 'collapsed' } catch { return false }
  })
  const [mobileNav, setMobileNav] = useState(false)
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [subjectForm, setSubjectForm] = useState<{ subject: Subject | null } | null>(null)
  const toast = useToast()

  const reloadSubjects = useCallback(async () => {
    try { setSubjects((await api.get<{ subjects: Subject[] }>('/subjects')).subjects) }
    catch (e) { toast((e as Error).message, 'error'); setSubjects((s) => s ?? []) }
  }, [toast])

  useEffect(() => { reloadSubjects() }, [reloadSubjects])
  useEffect(() => { try { localStorage.setItem('edumate.sidebar', collapsed ? 'collapsed' : 'open') } catch { /* storage unavailable */ } }, [collapsed])
  useEffect(() => {
    const onHash = () => setRoute(hashToRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((r: Route | Page) => {
    const next = typeof r === 'string' ? { page: r } : r
    const hash = routeToHash(next)
    if (window.location.hash !== hash) window.location.hash = hash
    setRoute(next)
    setMobileNav(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const ctx: AppState = useMemo(() => ({
    user, setUser, subjects, reloadSubjects, navigate,
    openAddSubject: () => setSubjectForm({ subject: null }),
    editSubject: (s: Subject) => setSubjectForm({ subject: s }),
  }), [user, setUser, subjects, reloadSubjects, navigate])

  const currentSubject = subjects?.find((s) => s.id === route.subjectId)
  const title = {
    home: 'Home', subjects: 'My Subjects', course: currentSubject?.name ?? 'Subject', study: 'Study Mode', performance: 'My Performance',
    calendar: 'Calendar', assistant: 'AI Assistant', settings: 'Settings', help: 'Help & Support',
  }[route.page]
  useEffect(() => { document.title = `${title} · EduMate AI` }, [title])

  const pageContent = subjects === null ? <Loading className="min-h-[60vh]" /> : {
    home: <Dashboard />,
    subjects: <SubjectsPage />,
    course: <CoursePage key={route.subjectId} subjectId={route.subjectId!} />,
    study: <StudyPage key={`${route.subjectId}-${route.moduleId}`} subjectId={route.subjectId} moduleId={route.moduleId} />,
    performance: <PerformancePage />,
    calendar: <CalendarPage />,
    assistant: <AssistantPage />,
    settings: <SettingsPage logout={logout} />,
    help: <HelpPage />,
  }[route.page]

  return (
    <AppContext.Provider value={ctx}>
      <div className="min-h-screen bg-[#F4F6F5] text-slate-800">
        <Sidebar page={route.page} collapsed={collapsed} setCollapsed={setCollapsed} logout={logout} />
        <div className={`min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-[84px]' : 'lg:ml-[248px]'}`}>
          <Header title={title} onMenu={() => setMobileNav(true)} logout={logout} />
          <main>{pageContent}</main>
        </div>
        {mobileNav && (
          <div className="fixed inset-0 z-[90] bg-slate-950/35 lg:hidden" onClick={() => setMobileNav(false)}>
            <div className="h-full w-[286px] overflow-y-auto bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-7 flex items-center justify-between"><Logo /><button onClick={() => setMobileNav(false)} aria-label="Close menu" className="rounded-lg p-2"><X size={19} /></button></div>
              {navGroups.map((group) => (
                <div key={group.label} className="mb-5">
                  <div className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{group.label}</div>
                  {group.items.map(({ id, label, icon: Icon }) => (
                    <button key={id} onClick={() => navigate(id)}
                      className={`mb-1 flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold ${isActive(route.page, id) ? 'bg-green-50 text-green-700' : 'text-slate-500'}`}>
                      <Icon size={18} />{label}
                    </button>
                  ))}
                </div>
              ))}
              <button onClick={logout} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-red-600"><LogOut size={18} /> Log out</button>
            </div>
          </div>
        )}
        {route.page !== 'assistant' && (
          <button onClick={() => navigate('assistant')} title="Open AI Assistant" className="fixed bottom-20 right-5 z-40 grid size-12 place-items-center rounded-2xl bg-[#173F2A] text-white shadow-xl transition hover:-translate-y-1 lg:bottom-7 lg:right-7"><Bot size={21} /><span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-white bg-green-400" /></button>
        )}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white px-2 py-1.5 lg:hidden">
          {navGroups[0].items.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => navigate(id)}
              className={`flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${isActive(route.page, id) ? 'text-green-600' : 'text-slate-400'}`}>
              <Icon size={18} />{label.replace('My ', '')}
            </button>
          ))}
        </nav>
        {subjectForm && (
          <SubjectForm subject={subjectForm.subject} onClose={() => setSubjectForm(null)}
            onSaved={async (s) => { setSubjectForm(null); await reloadSubjects(); if (!subjectForm.subject) navigate({ page: 'course', subjectId: s.id }) }} />
        )}
      </div>
    </AppContext.Provider>
  )
}

function Root() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    api.get<{ user: User }>('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null))
  }, [])

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {})
    window.location.hash = ''
    setUser(null)
  }

  if (user === undefined) return <div className="grid min-h-screen place-items-center bg-[#F3F4F6]"><Loading /></div>
  if (!user) return <Login onLogin={setUser} />
  return <Workspace key={user.id} user={user} setUser={setUser} logout={logout} />
}

export default function App() {
  return <ToastProvider><Root /></ToastProvider>
}
