import { useState } from 'react'
import AlertPanel from '../components/AlertPanel.jsx'
import AppShell from '../components/AppShell.jsx'
import ConnectionStatus from '../components/ConnectionStatus.jsx'
import JourneyMapPanel from '../components/JourneyMapPanel.jsx'
import RiskStatusCard from '../components/RiskStatusCard.jsx'
import SafetyCheckIn from '../components/SafetyCheckIn.jsx'
import SOSButton from '../components/SOSButton.jsx'
import VoiceSOSControl from '../components/VoiceSOSControl.jsx'
import { formatDuration, formatStatus, locationDistance } from '../lib/format.js'

function LocationStatus({ state, sync, onRetry }) {
  const messages = {
    active: ['Location active', sync?.state === 'offline' ? 'Offline: location is saved on this device. Live safety monitoring and guardian updates resume after sync.' : 'GPS samples are saved on this device before upload.'],
    requesting: ['Requesting location', 'Allow location access in your browser prompt.'],
    denied: ['Location access required', 'Allow location in browser settings, then try again.'],
    unsupported: ['Location unavailable', 'This browser does not support location sharing.'],
    error: ['Unable to access location', 'Check your device location settings and retry.'],
    inactive: ['Location paused', 'This journey is open, but GPS sharing is paused.'],
    completed: ['Location stopped', 'This journey is completed.'],
  }
  const [title, detail] = messages[state] || messages.inactive
  return <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
    <div><p className="font-bold">{title}</p><p className="mt-1 text-sm text-slate-600">{detail}</p></div>
    {state !== 'active' && state !== 'completed' && state !== 'unsupported' && <button onClick={onRetry} className="min-h-10 rounded-lg border border-teal-800 px-3 text-sm font-bold text-teal-900">{state === 'requesting' ? 'Waiting…' : 'Enable location'}</button>}
  </section>
}

