// src/lib/auth.test.ts
//
// Pure-helper coverage for the instant-auth allowlist. The actual sign-in
// round-trip is exercised manually because it touches the vite-plugin-pwa
// dev server, sessionStorage, and the Supabase registry.

import { describe, it, expect } from 'vitest'
import { INSTANT_AUTH_EMAILS, isInstantAuthEmail } from './auth'

describe('INSTANT_AUTH_EMAILS', () => {
  it('includes rune.glad@gmail.com exactly once', () => {
    const matches = Array.from(INSTANT_AUTH_EMAILS).filter((e) => e === 'rune.glad@gmail.com')
    expect(matches.length).toBe(1)
  })
})

describe('isInstantAuthEmail', () => {
  it('matches the exact allowlist entry', () => {
    expect(isInstantAuthEmail('rune.glad@gmail.com')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isInstantAuthEmail('RUNE.GLAD@GMAIL.COM')).toBe(true)
    expect(isInstantAuthEmail('Rune.glad@Gmail.Com')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isInstantAuthEmail('  rune.glad@gmail.com  ')).toBe(true)
    expect(isInstantAuthEmail('\trune.glad@gmail.com\n')).toBe(true)
  })

  it('rejects a similar-but-different address', () => {
    expect(isInstantAuthEmail('rune.glad+spam@gmail.com')).toBe(false)
    expect(isInstantAuthEmail('rune.glad@gmail.com.evil.test')).toBe(false)
    expect(isInstantAuthEmail('rune.glad@gmail.con')).toBe(false)
  })

  it('rejects empty string and unrelated addresses', () => {
    expect(isInstantAuthEmail('')).toBe(false)
    expect(isInstantAuthEmail('alice@example.com')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(isInstantAuthEmail(undefined)).toBe(false)
    expect(isInstantAuthEmail(null)).toBe(false)
    expect(isInstantAuthEmail(123)).toBe(false)
    expect(isInstantAuthEmail({})).toBe(false)
    expect(isInstantAuthEmail([])).toBe(false)
  })
})
