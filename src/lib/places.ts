import type { Place, CheckIn } from './types'
import { addToQueue, getQueue, isOnline } from './sync'
import { cachePlace, getAllCachedPlaces, getCachedPlace, searchCachedPlaces } from './local-places'
import { awardCoins, awardPoints, calcCheckInBonus, getMayorFromCheckIns, getUserCheckInCountFromCheckIns, getCheckInStreaks } from './points'
import type { UnlockResult } from './achievements'
import type { LevelDef } from './levels'
import { checkAchievements } from './achievements'
import { getUsername } from './user'
import { getFollowing } from './follow'
import { fetchWithRetry, promiseWithTimeout } from './fetch'
import { composeAddressFromLngLat } from './reverse-geocode'
import { parsePlaceAddress } from './address'
import { getDistance } from './location'
import { getMaxCheckInDistance } from './admin'
import { getTodayLocal, isoToLocalDate } from './date'
import { sendCheckInMessage } from './messages'

const inFlight = new Map<string, Promise<unknown>>()

function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

const PLACES_LIST_CACHE_KEY = 'checkin_places_list_cache'
const PLACES_LIST_CACHE_TIME_KEY = 'checkin_places_list_cache_time'
const PLACES_CACHE_TTL_MS = 300_000 // 5 minutes

function loadPlacesListCache(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(PLACES_LIST_CACHE_KEY) || '[]')
  } catch {
    return []
  }
}

function savePlacesListCache(places: Place[]) {
  try {
    localStorage.setItem(PLACES_LIST_CACHE_KEY, JSON.stringify(places))
    localStorage.setItem(PLACES_LIST_CACHE_TIME_KEY, String(Date.now()))
  } catch { /* ignore */ }
}

function isPlacesCacheStale(): boolean {
  try {
    const t = parseInt(localStorage.getItem(PLACES_LIST_CACHE_TIME_KEY) || '0', 10)
    return Date.now() - t > PLACES_CACHE_TTL_MS
  } catch {
    return true
  }
}

function filterPlacesByType(places: Place[], type?: string | null): Place[] {
  return type ? places.filter((p) => p.type === type) : places
}

export function mergePlaces(existing: Place[], incoming: Place[]): Place[] {
  const byId = new Map<string, Place>()
  for (const p of existing) byId.set(p.id, p)
  for (const p of incoming) byId.set(p.id, p)
  return [...byId.values()]
}

export function getCachedPlaces(type?: string | null): Place[] {
  return filterPlacesByType(loadPlacesListCache(), type)
}

function loadMockCheckIns(): CheckIn[] {
  try { return JSON.parse(localStorage.getItem('checkin_mock_checkins') || '[]') } catch { return [] }
}
function saveMockCheckIns(ins: CheckIn[]) {
  localStorage.setItem('checkin_mock_checkins', JSON.stringify(ins))
}
const mockCheckIns: CheckIn[] = loadMockCheckIns()

function hasSupabaseEnv(): boolean {
  try {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  } catch {
    return false
  }
}

async function getClient() {
  const { supabase } = await import('./supabase')
  return supabase
}

export async function getPlaces(
  type?: string | null,
  userLocation?: { latitude: number; longitude: number } | null,
): Promise<Place[]> {
  const cached = getCachedPlaces(type)
  if (cached.length > 0 && !isPlacesCacheStale()) return cached
  const key = `getPlaces:${type ?? '*'}:${userLocation ? `${userLocation.latitude},${userLocation.longitude}` : 'nil'}`
  return dedup(key, () => refreshPlaces(type, userLocation))
}

export async function refreshPlaces(
  type?: string | null,
  _userLocation?: { latitude: number; longitude: number } | null,
): Promise<Place[]> {
  const results: Place[] = []
  const seen = new Set<string>()

  // Supabase first (fast cached places)
  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      let query = supabase.from('places').select('*')
      if (type) query = query.eq('type', type)
      const { data, error } = await promiseWithTimeout(query, 3000, 'Supabase getPlaces')
      if (!error && data) {
        for (const p of data as Place[]) {
          if (!seen.has(p.id)) {
            seen.add(p.id)
            results.push(p)
          }
        }
      }
    } catch (e) { console.warn('Supabase getPlaces failed:', e) }
  }

  const local = filterPlacesByType(getAllCachedPlaces(), type)
  const mergedResults = mergePlaces(results, local)

  // Merge so type-filtered refreshes don't wipe out other types from cache
  savePlacesListCache(mergePlaces(loadPlacesListCache(), mergedResults))
  return mergedResults
}

