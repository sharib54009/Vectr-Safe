import { useState } from 'react'
import AppShell from '../components/AppShell.jsx'
import Map from '../components/Map.jsx'

const inputClass = 'mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20'
const fallbackCenter = [0, 0]

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser does not support location access.'))
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      error => reject(new Error(error.code === 1 ? 'Location access was denied. Allow it in your browser settings, or choose a start point on the map.' : 'Your current location could not be found. Try again or choose a start point on the map.')),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
    )
  })
}

export default function StartJourneyPage({ user, contacts, onNavigate, onLogout, onStart }) {
  const [form, setForm] = useState({ origin: '', destination: '', expected_arrival_at: '' })
  const [originLocation, setOriginLocation] = useState(null)
  const [destinationLocation, setDestinationLocation] = useState(null)
  const [selectionMode, setSelectionMode] = useState('')
  const [locationState, setLocationState] = useState('idle')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const acceptedContacts = contacts.filter(contact => contact.accepted_at && contact.is_active !== false)
  const center = originLocation ? [originLocation.latitude, originLocation.longitude] : destinationLocation ? [destinationLocation.latitude, destinationLocation.longitude] : fallbackCenter
  const zoom = originLocation || destinationLocation ? 13 : 2

  const useLocation = async () => {
    setLocationState('requesting')
    setError('')
    try {
      const location = await getCurrentLocation()
      setOriginLocation(location)
      setForm(previous => ({ ...previous, origin: previous.origin || 'Current location' }))
      setLocationState('active')
      setSelectionMode('destination')
    } catch (problem) {
      setLocationState('denied')
      setError(problem.message)
    }
  }

  const selectOnMap = location => {
    if (selectionMode === 'origin') {
      setOriginLocation(location)
      setForm(previous => ({ ...previous, origin: previous.origin || 'Selected on map' }))
      setSelectionMode('')
      setLocationState('selected')
    } else if (selectionMode === 'destination') {
      setDestinationLocation(location)
      setSelectionMode('')
    }
  }

  const start = async event => {
    event.preventDefault()
    if (!form.origin.trim() || !form.destination.trim() || !originLocation || !destinationLocation) {
      setError('Add a start point and destination on the map before continuing.')
      setReviewing(false)
      return
    }
    if (!reviewing) {
      setError('')
      setReviewing(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      await onStart({ ...form, origin_location: originLocation, destination_location: destinationLocation })
    } catch (problem) {
      setError(problem.message)
      setReviewing(false)
    } finally {
      setBusy(false)
    }
  }

  return <AppShell user={user} active="/app/home" onNavigate={onNavigate} onLogout={onLogout}>
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 sm:py-8">
      <button onClick={() => onNavigate('/app/home')} className="min-h-10 text-sm font-bold text-teal-900 underline">← Back to home</button>
      <header><p className="text-xs font-bold uppercase tracking-[0.15em] text-teal-800">New journey</p><h1 className="mt-1 text-3xl font-black">Where are you going?</h1><p className="mt-2 max-w-2xl text-slate-600">Choose a start and destination. VectrSafe will share your live GPS position during this journey.</p></header>
      <div className="grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <form onSubmit={start} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <section className="space-y-3" aria-labelledby="journey-details-title"><h2 id="journey-details-title" className="font-black">Journey details</h2>
            <label className="block text-sm font-bold">From<input required value={form.origin} onChange={event => setForm(previous => ({ ...previous, origin: event.target.value }))} className={inputClass} placeholder="Current location or place name" /></label>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={useLocation} disabled={locationState === 'requesting'} className="min-h-10 rounded-lg border border-teal-700 px-3 text-sm font-bold text-teal-900 disabled:opacity-60">{locationState === 'requesting' ? 'Finding you…' : 'Use my current location'}</button><button type="button" onClick={() => { setSelectionMode('origin'); setError('') }} className="min-h-10 rounded-lg border px-3 text-sm font-semibold">Choose on map</button></div>
            <p className="text-xs text-slate-600" role="status">{originLocation ? 'Start point selected.' : 'Location access required. You can use GPS or select a point on the map.'}</p>
            <label className="block text-sm font-bold">To<input required value={form.destination} onChange={event => setForm(previous => ({ ...previous, destination: event.target.value }))} className={inputClass} placeholder="Destination name" /></label>
            <button type="button" onClick={() => { setSelectionMode('destination'); setError('') }} className="min-h-10 rounded-lg border border-teal-700 px-3 text-sm font-bold text-teal-900">Choose destination on map</button>
            {destinationLocation && <p className="text-xs font-semibold text-teal-900" role="status">Destination point selected on map.</p>}
            <label className="block text-sm font-bold">Expected arrival <span className="font-normal text-slate-500">(optional)</span><input type="datetime-local" value={form.expected_arrival_at} onChange={event => setForm(previous => ({ ...previous, expected_arrival_at: event.target.value }))} className={inputClass} /></label>
          </section>
          <section className="rounded-xl bg-slate-50 p-4"><h2 className="text-sm font-black">Trusted contact access</h2><p className="mt-1 text-sm text-slate-700">{acceptedContacts.length ? `${acceptedContacts.length} authorized contact${acceptedContacts.length === 1 ? '' : 's'} can view this journey.` : 'No contacts have accepted an invitation yet.'}</p><p className="mt-2 text-xs text-slate-500">All active accepted contacts can view journeys; individual journey selection is not available yet.</p></section>
          <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700"><b>Route guidance</b><p className="mt-1">Live turn-by-turn routing is not connected. VectrSafe will show your selected start and destination and record your GPS trace without claiming a road route.</p></div>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
          {reviewing && <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm"><h2 className="font-black">Review journey</h2><p className="mt-2"><b>From:</b> {form.origin}</p><p><b>To:</b> {form.destination}</p><p><b>Expected arrival:</b> {form.expected_arrival_at ? new Date(form.expected_arrival_at).toLocaleString() : 'Not set'}</p><p><b>Shared with:</b> {acceptedContacts.length ? `${acceptedContacts.length} authorized contact${acceptedContacts.length === 1 ? '' : 's'}` : 'No accepted contacts'}</p></div>}
          <div className="flex flex-col gap-2 sm:flex-row">{reviewing && <button type="button" onClick={() => setReviewing(false)} className="min-h-12 flex-1 rounded-xl border px-4 py-3 font-bold">Edit</button>}<button disabled={busy || locationState === 'requesting'} className="min-h-12 flex-1 rounded-xl bg-teal-800 px-4 py-3 font-black text-white hover:bg-teal-900 disabled:opacity-60">{busy ? 'Starting journey…' : reviewing ? 'Start journey' : 'Review journey'}</button></div>
        </form>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-black">Select locations</h2><span className="text-xs text-slate-600">{selectionMode ? `Tap the map to set ${selectionMode === 'origin' ? 'start' : 'destination'}` : 'Map selection'}</span></div>
          <Map center={center} origin={originLocation} destination={destinationLocation ? { name: form.destination || 'Destination', position: [destinationLocation.latitude, destinationLocation.longitude] } : null} zoom={zoom} className="h-[320px] w-full rounded-2xl border border-slate-200 sm:h-[460px]" onMapClick={selectionMode ? selectOnMap : undefined} />
          <p className="text-xs text-slate-500">Map tiles © OpenStreetMap contributors. Approximate place selection only; this is not turn-by-turn navigation.</p>
        </section>
      </div>
    </main>
  </AppShell>
}
