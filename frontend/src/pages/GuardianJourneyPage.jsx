import AppShell from '../components/AppShell.jsx'
import AlertPanel from '../components/AlertPanel.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import JourneyMapPanel from '../components/JourneyMapPanel.jsx'
import RiskStatusCard from '../components/RiskStatusCard.jsx'
import { formatStatus, journeyActive } from '../lib/format.js'

export default function GuardianJourneyPage({ user, journey, socketState, error, onNavigate, onLogout, onRetry }) {
  const monitor = { current_location: journey.last_known_location, actual_route: journey.locations || [], risk: journey.risk, eta: { estimated_arrival: journey.estimated_arrival_at } }
  const latestCheckIn = journey.check_ins?.[0]
  const latestIncident = journey.incidents?.[0]
  const latestAlert = journey.latest_alert || journey.alerts?.[0]
  return <AppShell user={user} active="/guardian/journeys" guardian onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <button onClick={() => onNavigate('/guardian/journeys')} className="min-h-10 text-sm font-bold text-teal-900 underline">← Guardian dashboard</button>
      <header className="flex flex-col justify-between gap-3 rounded-2xl bg-[#142a32] p-5 text-white sm:flex-row sm:items-center"><div><p className="text-sm text-slate-300">{journey.rider_name} · shared journey</p><h1 className="mt-1 text-2xl font-black">{journey.origin} <span className="text-slate-400">→</span> {journey.destination}</h1><p className="mt-1 text-sm">{formatStatus(journey.status)} · started {new Date(journey.started_at).toLocaleString()}</p></div>{journeyActive(journey.status) ? <ConnectionStatus state={socketState} /> : <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">Journey ended</span>}</header>
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}<button onClick={onRetry} className="ml-2 font-bold underline">Retry</button></div>}
      {latestAlert && <AlertPanel alert={latestAlert} />}
      <div className="grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
        <section className="space-y-3">
          {journey.last_known_location || journey.origin_location || journey.destination_location ? <JourneyMapPanel journey={journey} monitor={monitor} className="h-[300px] w-full rounded-2xl border border-slate-200 sm:h-[410px]" /> : <div className="grid h-64 place-items-center rounded-2xl border border-dashed bg-white text-sm text-slate-600">No location has been shared yet.</div>}
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><b>Last location update:</b> {journey.last_location_at ? new Date(journey.last_location_at).toLocaleString() : 'Unavailable'}{journey.last_known_location && <span className="block text-xs text-slate-600">{Number(journey.last_known_location.latitude).toFixed(5)}, {Number(journey.last_known_location.longitude).toFixed(5)}</span>}</p>
        </section>
        <aside className="space-y-4"><RiskStatusCard risk={journey.risk} eta={{ estimated_arrival: journey.estimated_arrival_at }} distance={null} timestamp={journey.last_location_at} />
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Latest check-in</h2>{latestCheckIn ? <><p className="mt-2 text-sm font-bold">{formatStatus(latestCheckIn.status)}</p><p className="mt-1 text-sm text-slate-700">{latestCheckIn.reason}</p><p className="mt-2 text-xs text-slate-500">Deadline {new Date(latestCheckIn.deadline).toLocaleString()}</p></> : <p className="mt-2 text-sm text-slate-600">No check-ins recorded.</p>}</section>
        </aside>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Safety incidents</h2>{latestIncident ? <div className="mt-3 space-y-1 text-sm"><p><b>{formatStatus(latestIncident.incident_type)}</b> · {latestIncident.severity}</p><p>{latestIncident.reason}</p><p className="text-xs text-slate-500">{new Date(latestIncident.created_at).toLocaleString()} · {formatStatus(latestIncident.status)}</p></div> : <p className="mt-2 text-sm text-slate-600">No incidents recorded.</p>}</article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Alert delivery</h2>{journey.alerts?.length ? <ul className="mt-3 space-y-2">{journey.alerts.map(alert => <li key={alert.id} className="border-t border-slate-100 pt-2 text-sm"><b>{formatStatus(alert.alert_type)}</b><span className="block">{formatStatus(alert.delivery_status)}</span><span className="text-xs text-slate-500">{new Date(alert.created_at).toLocaleString()}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No safety alerts recorded.</p>}<p className="mt-3 text-xs text-slate-500">External delivery via SMS, email, or phone is not configured.</p></article>
      </section>
    </main>
  </AppShell>
}
