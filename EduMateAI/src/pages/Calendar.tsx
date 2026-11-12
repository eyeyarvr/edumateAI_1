import { FormEvent, useMemo, useState } from 'react'
import { AlarmClock, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { api, CalendarEvent, formatDay, formatTime, localDateKey, useApi } from '../api'
import { useApp } from '../app-context'
import { Button, ErrorBox, Modal, SectionTitle, useToast } from '../ui'
import { EVENT_COLOR, TaskList } from './Dashboard'

type Draft = Partial<CalendarEvent> & { date: string }

function EventForm({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { subjects } = useApp()
  const toast = useToast()
  const [form, setForm] = useState({
    title: draft.title ?? '', date: draft.date, time: draft.time ?? '10:00', durationMinutes: draft.durationMinutes ?? 60,
    type: draft.type ?? 'Study', subjectId: draft.subjectId ?? '', notes: draft.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const body = { ...form, durationMinutes: Number(form.durationMinutes), subjectId: form.subjectId ? Number(form.subjectId) : null }
    try {
      if (draft.id) await api.put(`/events/${draft.id}`, body)
      else await api.post('/events', body)
      toast(draft.id ? 'Event updated' : 'Event added')
      onSaved()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!draft.id || !confirm('Delete this event?')) return
    try { await api.del(`/events/${draft.id}`); toast('Event deleted'); onSaved() } catch (err) { setError((err as Error).message) }
  }
  return (
    <Modal title={draft.id ? 'Edit event' : 'Add calendar event'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="field">Event title<input autoFocus required maxLength={200} value={form.title} onChange={set('title')} className="input mt-2" placeholder="e.g. Web Development midterm" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Date<input required type="date" value={form.date} onChange={set('date')} className="input mt-2" /></label>
          <label className="field">Time<input required type="time" value={form.time} onChange={set('time')} className="input mt-2" /></label>
          <label className="field">Type<select value={form.type} onChange={set('type')} className="input mt-2"><option value="Study">Study session</option><option>Exam</option><option>Assignment</option><option>Reminder</option></select></label>
          <label className="field">Duration<select value={form.durationMinutes} onChange={set('durationMinutes')} className="input mt-2">{[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? 's' : ''}`}</option>)}</select></label>
        </div>
        <label className="field">Subject<select value={form.subjectId} onChange={set('subjectId')} className="input mt-2"><option value="">None</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="field">Notes<textarea maxLength={2000} value={form.notes} onChange={set('notes')} className="input mt-2 min-h-20 py-3" /></label>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {draft.id ? <Button type="button" variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>{draft.id ? 'Save' : 'Add event'}</Button></div>
        </div>
      </form>
    </Modal>
  )
}

export default function CalendarPage() {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [draft, setDraft] = useState<Draft | null>(null)
  const today = localDateKey(new Date())

  // Visible days: 6-week grid for month view (Sunday start), 7 days for week view.
  const days = useMemo(() => {
    const start = view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth(), 1) : new Date(cursor)
    start.setDate(start.getDate() - start.getDay())
    const count = view === 'month' ? 42 : 7
    return Array.from({ length: count }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [cursor, view])
  const from = localDateKey(days[0])
  const to = localDateKey(days[days.length - 1])
  const range = useApi<{ events: CalendarEvent[] }>(`/events?from=${from}&to=${to}`)
  const upcoming = useApi<{ events: CalendarEvent[] }>(`/events?from=${today}`)
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of range.data?.events ?? []) m.set(e.date, [...(m.get(e.date) ?? []), e])
    return m
  }, [range.data])

  const shift = (n: number) => { const d = new Date(cursor); if (view === 'month') d.setMonth(d.getMonth() + n, 1); else d.setDate(d.getDate() + 7 * n); setCursor(d) }
  const label = view === 'month' ? cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${formatDay(from)} – ${formatDay(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const saved = () => { setDraft(null); range.reload(); upcoming.reload() }

  return (
    <div className="page-wrap">
      <div className="page-heading"><div><p className="eyebrow">ACADEMIC PLANNER</p><h1>Calendar</h1><p>Keep exams, deadlines, and study plans in one place.</p></div><Button onClick={() => setDraft({ date: today })}><Plus size={17} /> Add event</Button></div>
      {range.error && <div className="mb-4"><ErrorBox message={range.error} onRetry={range.reload} /></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <section className="card overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <button onClick={() => shift(-1)} aria-label="Previous" className="rounded-lg border border-slate-200 p-2"><ChevronLeft size={16} /></button>
              <h2 className="min-w-44 text-center text-lg font-bold">{label}</h2>
              <button onClick={() => shift(1)} aria-label="Next" className="rounded-lg border border-slate-200 p-2"><ChevronRight size={16} /></button>
              <button onClick={() => setCursor(new Date())} className="text-xs font-bold text-green-600">Today</button>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">{(['month', 'week'] as const).map((x) => <button key={x} onClick={() => setView(x)} className={`rounded-lg px-4 py-1.5 text-xs font-bold capitalize ${view === x ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'}`}>{x}</button>)}</div>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => <div key={x} className="p-3 text-center text-[10px] font-extrabold uppercase text-slate-400">{x}</div>)}</div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const key = localDateKey(d)
              const inMonth = view === 'week' || d.getMonth() === cursor.getMonth()
              const evs = byDay.get(key) ?? []
              return (
                <div key={key} onClick={() => setDraft({ date: key })} className={`cursor-pointer border-b border-r border-slate-100 p-2 text-left ${view === 'week' ? 'min-h-72' : 'min-h-20 sm:min-h-28'} ${!inMonth ? 'bg-slate-50/60 text-slate-300' : 'text-slate-600 hover:bg-green-50/30'}`}>
                  <span className={`grid size-7 place-items-center rounded-full text-xs font-bold ${key === today ? 'bg-green-600 text-white' : ''}`}>{d.getDate()}</span>
                  <div className="mt-1 space-y-1">
                    {evs.slice(0, view === 'week' ? 10 : 2).map((e) => (
                      <button key={e.id} onClick={(ev) => { ev.stopPropagation(); setDraft(e) }} title={`${formatTime(e.time)} · ${e.title}`} className={`block w-full truncate rounded px-1.5 py-1 text-left text-[9px] font-bold ${EVENT_COLOR[e.type]}`}>
                        {view === 'week' && <span className="mr-1 opacity-70">{formatTime(e.time)}</span>}{e.title}
                      </button>
                    ))}
                    {view === 'month' && evs.length > 2 && <div className="px-1 text-[9px] font-bold text-slate-400">+{evs.length - 2} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
        <aside className="space-y-5">
          <section className="card p-5"><SectionTitle title="Upcoming" />
            <div className="space-y-4">
              {upcoming.data?.events.length === 0 && <p className="text-sm text-slate-400">No upcoming events.</p>}
              {upcoming.data?.events.slice(0, 6).map((e) => (
                <button key={e.id} onClick={() => setDraft(e)} className="flex w-full gap-3 text-left">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-50 text-sm font-bold">{Number(e.date.slice(8))}</div>
                  <div className="min-w-0"><div className="truncate text-sm font-bold">{e.title}</div><div className="mt-1 text-[11px] text-slate-400">{formatDay(e.date, { weekday: 'short', month: 'long', day: 'numeric' })} · {formatTime(e.time)}</div><span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${EVENT_COLOR[e.type]}`}>{e.type}{e.subjectName ? ` · ${e.subjectName}` : ''}</span></div>
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-2xl bg-[#173F2A] p-5 text-white"><AlarmClock size={22} className="mb-5 text-green-300" /><h3 className="font-bold">Plan focused study time</h3><p className="mt-2 text-sm leading-6 text-green-50/65">Students who schedule 3 sessions per week are more likely to meet their goals.</p><button onClick={() => setDraft({ date: today, type: 'Study' })} className="mt-4 text-sm font-bold text-green-300">Schedule a session →</button></section>
          <TaskList />
        </aside>
      </div>
      {draft && <EventForm draft={draft} onClose={() => setDraft(null)} onSaved={saved} />}
    </div>
  )
}
