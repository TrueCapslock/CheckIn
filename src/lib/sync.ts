const QUEUE_KEY = 'checkin_offline_queue'
const STORE_QUEUE_KEY = 'checkin_store_queue'
const MAX_RETRIES = 10

interface QueuedCheckIn {
  id: string
  placeId: string
  userName: string
  timestamp: string
}

interface PendingStoreOp {
  id: string
  type: 'stats' | 'stickers' | 'achievements' | 'streaks'
  email: string
  data: Record<string, unknown>
  timestamp: string
  retries: number
}

/* ───── Check-in offline queue ───── */

export function getQueue(): QueuedCheckIn[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function addToQueue(item: Omit<QueuedCheckIn, 'id' | 'timestamp'>): void {
  const queue = getQueue()
  queue.push({
    ...item,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  })
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function removeFromQueue(id: string): void {
  const queue = getQueue().filter((q) => q.id !== id)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY)
}

export function isOnline(): boolean {
  return navigator.onLine
}

export async function processQueue(): Promise<{ ok: number; fail: number }> {
  const queue = getQueue()
  if (queue.length === 0) return { ok: 0, fail: 0 }
  let ok = 0
  let fail = 0
  for (const item of queue) {
    try {
      const { supabase } = await import('./supabase')
      const { error } = await supabase.from('check_ins').insert({
        place_id: item.placeId,
        user_name: item.userName,
        created_at: item.timestamp,
      })
      if (error) {
        console.warn('Sync failed for', item.id, error.message)
        fail++
      } else {
        removeFromQueue(item.id)
        ok++
      }
    } catch {
      fail++
    }
  }
  return { ok, fail }
}

/* ───── Store retry queue (points, coins, stickers, achievements) ───── */

export function getStoreQueue(): PendingStoreOp[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function addToStoreQueue(op: { type: PendingStoreOp['type']; email: string; data: Record<string, unknown> }): void {
  const queue = getStoreQueue()
  const filtered = queue.filter((q) => q.type !== op.type)
  filtered.push({
    ...op,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    retries: 0,
  })
  localStorage.setItem(STORE_QUEUE_KEY, JSON.stringify(filtered))
}

function removeFromStoreQueue(id: string): void {
  const queue = getStoreQueue().filter((q) => q.id !== id)
  localStorage.setItem(STORE_QUEUE_KEY, JSON.stringify(queue))
}

export async function processStoreQueue(): Promise<{ ok: number; fail: number }> {
  const queue = getStoreQueue()
  if (queue.length === 0) return { ok: 0, fail: 0 }
  let ok = 0
  let fail = 0
  const { supabase } = await import('./supabase')
  for (const item of queue) {
    try {
      let error = null
      if (item.type === 'stats') {
        const { data } = await supabase.from('users').select('points').eq('email', item.email).maybeSingle()
        const nextData = { ...item.data }
        if (typeof nextData.points === 'number') {
          nextData.points = Math.max(nextData.points, data?.points ?? 0)
        }
        const r = await supabase.from('users').update(nextData).eq('email', item.email)
        error = r.error
      } else if (item.type === 'stickers') {
        const r = await supabase.from('users').update({ stickers: item.data }).eq('email', item.email)
        error = r.error
      } else if (item.type === 'achievements') {
        const r = await supabase.from('users').update({ achievements: item.data }).eq('email', item.email)
        error = r.error
      } else if (item.type === 'streaks') {
        const r = await supabase.from('users').update({ streaks: item.data }).eq('email', item.email)
        error = r.error
      }
      if (error) throw error
      removeFromStoreQueue(item.id)
      ok++
    } catch {
      item.retries++
      if (item.retries >= MAX_RETRIES) {
        removeFromStoreQueue(item.id)
      }
      fail++
    }
  }
  return { ok, fail }
}

/* ───── Rating offline queue ───── */

const RATING_QUEUE_KEY = 'checkin_rating_offline_queue'

export interface QueuedRating {
  id: string
  placeId: string
  userName: string
  rating: number
  timestamp: string
  retries: number
}

export function getRatingQueue(): QueuedRating[] {
  try {
    return JSON.parse(localStorage.getItem(RATING_QUEUE_KEY) || '[]')
  } catch {
    return []
  }
}

export function addRatingToQueue(item: Omit<QueuedRating, 'id' | 'timestamp' | 'retries'>): void {
  const queue = getRatingQueue()
  // Dedupe: if the user already has a queued rating for this (placeId, userName),
  // overwrite it with the new value rather than accumulating stale entries.
  const filtered = queue.filter(
    (q) => !(q.placeId === item.placeId && q.userName === item.userName),
  )
  filtered.push({
    ...item,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    retries: 0,
  })
  localStorage.setItem(RATING_QUEUE_KEY, JSON.stringify(filtered))
}

function removeRatingFromQueue(id: string): void {
  const queue = getRatingQueue().filter((q) => q.id !== id)
  localStorage.setItem(RATING_QUEUE_KEY, JSON.stringify(queue))
}

export async function processRatingsQueue(): Promise<{ ok: number; fail: number }> {
  const queue = getRatingQueue()
  if (queue.length === 0) return { ok: 0, fail: 0 }
  let ok = 0
  let fail = 0
  const { supabase } = await import('./supabase')
  for (const item of queue) {
    try {
      const { error } = await supabase.from('place_ratings').upsert(
        {
          place_id: item.placeId,
          user_name: item.userName,
          rating: item.rating,
          created_at: item.timestamp,
        },
        { onConflict: 'place_id,user_name' },
      )
      if (error) {
        // 42P01 = undefined_table — the place_ratings table hasn't been created yet
        // in Supabase. Don't keep retrying, that's noise.
        if (error.code === '42P01') {
          console.warn('place_ratings table missing — skipping queue drain')
          return { ok, fail: queue.length }
        }
        item.retries++
        if (item.retries >= MAX_RETRIES) removeRatingFromQueue(item.id)
        fail++
        continue
      }
      removeRatingFromQueue(item.id)
      ok++
    } catch {
      item.retries++
      if (item.retries >= MAX_RETRIES) removeRatingFromQueue(item.id)
      fail++
    }
  }
  return { ok, fail }
}