export async function searchPlaces(
  query: string,
  userLocation?: { latitude: number; longitude: number } | null,
): Promise<Place[]> {
  const key = `searchPlaces:${query}:${userLocation ? `${userLocation.latitude},${userLocation.longitude}` : 'nil'}`
  return dedup(key, () => searchPlacesImpl(query, userLocation))
}

async function searchPlacesImpl(
  query: string,
  _userLocation?: { latitude: number; longitude: number } | null,
): Promise<Place[]> {
  const trimmed = query.trim()
  if (!trimmed) return getCachedPlaces()

  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      const { data, error } = await promiseWithTimeout(
        supabase.from('places').select('*').ilike('name', `%${trimmed}%`),
        3000,
        'Supabase search',
      )
      if (!error && data) {
        savePlacesListCache(mergePlaces(loadPlacesListCache(), data as Place[]))
        return data as Place[]
      }
    } catch (e) { console.warn('Supabase search failed:', e) }
  }

  return searchCachedPlaces(trimmed)
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({ format: 'json', lat: String(lat), lon: String(lng), addressdetails: '1' })
    const res = await fetchWithRetry(`${NOMINATIM}/reverse?${params}`, {
      headers: { 'User-Agent': 'CheckInApp/1.0 (+https://github.com/olehartvig/checkin)' },
      timeout: 8000,
      retries: 1,
      backoff: 500,
    })
    const data = res.ok ? ((await res.json()) as Record<string, unknown>) : null
    if (data && !data.error) {
      const displayName = data.display_name as string | undefined
      // If Nominatim already returned admin-level info, use it as-is.
      const tags = data.address as Record<string, string> | undefined
      const hasCity = !!(tags && (tags.city || tags.town || tags.village))
      const hasCountry = !!(tags && tags.country)
      if (displayName && hasCity && hasCountry) return displayName
    }

    // Fall back to composing an address from Photon/BigDataCloud so the place has
    // city/country info even when Nominatim returned thin data (or failed).
    const composed = await composeAddressFromLngLat(lng, lat, undefined)
    if (composed) return composed

    // Last-resort: best-effort minimal string from Nominatim's tags.
    if (data) {
      const tags = data.address as Record<string, string> | undefined
      if (tags) {
        const parts: string[] = []
        if (tags.road) parts.push(tags.house_number ? `${tags.house_number} ${tags.road}` : tags.road)
        if (tags.city || tags.town || tags.village) parts.push(tags.city || tags.town || tags.village)
        if (tags.country) parts.push(tags.country)
        if (parts.length) return parts.join(', ')
      }
      return (data.display_name as string | undefined) ?? null
    }
    return null
  } catch {
    return null
  }
}

export interface ReGeocodeResult {
  total: number
  updated: number
  skipped: number
  errors: string[]
}

/**
 * Re-runs reverse-geocoding (via Photon/BigDataCloud) for every place whose
 * already-stored address doesn't yield a city or country. Writes the enriched
 * address back to Supabase + the local list cache so the achievement parser picks
 * it up.
 *
 * Throttles each request by 200 ms to stay polite to upstreams. `signal` lets the
 * caller cancel mid-pass (admin button reset). `onProgress` fires with the count.
 */
export async function reGeocodeAllPlacesMissingRegions(
  onProgress?: (done: number, total: number) => void,
  signal?: { aborted: boolean },
): Promise<ReGeocodeResult> {
  const { sleepThrottle } = await import('./reverse-geocode')
  const all = await getPlaces()
  const targets = all.filter((p) => {
    if (p.latitude == null || p.longitude == null) return false
    const parsed = parsePlaceAddress(p.address)
    return !(parsed.city || parsed.country)
  })
  const result: ReGeocodeResult = { total: targets.length, updated: 0, skipped: 0, errors: [] }

  for (let i = 0; i < targets.length; i++) {
    if (signal?.aborted) break
    const place = targets[i]
    onProgress?.(i, targets.length)
    try {
      const newAddress = await composeAddressFromLngLat(place.longitude!, place.latitude!, place.name)
      if (!newAddress) {
        result.skipped++
        continue
      }
      const updated: Place = { ...place, address: newAddress }
      await upsertPlaceInSupabase(updated)
      try {
        const raw = localStorage.getItem(PLACES_LIST_CACHE_KEY)
        if (raw) {
          const list = JSON.parse(raw) as Place[]
          const idx = list.findIndex((p) => p.id === place.id)
          if (idx >= 0) {
            list[idx] = updated
            localStorage.setItem(PLACES_LIST_CACHE_KEY, JSON.stringify(list))
          }
        }
        cachePlace(updated)
      } catch { /* ignore local cache update */ }
      result.updated++
    } catch (e) {
      result.errors.push(`${place.name || place.id}: ${(e as Error).message}`)
    }
    await sleepThrottle()
  }
  onProgress?.(targets.length, targets.length)
  return result
}

