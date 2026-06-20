import { useEffect, useState } from 'react'
import { getUser } from './user'

const CONFIG_KEY = 'checkin_config'

interface AppConfig {
  max_check_in_distance: number
  party_enabled: boolean
}

const DEFAULTS: AppConfig = { max_check_in_distance: 100, party_enabled: true }

let cachedConfig: AppConfig | null = null

function loadLocal(): AppConfig {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') || DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function saveLocal(config: AppConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}

function getConfig(): AppConfig {
  if (!cachedConfig) cachedConfig = loadLocal()
  return cachedConfig
}

function notify() {
  window.dispatchEvent(new CustomEvent('config-changed'))
}

/* ───── Load config from DB (call on app startup + foreground) ───── */

export async function loadConfigFromDb(): Promise<void> {
  try {
    const res = await fetch('/api/config')
    if (!res.ok) return
    if (!/application\/json/.test(res.headers.get('content-type') || '')) return
    const data = await res.json()
    if (data && typeof data.max_check_in_distance === 'number') {
      const config: AppConfig = {
        max_check_in_distance: data.max_check_in_distance,
        party_enabled: data.party_enabled !== false,
      }
      cachedConfig = config
      saveLocal(config)
      notify()
    }
  } catch (e) {
    console.warn('Config load failed, using local cache:', e)
  }
}

async function syncConfigToDb(updates: Partial<AppConfig>): Promise<true | string> {
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) {
      const err = await res.text()
      console.warn('Config sync failed:', res.status, err)
      return err || `HTTP ${res.status}`
    }
    return true
  } catch (e) {
    const msg = (e as Error).message
    console.warn('Config sync failed:', msg)
    return msg
  }
}

/* ───── Admin check ───── */

export function getAdminEmail(): string {
  return (import.meta.env.VITE_ADMIN_EMAIL || '').trim().toLowerCase()
}

export function isAdmin(): boolean {
  const adminEmail = getAdminEmail()
  const userEmail = getUser()?.email?.trim().toLowerCase() || ''
  return !!adminEmail && userEmail === adminEmail
}

/* ───── Sync local state to DB ───── */

export async function syncConfig(): Promise<true | string> {
  const result = await syncConfigToDb({ max_check_in_distance: getConfig().max_check_in_distance, party_enabled: getConfig().party_enabled })
  if (result === true) await loadConfigFromDb()
  return result
}

/* ───── Check-in distance ───── */

export function getMaxCheckInDistance(): number {
  return getConfig().max_check_in_distance
}

export function setMaxCheckInDistance(meters: number) {
  const config = getConfig()
  config.max_check_in_distance = meters
  cachedConfig = config
  saveLocal(config)
  notify()
}

/* ───── Party toggle ───── */

export function isPartyEnabled(): boolean {
  return getConfig().party_enabled
}

export function setPartyEnabled(enabled: boolean) {
  const config = getConfig()
  config.party_enabled = enabled
  cachedConfig = config
  saveLocal(config)
  notify()
}

export function usePartyEnabled(): boolean {
  const [enabled, setEnabled] = useState(isPartyEnabled())
  useEffect(() => {
    const handler = () => setEnabled(isPartyEnabled())
    window.addEventListener('config-changed', handler)
    return () => window.removeEventListener('config-changed', handler)
  }, [])
  return enabled
}

/* ───── Recalculate stats ───── */

export async function recalculateStats(email?: string): Promise<{ ok: boolean; results?: unknown[]; error?: string }> {
  try {
    const res = await fetch('/api/recalculate-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(email ? { email } : {}),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function deleteUser(email: string, name: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/* ───── Reset app ───── */

export async function resetApp(fullReset: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullReset }),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
