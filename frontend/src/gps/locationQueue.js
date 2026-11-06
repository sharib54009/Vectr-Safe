const DATABASE_NAME = 'vectrsafe-gps'
const STORE_NAME = 'pending-samples'
const DATABASE_VERSION = 2
const JOURNEY_STORE = 'journey-snapshots'

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Local location storage is unavailable in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'client_sample_id' })
        store.createIndex('journey_time', ['journey_id', 'timestamp'], { unique: false })
      }
      if (!database.objectStoreNames.contains(JOURNEY_STORE)) database.createObjectStore(JOURNEY_STORE, { keyPath: 'journey_id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local location storage.'))
  })
}

async function useStore(mode, operation) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)
    let result
    try { result = operation(store) } catch (error) { reject(error); database.close(); return }
    transaction.oncomplete = () => { database.close(); resolve(result?.result) }
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Local location storage failed.')) }
  })
}

export function queueLocationSample(sample) {
  return useStore('readwrite', store => store.put(sample))
}

export async function getQueuedLocations(journeyId) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).index('journey_time').getAll(
      IDBKeyRange.bound([Number(journeyId), ''], [Number(journeyId), '\uffff']),
    )
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.timestamp.localeCompare(b.timestamp)))
    request.onerror = () => reject(request.error || new Error('Could not read saved locations.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not read saved locations.')) }
  })
}

export function removeQueuedLocation(clientSampleId) {
  return useStore('readwrite', store => store.delete(clientSampleId))
}

export async function removeJourneyLocations(journeyId) {
  const samples = await getQueuedLocations(journeyId)
  if (!samples.length) return
  await useStore('readwrite', store => {
    for (const sample of samples) store.delete(sample.client_sample_id)
  })
}

export async function saveJourneySnapshot(journey) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(JOURNEY_STORE, 'readwrite')
    transaction.objectStore(JOURNEY_STORE).put(journey)
    transaction.oncomplete = () => { database.close(); resolve() }
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not save journey details locally.')) }
  })
}

export async function getJourneySnapshot(journeyId) {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(JOURNEY_STORE, 'readonly')
    const request = transaction.objectStore(JOURNEY_STORE).get(Number(journeyId))
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error || new Error('Could not read saved journey details.'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error || new Error('Could not read saved journey details.')) }
  })
}
