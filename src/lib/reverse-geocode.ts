import { fetchWithTimeout } from './fetch'
import type { ParsedAddress } from './address'

/* ───── Photon ─────
 * Free, keyless, OSM-backed. Documented at https://photon.komoot.io
 * Returns `features[0].properties: { city|town|village|hamlet|suburb, county|state, country }`
 */
interface PhotonProperties {
  city?: string
  town?: string
  village?: string
  hamlet?: string
  suburb?: string
  county?: string
  state?: string
  country?: string
}

interface PhotonFeature {
  properties?: PhotonProperties
  geometry?: { coordinates?: [number, number] }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

/* ───── BigDataCloud ─────
 * Free client-side reverse-geocode endpoint, keyless. Returns admin-level info
 * including country/subdivision/locality.
 */
interface BigDataCloudResponse {
  city?: string
  locality?: string
  principalSubdivision?: string
  countryName?: string
}

const TIMEOUT_MS = 5000
const BACKFILL_THROTTLE_MS = 200

function pickCityFromPhoton(props: PhotonProperties): string | undefined {
  return props.city || props.town || props.village || props.hamlet || props.suburb
}

function pickCountyFromPhoton(props: PhotonProperties): string | undefined {
  return props.county || props.state
}

async function fetchPhoton(lng: number, lat: number): Promise<ParsedAddress | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lon=${encodeURIComponent(String(lng))}&lat=${encodeURIComponent(String(lat))}`
    const res = await fetchWithTimeout(url, { timeout: TIMEOUT_MS })
    if (!res.ok) return null
    const data = (await res.json()) as PhotonResponse
    const feature = data.features?.[0]
    if (!feature) return null
    const props = feature.properties || {}
    return {
      city: pickCityFromPhoton(props),
      county: pickCountyFromPhoton(props),
      country: props.country,
    }
  } catch {
    return null
  }
}

async function fetchBigDataCloud(lng: number, lat: number): Promise<ParsedAddress | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lng))}&localityLanguage=en`
    const res = await fetchWithTimeout(url, { timeout: TIMEOUT_MS })
    if (!res.ok) return null
    const data = (await res.json()) as BigDataCloudResponse
    return {
      city: data.city || data.locality,
      county: data.principalSubdivision,
      country: data.countryName,
    }
  } catch {
    return null
  }
}

/**
 * Resolve the city, county, and country for a lng/lat, trying Photon first and
 * BigDataCloud as a fallback. Returns `{}` if both providers fail.
 */
export async function getCityFromLngLat(lng: number, lat: number): Promise<ParsedAddress> {
  const fromPhoton = await fetchPhoton(lng, lat)
  if (fromPhoton && (fromPhoton.city || fromPhoton.country || fromPhoton.county)) return fromPhoton
  const fromBdc = await fetchBigDataCloud(lng, lat)
  if (fromBdc && (fromBdc.city || fromBdc.country || fromBdc.county)) return fromBdc
  return {}
}

/**
 * Build a Nominatim-style comma-separated address string from an lng/lat using
 * the same provider chain. Returns null if neither provider yields useful info.
 */
export async function composeAddressFromLngLat(
  lng: number,
  lat: number,
  prefix?: string,
): Promise<string | null> {
  const r = await getCityFromLngLat(lng, lat)
  if (!r.city && !r.country && !r.county) return null
  const parts: string[] = []
  if (prefix) parts.push(prefix)
  if (r.city) parts.push(r.city)
  if (r.county && r.county !== r.city) parts.push(r.county)
  if (r.country) parts.push(r.country)
  return parts.join(', ')
}

/** Throttle used by the admin back-fill pass to be polite to upstream APIs. */
export const BACKFILL_THROTTLE = BACKFILL_THROTTLE_MS

export function sleepThrottle(ms: number = BACKFILL_THROTTLE_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
