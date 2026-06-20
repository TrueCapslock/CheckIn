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
