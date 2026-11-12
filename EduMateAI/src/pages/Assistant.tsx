import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Trash2 } from 'lucide-react'
import { api, ChatMessage, useApi } from '../api'
import { useApp } from '../app-context'
import { Button, ErrorBox, Loading, Markdown, useToast } from '../ui'

export default function AssistantPage() {
  const { user, subjects } = useApp()
  const toast = useToast()
  const { data, setData, error, reload } = useApi<{ messages: ChatMessage[]; aiEnabled: boolean }>('/chat')
  const [input, setInput] = useState('')
  const [subjectId, setSubjectId] = useState<number | ''>('')
  const [sending, setSending] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const messages = data?.messages ?? []
  const subject = subjects?.find((s) => s.id === subjectId)

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, sending])

  const send = async (text = input) => {
    if (!text.trim() || sending || !data) return
    setInput('')
    const temp: ChatMessage = { id: -Date.now(), role: 'user', content: text, createdAt: '' }
    setData({ ...data, messages: [...messages, temp] })
    setSending(true)
    try {
      const r = await api.post<{ messages: ChatMessage[] }>('/chat', { content: text, subjectId: subjectId || null })
      setData((d) => d && { ...d, messages: [...d.messages.filter((m) => m.id !== temp.id), ...r.messages] })
    } catch (e) {
      toast((e as Error).message, 'error')
      setData((d) => d && { ...d, messages: d.messages.filter((m) => m.id !== temp.id) })
      setInput(text)
    } finally { setSending(false) }
  }
  const clear = async () => {
    if (!messages.length || !confirm('Clear the whole conversation?')) return
    try { await api.del('/chat'); setData(data && { ...data, messages: [] }) } catch (e) { toast((e as Error).message, 'error') }
  }

  const suggestions = subject ? [`Summarize ${subject.name}`, 'Quiz me with one question', 'Explain the hardest topic simply'] : ['What should I study today?', 'Explain event bubbling', 'Give me a practice question']

  return (
    <div className="page-wrap flex min-h-[calc(100vh-72px)] flex-col">
      <div className="mb-5 flex items-center justify-between gap-3"><div><p className="eyebrow">SUPPORTING STUDY TOOL</p><h1 className="text-2xl font-extrabold">AI Assistant</h1><p className="mt-1 text-sm text-slate-500">Ask questions and clarify concepts from your modules.</p></div><Button variant="secondary" onClick={clear}><Trash2 size={15} /> <span className="hidden sm:inline">Clear conversation</span></Button></div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <div className="card flex min-h-[560px] flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-green-600 text-white"><Bot size={20} /></div><div><div className="text-sm font-bold">EduMate Assistant</div><div className="flex items-center gap-1 text-[11px] text-green-600"><span className="size-1.5 rounded-full bg-green-500" /> {data?.aiEnabled ? 'AI connected' : 'Offline mode · answers from your notes'}{subject ? ` · ${subject.name}` : ''}</div></div></div>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value ? Number(e.target.value) : '')} className="input h-9 w-48 text-xs" aria-label="Subject context"><option value="">All subjects</option>{subjects?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
          {!data && !error && <Loading />}
          {data && messages.length === 0 && (
            <div className="flex justify-start"><div className="max-w-2xl rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">Hi {user.firstName}! I can help explain concepts or answer questions using your uploaded modules. What are you studying today?</div></div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'whitespace-pre-wrap rounded-br-md bg-green-600 text-white' : 'rounded-bl-md bg-slate-100 text-slate-700 [&_.reviewer_li]:text-slate-700 [&_.reviewer_p]:text-slate-700'}`}>
                {m.role === 'ai' ? <Markdown text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Thinking…</div></div>}
          <div ref={bottom} />
        </div>
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 flex gap-2 overflow-x-auto">{suggestions.map((x) => <button onClick={() => send(x)} key={x} disabled={sending} className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:border-green-300 hover:text-green-700">{x}</button>)}</div>
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-green-400">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} className="max-h-28 min-h-10 flex-1 resize-none px-2 py-2 text-sm outline-none" placeholder="Ask about your modules..." maxLength={4000} />
            <button onClick={() => send()} disabled={!input.trim() || sending} aria-label="Send" className="grid size-10 place-items-center rounded-xl bg-green-600 text-white disabled:opacity-50"><Send size={17} /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
