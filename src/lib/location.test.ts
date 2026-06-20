import { describe, it, expect } from 'vitest'
import { getDistance, formatDistance } from './location'

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