/**
 * Per-user variant of `reGeocodeAllPlacesMissingRegions`. Iterates only the
 * place_ids referenced by `userName`'s check-ins so admin can fix one user's
 * data without touching the rest of the world.
 */
export async function reGeocodeUserPlaces(
  userName: string,
  onProgress?: (done: number, total: number) => void,
  signal?: { aborted: boolean },
): Promise<ReGeocodeResult> {
  const { sleepThrottle } = await import('./reverse-geocode')
  const allCheckIns = await getAllCheckIns()
  const userPlaceIds = Array.from(new Set(
    allCheckIns.filter((ci) => ci.user_name === userName).map((ci) => ci.place_id),
  ))
  if (userPlaceIds.length === 0) {
    return { total: 0, updated: 0, skipped: 0, errors: [] }
  }

  const targetPlaces: Place[] = []
  for (const pid of userPlaceIds) {
    let p = getCachedPlace(pid)
    if (!p) {
      try { p = await getPlace(pid) } catch { /* leave null */ }
    }
    if (!p || p.latitude == null || p.longitude == null) continue
    const parsed = parsePlaceAddress(p.address)
    if (!(parsed.city || parsed.country)) targetPlaces.push(p)
  }

  const result: ReGeocodeResult = { total: targetPlaces.length, updated: 0, skipped: 0, errors: [] }
  for (let i = 0; i < targetPlaces.length; i++) {
    if (signal?.aborted) break
    const place = targetPlaces[i]
    onProgress?.(i, targetPlaces.length)
    try {
      const newAddress = await composeAddressFromLngLat(place.longitude!, place.latitude!, place.name)
      if (!newAddress) {
        result.skipped++
        continue
      }
      const updated: Place = { ...place, address: newAddress }
      await upsertPlaceInSupabase(updated)
      try {
        const raw = localStorage.getItem(PLACES_LIST_CACHE_KEY)
        if (raw) {
          const list = JSON.parse(raw) as Place[]
          const idx = list.findIndex((p) => p.id === place.id)
          if (idx >= 0) {
            list[idx] = updated
            localStorage.setItem(PLACES_LIST_CACHE_KEY, JSON.stringify(list))
          }
        }
        cachePlace(updated)
      } catch { /* ignore */ }
      result.updated++
    } catch (e) {
      result.errors.push(`${place.name || place.id}: ${(e as Error).message}`)
    }
    await sleepThrottle()
  }
  onProgress?.(targetPlaces.length, targetPlaces.length)
  return result
}

export async function getPlace(id: string): Promise<Place | null> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      const { data, error } = await supabase.from('places').select('*').eq('id', id).single()
      if (!error && data) {
        cachePlace(data as Place)
        return data as Place
      }
    } catch (e) { console.warn('Supabase getPlace failed:', e) }
  }

  const cached = getCachedPlace(id)
  if (cached) return cached
  return null
}

export async function getCheckInsForPlace(placeId: string): Promise<CheckIn[]> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      const { data, error } = await supabase.from('check_ins').select('*').eq('place_id', placeId).order('created_at', { ascending: false })
      if (!error && data) return data as CheckIn[]
    } catch (e) { console.warn('Supabase getCheckInsForPlace failed:', e) }
  }
  return loadMockCheckIns().filter((c) => c.place_id === placeId)
}

export async function getCheckInCount(placeId: string): Promise<number> {
  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      const { count, error } = await supabase.from('check_ins').select('id', { count: 'exact' }).eq('place_id', placeId)
      if (!error) return count || 0
    } catch (e) { console.warn('Supabase getCheckInCount failed:', e) }
  }
  return loadMockCheckIns().filter((c) => c.place_id === placeId).length
}

