import { fetchWithRetry } from './fetch'

export interface GooglePlaceResult {
  id: string
  googlePlaceId: string
  name: string
  type: string
  address: string
  rating: number | null
  priceLevel: number | null
  photoRefs: string[]
  latitude: number
  longitude: number
  website: string | null
  phone: string | null
  hours: string[] | null
}

const API_KEY = import.meta.env.VITE_GOOGLE_PLACES_API_KEY
const BASE = 'https://places.googleapis.com/v1'

function isAvailable(): boolean {
  return !!API_KEY
}

const TYPE_MAP: Record<string, string> = {
  bar: 'bar',
  restaurant: 'restaurant',
  cafe: 'cafe',
  night_club: 'club',
  lounge: 'lounge',
  food: 'restaurant',
  meal_takeaway: 'restaurant',
  meal_delivery: 'restaurant',
  pub: 'bar',
  bakery: 'cafe',
  coffee_shop: 'cafe',
}

export function mapGoogleType(types: string[]): string {
  for (const t of types) {
    const mapped = TYPE_MAP[t]
    if (mapped) return mapped
  }
  return 'restaurant'
}

export function getPhotoUrl(photoName: string, maxHeight = 400): string {
  return `${BASE}/${photoName}/media?maxHeightPx=${maxHeight}&key=${API_KEY}`
}

export async function searchGooglePlaces(
  query: string,
  typeFilter?: string | null,
  location?: { latitude: number; longitude: number } | null,
): Promise<GooglePlaceResult[]> {
  if (!isAvailable()) return []

  const body: Record<string, unknown> = { textQuery: query }
  if (typeFilter) {
    const includedTypes = [typeFilter]
    if (typeFilter === 'club') includedTypes.push('night_club')
    body.includedTypes = includedTypes
  }
  if (location) {
    body.locationBias = {
      circle: {
        center: { latitude: location.latitude, longitude: location.longitude },
        radius: 10000,
      },
    }
  }

  const res = await fetchWithRetry(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.formattedAddress',
        'places.types',
        'places.rating',
        'places.priceLevel',
        'places.photos',
        'places.location',
        'places.websiteUri',
        'places.nationalPhoneNumber',
        'places.regularOpeningHours',
      ].join(','),
    },
    body: JSON.stringify(body),
    timeout: 8000,
    retries: 1,
    backoff: 500,
  })

  if (!res.ok) {
    const text = await res.text()
    console.warn('Google Places search error:', res.status, text)
    return []
  }

  const data = await res.json()
  return (data.places || []).map((p: Record<string, unknown>) => parseGooglePlace(p))
}

function parseGooglePlace(p: Record<string, unknown>): GooglePlaceResult {
  const name = (p.displayName as Record<string, string>)?.text || (p as Record<string, string>).name || ''
  const types = (p.types as string[]) || []
  const photos = (p.photos as Record<string, string>[]) || []
  const loc = p.location as Record<string, number> | undefined
  const hours = p.regularOpeningHours as Record<string, unknown> | undefined

  return {
    id: `google_${p.id}`,
    googlePlaceId: p.id as string,
    name,
    type: mapGoogleType(types),
    address: (p.formattedAddress as string) || '',
    rating: (p.rating as number) ?? null,
    priceLevel: (p.priceLevel as number) ?? null,
    photoRefs: photos.map((ph) => ph.name as string),
    latitude: loc?.lat || 0,
    longitude: loc?.lng || 0,
    website: (p.websiteUri as string) || null,
    phone: (p.nationalPhoneNumber as string) || null,
    hours: hours?.weekdayDescriptions as string[] | null,
  }
}

export async function getGooglePlaceDetails(placeId: string): Promise<GooglePlaceResult | null> {
  if (!isAvailable()) return null

  const cleanId = placeId.replace(/^google_/, '')
  const res = await fetchWithRetry(`${BASE}/places/${cleanId}`, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': [
        'id',
        'displayName',
        'formattedAddress',
        'types',
        'rating',
        'priceLevel',
        'photos',
        'location',
        'websiteUri',
        'nationalPhoneNumber',
        'regularOpeningHours',
        'editorialSummary',
      ].join(','),
    },
    timeout: 8000,
    retries: 1,
    backoff: 500,
  })

  if (!res.ok) {
    console.warn('Google Places detail error:', res.status)
    return null
  }

  const data = await res.json()
  return parseGooglePlace(data)
}
