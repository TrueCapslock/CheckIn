import type { Place, CheckIn } from './types'
import { getUser } from './user'
import { isoToLocalDate } from './date'
import { getLevelFromPoints } from './levels'
import type { LevelDef } from './levels'

const COINS_KEY = 'checkin_coins'
const POINTS_KEY = 'checkin_lifetime_points'
const STICKERS_KEY = 'checkin_stickers'

/* ───── Lifetime points (never reduced) ───── */

export function getLifetimePoints(): number {
  try {
    return Number(localStorage.getItem(POINTS_KEY)) || 0
  } catch {
    return 0
  }
}

function saveLifetimePoints(total: number) {
  localStorage.setItem(POINTS_KEY, String(total))
}

export function awardPoints(amount: number): { from: LevelDef; to: LevelDef } | null {
  const prev = getLifetimePoints()
  const total = prev + amount
  saveLifetimePoints(total)
  syncStatsToSupabase()
  const prevLevel = getLevelFromPoints(prev)
  const newLevel = getLevelFromPoints(total)
  if (newLevel.id !== prevLevel.id) return { from: prevLevel, to: newLevel }
  return null
}

/* ───── Coins (spendable — used to buy stickers) ───── */

export interface CoinsState {
  total: number
  weekly: number
  weekStart: string
}

export function getCoins(): CoinsState {
  try {
    return JSON.parse(localStorage.getItem(COINS_KEY) || '{"total":0,"weekly":0,"weekStart":""}')
  } catch {
    return { total: 0, weekly: 0, weekStart: '' }
  }
}

function saveCoins(c: CoinsState) {
  localStorage.setItem(COINS_KEY, JSON.stringify(c))
}

function getWeekStart(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setDate(diff))
  return monday.toISOString().slice(0, 10)
}

export function awardCoins(amount: number) {
  const c = getCoins()
  const week = getWeekStart()
  if (c.weekStart !== week) {
    c.weekly = 0
    c.weekStart = week
  }
  c.total += amount
  c.weekly += amount
  saveCoins(c)
  syncStatsToSupabase()
}

async function syncStatsToSupabase() {
  try {
    const { supabase } = await import('./supabase')
    const user = getUser()
    if (!user?.email) return
    const c = getCoins()
    const localPoints = getLifetimePoints()
    const { data } = await supabase.from('users').select('points').eq('email', user.email).maybeSingle()
    const points = Math.max(localPoints, data?.points ?? 0)
    if (points !== localPoints) saveLifetimePoints(points)
    const { error } = await supabase.from('users').update({ coins: c.total, points }).eq('email', user.email)
    if (error) throw error
  } catch (e) {
    console.warn('User stats sync failed:', e)
    const user = getUser()
    if (!user?.email) return
    const { addToStoreQueue } = await import('./sync')
    const c = getCoins()
    addToStoreQueue({ type: 'stats', email: user.email, data: { coins: c.total, points: getLifetimePoints() } })
  }
}

/* ───── Stickers ───── */

export interface StickerState {
  level: number
  lastUsed: string | null
}

const STICKER_COSTS = [0, 100, 500, 1000, 2000]
const STICKER_MULTIPLIERS = [1, 2, 3, 5, 8]

