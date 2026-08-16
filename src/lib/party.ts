import type { Party, PartyMember } from './types'
import { getUser, getUsername } from './user'
import { getFollowing } from './follow'

const PARTIES_KEY = 'checkin_parties_cache'
const INVITES_KEY = 'checkin_invites_cache'

/* ───── Cache helpers ───── */

function loadCached<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

function saveCache<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data))
}

/* ───── API helpers ───── */

async function partyApi(method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<Response> {
  let url = '/api/party'
  if (query) {
    const params = new URLSearchParams(query)
    url += `?${params.toString()}`
  }
  return fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

/* ───── Create party ───── */

export async function createParty(
  name: string,
  startsAt: string,
  endsAt: string,
  invitees: string[],
): Promise<{ ok: boolean; party?: Party; error?: string }> {
  const user = getUser()
  const createdBy = getUsername() || user?.email || 'Anonymous'
  try {
    const res = await partyApi('POST', { id: crypto.randomUUID(), name, created_by: createdBy, starts_at: startsAt, ends_at: endsAt, invitees })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error }
    if (data.party) {
      const cached = loadCached<Party>(PARTIES_KEY)
      cached.unshift(data.party)
      saveCache(PARTIES_KEY, cached)
    }
    return { ok: true, party: data.party }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/* ───── List parties ───── */

export async function getParties(): Promise<{ created: Party[]; invited: Party[] }> {
  const userName = getUsername()
  if (!userName) return { created: loadCached<Party>(PARTIES_KEY), invited: loadCached<Party>(INVITES_KEY) }

  try {
    const res = await partyApi('GET', undefined, { user_name: userName })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    saveCache(PARTIES_KEY, data.created || [])
    saveCache(INVITES_KEY, data.invited || [])
    return { created: data.created || [], invited: data.invited || [] }
  } catch {
    return { created: loadCached<Party>(PARTIES_KEY), invited: loadCached<Party>(INVITES_KEY) }
  }
}

/* ───── Get active party ───── */

export async function getActiveParty(): Promise<Party | null> {
  const { created, invited } = await getParties()
  const all = [...created, ...invited]
  const now = new Date().toISOString()
  return all.find((p) => p.status === 'active' && p.starts_at <= now && p.ends_at >= now) || null
}

/* ───── Respond to invitation ───── */

export async function respondToInvitation(partyId: string, accept: boolean): Promise<boolean> {
  const userName = getUsername()
  if (!userName) return false
  try {
    const res = await partyApi('PUT', { party_id: partyId, user_name: userName, accept })
    const data = await res.json()
    return data.ok === true
  } catch {
    return false
  }
}

/* ───── End party ───── */

export async function endParty(partyId: string): Promise<boolean> {
  try {
    const res = await partyApi('PATCH', { party_id: partyId, status: 'completed' })
    const data = await res.json()
    if (data.ok) {
      const cached = loadCached<Party>(PARTIES_KEY)
      const idx = cached.findIndex((p) => p.id === partyId)
      if (idx !== -1) {
        cached[idx].status = 'completed'
        saveCache(PARTIES_KEY, cached)
      }
    }
    return data.ok === true
  } catch {
    return false
  }
}

/* ───── Leave party ───── */

export async function leaveParty(partyId: string): Promise<boolean> {
  const userName = getUsername()
  if (!userName) return false
  try {
    const res = await partyApi('DELETE', { party_id: partyId, user_name: userName })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

/* ───── Delete party (creator only) ───── */

export async function deleteParty(partyId: string): Promise<boolean> {
  const user = getUser()
  const userName = getUsername() || user?.email || 'Anonymous'
  try {
    const res = await partyApi('DELETE', { party_id: partyId, user_name: userName, delete_party: true })
    return (await res.json()).ok === true
  } catch {
    return false
  }
}

/* ───── Link check-in to party ───── */

export async function linkCheckInToParty(partyId: string, checkInId: string): Promise<boolean> {
  const userName = getUsername()
  if (!userName) return false
  try {
    const { supabase } = await import('./supabase')
    const { error } = await supabase.from('party_check_ins').insert({
      party_id: partyId,
      check_in_id: checkInId,
      user_name: userName,
    })
    return !error
  } catch {
    return false
  }
}

/* ───── Get party leaderboard ───── */

export interface PartyLeaderboardEntry {
  name: string
  score: number
  checkIns: number
}

export async function getPartyLeaderboard(partyId: string): Promise<PartyLeaderboardEntry[]> {
  try {
    const { supabase } = await import('./supabase')
    const { data, error } = await supabase
      .from('party_check_ins')
      .select('user_name, check_ins!inner(points_awarded)')
      .eq('party_id', partyId)

    if (error) throw error
    if (!data) return []

    const scores: Record<string, { score: number; count: number }> = {}
    for (const row of data) {
      const name = row.user_name
      const pts = (row as unknown as { check_ins: { points_awarded: number | null } }).check_ins?.points_awarded || 10
      if (!scores[name]) scores[name] = { score: 0, count: 0 }
      scores[name].score += pts
      scores[name].count++
    }

    return Object.entries(scores)
      .map(([name, s]) => ({ name, score: s.score, checkIns: s.count }))
      .sort((a, b) => b.score - a.score)
  } catch {
    return []
  }
}

/* ───── Party members ───── */

export async function getPartyMembers(partyId: string): Promise<PartyMember[]> {
  try {
    const { supabase } = await import('./supabase')
    const { data, error } = await supabase
      .from('party_members')
      .select('*')
      .eq('party_id', partyId)
    if (error) throw error
    return data || []
  } catch {
    return []
  }
}

/* ───── Invite friends to existing party ───── */

export async function inviteToParty(partyId: string, names: string[]): Promise<boolean> {
  try {
    const { supabase } = await import('./supabase')
    const members = names.map((name) => ({
      party_id: partyId,
      user_name: name,
      status: 'invited',
    }))
    const { error } = await supabase.from('party_members').insert(members)
    return !error
  } catch {
    return false
  }
}

/* ───── Get pending invitation count ───── */

export function getPendingInviteCount(): number {
  return loadCached<Party>(INVITES_KEY).filter((p) => {
    const mStatus = (p as unknown as Record<string, unknown>).member_status
    return mStatus === 'invited'
  }).length
}

/* ───── Available friends to invite ───── */

export function getAvailableFriends(): string[] {
  return getFollowing().filter(Boolean)
}
