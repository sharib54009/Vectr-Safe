import { useMemo } from 'react'
import Map from './Map.jsx'

const defaultCenter = [0, 0]

function asPoint(location) {
  if (!location || location.latitude == null || location.longitude == null) return null
  return [location.latitude, location.longitude]
}

export default function JourneyMapPanel({ journey, monitor, onMapClick, className = '' }) {
  const origin = useMemo(() => asPoint(journey.origin_location), [journey.origin_location])
  const destinationPoint = useMemo(() => asPoint(journey.destination_location), [journey.destination_location])
  const current = useMemo(() => asPoint(monitor?.current_location), [monitor?.current_location])
  const center = current || origin || destinationPoint || defaultCenter
  const route = useMemo(() => (journey.planned_route || []).map(point => [point.latitude, point.longitude]), [journey.planned_route])
  const actualLocations = monitor?.actual_route || journey.locations || []
  const actualRoute = useMemo(() => actualLocations.map(location => [location.latitude, location.longitude]), [actualLocations])
  const destination = useMemo(() => destinationPoint ? { name: journey.destination, position: destinationPoint } : null, [destinationPoint, journey.destination])
  return <div>
    <Map center={center} origin={origin} vehiclePosition={current} vehicleLabel={journey.status === 'COMPLETED' ? 'Last recorded location' : 'Current GPS location'} destination={destination} route={route} actualRoute={actualRoute} className={className} onMapClick={onMapClick} />
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Map legend">
      {origin && <span><b className="text-teal-800">A</b> Start</span>}
      {destination && <span><b className="text-teal-800">B</b> Destination</span>}
      {current && <span><b className="text-slate-900">●</b> {journey.status === 'COMPLETED' ? 'Last GPS point' : 'Current GPS'}</span>}
      {actualRoute.length > 1 && <span><b className="text-amber-700">╌</b> Recorded GPS trace</span>}
    </div>
  </div>
}
