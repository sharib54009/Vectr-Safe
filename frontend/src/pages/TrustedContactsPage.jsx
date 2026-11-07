import { useState } from 'react'
import AppShell from '../components/AppShell.jsx'

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20'

export default function TrustedContactsPage({ user, contacts, loading, error, invitation, onNavigate, onLogout, onCreate, onRemove, onDismissInvitation, onRetry }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', relationship: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedContactId, setCopiedContactId] = useState(null)
  const makeInvitationLink = code => `${window.location.origin}/guardian/journeys?invitation_code=${encodeURIComponent(code)}`
  const invitationLink = invitation?.invitation_code ? makeInvitationLink(invitation.invitation_code) : ''
  const copyInvitationLink = async (link, contactId = null) => {
    try {
      await navigator.clipboard.writeText(link)
      if (contactId) {
        setCopiedContactId(contactId)
        window.setTimeout(() => setCopiedContactId(null), 2500)
      } else {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      setFormError('Copy is unavailable in this browser. Select and copy the invitation link below.')
    }
  }
  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try { await onCreate(form); setForm({ name: '', email: '', phone: '', relationship: '' }) } catch (problem) { setFormError(problem.message) } finally { setBusy(false) }
  }
  return <AppShell user={user} active="/app/trusted-contacts" onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-800">Privacy and sharing</p><h1 className="mt-1 text-3xl font-black">Trusted contacts</h1><p className="mt-2 text-slate-600">Only a contact who accepts an invitation using the matching account email can view your shared journeys.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}<button onClick={onRetry} className="ml-2 font-bold underline">Retry</button></div>}
      {invitation && <section className="rounded-2xl border border-teal-300 bg-teal-50 p-5" aria-live="polite"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">Invitation ready</h2><p className="mt-1 text-sm">This app does not send email invitations. Share this link with {invitation.name}. They must sign in or register using {invitation.email}; the invitation will be ready to accept on their Guardian view.</p></div><button onClick={onDismissInvitation} aria-label="Dismiss invitation link" className="rounded-lg px-2 py-1 font-bold">×</button></div><label className="mt-3 block text-xs font-bold text-slate-700">Invitation link<input readOnly value={invitationLink} onFocus={event => event.target.select()} className="mt-1 min-h-11 w-full rounded-lg border border-teal-800 bg-white px-3 text-sm" /></label><div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" onClick={copyInvitationLink} className="min-h-10 rounded-lg bg-teal-800 px-3 text-sm font-bold text-white">{copied ? 'Link copied' : 'Copy invitation link'}</button><span className="text-xs text-slate-700">Invitation code: <code className="font-mono font-bold">{invitation.invitation_code}</code></span></div></section>}
      <div className="grid gap-5 md:grid-cols-[1fr_1fr]">
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Add a contact</h2><label className="block text-sm font-bold">Name<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className={`${inputClass} mt-1`} /></label><label className="block text-sm font-bold">Account email<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className={`${inputClass} mt-1`} /></label><label className="block text-sm font-bold">Relationship <span className="font-normal text-slate-500">(optional)</span><input value={form.relationship} onChange={event => setForm({ ...form, relationship: event.target.value })} className={`${inputClass} mt-1`} /></label><label className="block text-sm font-bold">Phone <span className="font-normal text-slate-500">(optional, not used for alerts)</span><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className={`${inputClass} mt-1`} /></label>{formError && <p role="alert" className="text-sm text-rose-800">{formError}</p>}<button disabled={busy} className="min-h-11 w-full rounded-xl bg-teal-800 px-4 py-2 font-bold text-white disabled:opacity-60">{busy ? 'Creating…' : 'Create invitation'}</button></form>
        <section className="space-y-3"><h2 className="text-lg font-black">Your contacts</h2>{loading ? <p role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-600">Loading contacts…</p> : contacts.length ? contacts.map(contact => <article key={contact.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold">{contact.name}</h3><p className="truncate text-sm text-slate-600">{contact.email}</p><p className="mt-2 text-xs text-slate-600">{contact.accepted_at ? 'Authorized' : 'Invitation pending — waiting for them to accept'}{contact.relationship ? ` · ${contact.relationship}` : ''}</p></div><button onClick={() => { if (window.confirm(`Revoke ${contact.name}’s access?`)) onRemove(contact.id) }} className="min-h-10 shrink-0 rounded-lg border border-rose-300 px-3 text-sm font-bold text-rose-800">Revoke</button></div>{!contact.accepted_at && contact.invitation_code && <div className="mt-3 space-y-2"><label className="block text-xs font-bold">Share this invitation link<input readOnly value={makeInvitationLink(contact.invitation_code)} onFocus={event => event.target.select()} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs" /></label><button type="button" onClick={() => copyInvitationLink(makeInvitationLink(contact.invitation_code), contact.id)} className="min-h-9 rounded-lg border border-teal-800 px-3 text-sm font-bold">{copiedContactId === contact.id ? 'Link copied' : 'Copy invitation link'}</button></div>}</article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No trusted contacts yet.</div>}</section>
      </div>
      <p className="text-xs text-slate-500">External phone, email, and SMS delivery are not configured. Alerts are stored in VectrSafe and shared through authorized dashboards.</p>
    </main>
  </AppShell>
}
