import { post, request, WS_BASE_URL } from './client.js'

export const listJourneys = () => request('/api/journeys/')
export const createJourney = data => post('/api/journeys/', data)
export const getJourney = journeyId => request(`/api/journeys/${journeyId}/`)
export const submitLocation = (journeyId, location) => post(`/api/journeys/${journeyId}/locations/`, location)
export const completeJourney = journeyId => post(`/api/journeys/${journeyId}/complete/`, {})
export const cancelJourney = journeyId => post(`/api/journeys/${journeyId}/cancel/`, {})
export const listCheckIns = journeyId => request(`/api/journeys/${journeyId}/check-ins/`)
export const respondToCheckIn = (journeyId, response) => post(`/api/journeys/${journeyId}/check-in/respond/`, { response })

export function connectToJourney(journeyId, onEvent, onClose, onOpen) {
  const socket = new WebSocket(`${WS_BASE_URL}/ws/journeys/${journeyId}/`)
  socket.addEventListener('message', event => {
    try { onEvent(JSON.parse(event.data)) } catch { /* Ignore malformed messages. */ }
  })
  socket.addEventListener('close', onClose)
  socket.addEventListener('error', onClose)
  socket.addEventListener('open', onOpen)
  return socket
}
