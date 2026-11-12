import { FormEvent, useState } from 'react'
import { ArrowLeft, ArrowRight, BarChart3, Clock3, Download, Eye, FileText, Layers3, MessageCircle, MoreHorizontal, Pencil, Search, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react'
import { api, downloadMarkdown, Flashcard, formatBytes, formatDay, Module, parseDate, Subject, SubjectAnalytics, timeAgo, useApi } from '../api'
import { useApp } from '../app-context'
import { Button, Empty, ErrorBox, Loading, Modal, Progress, SectionTitle, useToast } from '../ui'

function UploadModal({ subjectId, onClose, onDone }: { subjectId: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > 50 * 1024 * 1024) return setError('Files must be 50 MB or smaller.')
    setError(''); setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return setError('Please choose a file.')
    const body = new FormData()
    body.append('title', title)
    body.append('file', file)
    setBusy(true)
    try { await api.post(`/subjects/${subjectId}/modules`, body); toast('Module uploaded'); onDone() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Upload learning module" onClose={onClose}>
      <form onSubmit={submit}>
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]) }}
          className={`block cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-green-500 bg-green-50' : 'border-green-200 bg-green-50/50 hover:bg-green-50'}`}>
          <div className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-white text-green-600 shadow-sm"><Upload size={21} /></div>
          <p className="text-sm font-bold text-slate-800">{file ? file.name : 'Drop a file here or click to browse'}</p>
          <p className="mt-1 text-xs text-slate-400">{file ? formatBytes(file.size) : 'PDF, DOCX, PPTX, TXT · Up to 50 MB'}</p>
          <input type="file" accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <label className="field mt-4">Module title<input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-2" placeholder="e.g. Week 5 – Sorting Algorithms" /></label>
        {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Upload</Button></div>
      </form>
    </Modal>
  )
}

