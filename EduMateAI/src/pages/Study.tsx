import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText,
  Layers3, Lightbulb, ListChecks, MessageCircle, Pencil, Plus, RotateCcw, Search, Shuffle, Sparkles, Trash2, Upload, XCircle, Zap,
} from 'lucide-react'
import { AnswerResult, api, downloadMarkdown, Flashcard, Module, Question, useApi } from '../api'
import { useApp } from '../app-context'
import { Button, Empty, ErrorBox, headings, Loading, Markdown, Modal, Progress, useToast } from '../ui'

type Tab = 'qa' | 'flashcards' | 'quiz' | 'reviewer'

function shuffle<T>(a: T[]) {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]] }
  return b
}

// --------------------------------------------------------------- question form
function QuestionForm({ moduleId, onClose, onSaved }: { moduleId: number; onClose: () => void; onSaved: () => void }) {
  const [question, setQuestion] = useState('')
  const [choices, setChoices] = useState(['', '', '', ''])
  const [correct, setCorrect] = useState(0)
  const [explanation, setExplanation] = useState('')
  const [topic, setTopic] = useState('')
  const [difficulty, setDifficulty] = useState('Medium')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const filled = choices.map((c) => c.trim())
    if (!filled[correct]) return setError('The correct choice cannot be empty.')
    setBusy(true)
    try {
      // Keep the chosen answer's position after removing blank choices.
      const nonEmpty = filled.map((c, i) => [c, i] as const).filter(([c]) => c)
      await api.post(`/modules/${moduleId}/questions`, { question, choices: nonEmpty.map(([c]) => c), correctIndex: nonEmpty.findIndex(([, i]) => i === correct), explanation, topic, difficulty })
      onSaved()
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Add quiz question" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <label className="field">Question<textarea autoFocus required value={question} onChange={(e) => setQuestion(e.target.value)} className="input mt-2 min-h-20 py-3" /></label>
        <div className="field">Answer choices <span className="font-normal text-slate-400">(select the correct one)</span>
          <div className="mt-2 space-y-2">{choices.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} className="size-4 accent-green-600" aria-label={`Choice ${i + 1} is correct`} />
              <input value={c} required={i < 2} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} className="input h-10" placeholder={`Choice ${String.fromCharCode(65 + i)}${i >= 2 ? ' (optional)' : ''}`} />
            </div>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="field">Topic<input value={topic} onChange={(e) => setTopic(e.target.value)} className="input mt-2" placeholder="e.g. DOM Events" /></label>
          <label className="field">Difficulty<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="input mt-2"><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        </div>
        <label className="field">Explanation <span className="font-normal text-slate-400">(shown after answering)</span><textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className="input mt-2 min-h-16 py-3" /></label>
        {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save question</Button></div>
      </form>
    </Modal>
  )
}

function NoQuestions({ moduleId, onAdded }: { moduleId: number; onAdded: () => void }) {
  const [adding, setAdding] = useState(false)
  return (
    <>
      <Empty icon={<ListChecks size={22} />} title="No questions for this module yet" text="Add your own questions, or use “Generate with AI” on the subject page to create a question bank automatically."
        action={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add a question</Button>} />
      {adding && <QuestionForm moduleId={moduleId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onAdded() }} />}
    </>
  )
}

