import type { Place } from './types'

const STORAGE_KEY = 'checkin_local_places'

function getAll(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveAll(places: Place[]): void {
  // localStorage writes can throw QuotaExceededError on Safari / iOS once the
  // browser hits its per-origin storage cap (typically after many cached
  // check-ins / places accumulate). Treat as best-effort: never throw so
  // callers (e.g. batchUpsertPlaces) can continue and still reach the server.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places))
  } catch (e) {
    if (isQuotaError(e)) {
      console.warn('localStorage full — skipping per-place cache write (Supabase still has the row)')
    } else {
      console.warn('local-places saveAll failed:', e)
    }
  }
}

/**
 * True when the thrown value is the browser's QuotaExceededError, which has
 * either a `name === 'QuotaExceededError'` (DOMException on Safari/Chrome) or
 * a recognizable message on Firefox/Linux without a real DOMException class.
 */
export function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const name = (e as { name?: string }).name
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true
  const msg = (e as { message?: string }).message
  return typeof msg === 'string' && /quota\s+has\s+been\s+exceeded/i.test(msg)
}

export function cachePlace(place: Place): void {
  const list = getAll()
  const existing = list.findIndex((p) => p.id === place.id)
  if (existing >= 0) {
    list[existing] = place
  } else {
    list.push(place)
  }
  saveAll(list)
}

export function getCachedPlace(id: string): Place | null {
  return getAll().find((p) => p.id === id) || null
}

export function getAllCachedPlaces(): Place[] {
  return getAll()
}

export function searchCachedPlaces(query: string): Place[] {
  const lower = query.toLowerCase()
  return getAll().filter((p) => p.name.toLowerCase().includes(lower))
}