function ModuleRow({ module, index, onChanged, aiEnabled }: { module: Module; index: number; onChanged: () => void; aiEnabled: boolean }) {
  const { navigate } = useApp()
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(module.title)

  const generate = async () => {
    setMenu(false); setBusy(true)
    try {
      const r = await api.post<{ flashcards: number; questions: number; grounded: boolean }>(`/modules/${module.id}/generate`)
      toast(`Generated ${r.flashcards} flashcards and ${r.questions} questions${r.grounded ? '' : ' (from the module title — attach a PDF for content-based questions)'}`)
      onChanged()
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const remove = async () => {
    setMenu(false)
    if (!confirm(`Delete “${module.title}” and its flashcards and questions?`)) return
    try { await api.del(`/modules/${module.id}`); toast('Module deleted'); onChanged() } catch (e) { toast((e as Error).message, 'error') }
  }
  const rename = async (e: FormEvent) => {
    e.preventDefault()
    try { await api.put(`/modules/${module.id}`, { title }); setRenaming(false); onChanged() } catch (err) { toast((err as Error).message, 'error') }
  }

  return (
    <div className="flex flex-col gap-4 p-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center">
      <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${index % 2 ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'}`}><FileText size={19} /></div>
      <div className="min-w-0 flex-1">
        {renaming
          ? <form onSubmit={rename} className="flex gap-2"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="input h-9" /><Button type="submit" className="h-9">Save</Button><Button type="button" variant="ghost" className="h-9" onClick={() => { setTitle(module.title); setRenaming(false) }}>Cancel</Button></form>
          : <h3 className="truncate text-sm font-bold text-slate-800">{module.title}</h3>}
        <p className="mt-1 truncate text-xs text-slate-400">
          {[module.fileName, module.pages ? `${module.pages} pages` : module.sizeBytes ? formatBytes(module.sizeBytes) : null, `Uploaded ${formatDay(module.uploadedAt.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })}`].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">{module.flashcards} flashcards · {module.questions} questions{module.hasReviewer ? ' · reviewer ready' : ''}</p>
      </div>
      <span className={`w-fit rounded-full px-3 py-1 text-[11px] font-bold ${busy || module.status === 'Processing' ? 'bg-amber-50 text-amber-600' : module.status === 'Failed' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{busy ? 'Generating…' : module.status}</span>
      <div className="relative flex gap-1">
        <Button variant="ghost" className="h-9 px-3" onClick={() => navigate({ page: 'study', subjectId: module.subjectId, moduleId: module.id })}><Sparkles size={15} /> Study</Button>
        {module.hasFile && <a href={`/api/modules/${module.id}/file`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"><Eye size={15} /> Preview</a>}
        <button onClick={() => setMenu(!menu)} aria-label="More actions" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><MoreHorizontal size={18} /></button>
        {menu && <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-10 z-20 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <button onClick={generate} disabled={!aiEnabled} title={aiEnabled ? '' : 'Set GEMINI_API_KEY or ANTHROPIC_API_KEY in the server .env file to enable'} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Wand2 size={15} /> Generate with AI</button>
            <button onClick={() => { setMenu(false); setRenaming(true) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={15} /> Rename</button>
            {module.hasFile && <a href={`/api/modules/${module.id}/file?download`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Download size={15} /> Download file</a>}
            <button onClick={remove} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={15} /> Delete</button>
          </div>
        </>}
      </div>
    </div>
  )
}

async function exportMaterials(subject: Subject, modules: Module[]) {
  let md = `# ${subject.name}${subject.code ? ` (${subject.code})` : ''}\n\n`
  for (const m of modules) {
    const { flashcards } = await api.get<{ flashcards: Flashcard[] }>(`/modules/${m.id}/flashcards`)
    md += `## ${m.title}\n\n`
    if (m.reviewer) md += `${m.reviewer.replace(/^## /gm, '### ')}\n\n`
    if (flashcards.length) md += `### Flashcards\n\n${flashcards.map((f) => `- **${f.question}** — ${f.answer}`).join('\n')}\n\n`
  }
  downloadMarkdown(`${subject.name}_study_materials`, md)
}

export default function CoursePage({ subjectId }: { subjectId: number }) {
  const { navigate, editSubject, reloadSubjects } = useApp()
  const toast = useToast()
  const detail = useApi<{ subject: Subject; analytics: SubjectAnalytics }>(`/subjects/${subjectId}`)
  const mods = useApi<{ modules: Module[] }>(`/subjects/${subjectId}/modules`)
  const ai = useApi<{ enabled: boolean }>('/ai/status')
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')

  if (detail.error) return <div className="page-wrap"><ErrorBox message={detail.error} onRetry={detail.reload} /><button onClick={() => navigate('subjects')} className="mt-4 text-sm font-bold text-green-600">← Back to subjects</button></div>
  if (!detail.data) return <Loading className="min-h-[60vh]" />
  const { subject, analytics } = detail.data
  const modules = mods.data?.modules ?? []
  const filtered = modules.filter((m) => m.title.toLowerCase().includes(query.toLowerCase()) && (!type || m.fileType === type))
  const refresh = () => { detail.reload(); mods.reload(); reloadSubjects() }
  const studied = Math.round((subject.modules * subject.progress) / 100)

  return (
    <div className="page-wrap">
      <button onClick={() => navigate('subjects')} className="mb-5 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-green-600"><ArrowLeft size={16} /> Back to subjects</button>
      <section className="mb-6 overflow-hidden rounded-2xl bg-[#173F2A] p-6 text-white sm:p-8">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-extrabold tracking-wide">{subject.icon}</div>
            <div><div className="mb-2 text-xs font-bold uppercase tracking-wider text-green-300">{[subject.code, subject.semester].filter(Boolean).join(' · ') || 'Subject'}</div><h1 className="text-3xl font-extrabold">{subject.name}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-green-50/70">{subject.description || 'Access your uploaded modules, AI-powered study materials, and course-specific learning performance.'}</p></div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => editSubject(subject)}><Pencil size={16} /> Edit subject</Button>
            <Button onClick={() => setUploading(true)}><Upload size={16} /> Upload module</Button>
          </div>
        </div>
        <div className="mt-8 grid gap-5 border-t border-white/10 pt-6 sm:grid-cols-3">
          <div><div className="text-2xl font-bold">{subject.modules}</div><div className="text-xs text-green-50/60">Uploaded modules</div></div>
          <div><div className="text-2xl font-bold">{subject.progress}%</div><div className="text-xs text-green-50/60">Course progress</div></div>
          <div><Progress value={subject.progress} className="mt-2 bg-white/10" /><div className="mt-2 text-xs text-green-50/60">{studied} of {subject.modules} modules studied</div></div>
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div><p className="eyebrow">COURSE ANALYTICS</p><h2 className="mt-1 text-lg font-bold text-slate-900">Your performance in {subject.name}</h2></div>
          <button onClick={() => navigate('performance')} className="flex items-center gap-1 text-xs font-bold text-green-600">View full analytics <ArrowRight size={14} /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="card p-4"><div className="mb-3 flex items-center justify-between"><div className="grid size-9 place-items-center rounded-xl bg-green-50 text-green-600"><BarChart3 size={17} /></div>{analytics.monthlyChange != null && <span className={`text-[10px] font-bold ${analytics.monthlyChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>{analytics.monthlyChange >= 0 ? '+' : ''}{analytics.monthlyChange}% this month</span>}</div><div className="text-2xl font-extrabold text-slate-900">{subject.quizScore}%</div><div className="text-xs text-slate-400">Average quiz score</div></div>
          <div className="card p-4"><div className="mb-3 grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600"><MessageCircle size={17} /></div><div className="text-2xl font-extrabold text-slate-900">{analytics.qaAccuracy ?? '—'}{analytics.qaAccuracy != null && '%'}</div><div className="text-xs text-slate-400">Q&A accuracy</div></div>
          <div className="card p-4"><div className="mb-3 grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-600"><Layers3 size={17} /></div><div className="text-2xl font-extrabold text-slate-900">{analytics.cardsReviewed}</div><div className="text-xs text-slate-400">Flashcards reviewed</div></div>
          <div className="card p-4"><div className="mb-3 grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-600"><Clock3 size={17} /></div><div className="text-2xl font-extrabold text-slate-900">{subject.studyHours}h</div><div className="text-xs text-slate-400">{subject.sessions} study sessions</div></div>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
          <div className="card p-5">
            <div className="mb-5 flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-800">Recent quiz trend</h3><p className="mt-1 text-[11px] text-slate-400">Last {analytics.trend.length || 6} assessments</p></div>
              {analytics.trend.length >= 2 && (() => { const d = analytics.trend.at(-1)!.score - analytics.trend[0].score; return <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${d >= 0 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>{d >= 0 ? 'Improving' : 'Needs attention'}</span> })()}
            </div>
            {analytics.trend.length === 0 ? <p className="flex h-28 items-center justify-center text-sm text-slate-400">Take a practice quiz to see your trend.</p> : (
              <div className="flex h-28 items-end gap-3">
                {analytics.trend.map((t, i) => <div key={i} className="flex h-full flex-1 flex-col justify-end gap-2" title={parseDate(t.date).toLocaleString()}><div className="text-center text-[9px] font-bold text-slate-400">{t.score}%</div><div className="rounded-t-md bg-green-500/80 transition-all" style={{ height: `${Math.max(t.score, 3)}%` }} /></div>)}
              </div>
            )}
          </div>
          <div className="card p-5">
            <div className="mb-4 flex items-center gap-2"><Sparkles size={17} className="text-green-600" /><h3 className="text-sm font-bold text-slate-800">Course insight</h3></div>
            <div className="mb-3 rounded-xl bg-green-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-green-700">Strongest topic</div><div className="mt-1 text-sm font-bold text-slate-800">{analytics.strongest ?? 'Not enough data yet'}</div></div>
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Recommended focus</div><div className="mt-1 text-sm font-bold text-slate-800">{analytics.focus ?? 'Not enough data yet'}</div></div>
          </div>
        </div>
      </section>

      <section className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-green-200 bg-green-50 p-5 sm:flex-row sm:items-center">
        <div className="flex gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-green-600 text-white"><Sparkles size={19} /></div><div><h3 className="font-bold text-slate-900">{modules.length ? 'Your AI study space is ready' : 'Upload a module to start studying'}</h3><p className="mt-1 text-sm text-slate-500">Practice with Q&A, flashcards, quizzes, and a structured reviewer.</p></div></div>
        <Button disabled={!modules.length} onClick={() => navigate({ page: 'study', subjectId: subject.id })}>Enter Study Mode <ArrowRight size={16} /></Button>
      </section>

      <SectionTitle title="Module library" action={<Button variant="secondary" disabled={!modules.length} onClick={() => exportMaterials(subject, modules).catch((e) => toast(e.message, 'error'))}><Download size={16} /> Export materials</Button>} />
      {mods.error && <ErrorBox message={mods.error} onRetry={mods.reload} />}
      {mods.data && modules.length === 0 ? (
        <Empty icon={<Upload size={22} />} title="No modules yet" text="Upload lecture slides, handouts or notes. You can then add flashcards and quiz questions, or let AI generate them." action={<Button onClick={() => setUploading(true)}><Upload size={16} /> Upload module</Button>} />
      ) : (
        <div className="card overflow-visible">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
            <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="input h-10 pl-10" placeholder="Search modules..." /></div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="input h-10 sm:w-40"><option value="">All file types</option>{[...new Set(modules.map((m) => m.fileType))].map((t) => <option key={t}>{t}</option>)}</select>
          </div>
          {!mods.data && <Loading />}
          <div className="divide-y divide-slate-100">
            {filtered.map((m, i) => <ModuleRow key={m.id} module={m} index={i} onChanged={refresh} aiEnabled={!!ai.data?.enabled} />)}
          </div>
          {mods.data && filtered.length === 0 && <p className="p-8 text-center text-sm text-slate-400">No modules match your search.</p>}
        </div>
      )}
      <p className="mt-3 text-[11px] text-slate-400">Last activity {timeAgo(subject.lastActivityAt) || '—'}</p>
      {uploading && <UploadModal subjectId={subject.id} onClose={() => setUploading(false)} onDone={() => { setUploading(false); refresh() }} />}
    </div>
  )
}