export async function getAllCheckIns(): Promise<CheckIn[]> {
  const local = [...loadMockCheckIns()].reverse()
  if (hasSupabaseEnv()) {
    try {
      const supabase = await getClient()
      const { data, error } = await supabase.from('check_ins').select('*').order('created_at', { ascending: false }).limit(50)
      if (!error && data) {
        const seen = new Set<string>()
        for (const ci of data as CheckIn[]) {
          seen.add(ci.id)
        }
        return [...(data as CheckIn[]), ...local.filter((ci) => !seen.has(ci.id))]
      }
    } catch (e) { console.warn('Supabase getAllCheckIns failed:', e) }
  }
  return local
}

export async function upsertPlaceInSupabase(place: Place): Promise<void> {
  if (!hasSupabaseEnv()) return
  const supabase = await getClient()
  const dbRow: Record<string, unknown> = {
    id: place.id,
    name: place.name,
    type: place.type,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
  }
  if (place.description != null) dbRow.description = place.description
  if (place.photo_url != null) dbRow.photo_url = place.photo_url
  if (place.created_at) dbRow.created_at = place.created_at
  const { error } = await supabase.from('places').insert(dbRow)
  // 23505 = unique violation (place already exists) — not a real error
  if (error && error.code !== '23505') throw error
}

export async function batchUpsertPlaces(places: Place[]): Promise<void> {
  // Cache locally so places are visible immediately without waiting on Supabase.
  // Both cache writes are wrapped in savePlacesListCache / saveAll and tolerate
  // localStorage QuotaExceededError, so a full browser cache must never block
  // the Supabase upsert below.
  try {
    const existing = loadPlacesListCache()
    const merged = mergePlaces(existing, places)
    savePlacesListCache(merged)
  } catch (e) {
    console.warn('Places list cache write failed:', e)
  }
  for (const p of places) {
    try {
      cachePlace(p)
    } catch (e) {
      console.warn('cachePlace failed (continuing):', e)
    }
  }

  if (!hasSupabaseEnv() || places.length === 0) return
  const supabase = await getClient()
  const rows = places.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    ...(p.description != null && { description: p.description }),
    ...(p.phone != null && { phone: p.phone }),
    ...(p.website != null && { website: p.website }),
    ...(p.created_at && { created_at: p.created_at }),
  }))
  try {
    const { error } = await supabase.from('places').upsert(rows, { onConflict: 'id' })
    if (error) console.warn('Batch upsert failed:', error)
  } catch (e) {
    console.warn('Batch upsert threw (continuing):', e)
  }
}

/**
 * Delete a place from Supabase and purge it from the local list cache.
 * Returns a discriminated result so the caller can surface a useful message
 * (e.g., 23503 = foreign key violation when the place has check-ins).
 */
export async function deletePlaceInSupabase(id: string): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  if (!hasSupabaseEnv()) return { ok: false, error: 'No Supabase configured' }
  const supabase = await getClient()
  const { error } = await supabase.from('places').delete().eq('id', id)
  // Purge from local list cache regardless of DB outcome so the UI stays consistent
  try {
    const raw = localStorage.getItem(PLACES_LIST_CACHE_KEY)
    if (raw) {
      const list = JSON.parse(raw) as Place[]
      const filtered = list.filter((p) => p.id !== id)
      localStorage.setItem(PLACES_LIST_CACHE_KEY, JSON.stringify(filtered))
    }
  } catch { /* ignore */ }
  if (!error) return { ok: true }
  if (error.code === '23503') return { ok: false, error: 'place_has_checkins', code: '23503' }
  return { ok: false, error: error.message, code: error.code }
}

export interface CheckInResult {
  ok: boolean
  reason?: string
  checkInId?: string
  bonus?: { base: number; mayorBonus: number; friendBonus: number; streakBonus: number; total: number; multiplier: number }
  achievements?: UnlockResult[]
  levelUp?: { from: LevelDef; to: LevelDef }
}

