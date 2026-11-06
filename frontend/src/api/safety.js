import { post, request } from './client.js'

export const createTrustedContact = data => post('/api/trusted-contacts/', data)
export const listTrustedContacts = () => request('/api/trusted-contacts/')
export const removeTrustedContact = contactId => request(`/api/trusted-contacts/${contactId}/`, { method: 'DELETE' })
export const acceptGuardianInvitation = invitationCode => post('/api/guardian-invitations/accept/', { invitation_code: invitationCode })
export const listGuardianJourneys = () => request('/api/guardian/journeys/')
export const getGuardianJourney = journeyId => request(`/api/guardian/journeys/${journeyId}/`)
export const listAlerts = () => request('/api/safety/alerts/')

export function triggerSos(journeyId, location, idempotencyKey, triggerSource = 'MANUAL') {
  return post(`/api/journeys/${journeyId}/sos/`, { ...(location || {}), trigger_source: triggerSource }, { 'Idempotency-Key': idempotencyKey })
}
