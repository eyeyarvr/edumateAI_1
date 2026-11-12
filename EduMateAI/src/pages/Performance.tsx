import { useState } from 'react'
import { BarChart3, Clock3, Layers3, ListChecks, MessageCircle, Target } from 'lucide-react'
import { parseDate, Performance, TopicStat, useApi } from '../api'
import { useApp } from '../app-context'
import { Empty, ErrorBox, Loading, Progress, SectionTitle } from '../ui'
import { RecommendationBanner } from './Dashboard'

function ScoreChart({ points }: { points: { date: string; score: number }[] }) {
  if (points.length === 0) return <div className="grid h-64 place-items-center text-sm text-slate-400">Complete a quiz to start your score history.</div>
  const W = 600, H = 220
  const xs = points.map((_, i) => (points.length === 1 ? W / 2 : 10 + (i * (W - 20)) / (points.length - 1)))
  const ys = points.map((p) => H - (p.score / 100) * H)
  const line = xs.map((x, i) => `${i ? 'L' : 'M'}${x} ${ys[i]}`).join(' ')
  return (
    <>
      <div className="relative ml-8 h-64 border-b border-l border-slate-200">
        {[25, 50, 75, 100].map((v) => <div key={v} className="absolute left-0 w-full border-t border-dashed border-slate-100" style={{ bottom: `${v}%` }}><span className="absolute -left-8 -top-2 text-[10px] text-slate-400">{v}</span></div>)}
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" preserveAspectRatio="none">
          <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#16A34A" stopOpacity=".2" /><stop offset="100%" stopColor="#16A34A" stopOpacity="0" /></linearGradient></defs>
          {points.length > 1 && <path d={`${line} L${xs.at(-1)} ${H} L${xs[0]} ${H} Z`} fill="url(#area)" />}
          <path d={line} fill="none" stroke="#16A34A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <div key={i} title={`${p.score}% · ${parseDate(p.date).toLocaleDateString()}`} className="absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-green-600 bg-white" style={{ left: `${(xs[i] / W) * 100}%`, bottom: `${p.score}%` }} />
        ))}
      </div>
      <div className="ml-8 mt-3 flex justify-between text-[10px] text-slate-400">{points.map((p, i) => <span key={i}>{parseDate(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>)}</div>
    </>
  )
}

/** Ranked topics in green (strong) or amber (needs work). */
function TopicList({ title, topics, empty, strong = false }: { title: string; topics: TopicStat[]; empty: string; strong?: boolean }) {
  return (
    <section className="card p-5"><SectionTitle title={title} />
      {topics.length === 0 && <p className="text-sm text-slate-400">{empty}</p>}
      <div className="space-y-3">{topics.map((t, i) => (
        <div key={`${t.topic}-${t.subjectId}`} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          {strong
            ? <div className="grid size-8 place-items-center rounded-lg bg-green-100 font-bold text-green-700">{i + 1}</div>
            : <div className="grid size-8 place-items-center rounded-lg bg-amber-100 text-amber-700"><Target size={15} /></div>}
          <div className="flex-1"><div className="text-sm font-semibold">{t.topic}</div><div className="text-[11px] text-slate-400">{t.subjectName} · {t.answered} answers</div></div>
          <b className={`text-sm ${strong ? 'text-green-600' : 'text-amber-600'}`}>{t.accuracy}%</b>
        </div>
      ))}</div>
    </section>
  )
}

export default function PerformancePage() {
  const { subjects, navigate } = useApp()
  const [days, setDays] = useState(30)
  const { data, error, reload } = useApi<Performance>(`/performance?days=${days}`)

  const heading = (
    <div className="page-heading"><div><p className="eyebrow">LEARNING ANALYTICS</p><h1>My Performance</h1><p>Understand your progress and discover where to focus next.</p></div>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input h-10 w-44"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={180}>This semester</option><option value={3650}>All time</option></select>
    </div>
  )
  if (error) return <div className="page-wrap">{heading}<ErrorBox message={error} onRetry={reload} /></div>
  if (!data) return <div className="page-wrap">{heading}<Loading /></div>
  if (!subjects?.length) return <div className="page-wrap">{heading}<Empty icon={<BarChart3 size={22} />} title="No data yet" text="Add a subject and start studying — your analytics will appear here." /></div>

  const s = data.stats
  const stats: [typeof Target, string, string, string][] = [
    [Target, 'Overall progress', `${s.overallProgress}%`, `${subjects.length} subjects`],
    [BarChart3, 'Average quiz score', `${s.averageQuizScore}%`, s.quizScoreChange == null ? 'No earlier data' : `${s.quizScoreChange >= 0 ? '+' : ''}${s.quizScoreChange}% vs. before last week`],
    [ListChecks, 'Quizzes completed', String(s.quizzesCompleted), 'in this period'],
    [MessageCircle, 'Q&A answered', String(s.qaAnswered), `${s.qaAccuracy}% correct`],
    [Layers3, 'Cards reviewed', String(s.cardsReviewed), `${s.cardsMastered} mastered`],
    [Clock3, 'Study sessions', String(s.studySessions), `${s.studyHours} hours total`],
  ]
  const avg = data.history.length ? Math.round(data.history.reduce((n, p) => n + p.score, 0) / data.history.length) : null

  return (
    <div className="page-wrap">
      {heading}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([I, label, value, meta]) => (
          <div key={label} className="card flex items-center gap-4 p-5"><div className="grid size-11 place-items-center rounded-xl bg-green-50 text-green-600"><I size={20} /></div><div><div className="text-xs font-semibold text-slate-400">{label}</div><div className="text-2xl font-extrabold text-slate-900">{value}</div><div className="text-[11px] text-green-600">{meta}</div></div></div>
        ))}
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <section className="card p-5 sm:p-6">
          <SectionTitle title="Quiz score history" action={avg != null && <span className="text-xs text-slate-400">Average {avg}%</span>} />
          <ScoreChart points={data.history} />
        </section>
        <section className="card p-5 sm:p-6">
          <SectionTitle title="Subject progress" />
          <div className="space-y-6">
            {data.subjects.map((x) => <button key={x.id} onClick={() => navigate({ page: 'course', subjectId: x.id })} className="block w-full text-left"><div className="mb-2 flex justify-between text-sm"><span className="font-semibold text-slate-700 hover:text-green-700">{x.name}</span><b>{x.progress}%</b></div><Progress value={x.progress} /></button>)}
          </div>
        </section>
      </div>
      <RecommendationBanner rec={data.recommendation} tone="amber" />
      <div className="grid gap-6 md:grid-cols-2">
        <TopicList title="Strongest topics" topics={data.strongest} empty="Answer a few more questions to see your strengths." strong />
        <TopicList title="Needs improvement" topics={data.weakest} empty="Nothing below 80% — great job!" />
      </div>
    </div>
  )
}
