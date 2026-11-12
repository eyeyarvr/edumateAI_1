import { useState } from 'react'
import { BarChart3, ChevronDown, HelpCircle, MessageCircle, Search, Sparkles, Upload } from 'lucide-react'
import { useApp } from '../app-context'
import { SectionTitle } from '../ui'

const FAQS: [string, string][] = [
  ['How do I upload academic modules?', 'Open a subject from My Subjects, choose “Upload module”, and select a PDF, DOCX, PPTX or TXT file (up to 50 MB). Files are stored privately on the server and only you can open them.'],
  ['How are study materials generated?', 'On a module’s “⋯” menu choose “Generate with AI”. EduMate reads the module (PDFs and text files are sent to the AI) and creates a reviewer, flashcards and a quiz question bank. You can also add or edit flashcards, questions and reviewer notes yourself.'],
  ['How does Q&A score my answers?', 'Your typed answer is compared with the correct answer’s key words. You see immediately whether you got it, the correct answer, and an explanation.'],
  ['How is my performance tracked?', 'Every quiz answer, Q&A response, flashcard rating and study session is saved to your account. Progress is the share of modules you have practised; topic strengths come from your answer accuracy per topic.'],
  ['Is my data private?', 'Yes. Every request is checked against your signed-in account, so other students can never see your subjects, files or results. Passwords are stored as secure bcrypt hashes.'],
  ['How do I delete my data?', 'Go to Settings → Account → Delete account. This permanently removes your profile, subjects, uploaded files and history.'],
]

export default function HelpPage() {
  const { navigate } = useApp()
  const [open, setOpen] = useState(0)
  const [query, setQuery] = useState('')
  const faqs = FAQS.filter(([q, a]) => (q + a).toLowerCase().includes(query.toLowerCase()))
  const guides: [typeof Upload, string, () => void][] = [
    [Upload, 'Upload Modules', () => navigate('subjects')],
    [Sparkles, 'Generate Materials', () => setQuery('generate')],
    [MessageCircle, 'Use AI Q&A', () => navigate('study')],
    [BarChart3, 'Track Performance', () => navigate('performance')],
  ]
  return (
    <div className="page-wrap max-w-5xl">
      <section className="mb-7 rounded-3xl bg-[#173F2A] p-7 text-center text-white sm:p-10"><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white/10"><HelpCircle size={23} /></div><h1 className="text-3xl font-extrabold">How can we help?</h1><p className="mt-2 text-sm text-green-50/70">Find answers and learn how to get the most from EduMate AI.</p><div className="relative mx-auto mt-6 max-w-xl"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => { setQuery(e.target.value); setOpen(0) }} className="h-12 w-full rounded-xl bg-white pl-12 pr-4 text-sm text-slate-800 outline-none" placeholder="Search help articles..." /></div></section>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{guides.map(([I, label, go]) => <button key={label} onClick={go} className="card p-5 text-left hover:border-green-200"><I className="mb-6 text-green-600" size={22} /><div className="text-sm font-bold">{label}</div><div className="mt-1 text-xs text-slate-400">Open →</div></button>)}</div>
      <section className="card p-5 sm:p-7"><SectionTitle title="Frequently asked questions" />
        {faqs.length === 0 && <p className="py-4 text-sm text-slate-400">No articles match “{query}”.</p>}
        <div className="divide-y divide-slate-100">{faqs.map(([q, a], i) => <button key={q} onClick={() => setOpen(i === open ? -1 : i)} className="w-full py-4 text-left"><div className="flex items-center justify-between gap-4 text-sm font-bold text-slate-800">{q}<ChevronDown size={17} className={`shrink-0 text-slate-400 transition ${open === i ? 'rotate-180' : ''}`} /></div>{open === i && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">{a}</p>}</button>)}</div>
      </section>
      <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-green-200 bg-green-50 p-6 sm:flex-row sm:items-center"><div><h3 className="font-bold">Still need help?</h3><p className="mt-1 text-sm text-slate-500">Our student support team is happy to assist you.</p></div><a href="mailto:support@edumate.ai?subject=EduMate%20AI%20support" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm shadow-green-200 hover:bg-green-700"><MessageCircle size={16} /> Contact support</a></section>
    </div>
  )
}
