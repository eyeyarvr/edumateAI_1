import { FormEvent, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Check, CheckCircle2, Clock3, FileText, FolderPlus, Layers3, Plus, Sparkles, Target, Timer, Trash2, Upload } from 'lucide-react'
import { Activity, api, CalendarEvent, dashboardUrl, dueLabel, formatTime, localDateKey, Recommendation, Task, timeAgo, useApi } from '../api'
import { useApp } from '../app-context'
import { Button, Empty, ErrorBox, Loading, SectionTitle, useToast } from '../ui'
import { SubjectCard } from './Subjects'

const ACTIVITY_ICON: Record<string, [typeof Upload, string]> = {
  upload: [Upload, 'bg-blue-50 text-blue-600'],
  quiz: [CheckCircle2, 'bg-green-50 text-green-600'],
  reviewer: [FileText, 'bg-violet-50 text-violet-600'],
  flashcards: [Layers3, 'bg-amber-50 text-amber-600'],
  subject: [FolderPlus, 'bg-slate-100 text-slate-600'],
  session: [Timer, 'bg-teal-50 text-teal-600'],
}
export const EVENT_COLOR: Record<string, string> = {
  Exam: 'bg-red-100 text-red-700', Assignment: 'bg-amber-100 text-amber-700', Study: 'bg-green-100 text-green-700', Reminder: 'bg-sky-100 text-sky-700',
}

