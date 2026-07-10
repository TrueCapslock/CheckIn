import { awardCoins } from './points'
import { getAllCheckIns, getPlace } from './places'
import { getCachedPlace } from './local-places'
import { parsePlaceAddress } from './address'
import { getUser } from './user'
import { getTodayLocal } from './date'

const ACHIEVEMENTS_KEY = 'checkin_achievements'
const STREAK_KEY = 'checkin_streaks'

/* ───── Achievement definitions ───── */

export interface AchievementDef {
  id: string
  title: string
  description: string
  icon: string
  coins: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_checkin', title: 'First Steps', description: 'Complete your first check-in', icon: '👣', coins: 10 },
  { id: 'first_bar', title: 'First Round', description: 'Check in at a bar', icon: '🍺', coins: 15 },
  { id: 'first_restaurant', title: 'First Bite', description: 'Check in at a restaurant', icon: '🍽️', coins: 15 },
  { id: 'first_cafe', title: 'First Brew', description: 'Check in at a cafe', icon: '☕', coins: 15 },
  { id: 'first_club', title: 'First Beat', description: 'Check in at a club', icon: '🎵', coins: 15 },
  { id: 'first_lounge', title: 'First Sip', description: 'Check in at a lounge', icon: '🥂', coins: 15 },
  { id: 'first_park', title: 'Green Thumb', description: 'Check in at a park', icon: '🌳', coins: 15 },
  { id: 'first_things_to_do', title: 'Tourist', description: 'Check in at a tourist attraction', icon: '🎪', coins: 15 },
  { id: 'first_hotel', title: 'First Stay', description: 'Check in at a hotel', icon: '🏨', coins: 15 },
  { id: 'first_city', title: 'Explorer', description: 'Visit your first city', icon: '🏙️', coins: 25 },
  { id: 'city_5', title: 'Traveler', description: 'Visit 5 unique cities', icon: '🗺️', coins: 100 },
  { id: 'city_10', title: 'Globetrotter', description: 'Visit 10 unique cities', icon: '🌎', coins: 200 },
  { id: 'city_25', title: 'World Citizen', description: 'Visit 25 unique cities', icon: '🌍', coins: 500 },
  { id: 'first_county', title: 'County Lines', description: 'Visit your first county', icon: '🛣️', coins: 50 },
  { id: 'county_5', title: 'Regional', description: 'Visit 5 unique counties', icon: '📍', coins: 100 },
  { id: 'county_10', title: 'Provincial', description: 'Visit 10 unique counties', icon: '🗺️', coins: 200 },
  { id: 'county_25', title: 'National', description: 'Visit 25 unique counties', icon: '🇺🇳', coins: 500 },
  { id: 'streak_3', title: 'Hat Trick', description: 'Check in 3 days in a row', icon: '🏒', coins: 30 },
  { id: 'streak_7', title: 'Week Warrior', description: 'Check in 7 days in a row', icon: '📅', coins: 100 },
  { id: 'bar_streak_7', title: 'Bar Fly', description: 'Check in at any bar 7 days in a row', icon: '🍻', coins: 100 },
  { id: 'checkins_10', title: 'Getting Started', description: '10 total check-ins', icon: '🚀', coins: 25 },
  { id: 'checkins_50', title: 'Regular', description: '50 total check-ins', icon: '⭐', coins: 100 },
  { id: 'checkins_100', title: 'Veteran', description: '100 total check-ins', icon: '💎', coins: 250 },
  { id: 'party_first', title: 'Party Starter', description: 'Create your first party', icon: '🎉', coins: 25 },
  { id: 'party_join', title: 'Social Butterfly', description: 'Join a party', icon: '🦋', coins: 15 },
  { id: 'party_checkin_3', title: 'Life of the Party', description: 'Check in at 3 places during one party', icon: '🎊', coins: 50 },
  { id: 'party_attend_5', title: 'Party Animal', description: 'Attend 5 parties', icon: '🐾', coins: 100 },
  { id: 'party_host_3', title: 'Host with the Most', description: 'Host 3 parties', icon: '🎙️', coins: 75 },
]

/* ───── Progress persistence ───── */

export interface AchievementState {
  unlocked: boolean
  unlockedAt?: string
}

