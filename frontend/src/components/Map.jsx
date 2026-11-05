import { useEffect, useMemo } from 'react'
import { divIcon, latLngBounds } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const vehicleIcon = divIcon({ className: 'vectrsafe-marker', html: '<span class="vectrsafe-marker__vehicle" aria-hidden="true">●</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
const originIcon = divIcon({ className: 'vectrsafe-marker', html: '<span class="vectrsafe-marker__origin" aria-hidden="true">A</span>', iconSize: [30, 30], iconAnchor: [15, 15] })
const destinationIcon = divIcon({ className: 'vectrsafe-marker', html: '<span class="vectrsafe-marker__destination" aria-hidden="true">B</span>', iconSize: [30, 30], iconAnchor: [15, 15] })

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: event => onMapClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng }) })
  return null
}

function FitMap({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) map.fitBounds(latLngBounds(points), { padding: [28, 28], maxZoom: 15 })
    else if (points.length === 1) map.setView(points[0], 14)
  }, [map, points])
  return null
}

export default function Map({ center, vehiclePosition, vehicleLabel = 'Current GPS location', origin, destination, route = [], actualRoute = [], zoom = 12, className = '', onMapClick }) {
  const originPosition = useMemo(() => origin ? (Array.isArray(origin) ? origin : [origin.latitude, origin.longitude]) : null, [origin])
  const points = useMemo(() => [originPosition, destination?.position, vehiclePosition, ...route, ...actualRoute]
    .filter(Boolean)
    .map(point => Array.isArray(point) ? point : [point.latitude, point.longitude]), [originPosition, destination?.position, vehiclePosition, route, actualRoute])

  return <MapContainer center={center} zoom={zoom} scrollWheelZoom className={`vectrsafe-map ${className}`}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitMap points={points} />
    <MapClickHandler onMapClick={onMapClick} />
    {route.length > 1 && <Polyline positions={route} pathOptions={{ color: '#167b78', weight: 5, opacity: 0.8 }} />}
    {actualRoute.length > 1 && <Polyline positions={actualRoute} pathOptions={{ color: '#c48131', weight: 4, opacity: 0.9, dashArray: '6 8' }} />}
    {originPosition && <Marker position={originPosition} icon={originIcon}><Tooltip direction="top">Origin</Tooltip></Marker>}
    {vehiclePosition && <Marker position={vehiclePosition} icon={vehicleIcon}><Tooltip direction="top">{vehicleLabel}</Tooltip></Marker>}
    {destination?.position && <Marker position={destination.position} icon={destinationIcon}><Tooltip direction="top">{destination.name || 'Destination'}</Tooltip></Marker>}
  </MapContainer>
}