// ---------------------------------------------------------------------- Q&A
function QAMode({ moduleId }: { moduleId: number }) {
  const toast = useToast()
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium')
  const { data, error, reload } = useApi<{ questions: Question[] }>(`/modules/${moduleId}/questions?difficulty=${difficulty}&shuffle=1&limit=10`)
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [tally, setTally] = useState({ correct: 0, wrong: 0 })
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => { setIndex(0); setAnswer(''); setResult(null); setAttemptId(null); setTally({ correct: 0, wrong: 0 }); setFinished(false) }, [data])

  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />
  const questions = data.questions
  if (!questions.length) return <NoQuestions moduleId={moduleId} onAdded={reload} />
  const q = questions[index]

  const check = async () => {
    setBusy(true)
    try {
      let id = attemptId
      if (!id) { id = (await api.post<{ attemptId: number }>('/attempts', { moduleId, mode: 'qa', difficulty })).attemptId; setAttemptId(id) }
      const r = await api.post<AnswerResult>(`/attempts/${id}/answers`, { questionId: q.id, answerText: answer })
      setResult(r)
      setTally((t) => (r.correct ? { ...t, correct: t.correct + 1 } : { ...t, wrong: t.wrong + 1 }))
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const next = async () => {
    if (index + 1 >= questions.length) {
      if (attemptId) await api.post(`/attempts/${attemptId}/complete`).catch(() => {})
      setFinished(true)
      return
    }
    setIndex(index + 1); setAnswer(''); setResult(null)
  }
  // Switching difficulty starts a new round, so close the current attempt first.
  const changeDifficulty = (d: typeof difficulty) => {
    if (d === difficulty) return
    if (attemptId && !finished) api.post(`/attempts/${attemptId}/complete`).catch(() => {})
    setDifficulty(d)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_290px]">
      <section className="card p-5 sm:p-8">
        {finished ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-green-50 text-green-600"><CheckCircle2 size={26} /></div>
            <h2 className="text-2xl font-extrabold">Session complete</h2>
            <p className="mt-2 text-slate-500">You answered {tally.correct} of {tally.correct + tally.wrong} correctly ({Math.round((100 * tally.correct) / Math.max(1, tally.correct + tally.wrong))}%).</p>
            <Button className="mt-6" onClick={reload}><RotateCcw size={15} /> Start another round</Button>
          </div>
        ) : <>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
            <div><p className="eyebrow">QUESTION {index + 1} OF {questions.length}</p><h2 className="mt-1 text-xl font-bold text-slate-900">Test your understanding</h2></div>
            <div className="flex rounded-xl bg-slate-100 p-1">{(['Easy', 'Medium', 'Hard'] as const).map((d) => <button key={d} onClick={() => changeDifficulty(d)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${difficulty === d ? 'bg-white text-green-700 shadow-sm' : 'text-slate-500'}`}>{d}</button>)}</div>
          </div>
          <Progress value={((index + (result ? 1 : 0)) / questions.length) * 100} className="mb-8" />
          <div className="rounded-2xl bg-slate-50 p-5 sm:p-7">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold text-green-600"><BrainCircuit size={16} /> {q.topic.toUpperCase()}</div>
            <p className="text-lg font-bold leading-8 text-slate-800">{q.question}</p>
          </div>
          <textarea value={answer} disabled={!!result} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && answer.trim() && !result) check() }}
            className="input mt-5 min-h-28 resize-none py-3" placeholder="Type your answer and explain your reasoning..." />
          {result && (
            <div className={`mt-4 rounded-xl border p-4 ${result.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className={`flex items-center gap-2 font-bold ${result.correct ? 'text-green-700' : 'text-red-700'}`}>{result.correct ? <CheckCircle2 size={17} /> : <XCircle size={17} />} {result.correct ? 'Correct' : 'Not quite'} — {result.correctAnswer}</div>
              {result.explanation && <p className="mt-2 text-sm leading-6 text-slate-600">{result.explanation}</p>}
            </div>
          )}
          <div className="mt-5 flex justify-between">
            <Button variant="secondary" disabled={!!result || !answer} onClick={() => setAnswer('')}><RotateCcw size={15} /> Clear</Button>
            {result ? <Button onClick={next}>{index + 1 >= questions.length ? 'Finish' : 'Next question'} <ArrowRight size={15} /></Button>
              : <Button disabled={!answer.trim()} loading={busy} onClick={check}>Check answer <ArrowRight size={15} /></Button>}
          </div>
        </>}
      </section>
      <aside className="space-y-4">
        <div className="card p-5"><div className="mb-4 flex items-center gap-2 font-bold text-slate-800"><Activity size={17} className="text-green-600" /> Session score</div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-green-50 p-3"><div className="text-2xl font-extrabold text-green-700">{tally.correct}</div><div className="text-[11px] text-green-700">Correct</div></div><div className="rounded-xl bg-red-50 p-3"><div className="text-2xl font-extrabold text-red-600">{tally.wrong}</div><div className="text-[11px] text-red-600">Review</div></div></div></div>
        <div className="card p-5"><div className="mb-3 flex items-center gap-2 font-bold text-slate-800"><Lightbulb size={17} className="text-amber-500" /> Study tip</div><p className="text-sm leading-6 text-slate-500">Answer in your own words first — explaining a concept is the fastest way to find gaps. Grading checks for the key idea, not exact wording.</p></div>
      </aside>
    </div>
  )
}

// --------------------------------------------------------------- flashcards
function FlashcardMode({ moduleId }: { moduleId: number }) {
  const toast = useToast()
  const { data, setData, error, reload } = useApi<{ flashcards: Flashcard[] }>(`/modules/${moduleId}/flashcards`)
  const [order, setOrder] = useState<number[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewOnly, setReviewOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const cards = data?.flashcards ?? []
  const pool = reviewOnly ? cards.filter((c) => c.lastResult === 'review') : cards

  useEffect(() => { setOrder(pool.map((c) => c.id)); setIndex(0); setFlipped(false) }, [data?.flashcards.length, reviewOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return <Loading />

  const card = cards.find((c) => c.id === order[index])
  const marked = cards.filter((c) => c.lastResult === 'review').length
  const known = cards.filter((c) => c.lastResult === 'known').length
  const move = (d: number) => { setFlipped(false); setIndex((i) => (order.length ? (i + d + order.length) % order.length : 0)) }

  const rate = async (result: 'known' | 'review') => {
    if (!card) return
    setData({ flashcards: cards.map((c) => (c.id === card.id ? { ...c, lastResult: result } : c)) })
    move(1)
    try { await api.post(`/flashcards/${card.id}/review`, { result }) } catch (e) { toast((e as Error).message, 'error') }
  }
  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { flashcard } = await api.post<{ flashcard: Flashcard }>(`/modules/${moduleId}/flashcards`, { question: q, answer: a })
      setData({ flashcards: [...cards, flashcard] }); setQ(''); setA(''); setAdding(false); toast('Flashcard added')
    } catch (err) { toast((err as Error).message, 'error') }
  }
  const remove = async () => {
    if (!card || !confirm('Delete this flashcard?')) return
    try { await api.del(`/flashcards/${card.id}`); setData({ flashcards: cards.filter((c) => c.id !== card.id) }) } catch (e) { toast((e as Error).message, 'error') }
  }

  const addForm = adding && (
    <Modal title="Add flashcard" onClose={() => setAdding(false)}>
      <form onSubmit={add} className="space-y-4">
        <label className="field">Front (question)<textarea autoFocus required value={q} onChange={(e) => setQ(e.target.value)} className="input mt-2 min-h-20 py-3" /></label>
        <label className="field">Back (answer)<textarea required value={a} onChange={(e) => setA(e.target.value)} className="input mt-2 min-h-24 py-3" /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit">Add card</Button></div>
      </form>
    </Modal>
  )

  if (!cards.length) return <>{addForm}<Empty icon={<Layers3 size={22} />} title="No flashcards yet" text="Create cards for key terms and concepts, or generate them with AI from the subject page." action={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add flashcard</Button>} /></>

  return (
    <div className="mx-auto max-w-4xl">
      {addForm}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="eyebrow">FLASHCARD SET</p><h2 className="text-xl font-bold">{cards.length} cards · {known} known</h2></div>
        <div className="flex flex-wrap gap-2">
          <Button variant={reviewOnly ? 'primary' : 'secondary'} disabled={!marked && !reviewOnly} onClick={() => setReviewOnly(!reviewOnly)}>{reviewOnly ? 'Show all cards' : `Review marked (${marked})`}</Button>
          <Button variant="secondary" onClick={() => { setOrder(shuffle(pool.map((c) => c.id))); setIndex(0); setFlipped(false) }}><Shuffle size={15} /> Shuffle</Button>
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={15} /> Add</Button>
        </div>
      </div>
      <Progress value={order.length ? ((index + 1) / order.length) * 100 : 0} />
      {card ? <>
        <button onClick={() => setFlipped(!flipped)} className={`mt-6 flex min-h-[360px] w-full flex-col items-center justify-center rounded-3xl border p-8 text-center shadow-sm transition-all duration-300 ${flipped ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
          <div className={`mb-8 grid size-12 place-items-center rounded-2xl ${flipped ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600'}`}>{flipped ? <Sparkles size={21} /> : <Layers3 size={21} />}</div>
          <div className="mb-4 text-xs font-bold uppercase tracking-[.16em] text-slate-400">{flipped ? 'Answer' : 'Question'}</div>
          <p className="max-w-2xl whitespace-pre-line text-2xl font-extrabold leading-10 text-slate-800">{flipped ? card.answer : card.question}</p>
          <div className="mt-8 text-xs font-semibold text-slate-400">Click the card to {flipped ? 'see the question' : 'reveal the answer'}</div>
        </button>
        <div className="mt-5 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <button onClick={() => move(-1)} aria-label="Previous card" className="rounded-xl border border-slate-200 p-3"><ChevronLeft size={18} /></button>
          <div className="flex gap-3"><Button variant="danger" onClick={() => rate('review')}><RotateCcw size={16} /> Need to review</Button><Button onClick={() => rate('known')}><Check size={16} /> I know this</Button></div>
          <button onClick={() => move(1)} aria-label="Next card" className="rounded-xl border border-slate-200 p-3"><ChevronRight size={18} /></button>
        </div>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-400">Card {index + 1} of {order.length} · {marked} marked for review <button onClick={remove} className="flex items-center gap-1 text-slate-400 hover:text-red-500"><Trash2 size={12} /> Delete card</button></div>
      </> : <p className="py-16 text-center text-sm text-slate-400">No cards marked for review. Nice work!</p>}
    </div>
  )
}

// --------------------------------------------------------------------- quiz
function QuizMode({ moduleId }: { moduleId: number }) {
  const toast = useToast()
  const bank = useApi<{ questions: Question[] }>(`/modules/${moduleId}/questions?withAnswers`)
  const [settings, setSettings] = useState({ count: 10, difficulty: 'Any', timer: 0 })
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [attemptId, setAttemptId] = useState<number | null>(null)
  const [index, setIndex] = useState(0)
  const [choice, setChoice] = useState<number | null>(null)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [answers, setAnswers] = useState<{ q: Question; chosen: number | null; r: AnswerResult | null }[]>([])
  const [done, setDone] = useState<{ score: number; total: number; percent: number } | null>(null)
  const [deadline, setDeadline] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const [managing, setManaging] = useState(false)
  const [adding, setAdding] = useState(false)
  const finishing = useRef(false)

  const finish = async (id = attemptId) => {
    if (finishing.current || !id) return
    finishing.current = true
    try { setDone(await api.post(`/attempts/${id}/complete`)) } catch (e) { toast((e as Error).message, 'error') }
    setDeadline(null)
  }

  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() >= deadline) finish() }, 500)
    return () => clearInterval(t)
  }, [deadline]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setBusy(true)
    try {
      const { questions: qs } = await api.get<{ questions: Question[] }>(`/modules/${moduleId}/questions?difficulty=${settings.difficulty}&shuffle=1&limit=${settings.count}`)
      if (!qs.length) { toast('Add some questions first.', 'error'); return }
      const { attemptId: id } = await api.post<{ attemptId: number }>('/attempts', { moduleId, mode: 'quiz', difficulty: settings.difficulty === 'Any' ? 'Medium' : settings.difficulty })
      finishing.current = false
      setQuestions(qs); setAttemptId(id); setIndex(0); setChoice(null); setResult(null); setAnswers([]); setDone(null)
      setDeadline(settings.timer ? Date.now() + settings.timer * 60000 : null)
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const submit = async () => {
    if (!questions || choice === null || !attemptId) return
    setBusy(true)
    try {
      const r = await api.post<AnswerResult>(`/attempts/${attemptId}/answers`, { questionId: questions[index].id, chosenIndex: choice })
      setResult(r); setAnswers((a) => [...a, { q: questions[index], chosen: choice, r }])
    } catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const next = () => {
    if (!questions) return
    if (index + 1 >= questions.length) return finish()
    setIndex(index + 1); setChoice(null); setResult(null)
  }
  const removeQuestion = async (id: number) => {
    if (!confirm('Delete this question?')) return
    try { await api.del(`/questions/${id}`); bank.reload() } catch (e) { toast((e as Error).message, 'error') }
  }

  if (bank.error) return <ErrorBox message={bank.error} onRetry={bank.reload} />
  if (!bank.data) return <Loading />
  const total = bank.data.questions.length
  if (!total) return <NoQuestions moduleId={moduleId} onAdded={bank.reload} />

  if (done && questions) return (
    <div className="mx-auto max-w-3xl card p-6 sm:p-9">
      <div className="text-center">
        <div className={`mx-auto mb-4 grid size-16 place-items-center rounded-2xl text-xl font-extrabold ${done.percent >= 75 ? 'bg-green-50 text-green-700' : done.percent >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>{done.percent}%</div>
        <h2 className="text-2xl font-extrabold">Quiz complete</h2>
        <p className="mt-2 text-slate-500">You scored {done.score} out of {done.total}{done.total < questions.length ? ` (${questions.length - done.total} unanswered)` : ''}.</p>
      </div>
      <div className="mt-7 space-y-3">
        {answers.map(({ q, chosen, r }) => (
          <div key={q.id} className={`rounded-xl border p-4 text-sm ${r?.correct ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
            <div className="font-bold text-slate-800">{q.question}</div>
            <div className="mt-1 text-slate-600">Your answer: {chosen !== null ? q.choices[chosen] : '—'} {r?.correct ? '✓' : `· Correct: ${r?.correctAnswer}`}</div>
            {!r?.correct && r?.explanation && <div className="mt-1 text-xs text-slate-500">{r.explanation}</div>}
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-3"><Button variant="secondary" onClick={() => { setQuestions(null); setDone(null) }}>Back to builder</Button><Button onClick={start} loading={busy}><RotateCcw size={15} /> Retake</Button></div>
    </div>
  )

  if (!questions) return (
    <div className="mx-auto max-w-3xl card p-6 sm:p-9">
      <div className="mb-7 text-center"><div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-green-50 text-green-600"><ListChecks size={25} /></div><p className="eyebrow">QUIZ BUILDER</p><h2 className="mt-2 text-2xl font-extrabold text-slate-900">Create your practice quiz</h2><p className="mt-2 text-sm text-slate-500">Questions are drawn only from this module’s question bank ({total} available).</p></div>
      <div className="grid gap-5 sm:grid-cols-3">
        <label className="field">Number of questions<select value={settings.count} onChange={(e) => setSettings({ ...settings, count: Number(e.target.value) })} className="input mt-2">{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n} questions</option>)}</select></label>
        <label className="field">Difficulty<select value={settings.difficulty} onChange={(e) => setSettings({ ...settings, difficulty: e.target.value })} className="input mt-2"><option value="Any">Mixed</option><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        <label className="field">Timer<select value={settings.timer} onChange={(e) => setSettings({ ...settings, timer: Number(e.target.value) })} className="input mt-2"><option value={0}>No timer</option><option value={5}>5 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></label>
      </div>
      <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-500"><span className="font-bold text-slate-700">Coverage:</span> {[...new Set(bank.data.questions.map((q) => q.topic))].join(', ')}</div>
      <Button onClick={start} loading={busy} className="mt-6 h-12 w-full"><Zap size={17} /> Start quiz</Button>
      <div className="mt-4 flex justify-center gap-4 text-sm"><button onClick={() => setAdding(true)} className="font-bold text-green-600">+ Add question</button><button onClick={() => setManaging(!managing)} className="font-bold text-slate-500">{managing ? 'Hide' : 'Manage'} question bank</button></div>
      {managing && <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{bank.data.questions.map((q) => (
        <div key={q.id} className="flex items-start gap-3 p-3 text-sm"><div className="flex-1"><div className="font-semibold text-slate-700">{q.question}</div><div className="mt-0.5 text-xs text-slate-400">{q.topic} · {q.difficulty} · Answer: {q.choices[q.correctIndex ?? 0]}</div></div><button onClick={() => removeQuestion(q.id)} aria-label="Delete question" className="rounded p-1 text-slate-400 hover:text-red-500"><Trash2 size={14} /></button></div>
      ))}</div>}
      {adding && <QuestionForm moduleId={moduleId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); bank.reload(); toast('Question added') }} />}
    </div>
  )

  const q = questions[index]
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null
  return (
    <div className="mx-auto max-w-4xl card p-6 sm:p-8">
      <div className="mb-5 flex items-center justify-between"><div><p className="eyebrow">QUESTION {index + 1} OF {questions.length}</p><h2 className="font-bold">Practice Quiz · {q.topic}</h2></div>
        {remaining !== null && <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold ${remaining < 60 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'}`}><Clock3 size={16} /> {String(Math.floor(remaining / 60)).padStart(2, '0')}:{String(remaining % 60).padStart(2, '0')}</div>}
      </div>
      <Progress value={((index + (result ? 1 : 0)) / questions.length) * 100} className="mb-8" />
      <p className="mb-6 text-lg font-bold leading-8 text-slate-800">{q.question}</p>
      <div className="space-y-3">
        {q.choices.map((option, i) => {
          const isCorrect = result && i === result.correctIndex
          const isWrong = result && i === choice && !result.correct
          return (
            <button key={i} onClick={() => !result && setChoice(i)} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm font-semibold transition ${isCorrect ? 'border-green-500 bg-green-50 text-green-800' : isWrong ? 'border-red-400 bg-red-50 text-red-700' : choice === i ? 'border-green-500 bg-green-50 text-green-800' : 'border-slate-200 hover:border-green-200'}`}>
              <span className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs ${choice === i || isCorrect ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500'} ${isWrong ? '!bg-red-500' : ''}`}>{String.fromCharCode(65 + i)}</span>{option}
            </button>
          )
        })}
      </div>
      {result && <div className={`mt-5 rounded-xl border p-4 text-sm text-slate-600 ${result.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}><b className={result.correct ? 'text-green-700' : 'text-red-700'}>{result.correct ? 'Correct!' : `Correct answer: ${result.correctAnswer}.`}</b> {result.explanation}</div>}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => finish()}>End quiz</Button>
        {result ? <Button onClick={next}>{index + 1 >= questions.length ? 'See results' : 'Next question'} <ArrowRight size={15} /></Button>
          : <Button disabled={choice === null} loading={busy} onClick={submit}>Submit answer <ArrowRight size={15} /></Button>}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- reviewer
function ReviewerMode({ module, onSaved }: { module: Module; onSaved: (m: Module) => void }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(module.reviewer)
  const [busy, setBusy] = useState(false)
  const toc = useMemo(() => headings(module.reviewer), [module.reviewer])

  const save = async () => {
    setBusy(true)
    try { const { module: m } = await api.put<{ module: Module }>(`/modules/${module.id}`, { reviewer: draft }); onSaved(m); setEditing(false); toast('Reviewer saved') }
    catch (e) { toast((e as Error).message, 'error') } finally { setBusy(false) }
  }
  const exportMd = () => downloadMarkdown(`${module.title}_reviewer`, `# ${module.title}\n\n${module.reviewer}`)

  if (editing) return (
    <div className="card p-6 sm:p-9">
      <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">EDIT REVIEWER</p><h2 className="text-2xl font-extrabold text-slate-900">{module.title}</h2></div></div>
      <p className="mb-3 text-xs text-slate-400">Use <code>## Heading</code>, <code>- bullet</code>, <code>1. step</code>, <code>**bold**</code>, and <code>&gt; callout</code>. Leave a blank line between sections.</p>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="input min-h-[420px] py-3 font-mono text-[13px] leading-6" />
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => { setDraft(module.reviewer); setEditing(false) }}>Cancel</Button><Button onClick={save} loading={busy}>Save reviewer</Button></div>
    </div>
  )

  if (!module.reviewer) return <Empty icon={<FileText size={22} />} title="No reviewer for this module yet" text="Write your own structured study notes, or use “Generate with AI” on the subject page." action={<Button onClick={() => setEditing(true)}><Pencil size={16} /> Write reviewer</Button>} />

  return (
    <div className="grid gap-6 xl:grid-cols-[250px_1fr]">
      <aside className="card h-fit p-4 xl:sticky xl:top-24">
        <div className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-400">In this reviewer</div>
        {toc.map((h) => <a key={h.id} href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-500 hover:bg-slate-50 hover:text-green-700">{h.label}</a>)}
      </aside>
      <article className="card p-6 sm:p-9">
        <div className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="eyebrow">STUDY REVIEWER</p><h2 className="text-2xl font-extrabold text-slate-900">{module.title}</h2></div><div className="flex gap-2"><Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} /> Edit</Button><Button variant="secondary" onClick={exportMd}><Download size={15} /> Export</Button></div></div>
        <div className="relative mb-7"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="input h-10 pl-10" placeholder="Search this reviewer..." /></div>
        <Markdown text={module.reviewer} highlight={query} />
        <div className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-400">Notes for “{module.title}” · {module.fileName}</div>
      </article>
    </div>
  )
}

// --------------------------------------------------------------- study page
function ModulePicker() {
  const { subjects, navigate } = useApp()
  const withModules = (subjects ?? []).filter((s) => s.modules > 0)
  return (
    <div className="page-wrap">
      <div className="page-heading"><div><p className="eyebrow">STUDY TOOLS</p><h1>What do you want to study?</h1><p>Pick a subject to open its Q&A, flashcards, quizzes and reviewer.</p></div></div>
      {withModules.length === 0
        ? <Empty icon={<Upload size={22} />} title="Upload a module first" text="Study tools work from the modules you upload to a subject." action={<Button onClick={() => navigate('subjects')}><BookOpen size={16} /> Go to My Subjects</Button>} />
        : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{withModules.map((s) => (
          <button key={s.id} onClick={() => navigate({ page: 'study', subjectId: s.id })} className="card flex items-center gap-4 p-5 text-left hover:border-green-200">
            <div className="grid size-12 shrink-0 place-items-center rounded-2xl text-xs font-extrabold" style={{ background: s.color }}>{s.icon}</div>
            <div className="min-w-0 flex-1"><div className="text-xs font-bold text-green-600">{s.code}</div><div className="truncate font-bold">{s.name}</div><div className="text-xs text-slate-400">{s.modules} modules · {s.progress}% progress</div></div>
            <ArrowRight size={16} className="text-green-600" />
          </button>
        ))}</div>}
    </div>
  )
}

export default function StudyPage({ subjectId, moduleId }: { subjectId?: number; moduleId?: number }) {
  const { subjects, navigate, reloadSubjects } = useApp()
  const [tab, setTab] = useState<Tab>('flashcards')
  const subject = subjects?.find((s) => s.id === subjectId)
  const mods = useApi<{ modules: Module[] }>(subject ? `/subjects/${subject.id}/modules` : null)
  const modules = mods.data?.modules ?? []
  const [module, setModule] = useState<Module | null>(null)

  // Default to the first module once the list loads.
  useEffect(() => {
    if (!mods.data) return
    const m = modules.find((x) => x.id === moduleId) ?? modules.find((x) => x.status === 'Ready to Study') ?? modules[0]
    setModule(m ?? null)
    if (m && m.id !== moduleId) navigate({ page: 'study', subjectId, moduleId: m.id })
  }, [mods.data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track time spent: one study session per module visit.
  useEffect(() => {
    if (!module) return
    let sessionId: number | null = null
    let closed = false
    const end = () => {
      if (closed) return
      closed = true
      if (sessionId) api.beacon(`/sessions/${sessionId}/end`)
    }
    api.post<{ sessionId: number }>('/sessions', { moduleId: module.id })
      .then((r) => { sessionId = r.sessionId; if (closed) api.beacon(`/sessions/${r.sessionId}/end`) })
      .catch(() => {})
    window.addEventListener('pagehide', end)
    return () => { window.removeEventListener('pagehide', end); end(); setTimeout(reloadSubjects, 300) }
  }, [module?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!subjectId) return <ModulePicker />
  if (!subject) return <div className="page-wrap"><ErrorBox message="Subject not found." /></div>
  if (mods.error) return <div className="page-wrap"><ErrorBox message={mods.error} onRetry={mods.reload} /></div>
  if (!mods.data) return <Loading className="min-h-[60vh]" />
  if (!modules.length) return <div className="page-wrap"><Empty icon={<Upload size={22} />} title={`No modules in ${subject.name} yet`} text="Upload a module to start studying." action={<Button onClick={() => navigate({ page: 'course', subjectId: subject.id })}>Open subject</Button>} /></div>
  if (!module) return <Loading className="min-h-[60vh]" />

  const tabs = [
    { id: 'qa' as const, label: 'AI Q&A', icon: MessageCircle },
    { id: 'flashcards' as const, label: 'Flashcards', icon: Layers3 },
    { id: 'quiz' as const, label: 'Practice Quiz', icon: ListChecks },
    { id: 'reviewer' as const, label: 'Reviewer', icon: FileText },
  ]
  return (
    <div className="min-h-full bg-[#F7F8F9]">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><button onClick={() => navigate({ page: 'course', subjectId: subject.id })} aria-label="Back to subject" className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500"><ArrowLeft size={17} /></button><div className="min-w-0"><div className="text-xs font-bold uppercase text-green-600">{subject.name}</div><h1 className="truncate font-bold text-slate-900">{module.title}</h1></div></div>
          <div className="flex items-center gap-3">
            <select value={module.id} onChange={(e) => navigate({ page: 'study', subjectId: subject.id, moduleId: Number(e.target.value) })} className="input h-10 max-w-[240px] text-xs" aria-label="Module">
              {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
            <div className="hidden min-w-32 sm:block"><div className="mb-1 flex justify-between text-[10px] font-bold text-slate-500"><span>COURSE PROGRESS</span><span>{subject.progress}%</span></div><Progress value={subject.progress} /></div>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-7">
        <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 md:grid-cols-4">
          {tabs.map((item) => {
            const Icon = item.icon
            return <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${tab === item.id ? 'bg-green-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={17} /> {item.label}</button>
          })}
        </div>
        {tab === 'qa' && <QAMode key={module.id} moduleId={module.id} />}
        {tab === 'flashcards' && <FlashcardMode key={module.id} moduleId={module.id} />}
        {tab === 'quiz' && <QuizMode key={module.id} moduleId={module.id} />}
        {tab === 'reviewer' && <ReviewerMode key={module.id} module={module} onSaved={(m) => { setModule(m); mods.reload() }} />}
      </div>
    </div>
  )
}