export interface StreakData {
  currentStreak: number
  lastDate: string
  barStreak: number
  lastBarDate: string | null
}

function loadAchievements(): Record<string, AchievementState> {
  try {
    return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY) || '{}')
  } catch { return {} }
}

function saveAchievements(a: Record<string, AchievementState>) {
  localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(a))
  syncAchievementsToSupabase(a)
}

async function syncAchievementsToSupabase(achievements: Record<string, AchievementState>) {
  try {
    const { supabase } = await import('./supabase')
    const user = getUser()
    if (!user?.email) return
    const { error } = await supabase.from('users').update({ achievements }).eq('email', user.email)
    if (error) throw error
  } catch {
    const user = getUser()
    if (!user?.email) return
    const { addToStoreQueue } = await import('./sync')
    addToStoreQueue({ type: 'achievements', email: user.email, data: achievements as Record<string, unknown> })
  }
}

function loadStreaks(): StreakData {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || '{"currentStreak":0,"lastDate":"","barStreak":0,"lastBarDate":null}')
  } catch { return { currentStreak: 0, lastDate: '', barStreak: 0, lastBarDate: null } }
}

function saveStreaks(s: StreakData) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(s))
  syncStreaksToSupabase(s)
}

async function syncStreaksToSupabase(streaks: StreakData) {
  try {
    const { supabase } = await import('./supabase')
    const user = getUser()
    if (!user?.email) return
    const { error } = await supabase.from('users').update({ streaks }).eq('email', user.email)
    if (error) throw error
  } catch {
    const user = getUser()
    if (!user?.email) return
    const { addToStoreQueue } = await import('./sync')
    addToStoreQueue({ type: 'streaks', email: user.email, data: streaks as unknown as Record<string, unknown> })
  }
}

export async function loadStreaksFromDb(): Promise<void> {
  try {
    const { supabase } = await import('./supabase')
    const user = getUser()
    if (!user?.email) return
    const { data, error } = await supabase.from('users').select('streaks').eq('email', user.email).single()
    if (error) throw error
    if (data?.streaks && typeof data.streaks === 'object') {
      const s = data.streaks as StreakData
      if (typeof s.currentStreak === 'number') {
        localStorage.setItem(STREAK_KEY, JSON.stringify(s))
      }
    }
  } catch {
    // Local cache is fine
  }
}

export function getAchievements(): Record<string, AchievementState> {
  return loadAchievements()
}

export function getUnlockedAchievements(): AchievementDef[] {
  const state = loadAchievements()
  return ACHIEVEMENTS.filter((a) => state[a.id]?.unlocked)
}

export function getLockedAchievements(): AchievementDef[] {
  const state = loadAchievements()
  return ACHIEVEMENTS.filter((a) => !state[a.id]?.unlocked)
}

function isSameDay(d1: string, d2: string): boolean {
  return d1.slice(0, 10) === d2.slice(0, 10)
}

function isConsecutiveDay(prev: string, current: string): boolean {
  const prevDate = new Date(prev.slice(0, 10))
  const currDate = new Date(current.slice(0, 10))
  const diff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
  return diff === 1
}

/* ───── Check and unlock ───── */

export interface UnlockResult {
  achievement: AchievementDef
  total: number
}

