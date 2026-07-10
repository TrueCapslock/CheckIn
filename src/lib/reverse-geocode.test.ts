import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getCityFromLngLat, composeAddressFromLngLat, BACKFILL_THROTTLE } from './reverse-geocode'

/**
 * Helper: stand up a one-shot mock fetch that returns the given JSON body.
 * For tests that need sequential calls, pass an array of bodies.
 */
function mockFetchSequence(responses: Array<{ ok: boolean; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    calls.push({ url: String(url), init: _init })
    const next = responses.shift()
    if (!next) {
      throw new Error(`mockFetchSequence exhausted at call #${calls.length}`)
    }
    return {
      ok: next.ok,
      json: async () => next.body,
      status: next.ok ? 200 : 500,
      statusText: next.ok ? 'OK' : 'Internal Server Error',
    } as Response
  })
  vi.stubGlobal('fetch', fn)
  return { calls, fn }
}

describe('getCityFromLngLat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns city + country from Photon when present', async () => {
    mockFetchSequence([{ ok: true, body: { features: [{ properties: { city: 'Oslo', country: 'Norway' } }] } }])
    const r = await getCityFromLngLat(10.75, 59.91)
    expect(r.city).toBe('Oslo')
    expect(r.country).toBe('Norway')
  })

  it('maps town/village/hamlet/suburb to city when present', async () => {
    mockFetchSequence([{ ok: true, body: { features: [{ properties: { town: 'Bergen', country: 'Norway' } }] } }])
    const r = await getCityFromLngLat(5.32, 60.39)
    expect(r.city).toBe('Bergen')
    expect(r.country).toBe('Norway')
  })

  it('maps state to county when county is missing', async () => {
    mockFetchSequence([{ ok: true, body: { features: [{ properties: { city: 'Berlin', state: 'Berlin', country: 'Germany' } }] } }])
    const r = await getCityFromLngLat(13.4, 52.5)
    expect(r.city).toBe('Berlin')
    expect(r.county).toBe('Berlin')
    expect(r.country).toBe('Germany')
  })

  it('falls back to BigDataCloud when Photon returns nothing', async () => {
    mockFetchSequence([
      { ok: true, body: { features: [] } },
      { ok: true, body: { city: 'Tokyo', principalSubdivision: 'Tokyo', countryName: 'Japan' } },
    ])
    const r = await getCityFromLngLat(139.69, 35.69)
    expect(r.city).toBe('Tokyo')
    expect(r.country).toBe('Japan')
  })

  it('falls back to BigDataCloud when Photon fails (non-OK)', async () => {
    mockFetchSequence([
      { ok: false, body: { error: 'rate limit' } },
      { ok: true, body: { city: 'Lisbon', countryName: 'Portugal' } },
    ])
    const r = await getCityFromLngLat(-9.14, 38.72)
    expect(r.city).toBe('Lisbon')
    expect(r.country).toBe('Portugal')
  })

  it('returns empty object when both providers fail', async () => {
    mockFetchSequence([
      { ok: false, body: null },
      { ok: false, body: null },
    ])
    const r = await getCityFromLngLat(0, 0)
    expect(r).toEqual({})
  })

  it('returns empty object when Photon returns weird shape with no features[0]', async () => {
    mockFetchSequence([{ ok: true, body: {} }])
    const r = await getCityFromLngLat(0, 0)
    expect(r).toEqual({})
  })
})

describe('composeAddressFromLngLat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds a comma-separated address from city, county, country', async () => {
    mockFetchSequence([{ ok: true, body: { features: [{ properties: { city: 'Oslo', county: 'Oslo', country: 'Norway' } }] } }])
    const a = await composeAddressFromLngLat(10.75, 59.91, 'Place Name')
    expect(a).toBe('Place Name, Oslo, Norway')
  })

  it('omits duplicate city/county when they match (e.g. Oslo)', async () => {
    mockFetchSequence([{ ok: true, body: { features: [{ properties: { city: 'Oslo', county: 'Oslo', country: 'Norway' } }] } }])
    const a = await composeAddressFromLngLat(10.75, 59.91)
    expect(a).toBe('Oslo, Norway')
  })

  it('returns null when no useful info is found', async () => {
    mockFetchSequence([{ ok: true, body: { features: [] } }, { ok: false, body: null }])
    const a = await composeAddressFromLngLat(0, 0)
    expect(a).toBeNull()
  })

  it('uses BigDataCloud city when Photon returns nothing', async () => {
    mockFetchSequence([
      { ok: true, body: { features: [] } },
      { ok: true, body: { city: 'Tokyo', countryName: 'Japan' } },
    ])
    const a = await composeAddressFromLngLat(139.69, 35.69)
    expect(a).toBe('Tokyo, Japan')
  })
})

describe('BACKFILL_THROTTLE', () => {
  it('is a positive integer ms value used for throttling', () => {
    expect(BACKFILL_THROTTLE).toBeGreaterThan(0)
    expect(Number.isInteger(BACKFILL_THROTTLE)).toBe(true)
  })
})
