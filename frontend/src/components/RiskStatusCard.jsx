const styles = {
  SAFE: 'border-teal-200 bg-teal-50 text-teal-950',
  ELEVATED: 'border-amber-300 bg-amber-50 text-amber-950',
  HIGH: 'border-rose-300 bg-rose-50 text-rose-950',
}

export default function RiskStatusCard({ risk = {}, eta, distance, timestamp }) {
  const state = risk.state || 'SAFE'
  const reasons = risk.reasons || []
  const headline = state === 'SAFE' ? 'Your journey is proceeding normally.' : state === 'ELEVATED' ? 'We noticed unusual movement.' : 'A safety check-in is required.'
  return <section className={`rounded-2xl border p-5 ${styles[state] || styles.SAFE}`} aria-labelledby="risk-heading" aria-live={state === 'HIGH' ? 'assertive' : 'polite'}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em]">Journey safety</p>
        <h2 id="risk-heading" className="mt-1 text-2xl font-black">{state.replace('_', ' ')}</h2>
        <p className="mt-1 text-sm">{headline}</p>
      </div>
      <span className="rounded-lg border border-current/20 bg-white/70 px-3 py-2 text-sm font-bold">Risk score {risk.score ?? '—'}</span>
    </div>
    <div className="mt-4">
      <h3 className="text-sm font-bold">Why?</h3>
      {reasons.length ? <ul className="mt-2 space-y-1.5 text-sm">{reasons.map((reason, index) => <li key={`${reason.type || 'reason'}-${index}`} className="flex gap-2"><span aria-hidden="true">•</span><span>{reason.message}</span></li>)}</ul> : <p className="mt-1 text-sm">No unusual movement signals are active.</p>}
    </div>
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-current/15 pt-3 text-sm">
      <span><b>ETA</b> · {eta?.estimated_arrival ? new Date(eta.estimated_arrival).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Unavailable without route guidance'}</span>
      {distance != null && <span><b>GPS trace</b> · {distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`}</span>}
      {timestamp && <span className="text-xs">Updated {new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</span>}
    </div>
  </section>
}
