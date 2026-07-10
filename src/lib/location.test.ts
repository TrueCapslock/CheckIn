import { describe, it, expect } from 'vitest'
import { getDistance, formatDistance, isValidLngLat } from './location'

describe('getDistance', () => {
  it('returns 0 for the same point', () => {
    const d = getDistance({ latitude: 45.5, longitude: -122.6 }, { latitude: 45.5, longitude: -122.6 })
    expect(d).toBe(0)
  })

  it('calculates distance between two known points', () => {
    // Portland (45.5152, -122.6784) to roughly 1km north ~0.009 deg lat
    const d = getDistance(
      { latitude: 45.5152, longitude: -122.6784 },
      { latitude: 45.524, longitude: -122.6784 },
    )
    expect(d).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(1.1)
  })

  it('is commutative', () => {
    const a = { latitude: 59.91, longitude: 10.73 }
    const b = { latitude: 59.92, longitude: 10.75 }
    expect(getDistance(a, b)).toBeCloseTo(getDistance(b, a), 10)
  })
})

describe('formatDistance', () => {
  it('formats meters under 1km', () => {
    expect(formatDistance(0.2)).toBe('200m')
    expect(formatDistance(0.999)).toBe('999m')
  })

  it('formats km for 1km and above', () => {
    expect(formatDistance(1)).toBe('1.0km')
    expect(formatDistance(7.1)).toBe('7.1km')
    expect(formatDistance(42.567)).toBe('42.6km')
  })
})

describe('isValidLngLat', () => {
  it('accepts typical coordinates (Oslo, Portland, etc.)', () => {
    expect(isValidLngLat(59.9139, 10.7522)).toBe(true)
    expect(isValidLngLat(45.5152, -122.6784)).toBe(true)
    expect(isValidLngLat(-33.8688, 151.2093)).toBe(true)
  })

  it('accepts edges of the valid range', () => {
    expect(isValidLngLat(90, 180)).toBe(true)
    expect(isValidLngLat(-90, -180)).toBe(true)
    expect(isValidLngLat(0, 0)).toBe(true) // Null Island is mathematically valid
  })

  it('rejects null / undefined', () => {
    expect(isValidLngLat(null, 10)).toBe(false)
    expect(isValidLngLat(10, null)).toBe(false)
    expect(isValidLngLat(null, null)).toBe(false)
    expect(isValidLngLat(undefined, 10)).toBe(false)
    expect(isValidLngLat(10, undefined)).toBe(false)
  })

  it('rejects NaN and Infinity', () => {
    expect(isValidLngLat(NaN, 10)).toBe(false)
    expect(isValidLngLat(10, NaN)).toBe(false)
    expect(isValidLngLat(Infinity, 10)).toBe(false)
    expect(isValidLngLat(10, -Infinity)).toBe(false)
  })

  it('rejects lat out of range', () => {
    expect(isValidLngLat(91, 0)).toBe(false)
    expect(isValidLngLat(-91, 0)).toBe(false)
    expect(isValidLngLat(200, 0)).toBe(false) // the user's reported bug
  })

  it('rejects lng out of range', () => {
    expect(isValidLngLat(0, 181)).toBe(false)
    expect(isValidLngLat(0, -181)).toBe(false)
    expect(isValidLngLat(0, 200)).toBe(false)
  })

  it('rejects non-number types', () => {
    expect(isValidLngLat('59' as unknown as number, 10)).toBe(false)
    expect(isValidLngLat(59, '10' as unknown as number)).toBe(false)
  })
})
