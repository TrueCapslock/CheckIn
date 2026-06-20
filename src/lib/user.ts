import type { StoredUser } from './auth'
import { supabase } from './supabase'

const STORAGE_KEY = 'checkin_user'
const AVATAR_PREFIX = 'checkin_avatar_'

// In-memory cache for other users' avatar URLs (avoids repeated DB queries)
const avatarUrlCache = new Map<string, string>()

export function getUsername(): string {
  return getUser()?.name || ''
}

export function getUser(): StoredUser | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

export function setUser(name: string, email: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email }))
}

export function clearUser(): void {
  const name = getUsername()
  localStorage.removeItem(STORAGE_KEY)
  if (name) localStorage.removeItem(AVATAR_PREFIX + name)
}

export function getAvatar(userName?: string): string | null {
  const name = userName || getUsername()
  if (!name) return null
  return localStorage.getItem(AVATAR_PREFIX + name)
}

export function setAvatar(dataUrl: string): void {
  const name = getUsername()
  if (!name) return
  localStorage.setItem(AVATAR_PREFIX + name, dataUrl)
}

export function removeAvatar(): void {
  const name = getUsername()
  if (!name) return
  localStorage.removeItem(AVATAR_PREFIX + name)
  const user = getUser()
  if (user?.email) {
    supabase.from('users').update({ avatar_url: null }).eq('email', user.email).then()
  }
}

export async function uploadAvatar(file: File): Promise<string | null> {
  const user = getUser()
  if (!user?.email || !user?.name) return null

  // Read file as data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

  // Store data URL in DB (anon key has UPDATE on users)
  const { error } = await supabase
    .from('users')
    .update({ avatar_url: dataUrl })
    .eq('email', user.email)

  if (error) {
    console.error('Avatar DB update failed:', error)
    return null
  }

  // Cache locally
  localStorage.setItem(AVATAR_PREFIX + user.name, dataUrl)
  avatarUrlCache.set(user.name, dataUrl)

  return dataUrl
}

export async function fetchAvatarUrl(userName: string): Promise<string | null> {
  if (!userName) return null

  // Check in-memory cache
  if (avatarUrlCache.has(userName)) {
    const cached = avatarUrlCache.get(userName)
    return cached || null
  }

  // Check localStorage (own avatar or previously seen)
  const local = localStorage.getItem(AVATAR_PREFIX + userName)
  if (local) {
    avatarUrlCache.set(userName, local)
    return local
  }

  // Query DB
  const { data, error } = await supabase
    .from('users')
    .select('avatar_url')
    .eq('name', userName)
    .maybeSingle()

  if (error || !data?.avatar_url) {
    avatarUrlCache.set(userName, '')
    return null
  }

  avatarUrlCache.set(userName, data.avatar_url)
  localStorage.setItem(AVATAR_PREFIX + userName, data.avatar_url)
  return data.avatar_url
}
