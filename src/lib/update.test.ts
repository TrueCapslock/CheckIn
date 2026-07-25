// src/lib/update.test.ts
//
// Pure-helper coverage for the update cooldown. We avoid testing the
// registerSW / virtual:pwa-register integration since it's an opaque virtual
// module wired into the build pipeline — the actual behavior is validated by
// a manual browser smoke test (see README updates).

import { describe, it, expect, beforeEach } from 'vitest'

// Shim `localStorage` for Node test environments where it's not a global.
// The production code already wraps localStorage calls in try/catch, so this
// shim is purely so the tests can drive the same behavior end-to-end.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => { store.clear() },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size },
    },
  })
}

// Import the source under test. The shim above guarantees a working
// localStorage on every test environment.
import {
  DISMISS_COOLDOWN_MS,
  _resetForTests,
  isCooldownActive,
  readLastDismissed,
  writeLastDismissed,
} from './update'

beforeEach(() => {
  _resetForTests()
  try { localStorage.clear() } catch { /* ignore */ }
})

// --- localStorage round-trip ---

describe('readLastDismissed', () => {
  it('returns 0 when nothing has been written', () => {
    expect(readLastDismissed()).toBe(0)
  })

  it('returns the stored timestamp as a number', () => {
    localStorage.setItem('checkin_update_dismissed_at', '1700000000000')
    expect(readLastDismissed()).toBe(1700000000000)
  })

  it('returns 0 for a non-numeric value', () => {
    localStorage.setItem('checkin_update_dismissed_at', 'not-a-number')
    expect(readLastDismissed()).toBe(0)
  })

  it('returns 0 for an empty string', () => {
    localStorage.setItem('checkin_update_dismissed_at', '')
    expect(readLastDismissed()).toBe(0)
  })

  it('returns 0 when stored value is negative', () => {
    localStorage.setItem('checkin_update_dismissed_at', '-5')
    expect(readLastDismissed()).toBe(0)
  })
})

describe('writeLastDismissed', () => {
  it('writes a timestamped value (explicit arg)', () => {
    writeLastDismissed(1700000000000)
    expect(readLastDismissed()).toBe(1700000000000)
  })

  it('defaults to Date.now() when called with no args', () => {
    const before = Date.now()
    writeLastDismissed()
    const after = Date.now()
    const v = readLastDismissed()
    expect(v).toBeGreaterThanOrEqual(before)
    expect(v).toBeLessThanOrEqual(after)
  })
})

// --- Cooldown math ---

describe('isCooldownActive', () => {
  it('is false when lastDismissed is 0 (never dismissed)', () => {
    expect(isCooldownActive(0, Date.now())).toBe(false)
  })

  it('is true within the 24h cooldown window', () => {
    const now = 100_000_000_000
    const within = now - DISMISS_COOLDOWN_MS + 1000
    expect(isCooldownActive(within, now)).toBe(true)
  })

  it('is false exactly at the cooldown boundary', () => {
    const now = 100_000_000_000
    const boundary = now - DISMISS_COOLDOWN_MS
    expect(isCooldownActive(boundary, now)).toBe(false)
  })

  it('is false after the cooldown has expired', () => {
    const now = 100_000_000_000
    const stale = now - DISMISS_COOLDOWN_MS - 1000
    expect(isCooldownActive(stale, now)).toBe(false)
  })

  it('respects a custom cooldown argument', () => {
    const now = 100_000_000_000
    // Last dismiss 5 seconds ago — 1-second cooldown is expired
    expect(isCooldownActive(now - 5_000, now, 1_000)).toBe(false)
    // Last dismiss 5 seconds ago — 10-second cooldown is still active
    expect(isCooldownActive(now - 5_000, now, 10_000)).toBe(true)
  })

  it('returns false if lastDismissed is in the future (clock skew guard)', () => {
    // Suppress fires, then user travels back in time. Should NOT keep the
    // banner hidden forever — treat future timestamps as "now".
    const now = 100_000_000_000
    expect(isCooldownActive(now + 60_000, now)).toBe(false)
  })
})