export async function checkAchievements(placeId: string, placeType: string, userName: string): Promise<UnlockResult[]> {
  const state = loadAchievements()
  const streaks = loadStreaks()
  const today = getTodayLocal()
  const allCheckIns = await getAllCheckIns()
  const mine = allCheckIns.filter((ci) => ci.user_name === userName)
  const justUnlocked: UnlockResult[] = []

  function unlock(id: string) {
    if (state[id]?.unlocked) return
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (!def) return
    state[id] = { unlocked: true, unlockedAt: new Date().toISOString() }
    awardCoins(def.coins)
    justUnlocked.push({ achievement: def, total: def.coins })
  }

  // ── First check-in ──
  if (mine.length <= 1) {
    unlock('first_checkin')
  }

  // ── First of type ──
  const typeKey = `first_${placeType}` as string
  if (ACHIEVEMENTS.some((a) => a.id === typeKey)) {
    unlock(typeKey)
  }

  // ── Streak (general) ──
  if (streaks.lastDate) {
    if (isSameDay(streaks.lastDate, today)) {
      // Already checked in today, streak unchanged
    } else if (isConsecutiveDay(streaks.lastDate, today + 'T00:00:00Z')) {
      streaks.currentStreak += 1
    } else {
      streaks.currentStreak = 1
    }
  } else {
    streaks.currentStreak = 1
  }
  streaks.lastDate = today

  if (streaks.currentStreak >= 3) unlock('streak_3')
  if (streaks.currentStreak >= 7) unlock('streak_7')

  // ── Bar streak ──
  if (placeType === 'bar') {
    if (streaks.lastBarDate) {
      if (isSameDay(streaks.lastBarDate, today)) {
        // Already checked in at bar today
      } else if (isConsecutiveDay(streaks.lastBarDate, today + 'T00:00:00Z')) {
        streaks.barStreak += 1
      } else {
        streaks.barStreak = 1
      }
    } else {
      streaks.barStreak = 1
    }
    streaks.lastBarDate = today
    if (streaks.barStreak >= 7) unlock('bar_streak_7')
  }

  saveStreaks(streaks)

  // ── Milestone check-ins ──
  const count = mine.length + 1 // include current check-in
  if (count >= 10) unlock('checkins_10')
  if (count >= 50) unlock('checkins_50')
  if (count >= 100) unlock('checkins_100')

  // ── City & county milestones ──
  // Look up each Place once (prefer local cache to avoid hammering Supabase) and
  // parse city/county from its Nominatim-style address. Count unique values
  // across all of the user's check-ins plus the current place.
  const uniquePlaceIds = Array.from(new Set([...mine.map((ci) => ci.place_id), placeId]))
  const cities = new Set<string>()
  const counties = new Set<string>()

  for (const pid of uniquePlaceIds) {
    let place = getCachedPlace(pid)
    if (!place) {
      try { place = await getPlace(pid) } catch { /* keep null */ }
    }
    if (!place?.address) continue
    const { city, county } = parsePlaceAddress(place.address)
    if (city) cities.add(city)
    if (county) counties.add(county)
  }

  if (cities.size >= 1) unlock('first_city')
  if (cities.size >= 5) unlock('city_5')
  if (cities.size >= 10) unlock('city_10')
  if (cities.size >= 25) unlock('city_25')

  if (counties.size >= 1) unlock('first_county')
  if (counties.size >= 5) unlock('county_5')
  if (counties.size >= 10) unlock('county_10')
  if (counties.size >= 25) unlock('county_25')

  saveAchievements(state)
  return justUnlocked
}

/* ───── Party achievements ───── */

const PARTY_ACHIEVEMENTS_KEY = 'checkin_party_achievements'

function loadPartyState(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PARTY_ACHIEVEMENTS_KEY) || '{}')
  } catch { return {} }
}

function savePartyState(s: Record<string, number>) {
  localStorage.setItem(PARTY_ACHIEVEMENTS_KEY, JSON.stringify(s))
}

export async function checkPartyAchievements(
  partyId: string,
  createdBy: string,
  currentUser: string,
): Promise<UnlockResult[]> {
  const state = loadAchievements()
  const justUnlocked: UnlockResult[] = []

  function unlock(id: string) {
    if (state[id]?.unlocked) return
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (!def) return
    state[id] = { unlocked: true, unlockedAt: new Date().toISOString() }
    awardCoins(def.coins)
    justUnlocked.push({ achievement: def, total: def.coins })
  }

  const partyState = loadPartyState()
  const partyKey = `party_${partyId}`

  if (currentUser === createdBy) {
    unlock('party_first')
    const hostedCount = Object.keys(partyState).filter((k) => k.startsWith('created_')).length
    if (hostedCount >= 2) unlock('party_host_3')
  }

  if (!partyState[partyKey]) {
    unlock('party_join')
  }
  partyState[partyKey] = (partyState[partyKey] || 0) + 1
  if (partyState[partyKey] >= 3) unlock('party_checkin_3')

  const attended = Object.keys(partyState).filter((k) => !k.startsWith('created_')).length
  if (attended >= 5) unlock('party_attend_5')

  savePartyState(partyState)
  saveAchievements(state)
  return justUnlocked
}
