import { getTodayLocal } from './date'

/**
 * Once-per-day import gate for the user-facing "Add places" flow on the
 * Places page. Admin imports on the Admin page are intentionally NOT gated.
 *
 * Persistence: a single YYYY-MM-DD string in localStorage. The date is the
 * user's local date (matching `getTodayLocal()`), so the gate resets on local
 * midnight regardless of timezone — a user who travels can't accidentally
 * bypass it.
 *
 * Writes are guarded with try/catch so a quota or private-mode failure can
 * never crash the import — it just means we can't gate that browser session.
 */
const STORAGE_KEY = 'checkin_last_user_import_date'

/** The local date the user last completed a successful import, or null. */
export function readLastUserImportDate(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}

/** Stamp today's local date so subsequent calls to `hasImportedToday()` return
 *  true. Call exactly once per successful import — not before the network
 *  call, so a failed fetch doesn't burn the user's daily quota. */
export function writeLastUserImportDate(date: string = getTodayLocal()): void {
  try { localStorage.setItem(STORAGE_KEY, date) } catch { /* quota / private mode */ }
}

/** Reset the gate. Useful for Settings → Reset or unit tests. */
export function clearLastUserImportDate(): void {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

/** True if the user's last successful import was during today's local date. */
export function hasImportedToday(): boolean {
  const last = readLastUserImportDate()
  if (!last) return false
  return last === getTodayLocal()
}

/** Hours remaining until local midnight — useful as a "come back in 6 hours"
 *  hint in the UI. Returns 0 on the floor (defensive against clock skew). */
export function hoursUntilNextImport(): number {
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  return Math.max(0, (tomorrow.getTime() - now.getTime()) / 3_600_000)
}
