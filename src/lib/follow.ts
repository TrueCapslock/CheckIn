import { getUser } from './user'
import { supabase } from './supabase'

const STORAGE_KEY = 'checkin_following'

export function getFollowing(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function isFollowing(name: string): boolean {
  return getFollowing().includes(name)
}

export async function followUser(name: string): Promise<void> {
  const list = getFollowing()
  if (list.includes(name)) return
  list.push(name)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  const user = getUser()
  if (user?.email) {
    try {
      const { error } = await supabase.from('follows').insert({
        follower_email: user.email.trim().toLowerCase(),
        followed_name: name.trim(),
      })
      if (error && error.code !== '23505') throw error
    } catch (e) {
      console.warn('Follow sync failed:', e)
    }
  }
}

export async function unfollowUser(name: string): Promise<void> {
  const list = getFollowing().filter((n) => n !== name)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  const user = getUser()
  if (user?.email) {
    try {
      const { error } = await supabase.from('follows').delete().match({
        follower_email: user.email.trim().toLowerCase(),
        followed_name: name.trim(),
      })
      if (error) throw error
    } catch (e) {
      console.warn('Follow sync failed:', e)
    }
  }
}

export async function loadFollowsFromDb(): Promise<void> {
  const user = getUser()
  if (!user?.email) return
  try {
    const { data, error } = await supabase
      .from('follows')
      .select('followed_name')
      .eq('follower_email', user.email.trim().toLowerCase())
    if (error) throw error
    const following = (data || []).map((row) => row.followed_name)
    if (following.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(following))
  } catch (e) {
    console.warn('Follow load failed:', e)
  }
}

/**
 * Reverse lookup: emails of users who follow `followedName`.
 * Used by the message fanout so `Bob's` check-in sends a row to every email in
 * `select follower_email from follows where followed_name = 'Bob'`.
 * Returns [] when Supabase is unreachable or there are no followers.
 */
export async function getFollowerEmails(followedName: string): Promise<string[]> {
  if (!followedName) return []
  try {
    const { data, error } = await supabase
      .from('follows')
      .select('follower_email')
      .eq('followed_name', followedName.trim())
    if (error) throw error
    return (data || [])
      .map((r) => (r.follower_email || '').trim().toLowerCase())
      .filter((e): e is string => !!e)
  } catch {
    return []
  }
}

