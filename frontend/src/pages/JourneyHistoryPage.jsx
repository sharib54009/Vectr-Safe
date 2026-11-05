import AppShell from '../components/AppShell.jsx'
import JourneySummaryCard from '../components/JourneySummaryCard.jsx'

export default function JourneyHistoryPage({ user, journeys, loading, error, onNavigate, onLogout, onOpen, onRetry }) {
  return <AppShell user={user} active="/app/journeys" onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <header><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-800">Your account</p><h1 className="mt-1 text-3xl font-black">Journey history</h1><p className="mt-2 text-slate-600">Review journey dates, durations, status, and highest recorded risk. GPS traces are available when you open a journey.</p></header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}<button onClick={onRetry} className="ml-2 font-bold underline">Retry</button></div>}
      {loading ? <p role="status" className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Loading your journey history…</p> : journeys.length ? <section aria-label="Past journeys" className="space-y-3">{journeys.map(journey => <JourneySummaryCard key={journey.id} journey={journey} onOpen={onOpen} />)}</section> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8"><h2 className="font-black">No journey history yet</h2><p className="mt-1 text-sm text-slate-600">Journeys you start will appear here.</p><button onClick={() => onNavigate('/app/journey/new')} className="mt-4 min-h-11 rounded-xl bg-teal-800 px-4 py-2 font-bold text-white">Start a journey</button></section>}
    </main>
  </AppShell>
}
