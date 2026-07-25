// Minimal in-memory localStorage shim for the node test environment so the
// helper modules that touch it don't throw. Keeps Vitest free of jsdom.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
}

import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatMessagePreview,
  buildCheckInMessageRows,
  readLastUnreadMessageCount,
  writeLastUnreadMessageCount,
} from './messages'

beforeEach(() => {
  localStorage.clear()
})

describe('formatMessagePreview', () => {
  it('produces "Name checked in at Place"', () => {
    expect(formatMessagePreview('Alice', 'Saffron Kitchen')).toBe('Alice checked in at Saffron Kitchen')
  })

  it('falls back to "a place" when name missing', () => {
    expect(formatMessagePreview('Bob')).toBe('Bob checked in at a place')
  })

  it('falls back to "a place" on empty string', () => {
    expect(formatMessagePreview('Bob', '')).toBe('Bob checked in at a place')
  })
})

describe('buildCheckInMessageRows', () => {
  it('returns one row per follower, excluding self', () => {
    const rows = buildCheckInMessageRows(
      'Alice',
      'alice@x.com',
      ['bob@y.com', 'carol@z.com', 'alice@x.com'],
      'p1',
      'c1',
      'Alice checked in at Saffron',
    )
    expect(rows.map((r) => r.recipient_email)).toEqual(['bob@y.com', 'carol@z.com'])
  })

  it('dedupes case-insensitively', () => {
    const rows = buildCheckInMessageRows(
      'Alice',
      'alice@x.com',
      ['bob@y.com', 'BOB@Y.COM', 'Bob@y.com'],
      'p1',
      'c1',
      'preview',
    )
    expect(rows.map((r) => r.recipient_email)).toEqual(['bob@y.com'])
  })

  it('returns [] when no followers', () => {
    expect(
      buildCheckInMessageRows('Alice', 'alice@x.com', [], 'p1', 'c1', 'p'),
    ).toEqual([])
  })

  it('returns [] when only self is present', () => {
    expect(
      buildCheckInMessageRows('Alice', 'alice@x.com', ['alice@x.com'], 'p1', 'c1', 'p'),
    ).toEqual([])
  })

  it('skips empty / whitespace recipients', () => {
    const rows = buildCheckInMessageRows(
      'Alice',
      'alice@x.com',
      ['', '   ', 'bob@y.com'],
      'p1',
      'c1',
      'p',
    )
    expect(rows.map((r) => r.recipient_email)).toEqual(['bob@y.com'])
  })

  it('skips self when actor email is empty or absent', () => {
    const rows = buildCheckInMessageRows('Alice', '', ['bob@y.com'], 'p1', 'c1', 'p')
    expect(rows.map((r) => r.recipient_email)).toEqual(['bob@y.com'])
  })

  it('uses default preview when none provided', () => {
    const rows = buildCheckInMessageRows('Alice', 'alice@x.com', ['bob@y.com'], 'p1', 'c1')
    expect(rows[0].preview).toBe('Alice checked in at a place')
  })

  it('preserves place_id and check_in_id', () => {
    const rows = buildCheckInMessageRows('Alice', 'alice@x.com', ['bob@y.com'], 'place-X', 'checkin-Y')
    expect(rows[0].place_id).toBe('place-X')
    expect(rows[0].check_in_id).toBe('checkin-Y')
  })

  it('handles null check_in_id', () => {
    const rows = buildCheckInMessageRows('Alice', 'alice@x.com', ['bob@y.com'], 'p1', null)
    expect(rows[0].check_in_id).toBeNull()
  })
})

describe('readLastUnreadMessageCount / writeLastUnreadMessageCount', () => {
  it('round-trips a count', () => {
    writeLastUnreadMessageCount('user@x.com', 42)
    expect(readLastUnreadMessageCount('user@x.com')).toBe(42)
  })

  it('returns 0 for an unknown email', () => {
    expect(readLastUnreadMessageCount('nobody@x.com')).toBe(0)
  })

  it('clamps negative writes to 0', () => {
    writeLastUnreadMessageCount('user@x.com', -5)
    expect(readLastUnreadMessageCount('user@x.com')).toBe(0)
  })

  it('is no-op for empty email', () => {
    writeLastUnreadMessageCount('', 7)
    expect(readLastUnreadMessageCount('')).toBe(0)
  })

  it('key is scoped per email', () => {
    writeLastUnreadMessageCount('a@x.com', 3)
    writeLastUnreadMessageCount('b@x.com', 9)
    expect(readLastUnreadMessageCount('a@x.com')).toBe(3)
    expect(readLastUnreadMessageCount('b@x.com')).toBe(9)
  })
})
