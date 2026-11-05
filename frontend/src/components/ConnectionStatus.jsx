const labels = {
  connected: 'Live updates connected',
  connecting: 'Connecting to live updates…',
  reconnecting: 'Reconnecting to live updates…',
  disconnected: 'Live updates disconnected. Reconnecting…',
}

export default function ConnectionStatus({ state }) {
  const live = state === 'connected'
  return <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${live ? 'border-teal-200 bg-teal-50 text-teal-900' : 'border-slate-300 bg-white text-slate-700'}`} role="status" aria-live="polite">
    <span className={`h-2 w-2 rounded-full ${live ? 'bg-teal-600' : 'bg-amber-500'}`} aria-hidden="true" />
    {labels[state] || labels.disconnected}
  </span>
}
