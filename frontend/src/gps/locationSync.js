import { getQueuedLocations, removeQueuedLocation } from './locationQueue.js'
import { submitLocation } from '../api/journeys.js'

const activeSyncs = new Map()
const retryWindows = new Map()

export function syncQueuedLocations(journeyId, onSample) {
  const key = String(journeyId)
  if (activeSyncs.has(key)) return activeSyncs.get(key)
  const retryAt = retryWindows.get(key)
  if (retryAt && retryAt.until > Date.now()) return Promise.resolve({ remaining: true, deferred: true, retryAfter: retryAt.until - Date.now() })
  const sync = (async () => {
    while (true) {
      const samples = await getQueuedLocations(journeyId)
      const sample = samples[0]
      if (!sample) return { remaining: false }
      if (!navigator.onLine) return { remaining: true, interrupted: true }
      try {
        const result = await submitLocation(journeyId, sample)
        await removeQueuedLocation(sample.client_sample_id)
        retryWindows.delete(key)
        onSample?.(result)
      } catch (error) {
        const attempts = (retryWindows.get(key)?.attempts || 0) + 1
        const retryAfter = Math.min(60_000, 5_000 * (2 ** Math.min(attempts - 1, 4)))
        retryWindows.set(key, { attempts, until: Date.now() + retryAfter })
        return { remaining: true, error, retryAfter }
      }
    }
  })().finally(() => activeSyncs.delete(key))
  activeSyncs.set(key, sync)
  return sync
}
