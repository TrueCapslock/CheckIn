import { fetchWithRetry } from './fetch'

export interface OverpassResult {
  id: string
  name: string
  type: string
  address: string
  latitude: number
  longitude: number
  website?: string | null
  phone?: string | null
  hours?: string | null
}

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

const TYPE_TAGS: Record<string, string[]> = {
  bar: ['["amenity"="bar"]'],
  restaurant: ['["amenity"="restaurant"]'],
  cafe: ['["amenity"="cafe"]'],
  club: ['["amenity"="nightclub"]'],
  lounge: ['["amenity"="bar"]', '["amenity"="nightclub"]'],
  park: ['["leisure"="park"]', '["leisure"="garden"]'],
  hotel: ['["tourism"="hotel"]'],
  things_to_do: ['["tourism"="attraction"]', '["tourism"="museum"]', '["tourism"="artwork"]', '["tourism"="gallery"]', '["historic"="monument"]'],
}

const ALL_TYPES = Object.keys(TYPE_TAGS)

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildQuery(
  filters: string[],
  location?: { latitude: number; longitude: number } | null,
  nameFilter?: string,
  radius?: number,
): string {
  const spatial = radius != null && location
    ? `(around:${radius},${location.latitude},${location.longitude})`
    : location
      ? `(around:10000,${location.latitude},${location.longitude})`
      : '(45.47,-122.73,45.55,-122.62)'

  const nameClause = nameFilter ? `["name"~"${escapeRegex(nameFilter)}",i]` : ''

  const lines: string[] = ['[out:json];(']
  for (const tag of filters) {
    lines.push(`  node${tag}${nameClause}${spatial};`)
    lines.push(`  way${tag}${nameClause}${spatial};`)
    lines.push(`  rel${tag}${nameClause}${spatial};`)
  }
  lines.push(');')
  lines.push('out center 500;')

  return lines.join('\n')
}

export function osmTagToType(tags: Record<string, string>): string {
  const amenity = tags.amenity || ''
  if (amenity === 'bar' && tags.cocktail) return 'lounge'
  if (amenity === 'bar') return 'bar'
  if (amenity === 'restaurant') return 'restaurant'
  if (amenity === 'cafe') return 'cafe'
  if (amenity === 'nightclub') return 'club'
  if (amenity === 'lounge') return 'lounge'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park'
  if (tags.tourism === 'hotel' || tags.tourism === 'motel' || tags.tourism === 'hostel') return 'hotel'
  if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.tourism === 'artwork' || tags.tourism === 'gallery' || tags.historic === 'monument') return 'things_to_do'
  return 'bar'
}

function parseElement(el: Record<string, unknown>): OverpassResult | null {
  const tags = el.tags as Record<string, string> | undefined
  if (!tags || !tags.name) return null

  const lat = (el.lat as number) ?? (el.center as Record<string, number> | undefined)?.lat ?? 0
  const lon = (el.lon as number) ?? (el.center as Record<string, number> | undefined)?.lon ?? 0

  if (!lat || !lon) return null

  const addrParts: string[] = []
  if (tags['addr:street']) {
    addrParts.push(tags['addr:housenumber'] ? `${tags['addr:housenumber']} ${tags['addr:street']}` : tags['addr:street'])
  }
  if (tags['addr:city']) addrParts.push(tags['addr:city'])
  if (tags['addr:postcode']) addrParts.push(tags['addr:postcode'])
  const address = addrParts.length ? addrParts.join(', ') : tags.name || ''

  const website = tags.website || tags['contact:website'] || null
  const phone = tags.phone || tags['contact:phone'] || null
  const hours = tags.opening_hours || null

  return {
    id: `osm_${el.type}_${el.id}`,
    name: tags.name,
    type: osmTagToType(tags),
    address,
    latitude: lat,
    longitude: lon,
    website,
    phone,
    hours,
  }
}

async function fetchOverpass(ql: string): Promise<OverpassResult[]> {
  const body = new URLSearchParams({ data: ql })

  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        timeout: 60000,
        retries: 1,
        backoff: 1000,
      })

      if (!res.ok) {
        console.warn('Overpass API error at', url, res.status)
        continue
      }

      const contentType = res.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        console.warn('Overpass non-JSON response at', url)
        continue
      }

      const data = await res.json()
      const seen = new Set<string>()
      const results: OverpassResult[] = []

      for (const el of data.elements || []) {
        const parsed = parseElement(el)
        if (parsed && !seen.has(parsed.id)) {
          seen.add(parsed.id)
          results.push(parsed)
        }
      }

      return results
    } catch (e) {
      console.warn('Overpass fetch failed for', url, e)
    }
  }

  return []
}

function isLocalhost(): boolean {
  try {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export async function searchOverpassPlaces(
  query: string,
  typeFilter?: string | null,
  location?: { latitude: number; longitude: number } | null,
): Promise<OverpassResult[]> {
  if (isLocalhost()) return []
  const filters = typeFilter ? TYPE_TAGS[typeFilter] || [`["amenity"="${typeFilter}"]`] : ALL_TYPES.flatMap((t) => TYPE_TAGS[t])

  // Try 10km first, expand to 50km if no results
  for (const radius of [10000, 50000]) {
    const ql = buildQuery(filters, location, query, radius)
    const results = await fetchOverpass(ql)
    if (results.length > 0) return results
  }

  return []
}

export async function getOverpassPlaces(
  typeFilter?: string | null,
  location?: { latitude: number; longitude: number } | null,
): Promise<OverpassResult[]> {
  if (isLocalhost()) return []
  const filters = typeFilter ? TYPE_TAGS[typeFilter] || [`["amenity"="${typeFilter}"]`] : ALL_TYPES.flatMap((t) => TYPE_TAGS[t])
  const ql = buildQuery(filters, location)
  return fetchOverpass(ql)
}

export function overpassToPlace(o: OverpassResult) {
  return {
    id: o.id,
    name: o.name,
    type: o.type as string,
    address: o.address,
    description: null,
    photo_url: null,
    latitude: o.latitude,
    longitude: o.longitude,
    website: o.website ?? null,
    phone: o.phone ?? null,
    hours: o.hours ? [o.hours] : null,
    created_at: new Date().toISOString(),
  }
}