export function TaskList({ compact = false }: { compact?: boolean }) {
  const toast = useToast()
  const { data, setData, loading, error, reload } = useApi<{ tasks: Task[] }>('/tasks')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('Medium')
  const tasks = data?.tasks ?? []

  const update = async (t: Task, patch: Partial<Task>) => {
    setData({ tasks: tasks.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) })
    try { await api.put(`/tasks/${t.id}`, patch) } catch (e) { toast((e as Error).message, 'error'); reload() }
  }
  const remove = async (t: Task) => {
    setData({ tasks: tasks.filter((x) => x.id !== t.id) })
    try { await api.del(`/tasks/${t.id}`) } catch (e) { toast((e as Error).message, 'error'); reload() }
  }
  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      const { task } = await api.post<{ task: Task }>('/tasks', { title, dueDate: due || null, priority })
      setData({ tasks: [task, ...tasks] })
      setTitle(''); setDue(''); setPriority('Medium'); setAdding(false)
    } catch (err) { toast((err as Error).message, 'error') }
  }

  return (
    <section className="card p-5">
      <SectionTitle title="To-do list" action={<button onClick={() => setAdding(!adding)} aria-label="Add task" className="grid size-8 place-items-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100"><Plus size={16} /></button>} />
      {adding && (
        <form onSubmit={add} className="mb-3 space-y-2 rounded-xl border border-green-200 bg-green-50/40 p-3">
          <input autoFocus required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="input h-10" placeholder="What do you need to do?" />
          <div className="flex gap-2">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="input h-10 flex-1" aria-label="Due date" />
            <select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])} className="input h-10 w-28" aria-label="Priority"><option>Low</option><option>Medium</option><option>High</option></select>
            <Button type="submit" className="h-10">Add</Button>
          </div>
        </form>
      )}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && tasks.length === 0 && !adding && <p className="py-6 text-center text-sm text-slate-400">No tasks yet — add one with the + button.</p>}
      <div className="space-y-1">
        {(compact ? tasks.slice(0, 6) : tasks).map((task) => (
          <div key={task.id} className="group flex gap-3 rounded-xl p-3 transition hover:bg-slate-50">
            <button onClick={() => update(task, { done: !task.done })} aria-label={task.done ? 'Mark as not done' : 'Mark as done'}
              className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${task.done ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 hover:border-green-500'}`}>
              {task.done && <Check size={13} />}
            </button>
            <div className="min-w-0 flex-1">
              <div className={`text-sm font-semibold ${task.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{task.title}</div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                <Clock3 size={12} /> <span className={!task.done && task.dueDate && task.dueDate < localDateKey(new Date()) ? 'font-bold text-red-500' : ''}>{dueLabel(task.dueDate)}</span>
                <span className={`rounded px-1.5 py-0.5 ${task.priority === 'High' ? 'bg-red-50 text-red-600' : 'bg-slate-100'}`}>{task.priority}</span>
              </div>
            </div>
            <button onClick={() => remove(task)} aria-label="Delete task" className="self-center rounded-lg p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  )
}

export function RecommendationBanner({ rec, tone = 'green' }: { rec: Recommendation; tone?: 'green' | 'amber' }) {
  const { navigate } = useApp()
  if (!rec) return null
  const go = () => navigate({ page: 'study', subjectId: rec.subjectId, moduleId: rec.moduleId ?? undefined })
  const amber = tone === 'amber'
  return (
    <section className={`mb-7 rounded-2xl border p-5 sm:p-6 ${amber ? 'border-amber-200 bg-amber-50' : 'border-green-200 bg-gradient-to-r from-green-50 to-white'}`}>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="flex gap-4">
          <div className={`hidden size-12 shrink-0 place-items-center rounded-2xl sm:grid ${amber ? 'bg-amber-100 text-amber-700' : 'bg-green-600 text-white'}`}>{amber ? <Sparkles size={21} /> : <Target size={23} />}</div>
          <div>
            <div className={`mb-1 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider ${amber ? 'text-amber-700' : 'text-green-700'}`}><Sparkles size={14} /> {amber ? 'Recommended focus' : 'Top suggested priority'}</div>
            <h2 className="text-lg font-bold text-slate-900">{rec.subjectName} — {rec.topic}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">You’re scoring {rec.accuracy}% on this topic. Review it with flashcards{rec.moduleTitle ? ` from “${rec.moduleTitle}”` : ''}, then try a short practice quiz.</p>
          </div>
        </div>
        <Button onClick={go} className="shrink-0">Start reviewing <ArrowRight size={16} /></Button>
      </div>
    </section>
  )
}

function WeekStrip({ events }: { events: CalendarEvent[] }) {
  const { navigate } = useApp()
  const today = new Date()
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d })
  const todayKey = localDateKey(today)
  const [selected, setSelected] = useState(todayKey)
  const byDay = useMemo(() => new Set(events.map((e) => e.date)), [events])
  const shown = events.filter((e) => e.date >= selected).slice(0, 3)
  return (
    <section className="card p-5">
      <SectionTitle title="This week" action={<button onClick={() => navigate('calendar')} className="text-xs font-bold text-green-600">Open calendar</button>} />
      <div className="mb-5 grid grid-cols-7 gap-1">
        {week.map((d) => {
          const key = localDateKey(d)
          return (
            <button key={key} onClick={() => setSelected(key)} className={`relative rounded-xl py-3 text-center ${key === selected ? 'bg-green-600 text-white shadow-sm' : key === todayKey ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-50'}`}>
              <div className="text-[10px] font-bold">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</div><div className="mt-1 text-sm font-bold">{d.getDate()}</div>
              {byDay.has(key) && <span className={`absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full ${key === selected ? 'bg-white' : 'bg-green-500'}`} />}
            </button>
          )
        })}
      </div>
      <div className="space-y-3">
        {shown.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No upcoming events. <button onClick={() => navigate('calendar')} className="font-bold text-green-600">Add one</button></p>}
        {shown.map((event) => (
          <div key={event.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-sm font-bold text-slate-700">{Number(event.date.slice(8))}</div>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-800">{event.title}</div><div className="text-xs text-slate-400">{dueLabel(event.date)} · {formatTime(event.time)} · {event.durationMinutes} min</div></div>
            <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${EVENT_COLOR[event.type]}`}>{event.type}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function Dashboard() {
  const { user, subjects, navigate, openAddSubject } = useApp()
  const { data, error, reload } = useApi<{ recommendation: Recommendation; activities: Activity[]; upcoming: CalendarEvent[] }>(dashboardUrl())
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const list = subjects ?? []

  return (
    <div className="page-wrap">
      <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-600"><span className="h-px w-5 bg-green-500" /> YOUR LEARNING SPACE</div>
          <h1 className="text-3xl font-extrabold tracking-[-.03em] text-slate-900">{greeting}, {user.firstName}!</h1>
          <p className="mt-2 text-sm text-slate-500">{list.length ? 'You’re making great progress. Let’s keep the momentum going.' : 'Let’s set up your first subject to get started.'}</p>
        </div>
        <Button onClick={() => navigate('study')} disabled={!list.length}><Sparkles size={17} /> Start a study session</Button>
      </section>

      {error && <div className="mb-6"><ErrorBox message={error} onRetry={reload} /></div>}
      {data && <RecommendationBanner rec={data.recommendation} />}

      <div className="mb-7">
        <SectionTitle title="My Subjects" action={<div className="flex gap-2"><Button variant="secondary" onClick={openAddSubject}><Plus size={16} /> Add subject</Button>{list.length > 3 && <button onClick={() => navigate('subjects')} className="hidden text-sm font-bold text-green-600 sm:block">View all</button>}</div>} />
        {list.length === 0
          ? <Empty icon={<BookOpen size={22} />} title="No subjects yet" text="Add the courses you’re taking this semester. Each subject keeps its own modules, flashcards and quizzes." action={<Button onClick={openAddSubject}><Plus size={16} /> Add subject</Button>} />
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.slice(0, 3).map((subject) => <SubjectCard key={subject.id} subject={subject} />)}</div>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        {data ? <WeekStrip events={data.upcoming} /> : <section className="card p-5"><Loading /></section>}
        <TaskList compact />
      </div>
      <section className="card mt-6 p-5">
        <SectionTitle title="Recent activity" />
        {data && data.activities.length === 0 && <p className="py-4 text-sm text-slate-400">Your uploads, quizzes and study sessions will show up here.</p>}
        <div className="grid gap-3 md:grid-cols-3">
          {data?.activities.map((activity) => {
            const [Icon, color] = ACTIVITY_ICON[activity.kind] ?? ACTIVITY_ICON.subject
            return (
              <div key={activity.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3">
                <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={16} /></div>
                <div className="min-w-0"><div className="text-sm font-semibold text-slate-700">{activity.text}</div><div className="mt-1 text-[11px] text-slate-400">{[activity.subjectName, activity.meta, timeAgo(activity.createdAt)].filter(Boolean).join(' · ')}</div></div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
