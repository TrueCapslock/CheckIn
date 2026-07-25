import type { Message } from './types'
import { getUser } from './user'
import { supabase } from './supabase'

/**
 * In-app messages — when a friend (someone who follows you) checks in, we
 * insert one row per follower into the `messages` table. The Feed tab badge
 * polls the unread count for the current user, and the Feed page renders
 * the latest N messages with a "Mark all as read" action.
 *
 * Delivery is best-effort from the client. Reads are safe (always return [] / 0
 * rather than throw) so the badge stays stable when Supabase is offline.
 */

const MAX_FANOUT_PER_INSERT = 200
const INTER_CHUNK_SLEEP_MS = 50
const UNREAD_CACHE_PREFIX = 'checkin_last_unread_'

function hasSupabaseEnv(): boolean {
  try {
    return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  } catch {
    return false
  }
}

async function getClient() {
  return supabase
}

/**
 * Pure — UI-visible preview string for a check-in message. Used so we don't need
 * to join places when rendering the inbox.
 */
export function formatMessagePreview(userName: string, placeName?: string): string {
  return `${userName} checked in at ${placeName || 'a place'}`
}

/**
 * Pure — build the row payload list for one check-in.
 *
 * - One row per follower (trimmed and lower-cased before dedup).
 * - Skips the actor's own email to avoid self-messages.
 * - Deduplicates follower emails case-insensitively.
 * - Skips empty / whitespace-only entries.
 */
export function buildCheckInMessageRows(
  fromUserName: string,
  fromUserEmail: string,
  followerEmails: string[],
  placeId: string,
  checkInId: string | null,
  preview?: string,
): Message[] {
  const actorEmail = fromUserEmail.trim().toLowerCase()
  const seen = new Set<string>()
  const rows: Message[] = []
  for (const follower of followerEmails) {
    const recipient = follower.trim().toLowerCase()
    if (!recipient || seen.has(recipient)) continue
    if (actorEmail && recipient === actorEmail) continue
    seen.add(recipient)
    rows.push({
      id: '',
      recipient_email: recipient,
      from_user_name: fromUserName,
      type: 'check_in',
      place_id: placeId,
      check_in_id: checkInId,
      preview: preview ?? formatMessagePreview(fromUserName),
      read_at: null,
      created_at: new Date().toISOString(),
    })
  }
  return rows
}

/**
 * Bulk-insert up to `MAX_FANOUT_PER_INSERT` rows per chunk with a tiny inter-chunk
 * breath so the cheapest free-tier Supabase projects don't choke on burst traffic.
 *
 * Error-code semantics:
 *   • 42P01 — the `messages` table is missing in this Supabase project
 *     (admin hasn't run the migration yet). Stop further chunks and bail — a hard
 *     error here is the right "we'll try again next time" signal.
 *   • 23505 — a unique-index collision on (recipient_email, check_in_id). This is
 *     success: the offline queue can retry fanout, so a duplicate row shows up
 *     identically to the first insert. Treat as a no-op success for the chunk.
 *   • Anything else — log and count the chunk as failed (caller doesn't await).
 */
async function chunkedInsert(rows: Message[]): Promise<{ ok: number; fail: number }> {
  if (rows.length === 0) return { ok: 0, fail: 0 }
  let ok = 0
  let fail = 0
  const supabase = await getClient()
  for (let i = 0; i < rows.length; i += MAX_FANOUT_PER_INSERT) {
    const chunk = rows.slice(i, i + MAX_FANOUT_PER_INSERT)
    const payload = chunk.map(({ id: _id, ...rest }) => rest)
    try {
      const { error } = await supabase.from('messages').insert(payload)
      if (error && error.code === '42P01') {
        console.warn('messages table missing - skipping fanout')
        return { ok, fail: rows.length - ok }
      }
      if (error && error.code === '23505') {
        ok += chunk.length
        continue
      }
      if (error) {
        console.warn('messages fanout chunk failed:', error.message)
        fail += chunk.length
        continue
      }
      ok += chunk.length
    } catch (e) {
      console.warn('messages fanout threw:', e)
      fail += chunk.length
    }
    if (i + MAX_FANOUT_PER_INSERT < rows.length) {
      await new Promise((r) => setTimeout(r, INTER_CHUNK_SLEEP_MS))
    }
  }
  return { ok, fail }
}

