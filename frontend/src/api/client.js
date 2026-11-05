const defaultApiHost = `${window.location.protocol}//${window.location.hostname}:8001`

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || defaultApiHost).replace(/\/$/, '')
export const WS_BASE_URL = (import.meta.env.VITE_WS_BASE_URL || API_BASE_URL.replace(/^http/, 'ws')).replace(/\/$/, '')

function csrfToken() {
  const cookie = document.cookie.split('; ').find(part => part.startsWith('csrftoken='))
  return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : ''
}

export async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const headers = new Headers(options.headers || {})
  const hasBody = options.body !== undefined
  if (hasBody && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    const csrfResponse = await fetch(`${API_BASE_URL}/api/auth/csrf/`, { credentials: 'include' }).catch(() => {
      throw new Error(`Can’t connect to VectrSafe at ${API_BASE_URL}. Start the Django server and try again.`)
    })
    if (!csrfResponse.ok) throw new Error('VectrSafe could not prepare a secure request. Try again.')
    const token = csrfToken()
    if (token) headers.set('X-CSRFToken', token)
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new Error(`Can’t connect to VectrSafe at ${API_BASE_URL}. Check that the Django server is running.`)
  }
  if (response.status === 204) return null
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      const problem = new Error('Your session may have expired, or this account is not authorized. Sign in again and retry.')
      problem.status = response.status
      throw problem
    }
    const detail = data.detail || data.error || data.non_field_errors?.[0]
    const fieldError = Object.values(data).flat().find(value => typeof value === 'string')
    const problem = new Error(detail || fieldError || `Request failed (${response.status}).`)
    problem.status = response.status
    throw problem
  }
  return data
}

export function post(path, data, headers = {}) {
  return request(path, { method: 'POST', body: JSON.stringify(data), headers })
}
