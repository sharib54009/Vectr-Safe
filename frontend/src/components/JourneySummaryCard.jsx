import { formatDuration, formatStatus, journeyActive } from '../lib/format.js'

export default function JourneySummaryCard({ journey, onOpen }) {
  const active = journeyActive(journey.status)
  const riskState = active ? journey.current_risk_state : journey.highest_risk_state || journey.current_risk_state
  return <button onClick={() => onOpen(journey.id)} className="group flex min-h-24 w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700">
    <span className="min-w-0">
      <span className="block truncate font-bold">{journey.origin} <span className="text-slate-400">→</span> {journey.destination}</span>
      <span className="mt-1 block text-sm text-slate-600">{new Date(journey.started_at).toLocaleDateString()} · {formatDuration(journey.started_at, journey.ended_at)}</span>
      <span className="mt-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700"><span className={`h-2 w-2 rounded-full ${riskState === 'HIGH' ? 'bg-rose-600' : riskState === 'ELEVATED' ? 'bg-amber-600' : 'bg-teal-700'}`} />{active ? 'Current risk' : 'Highest risk'}: {riskState || journey.status}</span>
    </span>
    <span className="flex shrink-0 flex-col items-end gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-teal-50 text-teal-900' : 'bg-slate-100 text-slate-700'}`}>{formatStatus(journey.status)}</span><span aria-hidden="true" className="text-xl text-slate-500 group-hover:text-teal-800">›</span></span>
  </button>
}