async function getFollowersSafe(name: string): Promise<string[]> {
  try {
    const { getFollowerEmails } = await import('./follow')
    return await getFollowerEmails(name)
  } catch {
    return []
  }
}

/**
 * Best-effort fanout for one check-in. Fires and forgets — never throws. Safe to
 * call from the hot check-in path (createCheckIn, processQueue) without awaiting.
 *
 * placeName is preferred but optional; when missing we fall back to the local
 * place cache (no network). If neither has a name, the preview reads
 * "... checked in at a place".
 */
export async function sendCheckInMessage(
  fromUserName: string,
  placeId: string,
  checkInId: string | null,
  placeName?: string,
): Promise<void> {
  if (!hasSupabaseEnv()) return
  const user = getUser()
  if (!user?.email) return
  try {
    const followerEmails = await getFollowersSafe(fromUserName)
    if (followerEmails.length === 0) return
    let resolved = placeName
    if (!resolved) {
      const cache = await import('./local-places')
      const cached = cache.getCachedPlace(placeId)
      resolved = cached?.name ?? undefined
    }
    const preview = formatMessagePreview(fromUserName, resolved)
    const rows = buildCheckInMessageRows(
      fromUserName,
      user.email,
      followerEmails,
      placeId,
      checkInId,
      preview,
    )
    await chunkedInsert(rows)
  } catch (e) {
    console.warn('sendCheckInMessage failed:', e)
  }
}

/* ───── Reader / badge helpers (used by Layout badge + Feed page) ───── */

/**
 * Number of unread messages for `email`. Never throws — returns 0 when offline,
 * when Supabase isn't configured, when the table is missing, or on any error.
 * Safe to call every 10 s.
 */
export async function getUnreadMessageCount(email: string): Promise<number> {
  if (!email || !hasSupabaseEnv()) return 0
  try {
    const supabase = await getClient()
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_email', email.toLowerCase())
      .is('read_at', null)
    if (error) {
      if (error.code === '42P01') return 0
      console.warn('unread count failed:', error.message)
      return 0
    }
    return count || 0
  } catch {
    return 0
  }
}

/**
 * Fetch recent messages for `email`, newest first. Returns [] on failure.
 */
export async function getMessagesForUser(email: string, limit = 50): Promise<Message[]> {
  if (!email || !hasSupabaseEnv()) return []
  try {
    const supabase = await getClient()
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('recipient_email', email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data || []) as Message[]
  } catch {
    return []
  }
}

/**
 * Mark every unread message for `email` as read in a single UPDATE.
 * No-op when offline or when the table doesn't exist.
 */
export async function markAllMessagesRead(email: string): Promise<void> {
  if (!email || !hasSupabaseEnv()) return
  try {
    const supabase = await getClient()
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_email', email.toLowerCase())
      .is('read_at', null)
  } catch {
    /* swallow */
  }
}

/**
 * Cache the last known unread count to localStorage so the Layout badge renders
 * a stable number between mounts and Supabase polls. Avoids the brief zero→real
 * flash on a slow network.
 */
export function readLastUnreadMessageCount(email: string): number {
  if (!email) return 0
  try {
    const raw = localStorage.getItem(UNREAD_CACHE_PREFIX + email.toLowerCase())
    const n = raw ? parseInt(raw, 10) : 0
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function writeLastUnreadMessageCount(email: string, count: number): void {
  if (!email) return
  try {
    localStorage.setItem(
      UNREAD_CACHE_PREFIX + email.toLowerCase(),
      String(Math.max(0, count | 0)),
    )
  } catch {
    /* ignore quota */
  }
}
