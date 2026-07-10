import { describe, it, expect } from 'vitest'
import { parsePlaceAddress } from './address'

describe('parsePlaceAddress', () => {
  it('returns empty for missing input', () => {
    expect(parsePlaceAddress('')).toEqual({})
    expect(parsePlaceAddress(null)).toEqual({})
    expect(parsePlaceAddress(undefined)).toEqual({})
  })

  it('parses a Norwegian-style address', () => {
    const r = parsePlaceAddress('Karl Johans gate 1, 0154 Oslo, Oslo, Norway')
    expect(r.city).toBe('Oslo')
    expect(r.county).toBe('Oslo')
  })

  it('parses a US-style address', () => {
    const r = parsePlaceAddress('350 5th Ave, New York, NY 10118, United States')
    expect(r.city).toBe('New York')
  })

  it('parses a UK-style address with county', () => {
    const r = parsePlaceAddress('221B Baker Street, London NW1 6XE, Greater London, England, United Kingdom')
    expect(r.city).toBe('London')
    expect(r.county).toBe('Greater London')
  })

  it('uses positional fallback when no keywords match', () => {
    const r = parsePlaceAddress('Some Cafe, Springfield, Greene, Missouri, United States')
    expect(r.city).toBe('Springfield')
    expect(r.county).toBe('Greene')
  })

  it('skips postcodes and state abbreviations', () => {
    const r = parsePlaceAddress('1 Main St, Portland, OR, United States')
    expect(r.city).toBe('Portland')
    expect(r.county).toBeUndefined()
  })

  it('returns just a city for a 2-part address', () => {
    const r = parsePlaceAddress('Cafe Marco, Rome')
    expect(r.city).toBe('Rome')
  })

  it('strips parenthetical comments', () => {
    const r = parsePlaceAddress('Main Cafe (downtown), Berlin, Berlin (state), Germany')
    expect(r.city).toBe('Berlin')
    expect(r.county).toBe('Berlin')
  })

  it('captures country as the canonical name', () => {
    expect(parsePlaceAddress('Karl Johans gate 1, 0154 Oslo, Oslo, Norway').country).toBe('Norway')
    expect(parsePlaceAddress('221B Baker Street, London NW1 6XE, Greater London, England, United Kingdom').country).toBe('United Kingdom')
    expect(parsePlaceAddress('350 5th Ave, New York, NY 10118, United States').country).toBe('United States')
    expect(parsePlaceAddress('Main Cafe (downtown), Berlin, Berlin (state), Germany').country).toBe('Germany')
    expect(parsePlaceAddress('Some Cafe, Springfield, Greene, Missouri, United States').country).toBe('United States')
  })

  it('canonicalises country aliases so USA / U.S.A. / United States all collapse', () => {
    expect(parsePlaceAddress('1 Main St, Portland, OR, USA').country).toBe('United States')
    expect(parsePlaceAddress('1 Main St, Portland, OR, U.S.A.').country).toBe('United States')
    expect(parsePlaceAddress('1 Main St, Portland, OR, United States').country).toBe('United States')
    expect(parsePlaceAddress('Some Cafe, London, uk').country).toBe('United Kingdom')
  })

  it('returns undefined country when no country token is present', () => {
    expect(parsePlaceAddress('Cafe Marco, Rome').country).toBeUndefined()
    expect(parsePlaceAddress('Somewhere, Nowhere').country).toBeUndefined()
  })
})
