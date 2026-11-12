import React, { createContext, useCallback, useContext, useState } from 'react'
import { AlertCircle, CheckCircle2, GraduationCap, Lightbulb, Loader2, X } from 'lucide-react'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-green-600 text-white shadow-sm shadow-green-200">
        <GraduationCap size={22} strokeWidth={2.2} />
      </div>
      {!compact && (
        <div>
          <div className="text-[18px] font-extrabold tracking-tight text-slate-900">EduMate <span className="text-green-600">AI</span></div>
          <div className="text-[10px] font-medium tracking-wide text-slate-400">YOUR AI LEARNING COMPANION</div>
        </div>
      )}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  loading = false,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  const styles = {
    primary: 'bg-green-600 text-white hover:bg-green-700 shadow-sm shadow-green-200',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'border border-red-100 bg-red-50 text-red-600 hover:bg-red-100',
  }
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  )
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className="h-full rounded-full bg-green-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
      {action}
    </div>
  )
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Loading({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return <div className={`flex items-center justify-center gap-2 py-12 text-sm text-slate-400 ${className}`}><Loader2 size={18} className="animate-spin" /> {label}</div>
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
      <span className="flex items-center gap-2"><AlertCircle size={17} /> {message}</span>
      {onRetry && <button onClick={onRetry} className="font-bold underline">Retry</button>}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 px-6 py-12 text-center">
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-green-50 text-green-600">{icon}</div>
      <h3 className="font-bold text-slate-800">{title}</h3>
      {text && <p className="mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ------------------------------------------------------------------ toasts
type Toast = { id: number; text: string; kind: 'success' | 'error' }
const ToastContext = createContext<(text: string, kind?: Toast['kind']) => void>(() => {})
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[200] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold shadow-lg ${t.kind === 'error' ? 'border-red-200 bg-white text-red-700' : 'border-green-200 bg-white text-green-800'}`}>
            {t.kind === 'error' ? <AlertCircle size={17} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ---------------------------------------------------------------- markdown
/** Tiny, safe markdown renderer for reviewer notes (headings, lists, quotes, bold, code). */
export function Markdown({ text, highlight = '' }: { text: string; highlight?: string }) {
  const inline = (s: string, key: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    return (
      <React.Fragment key={key}>
        {parts.map((p, i) => {
          if (p.startsWith('**') && p.endsWith('**')) return <b key={i}>{mark(p.slice(2, -2))}</b>
          if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="rounded bg-slate-100 px-1 py-0.5 text-[13px] text-slate-800">{p.slice(1, -1)}</code>
          return <React.Fragment key={i}>{mark(p)}</React.Fragment>
        })}
      </React.Fragment>
    )
  }
  const mark = (s: string) => {
    if (!highlight.trim()) return s
    const q = highlight.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return s.split(new RegExp(`(${q})`, 'gi')).map((p, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-amber-100 text-inherit">{p}</mark> : p))
  }

  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  return (
    <div className="reviewer">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean)
        if (!lines.length) return null
        if (/^#{1,3}\s/.test(lines[0]) && lines.length === 1) return <h3 key={i} id={slug(lines[0])}>{inline(lines[0].replace(/^#+\s*/, ''), 0)}</h3>
        if (/^#{1,3}\s/.test(lines[0])) {
          return <React.Fragment key={i}><h3 id={slug(lines[0])}>{inline(lines[0].replace(/^#+\s*/, ''), 0)}</h3><Markdown text={lines.slice(1).join('\n')} highlight={highlight} /></React.Fragment>
        }
        if (lines[0].startsWith('>')) return <div key={i} className="callout"><Lightbulb size={20} /><div><p>{inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), 0)}</p></div></div>
        if (lines.every((l) => /^[-*]\s/.test(l))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s/, ''), j)}</li>)}</ul>
        if (lines.every((l) => /^\d+[.)]\s/.test(l))) return <ol key={i} className="list-decimal space-y-2 pl-5">{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+[.)]\s/, ''), j)}</li>)}</ol>
        return <p key={i}>{inline(lines.join(' '), 0)}</p>
      })}
    </div>
  )
}

export const slug = (h: string) => h.replace(/^#+\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
export const headings = (text: string) => text.split('\n').filter((l) => /^#{1,3}\s/.test(l)).map((l) => ({ id: slug(l), label: l.replace(/^#+\s*/, '') }))
