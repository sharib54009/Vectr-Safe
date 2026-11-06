import { useCallback, useEffect, useRef, useState } from 'react'

function speechApi() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function supportsPrivateRecognition() {
  const Recognition = speechApi()
  return Boolean(Recognition && Recognition.prototype
    && 'processLocally' in Recognition.prototype
    && typeof Recognition.available === 'function')
}

function normalizePhrase(value) {
  return value.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function VoiceSOSControl({ activeJourney, emergencyActive, busy, onActivate }) {
  const supported = supportsPrivateRecognition()
  const [state, setState] = useState('DISABLED')
  const [message, setMessage] = useState('Voice SOS availability depends on browser permissions and device capabilities.')
  const recognitionRef = useRef(null)
  const enabledRef = useRef(false)
  const triggeredRef = useRef(false)
  const restartsRef = useRef(0)
  const restartTimerRef = useRef(null)
  const activationTokenRef = useRef(0)
  const mountedRef = useRef(true)
  const onActivateRef = useRef(onActivate)
  useEffect(() => { onActivateRef.current = onActivate }, [onActivate])

  const stopRecognition = useCallback(() => {
    enabledRef.current = false
    if (restartTimerRef.current) window.clearTimeout(restartTimerRef.current)
    restartTimerRef.current = null
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.stop() } catch { /* It may already have stopped. */ }
    }
  }, [])

  const activate = useCallback(() => {
    if (triggeredRef.current) return
    triggeredRef.current = true
    setState('TRIGGERED')
    setMessage('Emergency voice trigger detected. Sending SOS to VectrSafe…')
    stopRecognition()
    onActivateRef.current('VOICE')
  }, [stopRecognition])

  const startRecognition = useCallback(() => {
    if (!enabledRef.current || !activeJourney || emergencyActive) return
    const Recognition = speechApi()
    if (!Recognition) {
      setState('UNSUPPORTED')
      setMessage("Voice SOS isn't supported by this browser. You can still use the SOS button.")
      return
    }
    try {
      const recognition = new Recognition()
      recognition.processLocally = true
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = false
      recognition.lang = 'en-US'
      recognition.onstart = () => setState('ACTIVE')
      recognition.onresult = event => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          if (!event.results[index].isFinal) continue
          const phrase = normalizePhrase(event.results[index][0]?.transcript || '')
          restartsRef.current = 0
          if (phrase === 'confirm sos' || phrase === 'vectrsafe confirm sos') {
            activate()
            return
          }
          if (phrase === 'sos') {
            setState('NEEDS_CONFIRMATION')
            setMessage('“SOS” was heard. Tap Confirm voice SOS to send, or dismiss this prompt.')
          }
        }
      }
      recognition.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopRecognition()
          setState('PERMISSION_DENIED')
          setMessage('Microphone permission is required to use Voice SOS. Allow it in browser settings, then reload this journey.')
        } else if (event.error === 'audio-capture') {
          stopRecognition()
          setState('ERROR')
          setMessage('No microphone is available. You can still use the SOS button.')
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          stopRecognition()
          setState('ERROR')
          setMessage('Voice SOS stopped unexpectedly. You can still use the SOS button.')
        }
      }
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null
        if (!enabledRef.current || triggeredRef.current || !activeJourney || emergencyActive) return
        restartsRef.current += 1
        if (restartsRef.current > 3) {
          enabledRef.current = false
          setState('ERROR')
          setMessage('Voice recognition stopped. Enable it again if needed; the SOS button remains available.')
          return
        }
        setState('ENABLING')
        restartTimerRef.current = window.setTimeout(startRecognition, restartsRef.current * 1000)
      }
      recognition.start()
    } catch {
      stopRecognition()
      setState('ERROR')
      setMessage('Voice SOS could not start on this device. You can still use the SOS button.')
    }
  }, [activeJourney, emergencyActive, activate, stopRecognition])

  const enable = async () => {
    if (!activeJourney || emergencyActive || !supported || state === 'PERMISSION_DENIED' || state === 'ENABLING') return
    const activationToken = ++activationTokenRef.current
    setState('ENABLING')
    setMessage('Requesting microphone permission…')
    try {
      const Recognition = speechApi()
      if (!supportsPrivateRecognition()) {
        setState('UNSUPPORTED')
        setMessage('This browser cannot confirm on-device speech recognition. Voice SOS is unavailable here; use the SOS button.')
        return
      }
      let availability
      try {
        availability = await Recognition.available({ langs: ['en-US'], processLocally: true, quality: 'command' })
      } catch {
        setState('UNSUPPORTED')
        setMessage('On-device speech recognition could not be checked on this browser. Use the SOS button.')
        return
      }
      if (availability !== 'available') {
        setState('UNSUPPORTED')
        setMessage('On-device English speech recognition is not available on this device. Use the SOS button.')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable')
      if (navigator.permissions?.query) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' })
          if (permission.state === 'denied') throw new DOMException('Permission denied', 'NotAllowedError')
        } catch (error) {
          if (error?.name === 'NotAllowedError') throw error
        }
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      if (!mountedRef.current || activationToken !== activationTokenRef.current || !activeJourney || emergencyActive) return
      triggeredRef.current = false
      restartsRef.current = 0
      enabledRef.current = true
      setMessage('Voice SOS active. Say “Confirm SOS” to send. Saying “SOS” alone asks for a tap confirmation. Speech recognition is restricted to on-device processing; VectrSafe does not record or upload audio.')
      startRecognition()
    } catch (error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setState('PERMISSION_DENIED')
        setMessage('Microphone permission is required to use Voice SOS. Allow it in browser settings, then reload this journey.')
      } else {
        setState('ERROR')
        setMessage('A microphone could not be opened on this device. You can still use the SOS button.')
      }
    }
  }

  const disable = () => {
    activationTokenRef.current += 1
    stopRecognition()
    setState('DISABLED')
    setMessage('Voice SOS is disabled. The SOS button is always available.')
  }

  useEffect(() => {
    if (!activeJourney || emergencyActive) {
      activationTokenRef.current += 1
      stopRecognition()
      if (state !== 'TRIGGERED') {
        setState('DISABLED')
        setMessage(emergencyActive ? 'Voice SOS stopped because an emergency alert is active.' : 'Voice SOS is unavailable because this journey has ended.')
      }
    }
  }, [activeJourney, emergencyActive, state, stopRecognition])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      activationTokenRef.current += 1
      stopRecognition()
    }
  }, [stopRecognition])

  if (!activeJourney) return null
  if (!supported) return <section className="rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-800" aria-label="Voice SOS unavailable"><p className="font-bold">Voice SOS unavailable</p><p className="mt-1">Voice SOS isn't supported by this browser. You can still use the SOS button.</p><p className="mt-1 text-xs text-slate-500">Availability depends on browser permissions and device capabilities.</p></section>

  const isActive = state === 'ACTIVE' || state === 'NEEDS_CONFIRMATION' || state === 'ENABLING'
  return <section className="rounded-xl border border-slate-300 bg-white p-3 text-slate-900" aria-label="Voice SOS controls">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2"><span aria-hidden="true">{isActive ? '🎙' : state === 'TRIGGERED' ? '⚠️' : '○'}</span><h2 className="font-bold">{state === 'ACTIVE' ? 'Voice SOS Active' : state === 'TRIGGERED' ? 'Voice SOS Triggered' : 'Voice SOS'}</h2></div>
      {state === 'DISABLED' || state === 'ERROR' ? <button type="button" disabled={emergencyActive} onClick={enable} className="min-h-10 rounded-lg border border-slate-400 px-3 text-sm font-bold disabled:opacity-50">Enable Voice SOS</button> : isActive ? <button type="button" onClick={disable} className="min-h-10 rounded-lg border border-slate-400 px-3 text-sm font-bold">Disable</button> : null}
      {state === 'NEEDS_CONFIRMATION' && <button type="button" disabled={busy || emergencyActive} onClick={activate} className="min-h-10 rounded-lg bg-rose-700 px-3 text-sm font-bold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Confirm voice SOS'}</button>}
      {state === 'PERMISSION_DENIED' && <span className="text-xs font-semibold">Permission denied</span>}
    </div>
    <p className="mt-1 text-sm text-slate-700" role="status" aria-live="polite">{message}</p>
  </section>
}
