import type { StoredUser } from './auth'
import { getUser } from './user'

const COINS_KEY = 'checkin_coins'
const POINTS_KEY = 'checkin_lifetime_points'
const STICKERS_KEY = 'checkin_stickers'
const ACHIEVEMENTS_KEY = 'checkin_achievements'

export async function lookupUserByEmail(email: string): Promise<StoredUser | null> {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const { supabase } = await import('./supabase')
    let { data, error } = await supabase.from('users').select('name, coins, points, stickers, achievements').ilike('email', normalizedEmail).limit(1).maybeSingle()
    let hasStickersAchievements = true
    if (error && missingProfileColumn(error.message)) {
      hasStickersAchievements = false
      const fallback = await supabase.from('users').select('name, coins, points').ilike('email', normalizedEmail).limit(1).maybeSingle()
      data = fallback.data as typeof data
      error = fallback.error
    }
    let hasPoints = true
    if (error && missingProfileColumn(error.message)) {
      hasPoints = false
      const fallback = await supabase.from('users').select('name, coins').ilike('email', normalizedEmail).limit(1).maybeSingle()
      data = fallback.data as typeof data
      error = fallback.error
    }
    let hasCoins = true
    if (error && missingProfileColumn(error.message)) {
      hasCoins = false
      const fallback = await supabase.from('users').select('name').ilike('email', normalizedEmail).limit(1).maybeSingle()
      data = fallback.data as typeof data
      error = fallback.error
    }
    if (error) {
      console.warn('User lookup failed:', error.message)
      return null
    }
    if (data) {
      return {
        name: data.name,
        email: normalizedEmail,
        coins: hasCoins ? (data.coins ?? 0) : undefined,
        points: hasPoints ? (data.points ?? 0) : undefined,
        stickers: hasStickersAchievements ? (data.stickers ?? {}) : undefined,
        achievements: hasStickersAchievements ? (data.achievements ?? {}) : undefined,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function registerUser(name: string, email: string): Promise<boolean> {
  try {
    const normalizedEmail = email.trim().toLowerCase()
    const { supabase } = await import('./supabase')
    const coins = readCachedCoins()
    const points = readCachedPoints()
    const stickers = readCachedJson(STICKERS_KEY)
    const achievements = readCachedJson(ACHIEVEMENTS_KEY)
    let { error } = await supabase.from('users').insert({ name, email: normalizedEmail, coins, points, stickers, achievements })
    if (error && missingProfileColumn(error.message)) {
      const fallback = await supabase.from('users').insert({ name, email: normalizedEmail, coins, points })
      error = fallback.error
    }
    if (error && missingProfileColumn(error.message)) {
      const fallback = await supabase.from('users').insert({ name, email: normalizedEmail, coins })
      error = fallback.error
    }
    if (error && missingProfileColumn(error.message)) {
      const fallback = await supabase.from('users').insert({ name, email: normalizedEmail })
      error = fallback.error
    }
    if (error) {
      console.warn('User registration failed:', error.message)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function saveCoinsToCache(coins: number) {
  try {
    localStorage.setItem(COINS_KEY, JSON.stringify({ total: coins, weekly: 0, weekStart: '' }))
  } catch { /* ignore */ }
}

export function savePointsToCache(points: number) {
  try {
    localStorage.setItem(POINTS_KEY, String(points))
  } catch { /* ignore */ }
}

export function saveStickersToCache(stickers: Record<string, unknown>) {
  try {
    if (!stickers || Object.keys(stickers).length === 0) {
      const existing = readCachedJson(STICKERS_KEY)
      if (Object.keys(existing).length > 0) return
    }
    localStorage.setItem(STICKERS_KEY, JSON.stringify(stickers))
  } catch { /* ignore */ }
}

export function saveAchievementsToCache(achievements: Record<string, unknown>) {
  try {
    if (!achievements || Object.keys(achievements).length === 0) {
      const existing = readCachedJson(ACHIEVEMENTS_KEY)
      if (Object.keys(existing).length > 0) return
    }
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achievements))
  } catch { /* ignore */ }
}

function readCachedCoins(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(COINS_KEY) || '{"total":0}')
    return Number(raw.total) || 0
  } catch {
    return 0
  }
}

function readCachedPoints(): number {
  try {
    return Number(localStorage.getItem(POINTS_KEY)) || 0
  } catch {
    return 0
  }
}

function readCachedJson(key: string): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function missingProfileColumn(message: string): boolean {
  return ['coins', 'points', 'stickers', 'achievements'].some((field) => message.includes(field))
}

export async function loadUserProfileFromDb(): Promise<'ok' | 'not_found' | 'error'> {
  try {
    const user = getUser()
    if (!user?.email) return 'error'
    const existing = await lookupUserByEmail(user.email)
    if (!existing) return 'not_found'
    if (existing.coins != null) saveCoinsToCache(existing.coins)
    if (existing.points != null) savePointsToCache(existing.points)
    if (existing.stickers != null) saveStickersToCache(existing.stickers)
    if (existing.achievements != null) saveAchievementsToCache(existing.achievements)
    return 'ok'
  } catch {
    return 'error'
  }
}

export function clearAllAppData(): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('checkin_')) keysToRemove.push(key)
  }
  for (const key of keysToRemove) localStorage.removeItem(key)
}
