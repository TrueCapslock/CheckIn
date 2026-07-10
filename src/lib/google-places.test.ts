import { describe, it, expect } from 'vitest'
import { mapGoogleType, getPhotoUrl } from './google-places'

describe('mapGoogleType', () => {
  it('maps bar type', () => {
    expect(mapGoogleType(['bar'])).toBe('bar')
  })

  it('maps restaurant type', () => {
    expect(mapGoogleType(['restaurant'])).toBe('restaurant')
  })

  it('maps cafe type', () => {
    expect(mapGoogleType(['cafe'])).toBe('cafe')
  })

  it('maps night_club to club', () => {
    expect(mapGoogleType(['night_club'])).toBe('club')
  })

  it('maps lounge type', () => {
    expect(mapGoogleType(['lounge'])).toBe('lounge')
  })

  it('maps food to restaurant', () => {
    expect(mapGoogleType(['food'])).toBe('restaurant')
  })

  it('maps pub to bar', () => {
    expect(mapGoogleType(['pub'])).toBe('bar')
  })

  it('maps bakery to cafe', () => {
    expect(mapGoogleType(['bakery'])).toBe('cafe')
  })

  it('maps coffee_shop to cafe', () => {
    expect(mapGoogleType(['coffee_shop'])).toBe('cafe')
  })

  it('maps lodging to hotel', () => {
    expect(mapGoogleType(['lodging'])).toBe('hotel')
  })

  it('defaults to restaurant for unknown types', () => {
    expect(mapGoogleType(['unknown_type'])).toBe('restaurant')
  })

  it('uses the first matching type', () => {
    expect(mapGoogleType(['unknown', 'bar', 'cafe'])).toBe('bar')
  })

  it('defaults for empty array', () => {
    expect(mapGoogleType([])).toBe('restaurant')
  })
})

describe('getPhotoUrl', () => {
  it('builds a photo URL', () => {
    const url = getPhotoUrl('places/abc/photo')
    expect(url).toContain('places/abc/photo')
    expect(url).toContain('maxHeightPx=400')
    expect(url).toContain('key=test-key')
  })

  it('respects custom maxHeight', () => {
    const url = getPhotoUrl('places/abc/photo', 800)
    expect(url).toContain('maxHeightPx=800')
  })
})
