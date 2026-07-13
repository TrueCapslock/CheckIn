import { promiseWithTimeout } from './fetch'
import type { Place } from './types'

const BASE_URL = 'https://api.geoapify.com/v2/places'

/** Reported progress for long-running paginated imports. */
export interface GeoapifySearchProgress {
  /** Deduplicated places collected so far. */
  fetched: number
  /** 1-indexed page number currently being fetched (first page is 1). */
  page: number
  /** True when the last page returned fewer than MAX_PER_PAGE rows or the cap was hit. */
  done: boolean
}

// Only query categories we support in the app
const CATEGORIES = [
  'catering.bar',
  'catering.pub',
  'catering.restaurant',
  'catering.cafe',
  'catering.fast_food',
  'adult.nightclub',
  'leisure.park',
  'leisure.park.garden',
  'accommodation.hotel',
  'tourism.attraction',
  'entertainment.museum',
  'tourism.attraction.artwork',
  'entertainment.culture.gallery',
  'tourism.sights.memorial.monument',
]

interface GeoapifyFeature {
  properties: {
    name?: string
    place_id?: string
    formatted?: string
    address_line1?: string
    address_line2?: string
    lat?: number
    lon?: number
    categories?: string[]
    website?: string
    opening_hours?: string
    contact?: {
      phone?: string
      website?: string
    }
    datasource?: {
      phone?: string
      website?: string
      opening_hours?: string
    }
  }
  geometry?: {
    coordinates?: [number, number]
  }
}

function geoapifyType(categories: string[] = []): string {
  const cats = categories.join(' ')
  if (/catering\.bar/.test(cats)) return 'bar'
  if (/catering\.restaurant/.test(cats)) return 'restaurant'
  if (/catering\.cafe/.test(cats)) return 'cafe'
  if (/catering\.fast_food/.test(cats)) return 'restaurant'
  if (/catering/.test(cats)) return 'bar'
  if (/adult\.nightclub/.test(cats)) return 'club'
  if (/entertainment/.test(cats)) return 'things_to_do'
  if (/leisure\.park/.test(cats)) return 'park'
  if (/leisure/.test(cats)) return 'things_to_do'
  if (/accommodation/.test(cats)) return 'hotel'
  if (/tourism/.test(cats)) return 'things_to_do'
  if (/activity/.test(cats)) return 'club'
  if (/commercial/.test(cats)) return 'things_to_do'
  return 'bar'
}

function geoapifyToPlace(feature: GeoapifyFeature): Place | null {
  const p = feature.properties
  if (!p || !p.name) return null

  const lat = p.lat ?? feature.geometry?.coordinates?.[1] ?? null
  const lon = p.lon ?? feature.geometry?.coordinates?.[0] ?? null
  if (lat == null || lon == null) return null

  const id = p.place_id ? `geoapify_${p.place_id}` : `geoapify_${lat}_${lon}`

  const address = p.formatted || [p.address_line1, p.address_line2].filter(Boolean).join(', ') || ''

  const website = p.website || p.contact?.website || p.datasource?.website || null
  const phone = p.contact?.phone || p.datasource?.phone || null
  const hours = p.opening_hours || p.datasource?.opening_hours || null

  return {
    id,
    name: p.name,
    type: geoapifyType(p.categories),
    address,
    description: null,
    photo_url: null,
    latitude: lat,
    longitude: lon,
    phone,
    website,
    hours: hours ? [hours] : null,
    created_at: new Date().toISOString(),
  }
}

const MAX_PER_PAGE = 500
// Cheap runaway-loop guard, not a billing guard — Geoapify charges per request
// (not per result row) and has no documented hard cap on `offset`. 25k rows
// = 50 pages × 500, a generous headroom for any 10 km import.
const MAX_TOTAL = 25_000
// Honor the free-tier burst cap (5 req/sec) by serialising paged requests.
// Our loop is already serial; this is a belt-and-braces guard for if anyone
// later adds parallelism.
const REQUEST_INTERVAL_MS = 220

export async function searchGeoapifyPlaces(
  location: { latitude: number; longitude: number },
  radius = 10000,
  signal?: AbortSignal,
  onProgress?: (p: GeoapifySearchProgress) => void,
): Promise<Place[]> {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY
  if (!apiKey) return []

  const seen = new Set<string>()
  const places: Place[] = []
  const init: RequestInit = {}
  if (signal) init.signal = signal

  for (let offset = 0; ; offset += MAX_PER_PAGE) {
    if (offset > 0) {
      // Honour the 5 req/sec burst cap: ~220 ms between requests keeps us
      // comfortably under the ceiling without slowing single-page imports.
      await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS))
    }
    const params = new URLSearchParams({
      apiKey,
      categories: CATEGORIES.join(','),
      filter: `circle:${location.longitude},${location.latitude},${radius}`,
      limit: String(MAX_PER_PAGE),
      offset: String(offset),
    })

    const url = `${BASE_URL}?${params}`

    let features: GeoapifyFeature[] = []
    try {
      const res = await promiseWithTimeout(fetch(url, init), 20000, 'Geoapify')
      if (!res.ok) {
        console.warn('Geoapify API returned', res.status)
        onProgress?.({ fetched: places.length, page: offset / MAX_PER_PAGE + 1, done: true })
        break
      }
      const data = await res.json()
      features = (data.features || []) as GeoapifyFeature[]

      if (features.length === 0) {
        onProgress?.({ fetched: places.length, page: offset / MAX_PER_PAGE + 1, done: true })
        break
      }

      let capped = false
      for (const f of features) {
        if (places.length >= MAX_TOTAL) { capped = true; break }
        const place = geoapifyToPlace(f)
        if (place && !seen.has(place.id)) {
          seen.add(place.id)
          places.push(place)
        }
      }

      const done = capped || features.length < MAX_PER_PAGE
      onProgress?.({ fetched: places.length, page: offset / MAX_PER_PAGE + 1, done })
      if (done) break
    } catch (e) {
      console.warn('Geoapify search failed:', e)
      onProgress?.({ fetched: places.length, page: offset / MAX_PER_PAGE + 1, done: true })
      break
    }
  }

  return places
}
