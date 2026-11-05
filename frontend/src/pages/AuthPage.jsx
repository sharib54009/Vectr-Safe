import { useEffect, useState } from 'react'

const inputClass = 'mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20'

export default function AuthPage({ initialMode = 'login', onModeChange, onSubmit, connectionError, onRetry }) {
  const [mode, setMode] = useState(initialMode)
  const [form, setForm] = useState({ username: '', email: '', first_name: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setMode(initialMode), [initialMode])
  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try { await onSubmit(mode, form) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  return <main className="grid min-h-screen bg-[#142a32] text-white lg:grid-cols-[1.05fr_.95fr]">
    <section className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
      <a href="/login" className="flex w-fit items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-400 font-black text-[#102a32]">V</span><span><b className="block text-lg">VectrSafe</b><span className="text-xs text-slate-300">Journey safety</span></span></a>
      <div className="my-12 max-w-xl lg:my-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300">Stay connected on the way</p>
        <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">A clearer view of your journey safety.</h1>
        <p className="mt-5 max-w-lg text-lg leading-7 text-slate-300">Share your live location with people you trust, respond to safety check-ins, and get help from a journey screen built for the moment.</p>
      </div>
      <p className="text-xs text-slate-400">Your location is shared only during journeys you start.</p>
    </section>
    <section className="flex items-center justify-center bg-[#f4f6f5] px-4 py-10 text-slate-950 sm:px-8 lg:px-12">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-800">{mode === 'register' ? 'Get started' : 'Welcome back'}</p><h2 className="mt-2 text-2xl font-black">{mode === 'register' ? 'Create your account' : 'Sign in to VectrSafe'}</h2></div>
        {connectionError && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><b>Can’t reach VectrSafe.</b><p className="mt-1">{connectionError}</p><button type="button" onClick={onRetry} className="mt-2 font-bold underline">Try again</button></div>}
        <label className="block text-sm font-bold">Username<input required autoComplete="username" value={form.username} onChange={event => update('username', event.target.value)} className={inputClass} /></label>
        {mode === 'register' && <>
          <label className="block text-sm font-bold">Email<input required type="email" autoComplete="email" value={form.email} onChange={event => update('email', event.target.value)} className={inputClass} /></label>
          <label className="block text-sm font-bold">Name <span className="font-normal text-slate-500">(optional)</span><input autoComplete="given-name" value={form.first_name} onChange={event => update('first_name', event.target.value)} className={inputClass} /></label>
        </>}
        <label className="block text-sm font-bold">Password<input required type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={event => update('password', event.target.value)} className={inputClass} /></label>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
        <button disabled={busy} className="min-h-12 w-full rounded-xl bg-teal-800 px-4 py-3 font-bold text-white hover:bg-teal-900 disabled:opacity-60">{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
        <button type="button" onClick={() => { const next = mode === 'register' ? 'login' : 'register'; setMode(next); setError(''); onModeChange?.(next) }} className="min-h-11 w-full rounded-xl px-4 py-2 text-sm font-bold text-teal-900 hover:bg-teal-50">{mode === 'register' ? 'Already have an account? Sign in' : 'New to VectrSafe? Create an account'}</button>
        <p className="text-center text-xs text-slate-500">Passwords must be at least 10 characters and meet Django’s password checks.</p>
      </form>
    </section>
  </main>
}
