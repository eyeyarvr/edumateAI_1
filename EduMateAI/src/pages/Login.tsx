import React, { FormEvent, useState } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, GraduationCap, LockKeyhole, ShieldCheck, User as UserIcon } from 'lucide-react'
import { api, User } from '../api'
import { Button, Logo } from '../ui'

type Screen = 'welcome' | 'signin' | 'signup'

/** Labelled text input with a leading icon and an optional trailing control. */
function IconField({ label, icon: Icon, onValue, after, ...input }: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string; icon: typeof LockKeyhole; onValue: (v: string) => void; after?: React.ReactNode
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 px-4 focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100">
        <Icon size={18} className="text-slate-400" />
        <input required {...input} onChange={(e) => onValue(e.target.value)} className="h-12 w-full outline-none" />
        {after}
      </div>
    </label>
  )
}

function PasswordField({ show, toggle, autoComplete, ...props }: {
  label: string; value: string; onValue: (v: string) => void; show: boolean; toggle: () => void; autoComplete: string; placeholder: string
}) {
  return (
    <IconField {...props} icon={LockKeyhole} type={show ? 'text' : 'password'} autoComplete={autoComplete}
      minLength={autoComplete === 'new-password' ? 8 : undefined}
      after={
        <button type="button" onClick={toggle} aria-label={show ? 'Hide password' : 'Show password'} className="text-slate-400 hover:text-slate-700">
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      } />
  )
}

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)

  const goTo = (destination: Screen) => {
    setScreen(destination)
    setShowPassword(false)
    setShowConfirm(false)
    setPassword('')
    setConfirmPassword('')
    setError('')
    setForgot(false)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (screen === 'signup') {
      if (password.length < 8) return setError('Password must be at least 8 characters.')
      if (password !== confirmPassword) return setError('Passwords do not match. Please try again.')
    }
    setBusy(true)
    try {
      const { user } = screen === 'signup'
        ? await api.post<{ user: User }>('/auth/signup', { fullName, email, password })
        : await api.post<{ user: User }>('/auth/login', { email, password, remember })
      onLogin(user)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const footer = (
    <div className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
      <ShieldCheck size={15} className="text-green-600" /> Your academic materials stay private and secure.
    </div>
  )

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3F4F6] px-4 py-8 sm:px-6">
      <section className="w-full max-w-[470px] rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_55px_rgba(15,23,42,0.08)] sm:p-9">
        <div className={screen === 'welcome' ? 'mb-9 flex justify-center' : 'mb-8'}><Logo /></div>

        {screen === 'welcome' && (
          <div className="w-full text-center">
            <p className="mb-3 text-sm font-bold text-green-600">YOUR AI LEARNING COMPANION</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Welcome to EduMate AI!</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">Your smarter way to learn, practice, and improve.</p>
            <div className="mt-9 space-y-3">
              <Button onClick={() => goTo('signin')} className="h-12 w-full">Sign In <ArrowRight size={17} /></Button>
              <Button onClick={() => goTo('signup')} variant="secondary" className="h-12 w-full">Sign Up</Button>
            </div>
            <p className="mt-6 text-xs leading-5 text-slate-400">Choose an option to continue to your student learning workspace.</p>
          </div>
        )}

        {screen !== 'welcome' && (
          <div className="w-full">
            <button onClick={() => goTo('welcome')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-green-600"><ArrowLeft size={16} /> Back</button>
            <div className="mb-8">
              <p className="mb-2 text-sm font-bold text-green-600">{screen === 'signin' ? 'WELCOME BACK' : 'JOIN EDUMATE AI'}</p>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{screen === 'signin' ? 'Continue your learning' : 'Create your student account'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Use your official university email to access your learning workspace.</p>
            </div>
            <form onSubmit={submit} className="space-y-5">
              {screen === 'signup' && (
                <IconField label="Full name" icon={UserIcon} autoComplete="name" value={fullName} onValue={setFullName} placeholder="Enter your full name" />
              )}
              <IconField label={screen === 'signin' ? 'University email' : 'University student email'} icon={GraduationCap} type="email" autoComplete="email"
                value={email} onValue={(v) => { setEmail(v); setError('') }} placeholder="name@university.edu" />
              <PasswordField label="Password" value={password} onValue={(v) => { setPassword(v); setError('') }} show={showPassword} toggle={() => setShowPassword(!showPassword)}
                autoComplete={screen === 'signin' ? 'current-password' : 'new-password'} placeholder={screen === 'signin' ? 'Enter your password' : 'Create a password (8+ characters)'} />
              {screen === 'signup' && (
                <PasswordField label="Confirm password" value={confirmPassword} onValue={(v) => { setConfirmPassword(v); setError('') }} show={showConfirm} toggle={() => setShowConfirm(!showConfirm)}
                  autoComplete="new-password" placeholder="Confirm your password" />
              )}
              {screen === 'signin' && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-green-600" /> Remember me</label>
                  <button type="button" onClick={() => setForgot(!forgot)} className="font-semibold text-green-600 hover:underline">Forgot password?</button>
                </div>
              )}
              {forgot && <p className="-mt-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">Password reset by email isn’t set up on this server yet. Ask your administrator to reset it, or sign in and change it under Settings → Security.</p>}
              {error && <p role="alert" className="-mt-2 text-xs font-semibold text-red-600">{error}</p>}
              <Button type="submit" loading={busy} className="h-12 w-full">{screen === 'signin' ? 'Sign In to EduMate' : 'Create Account'} {!busy && <ArrowRight size={17} />}</Button>
            </form>
            <p className="mt-7 text-center text-sm text-slate-500">
              {screen === 'signin' ? 'New to EduMate AI? ' : 'Already have an account? '}
              <button onClick={() => goTo(screen === 'signin' ? 'signup' : 'signin')} className="font-bold text-green-600">{screen === 'signin' ? 'Sign up' : 'Sign in'}</button>
            </p>
            {screen === 'signin' && import.meta.env.DEV && <p className="mt-3 text-center text-[11px] text-slate-400">Demo account: demo@university.edu / demo1234</p>}
            {footer}
          </div>
        )}
      </section>
    </main>
  )
}
