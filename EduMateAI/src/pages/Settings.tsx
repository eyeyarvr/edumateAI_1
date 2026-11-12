import { FormEvent, useState } from 'react'
import { api, initials, parseDate, User } from '../api'
import { useApp } from '../app-context'
import { Button, useToast } from '../ui'

type Tab = 'profile' | 'security' | 'notifications' | 'account'

function Profile() {
  const { user, setUser } = useApp()
  const toast = useToast()
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, university: user.university, program: user.program })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { const r = await api.put<{ user: User }>('/me', { ...form, settings: user.settings }); setUser(r.user); toast('Profile saved') }
    catch (err) { toast((err as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit}>
      <h2 className="text-lg font-bold">Student profile</h2><p className="mt-1 text-sm text-slate-500">Update your personal and academic information.</p>
      <div className="my-6 flex items-center gap-4"><div className="grid size-16 place-items-center rounded-2xl bg-green-100 text-lg font-bold text-green-700">{initials(form)}</div><div className="text-xs text-slate-400">Member since {parseDate(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="field">First name<input required maxLength={60} className="input mt-2" value={form.firstName} onChange={set('firstName')} /></label>
        <label className="field">Last name<input maxLength={60} className="input mt-2" value={form.lastName} onChange={set('lastName')} /></label>
        <label className="field sm:col-span-2">University email<input className="input mt-2 bg-slate-50" disabled value={user.email} /></label>
        <label className="field">University<input maxLength={120} className="input mt-2" value={form.university} onChange={set('university')} placeholder="e.g. Benguet State University" /></label>
        <label className="field">Program<input maxLength={120} className="input mt-2" value={form.program} onChange={set('program')} placeholder="e.g. BS Information Technology" /></label>
      </div>
      <div className="mt-7 flex justify-end"><Button type="submit" loading={busy}>Save changes</Button></div>
    </form>
  )
}

function Security() {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return setError('New password must be at least 8 characters.')
    if (next !== confirmPw) return setError('New passwords do not match.')
    setBusy(true); setError('')
    try { await api.put('/me/password', { currentPassword: current, newPassword: next }); toast('Password changed'); setCurrent(''); setNext(''); setConfirmPw('') }
    catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div><h2 className="text-lg font-bold">Security</h2><p className="mt-1 text-sm text-slate-500">Change the password you use to sign in.</p></div>
      <label className="field">Current password<input required type="password" autoComplete="current-password" className="input mt-2" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
      <label className="field">New password<input required minLength={8} type="password" autoComplete="new-password" className="input mt-2" value={next} onChange={(e) => setNext(e.target.value)} /></label>
      <label className="field">Confirm new password<input required type="password" autoComplete="new-password" className="input mt-2" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} /></label>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}>Update password</Button></div>
    </form>
  )
}

function Notifications() {
  const { user, setUser } = useApp()
  const toast = useToast()
  const items: [keyof User['settings'], string, string][] = [
    ['studyReminders', 'Study reminders', 'Nudges before scheduled study sessions'],
    ['upcomingDeadlines', 'Upcoming deadlines', 'Highlights exams and assignments due this week'],
    ['weeklySummary', 'Weekly progress summary', 'A recap of your quizzes and study time'],
  ]
  const toggle = async (k: keyof User['settings']) => {
    const settings = { ...user.settings, [k]: !user.settings[k] }
    setUser({ ...user, settings })
    try { const r = await api.put<{ user: User }>('/me', { firstName: user.firstName, lastName: user.lastName, university: user.university, program: user.program, settings }); setUser(r.user) }
    catch (e) { toast((e as Error).message, 'error'); setUser(user) }
  }
  return (
    <div>
      <h2 className="text-lg font-bold">Notification preferences</h2><p className="mt-1 text-sm text-slate-500">Changes are saved automatically.</p>
      <div className="mt-4 divide-y divide-slate-100">{items.map(([k, label, hint]) => (
        <label key={k} className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm text-slate-600">
          <span><span className="block font-semibold text-slate-700">{label}</span><span className="text-xs text-slate-400">{hint}</span></span>
          <input type="checkbox" checked={user.settings[k]} onChange={() => toggle(k)} className="size-4 accent-green-600" />
        </label>
      ))}</div>
    </div>
  )
}

function Account({ logout }: { logout: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const remove = async (e: FormEvent) => {
    e.preventDefault()
    if (!confirm('This permanently deletes your account, subjects, uploaded files and history. Continue?')) return
    setBusy(true)
    try { await api.del('/me', { password }); logout() } catch (err) { toast((err as Error).message, 'error') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-8">
      <div><h2 className="text-lg font-bold">Account</h2><p className="mt-1 text-sm text-slate-500">Sign out of this device or remove your account.</p><Button variant="secondary" className="mt-4" onClick={logout}>Sign out</Button></div>
      <form onSubmit={remove} className="max-w-md rounded-2xl border border-red-100 bg-red-50/50 p-5">
        <h3 className="font-bold text-red-700">Delete account</h3>
        <p className="mt-1 text-sm text-slate-500">Deletes everything permanently. Enter your password to confirm.</p>
        <input required type="password" autoComplete="current-password" className="input mt-4" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="danger" loading={busy} className="mt-3">Delete my account</Button>
      </form>
    </div>
  )
}

export default function SettingsPage({ logout }: { logout: () => void }) {
  const [tab, setTab] = useState<Tab>('profile')
  const tabs: [Tab, string][] = [['profile', 'Student Profile'], ['security', 'Security'], ['notifications', 'Notifications'], ['account', 'Account']]
  return (
    <div className="page-wrap max-w-5xl">
      <div className="page-heading"><div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p>Manage your account, profile, and learning preferences.</p></div></div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <aside className="card h-fit p-2">{tabs.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ${tab === id ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>)}</aside>
        <section className="card p-5 sm:p-7">
          {tab === 'profile' && <Profile />}
          {tab === 'security' && <Security />}
          {tab === 'notifications' && <Notifications />}
          {tab === 'account' && <Account logout={logout} />}
        </section>
      </div>
    </div>
  )
}