export function getStickers(): Record<string, StickerState> {
  try {
    return JSON.parse(localStorage.getItem(STICKERS_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveStickers(s: Record<string, StickerState>) {
  localStorage.setItem(STICKERS_KEY, JSON.stringify(s))
  syncStickersToSupabase(s)
}

async function syncStickersToSupabase(stickers = getStickers()) {
  try {
    const { supabase } = await import('./supabase')
    const user = getUser()
    if (!user?.email) return
    const { error } = await supabase.from('users').update({ stickers }).eq('email', user.email)
    if (error) throw error
  } catch {
    const user = getUser()
    if (!user?.email) return
    const { addToStoreQueue } = await import('./sync')
    addToStoreQueue({ type: 'stickers', email: user.email, data: stickers as Record<string, unknown> })
  }
}

export function getStickerLevelMultiplier(type: string): number {
  const stickers = getStickers()
  const s = stickers[type]
  if (!s) return 1
  return STICKER_MULTIPLIERS[s.level] || 1
}

export function canUpgradeSticker(type: string): boolean {
  const stickers = getStickers()
  const s = stickers[type] || { level: 0, lastUsed: null }
  const nextLevel = s.level + 1
  if (nextLevel >= STICKER_COSTS.length) return false
  const cost = STICKER_COSTS[nextLevel]
  return getCoins().total >= cost
}

export function upgradeStickerCost(type: string): number {
  const stickers = getStickers()
  const s = stickers[type] || { level: 0, lastUsed: null }
  const nextLevel = s.level + 1
  if (nextLevel >= STICKER_COSTS.length) return Infinity
  return STICKER_COSTS[nextLevel]
}

export function upgradeSticker(type: string): boolean {
  if (!canUpgradeSticker(type)) return false
  const stickers = getStickers()
  const s = stickers[type] || { level: 0, lastUsed: null }
  const nextLevel = s.level + 1
  const cost = STICKER_COSTS[nextLevel]
  const coins = getCoins()
  coins.total -= cost
  saveCoins(coins)
  syncStatsToSupabase()
  stickers[type] = { ...s, level: nextLevel }
  saveStickers(stickers)
  return true
}

export function canUseSticker(type: string): boolean {
  const stickers = getStickers()
  const s = stickers[type]
  if (!s || s.level === 0) return false
  if (!s.lastUsed) return true
  const week = getWeekStart()
  return s.lastUsed !== week
}

export function useSticker(type: string): number {
  if (!canUseSticker(type)) return 1
  const stickers = getStickers()
  const s = stickers[type]
  if (!s) return 1
  stickers[type] = { ...s, lastUsed: getWeekStart() }
  saveStickers(stickers)
  return STICKER_MULTIPLIERS[s.level] || 1
}

/* ───── Mayor (computed from check-in data) ───── */

export function getMayorFromCheckIns(allCheckIns: CheckIn[], placeId: string): string | null {
  const counts: Record<string, number> = {}
  for (const ci of allCheckIns) {
    if (ci.place_id === placeId) {
      counts[ci.user_name] = (counts[ci.user_name] || 0) + 1
    }
  }
  let top: string | null = null
  let topCount = 0
  for (const [name, count] of Object.entries(counts)) {
    if (count > topCount) {
      topCount = count
      top = name
    }
  }
  return top
}

export function getUserCheckInCountFromCheckIns(allCheckIns: CheckIn[], placeId: string, userName: string): number {
  return allCheckIns.filter((ci) => ci.place_id === placeId && ci.user_name === userName).length
}

/* ───── Leaderboard (computed from check-in data) ───── */

export interface LeaderboardEntry {
  name: string
  score: number
}

function scoreFromCheckIns(checkIns: CheckIn[]): LeaderboardEntry[] {
  const scores: Record<string, number> = {}
  for (const ci of checkIns) {
    scores[ci.user_name] = (scores[ci.user_name] || 0) + (ci.points_awarded ?? 10)
  }
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
}

export function getWeeklyLeaderboardFromCheckIns(allCheckIns: CheckIn[]): LeaderboardEntry[] {
  const week = getWeekStart()
  return scoreFromCheckIns(allCheckIns.filter((ci) => ci.created_at >= week))
}

export function getMonthlyLeaderboardFromCheckIns(allCheckIns: CheckIn[]): LeaderboardEntry[] {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  return scoreFromCheckIns(allCheckIns.filter((ci) => new Date(ci.created_at) >= monthStart))
}

export function getAllTimeLeaderboardFromCheckIns(allCheckIns: CheckIn[]): LeaderboardEntry[] {
  return scoreFromCheckIns(allCheckIns)
}

export function getCheckInStreaks(checkIns: CheckIn[], userName: string): {
  current: number
  longest: number
  dailyDates: string[]
} {
  const myDates = new Set(
    checkIns
      .filter((ci) => ci.user_name === userName)
      .map((ci) => isoToLocalDate(ci.created_at)),
  )
  const sorted = [...myDates].sort().reverse()
  let current = 0
  for (const d of sorted) {
    const expected = getExpectedDate(current)
    if (d === expected) {
      current++
    } else break
  }
  let longest = 0
  let streak = 0
  let prev: string | null = null
  for (const d of [...myDates].sort()) {
    if (prev) {
      const diff = (new Date(d).getTime() - new Date(prev).getTime()) / 86400000
      if (diff === 1) {
        streak++
      } else {
        streak = 1
      }
    } else {
      streak = 1
    }
    if (streak > longest) longest = streak
    prev = d
  }
  return { current, longest, dailyDates: [...myDates].sort() }
}

function getExpectedDate(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return isoToLocalDate(d.toISOString())
}

/* ───── Bonus calculations ───── */

export function calcCheckInBonus(place: Place, userCheckInCount: number, isMayor: boolean, friendCheckedIn: boolean, streakDays: number = 0): {
  base: number
  mayorBonus: number
  friendBonus: number
  streakBonus: number
  total: number
  multiplier: number
} {
  let base = 10
  let mayorBonus = 0
  let friendBonus = 0
  if (isMayor) mayorBonus = 5
  if (userCheckInCount === 0) base += 2
  if (!friendCheckedIn) friendBonus = 3
  const streakBonus = Math.min(streakDays, 5)
  const multiplier = getStickerLevelMultiplier(place.type)
  const raw = (base + mayorBonus + friendBonus + streakBonus) * multiplier
  return { base, mayorBonus, friendBonus, streakBonus, total: Math.round(raw), multiplier }
}

export function formatCoins(amount: number): string {
  return `🪙 ${amount}`
}
