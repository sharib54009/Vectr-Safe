import { useState } from 'react'

export default function SOSButton({ onSend, busy = false, compact = false, activated = false }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  if (activated) return <button type="button" disabled aria-live="polite" className={`min-h-12 rounded-xl bg-rose-950 px-5 py-3 font-black text-white ${compact ? 'w-full sm:w-auto' : 'w-full'}`}>SOS ACTIVATED</button>
  return <div className={compact ? '' : 'space-y-2'}>
    {!confirming ? <button type="button" onClick={() => { setError(''); setConfirming(true) }} aria-haspopup="dialog" className={`min-h-12 rounded-xl bg-rose-700 px-5 py-3 font-black text-white hover:bg-rose-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-700 ${compact ? 'w-full sm:w-auto' : 'w-full'}`}>
      SOS · Request help
    </button> : <div role="dialog" aria-label="Confirm emergency SOS" className="rounded-xl border border-rose-300 bg-white p-3">
      <p className="text-sm font-bold text-slate-900">Send an SOS to authorized guardians?</p>
      <p className="mt-1 text-xs text-slate-600">This records an urgent alert in VectrSafe. External SMS or calls are not configured.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={busy} onClick={async () => { try { await onSend(); setConfirming(false); setError('') } catch (problem) { setError(problem.message || 'VectrSafe could not record the SOS. Try again.') } }} className="min-h-11 flex-1 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Confirm SOS'}</button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="min-h-11 rounded-lg border px-3 py-2 font-semibold">Cancel</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-rose-800">{error}</p>}
    </div>}
  </div>
}
