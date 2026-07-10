/* ───── Category data, loaded from Supabase with localStorage fallback ───── */

export interface Category {
  id: string
  name: string
  icon: string
  sort_order: number
  google_query: string
}

const CACHE_KEY = 'checkin_categories_v2'
const CACHE_TIME_KEY = 'checkin_categories_ts_v2'
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

const FALLBACK_CATEGORIES: Category[] = [
  { id: 'bar', name: 'Bar', icon: '🍸', sort_order: 1, google_query: 'bars' },
  { id: 'restaurant', name: 'Restaurant', icon: '🍽️', sort_order: 2, google_query: 'restaurants' },
  { id: 'cafe', name: 'Cafe', icon: '☕', sort_order: 3, google_query: 'cafes' },
  { id: 'club', name: 'Club', icon: '🎵', sort_order: 4, google_query: 'night clubs' },
  { id: 'lounge', name: 'Lounge', icon: '🥂', sort_order: 5, google_query: 'lounges' },  { id: 'park', name: 'Park', icon: '🌳', sort_order: 6, google_query: 'parks' },
  { id: 'hotel', name: 'Hotel', icon: '🏨', sort_order: 7, google_query: 'hotels' },
  { id: 'things_to_do', name: 'Things to Do', icon: '🎪', sort_order: 8, google_query: 'things to do' },
] 

function hasSupabaseEnv(): boolean {
  try {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  } catch {
    return false
  }
}

function loadCached(): Category[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const ts = localStorage.getItem(CACHE_TIME_KEY)
    if (ts && Date.now() - Number(ts) > CACHE_TTL) {
      localStorage.removeItem(CACHE_KEY)
      localStorage.removeItem(CACHE_TIME_KEY)
      return null
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveCache(cats: Category[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cats))
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()))
  } catch { /* ignore */ }
}

/**
 * Merge FALLBACK_CATEGORIES with remote (Supabase) entries.
 *
 * FALLBACK_CATEGORIES is authoritative for known ids — every entry defined there
 * wins outright, so icon/sort_order updates in code propagate to all clients.
 * Remote entries whose id is NOT in FALLBACK are preserved (admin-created
 * categories). Result is re-sorted by sort_order.
 */
function mergeWithFallback(remote: Category[]): Category[] {
  const byId = new Map<string, Category>()
  for (const fb of FALLBACK_CATEGORIES) byId.set(fb.id, fb)
  for (const cat of remote) if (!byId.has(cat.id)) byId.set(cat.id, cat)
  return Array.from(byId.values()).sort((a, b) => a.sort_order - b.sort_order)
}

let cached: Category[] | null = null

/** Get categories — returns cached data or fallback. Call loadCategories() first to populate from Supabase. */
export function getCategories(): Category[] {
  if (cached) return cached
  const fromStorage = loadCached()
  if (fromStorage) {
    cached = fromStorage
    return cached
  }
  return FALLBACK_CATEGORIES
}

/** Load categories from Supabase (called on app init) */
export async function loadCategories(): Promise<Category[]> {
  if (!hasSupabaseEnv()) {
    cached = FALLBACK_CATEGORIES
    return cached
  }

  try {
    const { supabase } = await import('./supabase')
    const { data, error } = await supabase.from('categories').select('*').order('sort_order')
    if (!error && data && data.length > 0) {
      cached = mergeWithFallback(data as Category[])
      saveCache(cached)
      return cached
    }
    if (error) console.warn('Failed to load categories from Supabase:', error.message)
  } catch (e) { console.warn('Failed to load categories:', e) }

  cached = FALLBACK_CATEGORIES
  return cached
}

/** Get a category by type id */
export function getCategory(id: string): Category | undefined {
  return getCategories().find((c) => c.id === id)
}

/** Get icon for a category type */
export function getCategoryIcon(type: string): string {
  return getCategory(type)?.icon || '📍'
}

/** Get Google query string for a category type */
export function getGoogleQuery(type: string): string {
  return getCategory(type)?.google_query || type
}
