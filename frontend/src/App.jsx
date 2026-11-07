import { useCallback, useEffect, useRef, useState } from 'react'
import { acceptGuardianInvitation, createTrustedContact, getGuardianJourney, listGuardianJourneys, listTrustedContacts, removeTrustedContact, triggerSos } from './api/safety.js'
import { getCurrentUser, logIn, logOut, signUp } from './api/auth.js'
import { cancelJourney as cancelJourneyRequest, completeJourney, createJourney, getJourney, listJourneys, respondToCheckIn } from './api/journeys.js'
import AuthPage from './pages/AuthPage.jsx'
import HomePage from './pages/HomePage.jsx'
import StartJourneyPage from './pages/StartJourneyPage.jsx'
import LiveJourneyPage from './pages/LiveJourneyPage.jsx'
import JourneyHistoryPage from './pages/JourneyHistoryPage.jsx'
import TrustedContactsPage from './pages/TrustedContactsPage.jsx'
import GuardianDashboardPage from './pages/GuardianDashboardPage.jsx'
import GuardianJourneyPage from './pages/GuardianJourneyPage.jsx'
import useJourneySocket from './hooks/useJourneySocket.js'
import { journeyActive } from './lib/format.js'
import { getJourneySnapshot, getQueuedLocations, queueLocationSample, removeJourneyLocations, removeQueuedLocation, saveJourneySnapshot } from './gps/locationQueue.js'
import { syncQueuedLocations } from './gps/locationSync.js'

function currentPath() {
  return window.location.pathname === '/' ? '/login' : window.location.pathname
}

function useNavigation() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onPopState = () => setPath(currentPath())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  const navigate = useCallback(nextPath => {
    if (!nextPath.startsWith('/')) return
    if (`${window.location.pathname}${window.location.search}` !== nextPath) window.history.pushState({}, '', nextPath)
    setPath(currentPath())
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])
  return [path, navigate]
}

function normalizeJourney(data) {
  const locations = data.locations || []
  const lastLocation = locations.at(-1) || data.last_known_location || null
  const riskReasons = (data.risk_reasons || data.risk?.reasons || []).filter(reason => reason.is_active !== false)
  return {
    ...data,
    current_location: lastLocation,
    last_known_location: lastLocation,
    actual_route: locations,
    risk: {
      score: data.risk?.score ?? data.current_risk_score ?? 0,
      state: data.risk?.state || data.current_risk_state || 'SAFE',
      reasons: riskReasons.map(reason => ({ type: reason.type || reason.signal_type, severity: reason.severity, message: reason.message })),
    },
    eta: {
      estimated_arrival: data.eta?.estimated_arrival ?? data.estimated_arrival_at,
      remaining_distance_meters: data.eta?.remaining_distance_meters ?? data.remaining_distance_meters,
    },
  }
}

function appendLocation(previous, location) {
  const history = previous?.actual_route || []
  const alreadyPresent = history.some(item => (location?.id && item.id === location.id)
    || (location?.client_sample_id && item.client_sample_id === location.client_sample_id))
  return {
    ...previous,
    current_location: location,
    last_known_location: location,
    actual_route: alreadyPresent ? history : [...history, location].slice(-500),
  }
}

function isSessionProblem(problem) {
  return problem?.status === 401 || problem?.status === 403
}

function makeIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes)
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function App() {
  const [path, navigate] = useNavigation()
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [authError, setAuthError] = useState('')
  const [journeys, setJourneys] = useState([])
  const [contacts, setContacts] = useState([])
  const [guardianJourneys, setGuardianJourneys] = useState([])
  const [journey, setJourney] = useState(null)
  const [monitor, setMonitor] = useState(null)
  const [checkIn, setCheckIn] = useState(null)
  const [alert, setAlert] = useState(null)
  const [emergency, setEmergency] = useState(null)
  const [guardianJourney, setGuardianJourney] = useState(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [guardianLoading, setGuardianLoading] = useState(false)
  const [journeyLoading, setJourneyLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [guardianError, setGuardianError] = useState('')
  const [journeyError, setJourneyError] = useState('')
  const [pageNotice, setPageNotice] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [locationSharing, setLocationSharing] = useState(false)
  const [locationState, setLocationState] = useState('inactive')
  const [gpsSync, setGpsSync] = useState({ state: navigator.onLine ? 'live' : 'offline', queued: 0 })
  const [busy, setBusy] = useState({ respond: false, sos: false, end: false, cancel: false })
  const lastSentAt = useRef(0)
  const pendingSosKey = useRef(null)
  const emergencyRef = useRef(null)
  const sosRequestRef = useRef(null)
  const syncRetryTimer = useRef(null)

  const riderJourneyId = path.match(/^\/app\/journey\/(\d+)$/)?.[1] || null
  const guardianJourneyId = path.match(/^\/guardian\/journey\/(\d+)$/)?.[1] || null
  const socketJourneyId = riderJourneyId && journeyActive(journey?.status)
    ? Number(riderJourneyId)
    : guardianJourneyId && guardianJourney && journeyActive(guardianJourney.status)
      ? Number(guardianJourneyId)
      : null

  const clearLocalSession = useCallback(() => {
    setUser(null)
    setJourneys([])
    setContacts([])
    setGuardianJourneys([])
    setJourney(null)
    setMonitor(null)
    setCheckIn(null)
    setAlert(null)
    emergencyRef.current = null
    pendingSosKey.current = null
    setEmergency(null)
    setGuardianJourney(null)
    setLocationSharing(false)
    setLocationState('inactive')
    navigate('/login')
  }, [navigate])

  const handleSessionProblem = useCallback(problem => {
    if (!isSessionProblem(problem)) return false
    clearLocalSession()
    setAuthError('Your session expired. Please sign in again.')
    return true
  }, [clearLocalSession])

  const syncJourneyLocations = useCallback(async (id, { force = false } = {}) => {
    if (!id || (!navigator.onLine && !force)) {
      setGpsSync(previous => ({ ...previous, state: 'offline' }))
      return
    }
    setGpsSync(previous => ({ ...previous, state: previous.queued ? 'syncing' : 'live' }))
    try {
      const result = await syncQueuedLocations(id, response => {
        setMonitor(previous => ({ ...appendLocation({ ...previous, risk: response.risk, eta: response.eta }, response.location), risk: response.risk, eta: response.eta }))
        if (response.check_in?.status === 'PENDING') setCheckIn(response.check_in)
        setJourneys(previous => previous.map(item => item.id === Number(id) ? { ...item, current_risk_state: response.risk.state, current_risk_score: response.risk.score } : item))
      })
      const remaining = await getQueuedLocations(id)
      setGpsSync({ state: result.error ? 'problem' : remaining.length ? (navigator.onLine ? 'syncing' : 'offline') : 'synced', queued: remaining.length })
      if (result.error && navigator.onLine && !syncRetryTimer.current) {
        syncRetryTimer.current = window.setTimeout(() => {
          syncRetryTimer.current = null
          syncJourneyLocations(id)
        }, result.retryAfter || 15_000)
      }
      if (result.error && isSessionProblem(result.error)) handleSessionProblem(result.error)
    } catch {
      setGpsSync(previous => ({ ...previous, state: navigator.onLine ? 'problem' : 'offline' }))
    }
  }, [handleSessionProblem])

  const refreshDashboard = useCallback(async () => {
    if (!user) return
    setDashboardLoading(true)
    setDashboardError('')
    try {
      const [journeyList, contactList] = await Promise.all([listJourneys(), listTrustedContacts()])
      setJourneys(journeyList)
      setContacts(contactList)
    } catch (problem) {
      if (!handleSessionProblem(problem)) setDashboardError(problem.message)
    } finally { setDashboardLoading(false) }
  }, [user, handleSessionProblem])

  const refreshGuardian = useCallback(async () => {
    if (!user) return
    setGuardianLoading(true)
    setGuardianError('')
    try { setGuardianJourneys(await listGuardianJourneys()) } catch (problem) {
      if (!handleSessionProblem(problem)) setGuardianError(problem.message)
    } finally { setGuardianLoading(false) }
  }, [user, handleSessionProblem])

  const refreshJourney = useCallback(async id => {
    const detail = await getJourney(id)
    setJourney(detail)
    setMonitor(normalizeJourney(detail))
    setCheckIn(detail.check_ins?.find(item => item.status === 'PENDING') || null)
    setAlert(detail.alerts?.[0] || null)
    setJourneyError('')
    return detail
  }, [])

  const refreshGuardianJourney = useCallback(async id => {
    const detail = await getGuardianJourney(id)
    setGuardianJourney(detail)
    setGuardianError('')
    return detail
  }, [])

  useEffect(() => {
    let current = true
    let requestPending = false
    let retryAfterPending = false
    let networkFailure = false
    const checkSession = async () => {
      if (!current) return
      if (requestPending) {
        retryAfterPending = true
        return
      }
      requestPending = true
      try {
        const account = await getCurrentUser()
        if (!current) return
        networkFailure = false
        setAuthError('')
        setUser(account)
        if (path === '/' || path === '/login' || path === '/register') navigate('/app/home')
      } catch (problem) {
        if (!current) return
        networkFailure = problem.status === 0
        if (!isSessionProblem(problem)) setAuthError(problem.message)
        setUser(null)
      } finally {
        requestPending = false
        if (current) setAuthReady(true)
        const shouldRetry = current && retryAfterPending && networkFailure && navigator.onLine
        retryAfterPending = false
        if (shouldRetry) checkSession()
      }
    }
    const onOnline = () => {
      if (networkFailure) checkSession()
      else if (requestPending) retryAfterPending = true
    }
    window.addEventListener('online', onOnline)
    checkSession()
    return () => {
      current = false
      window.removeEventListener('online', onOnline)
    }
  }, []) // Retry an offline session check when connectivity returns.

  useEffect(() => {
    if (user) refreshDashboard()
  }, [user, refreshDashboard])

  useEffect(() => {
    if (user && path.startsWith('/guardian')) refreshGuardian()
  }, [user, path.startsWith('/guardian'), refreshGuardian])

  useEffect(() => {
    if (!user || !riderJourneyId) {
      if (!riderJourneyId) {
        setJourney(null)
        setMonitor(null)
        setCheckIn(null)
        setAlert(null)
        setLocationSharing(false)
        setLocationState('inactive')
      }
      return undefined
    }
    let current = true
    setJourney(null)
    setMonitor(null)
    emergencyRef.current = null
    pendingSosKey.current = null
    setEmergency(null)
    setJourneyLoading(true)
    setJourneyError('')
    getJourney(riderJourneyId).then(detail => {
      if (!current) return
      if (emergencyRef.current && String(emergencyRef.current.journeyId) !== String(detail.id)) {
        emergencyRef.current = null
        pendingSosKey.current = null
        setEmergency(null)
      }
      lastSentAt.current = 0
      setJourney(detail)
      setMonitor(normalizeJourney(detail))
      saveJourneySnapshot({
        journey_id: Number(detail.id), owner_id: String(user.id), id: detail.id, origin: detail.origin,
        destination: detail.destination, status: detail.status, started_at: detail.started_at,
        ended_at: detail.ended_at, planned_route: [], origin_location: detail.origin_location,
        destination_location: detail.destination_location, current_risk_state: detail.current_risk_state,
        highest_risk_state: detail.highest_risk_state, current_risk_score: detail.current_risk_score,
        last_known_location: detail.last_known_location || detail.locations?.at(-1) || null,
      }).catch(() => {})
      setCheckIn(detail.check_ins?.find(item => item.status === 'PENDING') || null)
      setAlert(detail.alerts?.[0] || null)
      setLocationSharing(journeyActive(detail.status))
      setLocationState(journeyActive(detail.status) ? 'requesting' : 'inactive')
    }).catch(problem => {
      if (!current) return
      if (isSessionProblem(problem)) {
        handleSessionProblem(problem)
        return
      }
      if (problem.status === 0) {
        Promise.all([getJourneySnapshot(riderJourneyId), getQueuedLocations(riderJourneyId)]).then(([snapshot, queued]) => {
          if (!current || !snapshot || snapshot.owner_id !== String(user.id)) throw problem
          const offlineJourney = { ...snapshot, locations: queued, last_known_location: queued.at(-1) || null }
          setJourney(offlineJourney)
          setMonitor(normalizeJourney(offlineJourney))
          setLocationSharing(journeyActive(snapshot.status))
          setLocationState(journeyActive(snapshot.status) ? 'requesting' : 'inactive')
          setGpsSync({ state: navigator.onLine ? (queued.length ? 'syncing' : 'problem') : 'offline', queued: queued.length })
          if (queued.length && navigator.onLine) syncJourneyLocations(riderJourneyId)
        }).catch(() => { if (current) setJourneyError(problem.message) })
      } else setJourneyError(problem.message)
    }).finally(() => current && setJourneyLoading(false))
    return () => { current = false }
  }, [user, riderJourneyId, handleSessionProblem, syncJourneyLocations])

  useEffect(() => {
    if (!user || !guardianJourneyId) {
      if (!guardianJourneyId) setGuardianJourney(null)
      return undefined
    }
    let current = true
    setGuardianLoading(true)
    getGuardianJourney(guardianJourneyId).then(detail => current && setGuardianJourney(detail)).catch(problem => {
      if (!current) return
      if (!handleSessionProblem(problem)) setGuardianError(problem.message)
    }).finally(() => current && setGuardianLoading(false))
    return () => { current = false }
  }, [user, guardianJourneyId, handleSessionProblem])

  const applySocketEvent = useCallback(event => {
    if (event.event === 'location_update') {
      setMonitor(previous => appendLocation({ ...previous, eta: event.eta || previous?.eta }, event.location))
      setJourney(previous => previous ? { ...previous, last_known_location: event.location } : previous)
      setGuardianJourney(previous => previous ? { ...previous, last_known_location: event.location, last_location_at: event.location?.timestamp, locations: appendLocation({ actual_route: previous.locations || [] }, event.location).actual_route } : previous)
    } else if (event.event === 'risk_update') {
      setMonitor(previous => ({ ...previous, risk: event.risk }))
      setJourney(previous => previous ? { ...previous, current_risk_state: event.risk.state, current_risk_score: event.risk.score, highest_risk_state: event.risk.state === 'HIGH' ? 'HIGH' : previous.highest_risk_state } : previous)
      setGuardianJourney(previous => previous ? { ...previous, risk: event.risk, highest_risk_state: event.risk.state === 'HIGH' ? 'HIGH' : previous.highest_risk_state } : previous)
      setGuardianJourneys(previous => previous.map(item => item.id === event.journey_id ? { ...item, risk: event.risk, highest_risk_state: event.risk.state === 'HIGH' ? 'HIGH' : item.highest_risk_state } : item))
    } else if (event.event === 'check_in_requested' || event.event === 'check_in_updated') {
      setCheckIn(event.check_in.status === 'PENDING' ? event.check_in : null)
      setGuardianJourney(previous => previous ? { ...previous, check_ins: [event.check_in, ...(previous.check_ins || []).filter(item => item.id !== event.check_in.id)] } : previous)
      if (event.event === 'check_in_requested') setPageNotice('A safety check-in is waiting for your response.')
      if (event.check_in.status === 'RESPONDED_SAFE') setPageNotice('Your safe response was recorded.')
    } else if (event.event === 'safety_alert') {
      setAlert(event)
      setCheckIn(null)
      setJourney(previous => previous ? { ...previous, status: 'ESCALATED' } : previous)
      setGuardianJourney(previous => previous ? { ...previous, status: 'ESCALATED', latest_alert: event, alerts: [event, ...(previous.alerts || []).filter(item => item.id !== event.id)] } : previous)
      setGuardianJourneys(previous => previous.map(item => item.id === event.journey_id ? { ...item, status: 'ESCALATED', latest_alert: event } : item))
    } else if (event.event === 'journey_status') {
      setJourney(previous => previous ? { ...previous, status: event.status, ended_at: event.ended_at || previous.ended_at } : previous)
      setGuardianJourney(previous => previous ? { ...previous, status: event.status, ended_at: event.ended_at || previous.ended_at } : previous)
      setGuardianJourneys(previous => previous.map(item => item.id === event.journey_id ? { ...item, status: event.status } : item))
      if (event.status === 'COMPLETED') setLocationSharing(false)
    }
  }, [])

  const refreshSocketState = useCallback(() => {
    if (riderJourneyId) refreshJourney(riderJourneyId).catch(problem => { if (!handleSessionProblem(problem)) setJourneyError(problem.message) })
    if (guardianJourneyId) refreshGuardianJourney(guardianJourneyId).catch(problem => { if (!handleSessionProblem(problem)) setGuardianError(problem.message) })
  }, [riderJourneyId, guardianJourneyId, refreshJourney, refreshGuardianJourney, handleSessionProblem])
  const socketState = useJourneySocket(socketJourneyId, applySocketEvent, refreshSocketState)

  useEffect(() => {
    const id = journey?.id
    if (!user || !id || !riderJourneyId || String(id) !== riderJourneyId) return undefined
    let current = true
    const restore = async () => {
      if (journey.status === 'CANCELLED') {
        await removeJourneyLocations(id)
        if (current) setGpsSync({ state: 'inactive', queued: 0 })
        return
      }
      try {
        const queued = await getQueuedLocations(id)
        if (!current) return
        setGpsSync({ state: !navigator.onLine ? 'offline' : queued.length ? 'syncing' : 'synced', queued: queued.length })
        if (queued.length) syncJourneyLocations(id)
      } catch {
        if (current) setGpsSync({ state: 'problem', queued: 0 })
      }
    }
    restore()
    const onOnline = () => syncJourneyLocations(id, { force: true })
    const onOffline = () => setGpsSync(previous => ({ ...previous, state: 'offline' }))
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      current = false
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (syncRetryTimer.current) window.clearTimeout(syncRetryTimer.current)
      syncRetryTimer.current = null
    }
  }, [user, journey?.id, journey?.status, riderJourneyId, syncJourneyLocations])

  useEffect(() => {
    const monitoredJourneyId = journey?.id
    const monitoredJourneyStatus = journey?.status
    if (!locationSharing || !monitoredJourneyId || String(monitoredJourneyId) !== riderJourneyId || monitoredJourneyStatus === 'COMPLETED') return undefined
    if (!navigator.geolocation) {
      setLocationState('unsupported')
      setLocationSharing(false)
      return undefined
    }
    setLocationState('requesting')
    let tracking = true
    const watchId = navigator.geolocation.watchPosition(position => {
      if (!tracking) return
      setLocationState('active')
      const now = Date.now()
      if (now - lastSentAt.current < 15000) return
      lastSentAt.current = now
      const coords = position.coords
      const sample = {
        journey_id: Number(monitoredJourneyId),
        client_sample_id: makeIdempotencyKey(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp: new Date(position.timestamp).toISOString(),
        accuracy_meters: coords.accuracy,
        altitude_meters: coords.altitude,
        speed_meters_per_second: coords.speed,
        heading_degrees: coords.heading,
      }
      const localLocation = { ...sample, id: `local-${sample.client_sample_id}` }
      setMonitor(previous => appendLocation(previous, localLocation))
      queueLocationSample(sample).then(async () => {
        if (!tracking) {
          await removeQueuedLocation(sample.client_sample_id)
          return
        }
        const queued = await getQueuedLocations(monitoredJourneyId)
        if (!tracking) {
          await removeQueuedLocation(sample.client_sample_id)
          return
        }
        setGpsSync(previous => ({ ...previous, queued: queued.length, state: navigator.onLine ? 'syncing' : 'offline' }))
        syncJourneyLocations(monitoredJourneyId)
      }).catch(() => {
        if (!tracking) return
        setGpsSync(previous => ({ ...previous, state: 'problem' }))
        setJourneyError('Location could not be saved on this device. Check browser storage access.')
      })
    }, problem => {
      setLocationState(problem.code === 1 ? 'denied' : 'error')
      setLocationSharing(false)
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 })
    return () => {
      tracking = false
      navigator.geolocation.clearWatch(watchId)
    }
  }, [locationSharing, journey?.id, journey?.status, riderJourneyId, syncJourneyLocations])

  const submitAuth = async (mode, credentials) => {
    const account = mode === 'register' ? await signUp(credentials) : await logIn(credentials)
    setUser(account)
    setAuthError('')
    const requestedNext = new URLSearchParams(window.location.search).get('next')
    const nextPath = requestedNext?.startsWith('/') ? requestedNext : window.location.pathname.startsWith('/guardian') ? `${window.location.pathname}${window.location.search}` : '/app/home'
    navigate(nextPath)
  }

  const retryAuth = async () => {
    setAuthError('')
    try {
      const account = await getCurrentUser()
      setUser(account)
      navigate('/app/home')
    } catch (problem) {
      setAuthError(problem.message)
    }
  }

  const startJourney = async form => {
    const expected = form.expected_arrival_at ? new Date(form.expected_arrival_at).toISOString() : null
    let created
    try {
      created = await createJourney({
        origin: form.origin,
        destination: form.destination,
        origin_location: form.origin_location,
        destination_location: form.destination_location,
        planned_route: [],
        expected_arrival_at: expected,
      })
    } catch (problem) {
      handleSessionProblem(problem)
      throw problem
    }
    setJourneys(previous => [created, ...previous])
    setPageNotice('Journey started. Allow browser location to share GPS updates.')
    navigate(`/app/journey/${created.id}`)
  }

  const addContact = async data => {
    let contact
    try { contact = await createTrustedContact(data) } catch (problem) {
      handleSessionProblem(problem)
      throw problem
    }
    setContacts(previous => [...previous, contact])
    setInvitation(contact)
    return contact
  }

  const deleteContact = async contactId => {
    try {
      await removeTrustedContact(contactId)
      setContacts(previous => previous.filter(contact => contact.id !== contactId))
    } catch (problem) {
      if (!handleSessionProblem(problem)) setDashboardError(problem.message)
    }
  }

  const respond = async value => {
    if (!journey) return
    setBusy(previous => ({ ...previous, respond: true }))
    try {
      const result = await respondToCheckIn(journey.id, value)
      setCheckIn(null)
      if (result.alert) setAlert(result.alert)
      setPageNotice(value === 'SAFE' ? 'Your response was recorded by the server.' : 'Your request was recorded. Authorized guardians can see the alert in VectrSafe.')
      setJourney(previous => previous ? { ...previous, status: result.alert ? 'ESCALATED' : previous.status } : previous)
    } catch (problem) {
      if (!handleSessionProblem(problem)) {
        setJourneyError(problem.message)
        try { await refreshJourney(journey.id) } catch { /* Preserve the server error on screen. */ }
      }
    } finally { setBusy(previous => ({ ...previous, respond: false })) }
  }

  const sendSOS = useCallback((triggerSource = 'MANUAL') => {
    if (!journey) return Promise.resolve(null)
    if (emergencyRef.current?.state === 'recorded') return Promise.resolve(emergencyRef.current.result)
    if (sosRequestRef.current) return sosRequestRef.current

    const source = emergencyRef.current?.source || triggerSource
    if (!pendingSosKey.current || pendingSosKey.current.journeyId !== journey.id) {
      pendingSosKey.current = { journeyId: journey.id, key: makeIdempotencyKey() }
    }
    const setEmergencyState = next => {
      emergencyRef.current = next
      setEmergency(next)
    }
    setEmergencyState({ state: 'sending', source, journeyId: journey.id })
    const request = (async () => {
      setBusy(previous => ({ ...previous, sos: true }))
      try {
        const point = monitor?.current_location
        const result = await triggerSos(journey.id, point ? { latitude: point.latitude, longitude: point.longitude } : {}, pendingSosKey.current.key, source)
        pendingSosKey.current = null
        setAlert(result.alert)
        setJourney(previous => previous ? { ...previous, status: 'ESCALATED' } : previous)
        setEmergencyState({ state: 'recorded', source, journeyId: journey.id, result })
        return result
      } catch (problem) {
        if (isSessionProblem(problem)) handleSessionProblem(problem)
        const canRetry = problem.status === 0 || problem.status >= 500
        setEmergencyState({
          state: canRetry ? 'local_pending' : 'failed',
          source,
          journeyId: journey.id,
          message: canRetry ? '' : 'Check the journey and session, then retry if help is still needed.',
        })
        return null
      } finally {
        setBusy(previous => ({ ...previous, sos: false }))
        sosRequestRef.current = null
      }
    })()
    sosRequestRef.current = request
    return request
  }, [journey, monitor, handleSessionProblem])

  useEffect(() => {
    if (!journey?.id || emergency?.state !== 'local_pending') return undefined
    const retryWhenOnline = () => {
      if (navigator.onLine) sendSOS(emergency.source)
    }
    window.addEventListener('online', retryWhenOnline)
    return () => window.removeEventListener('online', retryWhenOnline)
  }, [journey?.id, emergency?.state, emergency?.source, sendSOS])

  const endJourney = async () => {
    if (!journey) return
    setBusy(previous => ({ ...previous, end: true }))
    try {
      const completed = await completeJourney(journey.id)
      setJourney(completed)
      setMonitor(previous => previous ? { ...previous, status: 'COMPLETED' } : previous)
      setLocationSharing(false)
      setLocationState('inactive')
      setJourneys(previous => previous.map(item => item.id === completed.id ? completed : item))
      setPageNotice('Journey completed. GPS sharing has stopped.')
    } catch (problem) {
      if (!handleSessionProblem(problem)) setJourneyError(problem.message)
    } finally { setBusy(previous => ({ ...previous, end: false })) }
  }

  const cancelJourney = async () => {
    if (!journey) return
    setBusy(previous => ({ ...previous, cancel: true }))
    try {
      const cancelled = await cancelJourneyRequest(journey.id)
      setJourney(cancelled)
      setMonitor(previous => previous ? { ...previous, status: 'CANCELLED' } : previous)
      setCheckIn(null)
      setLocationSharing(false)
      setLocationState('inactive')
      setJourneys(previous => previous.map(item => item.id === cancelled.id ? cancelled : item))
      setPageNotice('Journey cancelled. GPS tracking and Voice SOS have stopped.')
    } catch (problem) {
      if (!handleSessionProblem(problem)) setJourneyError(problem.message)
    } finally { setBusy(previous => ({ ...previous, cancel: false })) }
  }

  const signOut = async () => {
    try { await logOut() } catch { /* Clear local data if the server session has already ended. */ }
    clearLocalSession()
    setAuthError('')
  }

  const acceptInvitation = async code => {
    try {
      await acceptGuardianInvitation(code)
      await refreshGuardian()
    } catch (problem) {
      handleSessionProblem(problem)
      throw problem
    }
  }

  const openJourney = id => navigate(`/app/journey/${id}`)
  const openGuardianJourney = id => navigate(`/guardian/journey/${id}`)
  const retryJourney = () => riderJourneyId && refreshJourney(riderJourneyId).catch(problem => { if (!handleSessionProblem(problem)) setJourneyError(problem.message) })
  const retryGuardianJourney = () => guardianJourneyId && refreshGuardianJourney(guardianJourneyId).catch(problem => { if (!handleSessionProblem(problem)) setGuardianError(problem.message) })

  const onRetryLocation = () => {
    setJourneyError('')
    setLocationState('requesting')
    setLocationSharing(true)
  }

  const page = (() => {
    if (!authReady) return <main className="grid min-h-screen place-items-center bg-[#f4f6f5] text-slate-700" role="status">Loading VectrSafe…</main>
    if (!user) return <AuthPage key={path.startsWith('/register') ? 'register' : 'login'} initialMode={path.startsWith('/register') ? 'register' : 'login'} onModeChange={mode => {
      const destination = mode === 'register' ? '/register' : '/login'
      const returnTarget = window.location.pathname.startsWith('/guardian')
        ? `${window.location.pathname}${window.location.search}`
        : new URLSearchParams(window.location.search).get('next')
      navigate(returnTarget ? `${destination}?next=${encodeURIComponent(returnTarget)}` : destination)
    }} onSubmit={submitAuth} connectionError={authError} onRetry={retryAuth} />
    if (path === '/login' || path === '/register' || path === '/') return null
    if (path === '/app/journey/new') return <StartJourneyPage user={user} contacts={contacts} onNavigate={navigate} onLogout={signOut} onStart={startJourney} />
    if (riderJourneyId) {
      if (journeyLoading && !journey) return <main className="grid min-h-[70vh] place-items-center text-slate-700" role="status">Loading journey…</main>
      if (!journey) return <main className="mx-auto mt-12 max-w-xl rounded-2xl border bg-white p-6"><h1 className="text-xl font-black">Journey unavailable</h1><p className="mt-2 text-sm text-slate-600">This journey could not be found or is not available to your account.</p><button onClick={() => navigate('/app/home')} className="mt-4 font-bold text-teal-900 underline">Return home</button></main>
      return <LiveJourneyPage user={user} journey={{ ...journey, error: journeyError }} monitor={monitor || normalizeJourney(journey)} checkIn={checkIn} alert={alert} emergency={emergency} socketState={socketState} locationState={locationState} gpsSync={gpsSync} busy={busy} onNavigate={navigate} onLogout={signOut} onRespond={respond} onSos={sendSOS} onRetryLocation={onRetryLocation} onEnd={endJourney} onCancel={cancelJourney} onRefresh={retryJourney} />
    }
    if (path === '/app/journeys') return <JourneyHistoryPage user={user} journeys={journeys} loading={dashboardLoading} error={dashboardError} onNavigate={navigate} onLogout={signOut} onOpen={openJourney} onRetry={refreshDashboard} />
    if (path === '/app/trusted-contacts') return <TrustedContactsPage user={user} contacts={contacts} loading={dashboardLoading} error={dashboardError} invitation={invitation} onNavigate={navigate} onLogout={signOut} onCreate={addContact} onRemove={deleteContact} onDismissInvitation={() => setInvitation(null)} onRetry={refreshDashboard} />
    if (path === '/guardian/journeys' || path === '/guardian') return <GuardianDashboardPage user={user} journeys={guardianJourneys} loading={guardianLoading} error={guardianError} onNavigate={navigate} onLogout={signOut} onOpen={openGuardianJourney} onAccept={acceptInvitation} onRetry={refreshGuardian} />
    if (guardianJourneyId) {
      if (guardianLoading && !guardianJourney) return <main className="grid min-h-[70vh] place-items-center text-slate-700" role="status">Loading shared journey…</main>
      if (!guardianJourney) return <main className="mx-auto mt-12 max-w-xl rounded-2xl border bg-white p-6"><h1 className="text-xl font-black">Shared journey unavailable</h1><p className="mt-2 text-sm text-slate-600">This journey is not available to your guardian account.</p><button onClick={() => navigate('/guardian/journeys')} className="mt-4 font-bold text-teal-900 underline">Return to guardian dashboard</button></main>
      return <GuardianJourneyPage user={user} journey={guardianJourney} socketState={socketState} error={guardianError} onNavigate={navigate} onLogout={signOut} onRetry={retryGuardianJourney} />
    }
    if (path === '/app/home') return <HomePage user={user} journeys={journeys} contacts={contacts} loading={dashboardLoading} error={dashboardError} onNavigate={navigate} onLogout={signOut} onOpenJourney={openJourney} onRetry={refreshDashboard} />
    return <main className="mx-auto mt-12 max-w-xl rounded-2xl border bg-white p-6"><h1 className="text-xl font-black">Page not found</h1><button onClick={() => navigate('/app/home')} className="mt-4 font-bold text-teal-900 underline">Go to home</button></main>
  })()

  return <>
    {page}
    {pageNotice && user && <div role="status" aria-live="polite" className="fixed bottom-3 left-1/2 z-[1000] w-[min(94vw,42rem)] -translate-x-1/2 rounded-xl bg-[#142a32] p-3 text-center text-sm text-white shadow-xl sm:bottom-5">{pageNotice}<button onClick={() => setPageNotice('')} className="ml-3 min-h-8 rounded px-2 font-bold underline">Dismiss</button></div>}
  </>
}

export default App
