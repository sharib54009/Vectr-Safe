import AppShell from '../components/AppShell.jsx'
import JourneySummaryCard from '../components/JourneySummaryCard.jsx'
import { journeyActive } from '../lib/format.js'

export default function HomePage({ user, journeys, contacts, loading, error, onNavigate, onLogout, onOpenJourney, onRetry }) {
  const active = journeys.find(item => journeyActive(item.status))
  const authorized = contacts.filter(contact => contact.accepted_at && contact.is_active !== false)
  const recent = journeys.filter(item => item.id !== active?.id).slice(0, 3)
  const greeting = user.first_name ? `Good to see you, ${user.first_name}.` : `Good to see you, ${user.username}.`
  return <AppShell user={user} active="/app/home" onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-6 sm:py-9">
      <section className="flex flex-col justify-between gap-5 rounded-3xl bg-[#e4efed] p-6 sm:flex-row sm:items-center sm:p-8">
        <div><p className="text-sm font-semibold text-teal-900">{greeting}</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Your journeys, with more peace of mind.</h1><p className="mt-3 max-w-2xl text-slate-700">Start a journey to share your live location and receive safety check-ins along the way.</p></div>
        <button onClick={() => onNavigate(active ? `/app/journey/${active.id}` : '/app/journey/new')} className="min-h-14 shrink-0 rounded-2xl bg-teal-800 px-6 py-4 text-base font-black text-white hover:bg-teal-900">{active ? 'Return to active journey' : 'Start a journey'} <span aria-hidden="true">→</span></button>
      </section>
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><span>{error}</span><button onClick={onRetry} className="font-bold underline">Retry</button></div>}
      {active && <section aria-labelledby="active-title"><div className="mb-3 flex items-center justify-between"><h2 id="active-title" className="text-lg font-black">Active journey</h2><span className="rounded-full bg-teal-100 px-3 py-1 text-xs font-bold text-teal-950">Monitoring</span></div><JourneySummaryCard journey={active} onOpen={onOpenJourney} /></section>}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_.8fr]">
        <section aria-labelledby="recent-title" className="space-y-3"><div className="flex items-center justify-between"><h2 id="recent-title" className="text-lg font-black">Recent journeys</h2><button onClick={() => onNavigate('/app/journeys')} className="text-sm font-bold text-teal-900 underline">View history</button></div>
          {loading ? <div className="rounded-2xl border bg-white p-5 text-sm text-slate-600" role="status">Loading your journeys…</div> : recent.length ? recent.map(item => <JourneySummaryCard key={item.id} journey={item} onOpen={onOpenJourney} />) : !active ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6"><p className="font-bold">No journeys yet</p><p className="mt-1 text-sm text-slate-600">Your journey history will appear here after you finish a trip.</p></div> : <p className="rounded-2xl border bg-white p-5 text-sm text-slate-600">No previous journeys yet.</p>}
        </section>
        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">Trusted contact access</h2><p className="mt-1 text-sm text-slate-600">People who accepted your invitation can view your shared journeys.</p></div><span className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-black text-teal-950">{authorized.length} active</span></div><button onClick={() => onNavigate('/app/trusted-contacts')} className="mt-4 min-h-10 text-sm font-bold text-teal-900 underline">Manage contacts</button></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Safety status</h2><p className="mt-1 text-sm text-slate-600">{active ? `Your current journey is ${active.current_risk_state.toLowerCase()}.` : 'No journey is being monitored right now.'}</p><p className="mt-3 text-xs text-slate-500">Location sharing starts when you open an active journey.</p></section>
        </aside>
      </div>
    </main>
  </AppShell>
}
