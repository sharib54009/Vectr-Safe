export function journeyActive(status) {
  return ['ACTIVE', 'HIGH_RISK', 'ESCALATED'].includes(status)
}

export function formatDuration(startedAt, endedAt) {
  if (!startedAt) return '—'
  const total = Math.max(0, Math.floor(((endedAt ? new Date(endedAt) : new Date()) - new Date(startedAt)) / 60000))
  if (total < 60) return `${total} min`
  return `${Math.floor(total / 60)} hr ${total % 60} min`
}

export function locationDistance(points = []) {
  if (points.length < 2) return 0
  const radians = degrees => degrees * Math.PI / 180
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const dLat = radians(b.latitude - a.latitude)
    const dLng = radians(b.longitude - a.longitude)
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2
    total += 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  }
  return total
}

export function formatStatus(status = '') {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
}
