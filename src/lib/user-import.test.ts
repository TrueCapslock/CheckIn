import { describe, it, expect, beforeEach } from 'vitest'
import {
  readLastUserImportDate,
  writeLastUserImportDate,
  clearLastUserImportDate,
  hasImportedToday,
  hoursUntilNextImport,
} from './user-import'
import { getTodayLocal } from './date'

// Minimal in-memory localStorage for the node test env (no jsdom dependency).
// Installed fresh per `beforeEach` so tests don't leak.
function shimLocalStorage() {
  const store: Record<string, string> = {}
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v) },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { for (const k of Object.keys(store)) delete store[k] },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length },
  }
}

describe('user-import gate', () => {
  beforeEach(() => {
    shimLocalStorage()
    clearLastUserImportDate()
  })

  it('returns false on a fresh store', () => {
    expect(hasImportedToday()).toBe(false)
    expect(readLastUserImportDate()).toBeNull()
  })

  it("returns true once today's local date is stamped", () => {
    writeLastUserImportDate(getTodayLocal())
    expect(hasImportedToday()).toBe(true)
    expect(readLastUserImportDate()).toBe(getTodayLocal())
  })

  it('returns false when the stored date is yesterday', () => {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    const stamp = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
    writeLastUserImportDate(stamp)
    expect(hasImportedToday()).toBe(false)
  })

  it('returns false when the stored date is tomorrow (clock skew guard)', () => {
    const t = new Date()
    t.setDate(t.getDate() + 1)
    const stamp = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    writeLastUserImportDate(stamp)
    expect(hasImportedToday()).toBe(false)
  })

  it('clearLastUserImportDate unblocks the gate', () => {
    writeLastUserImportDate(getTodayLocal())
    expect(hasImportedToday()).toBe(true)
    clearLastUserImportDate()
    expect(hasImportedToday()).toBe(false)
    expect(readLastUserImportDate()).toBeNull()
  })

  it('writeLastUserImportDate() with no arg stamps today', () => {
    writeLastUserImportDate()
    expect(readLastUserImportDate()).toBe(getTodayLocal())
  })

  it('writeLastUserImportDate accepts an explicit date arg', () => {
    writeLastUserImportDate('2025-01-15')
    expect(readLastUserImportDate()).toBe('2025-01-15')
    expect(hasImportedToday()).toBe(false) // not today's date
  })

  it('hoursUntilNextImport is in (0, 24]', () => {
    const h = hoursUntilNextImport()
    expect(h).toBeGreaterThan(0)
    expect(h).toBeLessThanOrEqual(24)
  })
})
