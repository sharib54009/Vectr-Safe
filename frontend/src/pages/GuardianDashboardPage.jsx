import { useCallback, useEffect, useState } from 'react'
import { getGuardianJourney } from '../api/safety.js'
import AppShell from '../components/AppShell.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import useJourneySocket from '../hooks/useJourneySocket.js'
import { formatStatus, journeyActive } from '../lib/format.js'

function GuardianJourneyRow({ journey, onOpen }) {
  const [live, setLive] = useState(journey)
  useEffect(() => setLive(journey), [journey])
  const onEvent = useCallback(event => {
    setLive(previous => {
      if (event.event === 'risk_update') return { ...previous, risk: event.risk }
      if (event.event === 'journey_status') return { ...previous, status: event.status }
      if (event.event === 'safety_alert') return { ...previous, status: 'ESCALATED', risk: event.risk || previous.risk, latest_alert: event }
      if (event.event === 'location_update') return { ...previous, last_known_location: event.location, last_location_at: event.location?.timestamp }
      return previous
    })
  }, [])
  const onReconnect = useCallback(() => getGuardianJourney(journey.id).then(setLive).catch(() => {}), [journey.id])
  const socketState = useJourneySocket(journeyActive(live.status) ? journey.id : null, onEvent, onReconnect)
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><button onClick={() => onOpen(live.id)} className="min-w-0 flex-1 text-left"><span className="block text-sm font-semibold text-slate-600">{live.rider_name}</span><b className="mt-1 block truncate text-lg">{live.origin} <span className="text-slate-400">→</span> {live.destination}</b><span className="mt-2 block text-sm text-slate-600">{live.last_location_at ? `Last location ${new Date(live.last_location_at).toLocaleTimeString()}` : 'Waiting for first GPS location'}</span></button><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-black ${live.risk?.state === 'HIGH' ? 'bg-rose-100 text-rose-900' : live.risk?.state === 'ELEVATED' ? 'bg-amber-100 text-amber-950' : 'bg-teal-100 text-teal-950'}`}>{live.risk?.state || 'SAFE'} · {formatStatus(live.status)}</span>{journeyActive(live.status) && <ConnectionStatus state={socketState} />}<button onClick={() => onOpen(live.id)} aria-label={`Open ${live.rider_name}’s journey`} className="min-h-10 rounded-lg border px-3 font-bold">View</button></div></div>
    {live.latest_alert && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">Safety alert: {live.latest_alert.message || live.latest_alert.reason}</p>}
  </div>
}

export default function GuardianDashboardPage({ user, journeys, loading, error, onNavigate, onLogout, onOpen, onAccept, onRetry }) {
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('invitation_code') || '')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeCount = journeys.filter(journey => journeyActive(journey.status)).length
  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    setFormError('')
    try {
      await onAccept(code.trim())
      setCode('')
      window.history.replaceState({}, '', `${window.location.pathname}`)
    } catch (problem) { setFormError(problem.message) } finally { setBusy(false) }
  }
  return <AppShell user={user} active="/guardian/journeys" guardian onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="rounded-3xl bg-[#e4efed] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-900">Authorized guardian access</p><h1 className="mt-1 text-3xl font-black">Guardian dashboard</h1><p className="mt-2 max-w-2xl text-slate-700">Only riders who accepted an invitation for your account appear here.</p><p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold"><span className="h-2 w-2 rounded-full bg-teal-700" />{activeCount} active safety {activeCount === 1 ? 'monitor' : 'monitors'}</p></header>
      {(error || formError) && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{formError || error}{error && <button onClick={onRetry} className="ml-2 font-bold underline">Retry</button>}</div>}
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-bold">Accept a rider invitation<input required value={code} onChange={event => setCode(event.target.value)} className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20" placeholder="Enter invitation code" /></label><button disabled={busy} className="min-h-12 rounded-xl bg-teal-800 px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? 'Accepting…' : 'Accept invitation'}</button></form>
      <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Shared journeys</h2><button onClick={onRetry} className="text-sm font-bold text-teal-900 underline">Refresh</button></div>
        {loading ? <p role="status" className="rounded-2xl border bg-white p-5 text-sm text-slate-600">Loading authorized journeys…</p> : journeys.length ? journeys.map(journey => <GuardianJourneyRow key={journey.id} journey={journey} onOpen={onOpen} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6"><h3 className="font-bold">No shared journeys</h3><p className="mt-1 text-sm text-slate-600">Accept a VectrSafe invitation using the email address the rider invited.</p></div>}
      </section>
      <p className="text-xs text-slate-500">Alert status reflects VectrSafe records. External SMS, email, and phone alerts are not configured.</p>
    </main>
  </AppShell>
}