export async function createCheckIn(placeId: string, userName = 'You', userLocation?: { latitude: number; longitude: number } | null): Promise<CheckInResult> {
  const myName = getUsername() || userName
  const today = getTodayLocal()

  if (!isOnline()) {
    const alreadyQueuedToday = getQueue().some((q) => (
      q.placeId === placeId &&
      q.userName === myName &&
      isoToLocalDate(q.timestamp) === today
    ))
    const alreadyCheckedInToday = loadMockCheckIns().some((ci) => (
      ci.place_id === placeId &&
      ci.user_name === myName &&
      isoToLocalDate(ci.created_at) === today
    ))
    if (alreadyQueuedToday || alreadyCheckedInToday) return { ok: false }
    addToQueue({ placeId, userName })
    return { ok: true }
  }

  // Load existing check-ins for bonus calculation
  const allCheckIns = await getAllCheckIns()
  const alreadyCheckedInToday = allCheckIns.some((ci) => (
    ci.place_id === placeId &&
    ci.user_name === myName &&
    isoToLocalDate(ci.created_at) === today
  ))
  if (alreadyCheckedInToday) return { ok: false }

  const getBonus = (place: Place) => {
    const userCount = getUserCheckInCountFromCheckIns(allCheckIns, placeId, myName)
    const mayor = getMayorFromCheckIns(allCheckIns, placeId)
    const following = getFollowing()
    const friendCheckedIn = following.length > 0 && allCheckIns.some(
      (ci) => ci.place_id === placeId && following.includes(ci.user_name) && ci.user_name !== myName,
    )
    const streak = getCheckInStreaks(allCheckIns, myName)
    return calcCheckInBonus(place, userCount, mayor === myName, friendCheckedIn, streak.current)
  }

  const award = async (place: Place, bonus: { base: number; mayorBonus: number; friendBonus: number; streakBonus: number; total: number; multiplier: number }) => {
    const lu = awardPoints(bonus.total)
    awardCoins(bonus.total)
    const achievements = await checkAchievements(placeId, place.type, myName)
    return lu ? { bonus, achievements, levelUp: lu } : { bonus, achievements }
  }

  if (hasSupabaseEnv()) {
    try {
      const place = await getPlace(placeId)
      if (!place) {
        console.warn('Place not found, saving check-in locally')
      } else {
        // Proximity check
        if (userLocation && place.latitude && place.longitude) {
          const dist = getDistance(userLocation, { latitude: place.latitude, longitude: place.longitude })
          if (dist > getMaxCheckInDistance() / 1000) return { ok: false, reason: 'too_far' }
        }
        await upsertPlaceInSupabase(place)
        const supabase = await getClient()
        const bonus = getBonus(place)
        let { data: insertData, error } = await supabase
          .from('check_ins')
          .insert({ place_id: placeId, user_name: userName, points_awarded: bonus.total })
          .select('id')
          .single()
        if (error && error.message.includes('points_awarded')) {
          const fallback = await supabase
            .from('check_ins')
            .insert({ place_id: placeId, user_name: userName })
            .select('id')
            .single()
          insertData = fallback.data
          error = fallback.error
        }
        if (error) throw error

        const result = await award(place, bonus)
        // Fire-and-forget fanout to my followers. Never blocks the success return;
        // sendCheckInMessage swallows all errors internally.
        void sendCheckInMessage(myName, placeId, insertData?.id ?? null, place?.name).catch(() => {})
        return { ok: true, checkInId: insertData?.id, ...result }
      }
    } catch (e) {
      console.warn('Supabase createCheckIn failed:', (e as Error)?.message || e)
    }
  }

  // Fallback to localStorage when Supabase is unavailable or rejects
  if (hasSupabaseEnv()) {
    // DB write failed — queue for retry
    addToQueue({ placeId, userName })
  }
  const place = await getPlace(placeId)
  // Proximity check
  if (userLocation && place?.latitude && place?.longitude) {
    const dist = getDistance(userLocation, { latitude: place.latitude, longitude: place.longitude })
    if (dist > getMaxCheckInDistance() / 1000) return { ok: false, reason: 'too_far' }
  }
  const bonus = place ? getBonus(place) : null
  const mockId = String(Date.now())
  mockCheckIns.push({
    id: mockId, place_id: placeId, user_id: 'mock-user',
    user_name: userName, points_awarded: bonus?.total ?? 10, created_at: new Date().toISOString(),
  })
  saveMockCheckIns(mockCheckIns)

  if (place && bonus) {
    const result = await award(place, bonus)
    // Same fanout in the local-mock path so a user with no Supabase still
    // triggers message creation once Supabase comes back.
    void sendCheckInMessage(myName, placeId, mockId, place?.name).catch(() => {})
    return { ok: true, checkInId: mockId, ...result }
  }

  void sendCheckInMessage(myName, placeId, mockId, place?.name).catch(() => {})
  return { ok: true, checkInId: mockId }
}
