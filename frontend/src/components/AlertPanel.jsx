export default function AlertPanel({ alert, compact = false }) {
  if (!alert) return null
  const location = alert.last_known_location
  const risk = alert.risk || alert.risk_snapshot || {}
  return <section className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-950" aria-labelledby="alert-title" role="alert">
    <p className="text-xs font-black uppercase tracking-[0.14em]">Safety alert · {alert.severity || 'HIGH'}</p>
    <h2 id="alert-title" className="mt-1 text-lg font-bold">{alert.message || alert.reason || alert.alert_type}</h2>
    {!compact && <>
      <p className="mt-2 text-sm">Risk state: {risk.state || 'Unavailable'}{risk.score != null ? ` · score ${risk.score}` : ''}</p>
      {!!risk.reasons?.length && <ul className="mt-2 space-y-1 text-sm">{risk.reasons.map((reason, index) => <li key={index}>• {reason.message}</li>)}</ul>}
      <p className="mt-2 text-sm">Last known location: {location?.latitude != null ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}` : 'Unavailable'}</p>
    </>}
    <p className="mt-3 text-xs">{alert.created_at ? new Date(alert.created_at).toLocaleString() : ''} · External delivery: {alert.delivery_status || 'NOT_CONFIGURED'}</p>
  </section>
}
