import { useEffect, useRef, useState } from 'react'
import { connectToJourney } from '../api/journeys.js'

export default function useJourneySocket(journeyId, onEvent, onReconnect) {
  const eventRef = useRef(onEvent)
  const reconnectRef = useRef(onReconnect)
  const [state, setState] = useState(journeyId ? 'connecting' : 'disconnected')
  useEffect(() => { eventRef.current = onEvent }, [onEvent])
  useEffect(() => { reconnectRef.current = onReconnect }, [onReconnect])

  useEffect(() => {
    if (!journeyId) {
      setState('disconnected')
      return undefined
    }
    let closed = false
    let socket
    let retryTimer
    let attempts = 0
    let wasConnected = false
    setState('connecting')

    const connect = () => {
      if (closed) return
      setState(attempts ? 'reconnecting' : 'connecting')
      socket = connectToJourney(journeyId, event => eventRef.current?.(event), () => {
        if (closed || retryTimer) return
        setState('reconnecting')
        const delay = Math.min(15000, 750 * (2 ** Math.min(attempts, 4)))
        attempts += 1
        retryTimer = window.setTimeout(() => { retryTimer = null; connect() }, delay)
      }, () => {
        if (closed) return
        setState('connected')
        if (wasConnected) reconnectRef.current?.()
        wasConnected = true
        attempts = 0
      })
    }
    connect()
    return () => {
      closed = true
      if (retryTimer) window.clearTimeout(retryTimer)
      socket?.close()
    }
  }, [journeyId])
  return state
}
