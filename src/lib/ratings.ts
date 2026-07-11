import type { Rating } from './types'
import { supabase } from './supabase'

const RATINGS_LIMIT = 500

export interface RatingStats {
  avg: number
  count: number
}

/**
 * Fetch every user-submitted rating for a place, newest first. Returns []
 * on any error or while offline so the UI degrades gracefully.
 */
export async function getRatingsForPlace(placeId: string): Promise<Rating[]> {
  try {
    const { data, error } = await supabase
      .from('place_ratings')
      .select('*')
      .eq('place_id', placeId)
      .order('created_at', { ascending: false })
      .limit(RATINGS_LIMIT)
    if (error) {
      console.warn('Supabase getRatingsForPlace failed:', error.message)
      return []
    }
    return (data || []) as Rating[]
  } catch (e) {
    console.warn('getRatingsForPlace failed:', e)
    return []
  }
}

/**
 * Fetch a single rating for (placeId, userName) — used to highlight the
 * star choice of the current viewer.
 */
export async function getMyRatingForPlace(placeId: string, userName: string): Promise<Rating | null> {
  try {
    const { data, error } = await supabase
      .from('place_ratings')
      .select('*')
      .eq('place_id', placeId)
      .eq('user_name', userName)
      .maybeSingle()
    if (error) {
      console.warn('Supabase getMyRatingForPlace failed:', error.message)
      return null
    }
    return (data as Rating | null) ?? null
  } catch (e) {
    console.warn('getMyRatingForPlace failed:', e)
    return null
  }
}

/** Pure helper: aggregate avg + count over a list of ratings. */
export function getAverageRating(ratings: Rating[] | null | undefined): RatingStats | null {
  if (!ratings || ratings.length === 0) return null
  const sum = ratings.reduce((acc, r) => acc + r.rating, 0)
  return { avg: sum / ratings.length, count: ratings.length }
}

/** Slice of one page of ratings + metadata. `page` is 0-indexed and is
 *  clamped into [0, totalPages-1], so out-of-range callers cannot read past
 *  the end of the list. An empty list still reports `totalPages = 1` so the
 *  UI can render "Page 1 of 1" without a divide-by-zero edge case. */
export function paginateRatings(
  ratings: Rating[],
  page: number,
  pageSize: number,
): { items: Rating[]; page: number; totalPages: number; total: number; pageSize: number } {
  const total = ratings.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(0, page), totalPages - 1)
  const start = safePage * pageSize
  return {
    items: ratings.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
  }
}

/**
 * Pure helper: drop entries that aren't authored by `userName` or any name in
 * `friendSet`. Used by the PlaceDetail UI to render only the "self + friends"
 * rating list.
 */
export function filterRatingsToSelfAndFriends(
  ratings: Rating[],
  userName: string | null | undefined,
  friendSet: Iterable<string>,
): Rating[] {
  const friends = new Set(friendSet)
  return ratings.filter((r) => r.user_name === userName || friends.has(r.user_name))
}

/**
 * Submit (or update) the current user's rating for a place.
 *  - Online + Supabase reachable → upserts the row directly.
 *  - Offline OR any other transient failure → queues to localStorage for
 *    `processRatingsQueue()` to drain on the next online tick.
 * The expected Supabase schema is:
 *   place_ratings(id uuid pk, place_id text, user_name text, rating int2,
 *                 created_at timestamptz, UNIQUE(place_id, user_name))
 */
export async function submitRating(
  placeId: string,
  userName: string,
  rating: number,
): Promise<{ ok: boolean; queued: boolean; error?: string }> {
  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return { ok: false, queued: false, error: 'rating must be an integer 1–5' }
  }
  const { addRatingToQueue, isOnline } = await import('./sync')
  if (!isOnline()) {
    addRatingToQueue({ placeId, userName, rating })
    return { ok: true, queued: true }
  }
  try {
    const { error } = await supabase.from('place_ratings').upsert(
      {
        place_id: placeId,
        user_name: userName,
        rating,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'place_id,user_name' },
    )
    if (error) {
      // 42P01 = undefined_table — caller hasn't created place_ratings yet.
      // Surface the error rather than silently retrying forever.
      if (error.code === '42P01') {
        return { ok: false, queued: false, error: 'place_ratings table missing — apply Supabase migration' }
      }
      addRatingToQueue({ placeId, userName, rating })
      return { ok: true, queued: true }
    }
    return { ok: true, queued: false }
  } catch {
    addRatingToQueue({ placeId, userName, rating })
    return { ok: true, queued: true }
  }
}
