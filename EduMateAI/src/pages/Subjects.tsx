import { useState } from 'react'
import { ArrowRight, BookOpen, Layers3, List, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { api, Subject, timeAgo } from '../api'
import { useApp } from '../app-context'
import { Button, Empty, Progress, useToast } from '../ui'

export function SubjectCard({ subject, onDelete }: { subject: Subject; onDelete?: () => void }) {
  const { navigate, editSubject } = useApp()
  const open = () => navigate({ page: 'course', subjectId: subject.id })
  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-green-200 hover:shadow-md">
      <div className="mb-5 flex items-start justify-between">
        <div className="grid size-12 place-items-center rounded-2xl text-xs font-extrabold tracking-tight text-slate-700" style={{ background: subject.color }}>{subject.icon}</div>
        <div className="flex gap-1">
          <button onClick={() => editSubject(subject)} aria-label={`Edit ${subject.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><Pencil size={15} /></button>
          {onDelete && <button onClick={onDelete} aria-label={`Delete ${subject.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><Trash2 size={15} /></button>}
        </div>
      </div>
      <div className="text-xs font-bold text-green-600">{subject.code || 'No course code'}</div>
      <button onClick={open} className="mt-1 text-left text-lg font-bold tracking-tight text-slate-900 hover:text-green-700">{subject.name}</button>
      <p className="mt-1 text-xs text-slate-400">{subject.modules} uploaded module{subject.modules === 1 ? '' : 's'}</p>
      <div className="mt-5 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-500">Course progress</span>
        <span className="font-bold text-slate-700">{subject.progress}%</span>
      </div>
      <Progress value={subject.progress} className="mt-2" />
      <div className="mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-3 text-center">
        <div><div className="text-sm font-extrabold text-slate-800">{subject.quizScore}%</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Quiz avg.</div></div>
        <div><div className="text-sm font-extrabold text-slate-800">{subject.studyHours}h</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Studied</div></div>
        <div><div className="text-sm font-extrabold text-slate-800">{subject.sessions}</div><div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">Sessions</div></div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="truncate text-[11px] text-slate-400" title={subject.lastActivityText ?? ''}>{subject.lastActivityAt ? `Active ${timeAgo(subject.lastActivityAt)}` : 'No activity yet'}</span>
        <button onClick={open} className="flex shrink-0 items-center gap-1 text-xs font-bold text-green-600 hover:text-green-700">Open <ArrowRight size={14} /></button>
      </div>
    </article>
  )
}

export default function SubjectsPage() {
  const { subjects, reloadSubjects, openAddSubject, navigate } = useApp()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [semester, setSemester] = useState('')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const list = subjects ?? []
  const semesters = [...new Set(list.map((s) => s.semester).filter(Boolean))]
  const q = query.toLowerCase()
  const filtered = list.filter((s) => (s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) && (!semester || s.semester === semester))

  const remove = async (s: Subject) => {
    if (!confirm(`Delete “${s.name}”? All of its modules, flashcards, quizzes and history will be permanently removed.`)) return
    try { await api.del(`/subjects/${s.id}`); toast('Subject deleted'); reloadSubjects() }
    catch (e) { toast((e as Error).message, 'error') }
  }

  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">ACADEMIC WORKSPACE</p><h1>My Subjects</h1><p>Organize your modules and launch AI-powered study sessions.</p></div>
        <Button onClick={openAddSubject}><Plus size={17} /> Add subject</Button>
      </div>
      {list.length === 0 ? (
        <Empty icon={<BookOpen size={22} />} title="No subjects yet" text="Create a subject for each course you’re taking, then upload your modules to start studying." action={<Button onClick={openAddSubject}><Plus size={16} /> Add your first subject</Button>} />
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative max-w-lg flex-1"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-11" placeholder="Search subjects or course codes..." /></div>
            <select value={semester} onChange={(e) => setSemester(e.target.value)} className="input w-full sm:w-52"><option value="">All semesters</option>{semesters.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div className="mb-6 flex items-center justify-between text-sm">
            <span className="text-slate-500"><b className="text-slate-800">{filtered.length} subject{filtered.length === 1 ? '' : 's'}</b> · {filtered.reduce((a, s) => a + s.modules, 0)} total modules</span>
            <button onClick={() => setView(view === 'grid' ? 'list' : 'grid')} className="flex items-center gap-2 text-slate-500 hover:text-green-700">{view === 'grid' ? <><Layers3 size={16} /> Grid view</> : <><List size={16} /> List view</>}</button>
          </div>
          {view === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((subject) => <SubjectCard key={subject.id} subject={subject} onDelete={() => remove(subject)} />)}
              <button onClick={openAddSubject} className="min-h-72 rounded-2xl border-2 border-dashed border-slate-200 bg-white/40 p-6 text-slate-400 transition hover:border-green-300 hover:bg-green-50 hover:text-green-600">
                <Plus className="mx-auto mb-3" /><span className="text-sm font-bold">Add another subject</span><span className="mt-1 block text-xs font-normal">Create a space for your modules</span>
              </button>
            </div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => navigate({ page: 'course', subjectId: s.id })} className="flex w-full items-center gap-4 p-4 text-left hover:bg-slate-50">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl text-[10px] font-extrabold" style={{ background: s.color }}>{s.icon}</div>
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{s.name}</div><div className="text-xs text-slate-400">{s.code} · {s.modules} modules · {s.semester}</div></div>
                  <div className="hidden w-40 sm:block"><Progress value={s.progress} /></div>
                  <b className="w-12 text-right text-sm">{s.progress}%</b>
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 && <p className="py-10 text-center text-sm text-slate-400">No subjects match your search.</p>}
        </>
      )}
    </div>
  )
}
