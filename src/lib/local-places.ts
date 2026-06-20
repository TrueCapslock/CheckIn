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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(places))
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
