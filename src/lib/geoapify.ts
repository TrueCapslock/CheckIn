import { promiseWithTimeout } from './fetch'
import type { Place } from './types'

const BASE_URL = 'https://api.geoapify.com/v2/places'

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
const MAX_TOTAL = 2000

export async function searchGeoapifyPlaces(
  location: { latitude: number; longitude: number },
  radius = 10000,
  signal?: AbortSignal,
): Promise<Place[]> {
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY
  if (!apiKey) return []

  const seen = new Set<string>()
  const places: Place[] = []
  const init: RequestInit = {}
  if (signal) init.signal = signal

  for (let offset = 0; ; offset += MAX_PER_PAGE) {
    const params = new URLSearchParams({
      apiKey,
      categories: CATEGORIES.join(','),
      filter: `circle:${location.longitude},${location.latitude},${radius}`,
      limit: String(MAX_PER_PAGE),
      offset: String(offset),
    })

    const url = `${BASE_URL}?${params}`

    try {
      const res = await promiseWithTimeout(fetch(url, init), 20000, 'Geoapify')
      if (!res.ok) {
        console.warn('Geoapify API returned', res.status)
        break
      }
      const data = await res.json()
      const features: GeoapifyFeature[] = data.features || []

      if (features.length === 0) break

      for (const f of features) {
        const place = geoapifyToPlace(f)
        if (place && !seen.has(place.id)) {
          seen.add(place.id)
          places.push(place)
          if (places.length >= MAX_TOTAL) break
        }
      }

      if (features.length < MAX_PER_PAGE || places.length >= MAX_TOTAL) break
    } catch (e) {
      console.warn('Geoapify search failed:', e)
      break
    }
  }

  return places
}