export default function LiveJourneyPage({ user, journey, monitor, checkIn, alert, emergency, socketState, locationState, gpsSync, busy, onNavigate, onLogout, onRespond, onSos, onRetryLocation, onEnd, onRefresh }) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const completed = journey.status === 'COMPLETED'
  const journeyEnded = completed || journey.status === 'CANCELLED'
  const distance = locationDistance(monitor.actual_route || [])
  const location = monitor.current_location
  return <AppShell user={user} active="/app/home" onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6 sm:py-7">
      <button onClick={() => onNavigate('/app/home')} className="min-h-10 text-sm font-bold text-teal-900 underline">← Back to home</button>
      <header className="flex flex-col justify-between gap-4 rounded-2xl bg-[#142a32] p-5 text-white sm:flex-row sm:items-center sm:p-6">
        <div><div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${journeyEnded ? 'bg-slate-200 text-slate-800' : journey.status === 'ESCALATED' || monitor.risk?.state === 'HIGH' ? 'bg-rose-200 text-rose-950' : 'bg-teal-200 text-teal-950'}`}>{completed ? 'Journey completed' : journey.status === 'CANCELLED' ? 'Journey cancelled' : journey.status === 'ESCALATED' || monitor.risk?.state === 'HIGH' ? 'High risk' : 'Journey active'}</span>{!journeyEnded && <ConnectionStatus state={socketState} />}</div><h1 className="mt-3 text-2xl font-black sm:text-3xl">{journey.origin} <span className="text-slate-400">→</span> {journey.destination}</h1><p className="mt-1 text-sm text-slate-300">Started {new Date(journey.started_at).toLocaleString()}</p></div>
        <div className="flex flex-col gap-2 sm:min-w-64">{!journeyEnded && <><SOSButton onSend={onSos} busy={busy.sos} compact activated={emergency?.state === 'recorded'} /><VoiceSOSControl activeJourney={['ACTIVE', 'HIGH_RISK', 'ESCALATED'].includes(journey.status)} emergencyActive={Boolean(emergency) || Boolean(alert)} busy={busy.sos} onActivate={onSos} /></>}{!journeyEnded && (confirmEnd ? <div className="rounded-xl bg-white p-3 text-slate-900"><p className="text-sm font-bold">End this journey and stop GPS sharing?</p><div className="mt-2 flex gap-2"><button onClick={async () => { await onEnd(); setConfirmEnd(false) }} disabled={busy.end} className="min-h-10 flex-1 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white">{busy.end ? 'Ending…' : 'Confirm end'}</button><button onClick={() => setConfirmEnd(false)} className="min-h-10 rounded-lg border px-3 text-sm font-bold">Keep going</button></div></div> : <button onClick={() => setConfirmEnd(true)} className="min-h-11 rounded-xl border border-white/40 px-4 py-2 text-sm font-bold text-white hover:bg-white/10">End journey</button>)}</div>
      </header>
      {checkIn && !journeyEnded && <SafetyCheckIn checkIn={checkIn} onRespond={onRespond} onSos={onSos} busy={busy.respond || busy.sos} />}
      {emergency && <section role="alert" aria-live="assertive" className={`rounded-2xl border-2 p-5 ${emergency.state === 'recorded' ? 'border-rose-700 bg-rose-50 text-rose-950' : 'border-amber-500 bg-amber-50 text-amber-950'}`}>
        <h2 className="text-xl font-black">SOS ACTIVATED</h2>
        {emergency.state === 'sending' && <p className="mt-1 text-sm">Sending the SOS to VectrSafe. Guardian delivery is not confirmed yet.</p>}
        {emergency.state === 'local_pending' && <><p className="mt-1 text-sm font-bold">SOS triggered on this device. The server could not confirm delivery; guardian notification is not confirmed.</p><p className="mt-1 text-sm">Keep this journey open. VectrSafe will retry when the connection returns. Offline GPS storage does not itself deliver SOS alerts.</p><button type="button" disabled={busy.sos} onClick={() => onSos(emergency.source)} className="mt-3 min-h-10 rounded-lg border border-amber-800 px-3 text-sm font-bold disabled:opacity-60">{busy.sos ? 'Retrying…' : 'Retry SOS delivery'}</button></>}
        {emergency.state === 'failed' && <p className="mt-1 text-sm">VectrSafe did not record this SOS. Guardian notification is not confirmed. {emergency.message}</p>}
        {emergency.state === 'recorded' && <><p className="mt-1 text-sm font-bold">SOS recorded by VectrSafe. Authorized guardians can access the alert in the app; this does not confirm that a guardian has read it.</p><p className="mt-1 text-sm">External SMS and phone delivery are not configured.</p>{emergency.result?.alert?.last_known_location && <p className="mt-2 text-sm">Latest server location: {Number(emergency.result.alert.last_known_location.latitude).toFixed(5)}, {Number(emergency.result.alert.last_known_location.longitude).toFixed(5)}</p>}{emergency.result?.already_active && <p className="mt-1 text-sm font-semibold">An existing active safety alert was reused to prevent duplicate incidents.</p>}</>}
      </section>}
      {alert && <AlertPanel alert={alert} />}
      {journey.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{journey.error}<button onClick={onRefresh} className="ml-3 font-bold underline">Refresh journey</button></div>}
      {completed && <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950"><h2 className="text-lg font-black">Journey completed</h2><p className="mt-1 text-sm">{journey.origin} → {journey.destination}</p><p className="mt-1 text-sm">Duration: {formatDuration(journey.started_at, journey.ended_at)} · GPS sharing has stopped.</p><p className="mt-2 text-xs">Completed {journey.ended_at ? new Date(journey.ended_at).toLocaleString() : 'time unavailable'}</p></section>}
      {journey.status === 'CANCELLED' && <section className="rounded-2xl border border-slate-300 bg-slate-50 p-5 text-slate-900"><h2 className="text-lg font-black">Journey cancelled</h2><p className="mt-1 text-sm">GPS and Voice SOS have stopped for this journey.</p></section>}
      {(!completed || gpsSync?.queued > 0 || gpsSync?.state === 'syncing' || gpsSync?.state === 'problem') && <section role="status" aria-live="polite" className={`rounded-xl border p-3 text-sm ${gpsSync?.state === 'offline' ? 'border-amber-300 bg-amber-50 text-amber-950' : gpsSync?.state === 'problem' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-teal-200 bg-teal-50 text-teal-950'}`}>
        <p className="font-bold">{gpsSync?.state === 'offline' ? 'Offline — saving location locally' : gpsSync?.state === 'syncing' ? 'Syncing saved locations…' : gpsSync?.state === 'problem' ? 'Some locations could not sync. Retrying…' : gpsSync?.state === 'synced' ? 'All locations synced' : 'Live tracking'}</p>
        {gpsSync?.state === 'offline' && <p className="mt-1">Location is saved on this device. Live safety monitoring and guardian updates resume when connection returns.</p>}
        {gpsSync?.queued > 0 && <p className="mt-1">{gpsSync.queued} location sample{gpsSync.queued === 1 ? '' : 's'} waiting to sync.</p>}
      </section>}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_.8fr]">
        <section className="space-y-4">
          {location || journey.origin_location || journey.destination_location ? <JourneyMapPanel journey={journey} monitor={monitor} className="h-[300px] w-full rounded-2xl border border-slate-200 sm:h-[410px]" /> : <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center sm:h-80"><div><h2 className="font-bold">Waiting for location</h2><p className="mt-1 text-sm text-slate-600">Enable browser location to show the journey map.</p></div></div>}
          <LocationStatus state={journeyEnded ? 'completed' : locationState} sync={gpsSync} onRetry={onRetryLocation} />
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold text-slate-500">Elapsed</p><p className="mt-1 font-black">{formatDuration(journey.started_at, completed ? journey.ended_at : null)}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold text-slate-500">GPS trace</p><p className="mt-1 font-black">{distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`}</p></div><div className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold text-slate-500">Expected arrival</p><p className="mt-1 font-black">{monitor.eta?.estimated_arrival ? new Date(monitor.eta.estimated_arrival).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Unavailable'}</p></div></div>
          <p className="text-xs text-slate-500">GPS is recorded by VectrSafe. Road directions and turn-by-turn routing are not connected.</p>
        </section>
        <aside className="space-y-4"><RiskStatusCard risk={monitor.risk} eta={monitor.eta} distance={distance} timestamp={location?.timestamp} />
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Journey status</h2><p className="mt-2 text-sm text-slate-700">{formatStatus(journey.status)} · highest risk {journey.highest_risk_state || journey.current_risk_state}</p><p className="mt-1 text-xs text-slate-500">{completed ? `Duration ${formatDuration(journey.started_at, journey.ended_at)}` : `Started ${formatDuration(journey.started_at)} ago`}</p></section>
        </aside>
      </div>
    </main>
  </AppShell>
}
