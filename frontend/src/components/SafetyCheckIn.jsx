import { useEffect, useState } from 'react'
import SOSButton from './SOSButton.jsx'

function remaining(deadline) {
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

function timeLabel(value) {
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function SafetyCheckIn({ checkIn, onRespond, onSos, busy }) {
  const [seconds, setSeconds] = useState(() => remaining(checkIn.deadline))
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds(remaining(checkIn.deadline)), 1000)
    return () => window.clearInterval(timer)
  }, [checkIn.deadline])

  return <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950" aria-labelledby="checkin-title" aria-live="assertive">
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[0.14em]">Please respond</p><h2 id="checkin-title" className="mt-1 text-xl font-black">Safety check-in</h2></div>
      <span className="rounded-lg bg-white px-3 py-2 font-mono text-xl font-black" aria-label={`${seconds} seconds remaining`}>{seconds > 0 ? timeLabel(seconds) : '00:00'}</span>
    </div>
    <p className="mt-3 text-sm">{checkIn.reason || 'We noticed unusual activity during your journey.'}</p>
    {seconds === 0 && <p className="mt-3 text-sm font-semibold">Your response window has ended. The server is updating this check-in. You can still request help with SOS.</p>}
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <button disabled={busy || seconds === 0} onClick={() => onRespond('SAFE')} className="min-h-12 flex-1 rounded-xl bg-teal-800 px-4 py-3 font-bold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">Yes, I’m safe</button>
      <button disabled={busy || seconds === 0} onClick={() => onRespond('HELP')} className="min-h-12 rounded-xl border border-rose-400 bg-white px-4 py-3 font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">I need help</button>
      <SOSButton onSend={onSos} busy={busy} compact />
    </div>
    <p className="mt-3 text-xs">The server controls the deadline. If live updates disconnect, this check-in remains active until the server updates it.</p>
  </section>
}
