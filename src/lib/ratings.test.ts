import { describe, it, expect } from 'vitest'
import type { Rating } from './types'
import { getAverageRating, filterRatingsToSelfAndFriends, paginateRatings } from './ratings'

const mkRating = (userName: string, rating: number): Rating => ({
  id: `id-${userName}-${rating}`,
  place_id: 'p',
  user_name: userName,
  rating,
  created_at: new Date().toISOString(),
})

describe('getAverageRating', () => {
  it('returns null for an empty list', () => {
    expect(getAverageRating([])).toBeNull()
  })

  it('returns null for null/undefined input', () => {
    expect(getAverageRating(null)).toBeNull()
    expect(getAverageRating(undefined)).toBeNull()
  })

  it('returns single-rating stats for a one-element list', () => {
    const stats = getAverageRating([mkRating('alice', 4)])
    expect(stats).toEqual({ avg: 4, count: 1 })
  })

  it('computes a 1-decimal average', () => {
    const stats = getAverageRating([mkRating('a', 5), mkRating('b', 4), mkRating('c', 3)])
    expect(stats).toEqual({ avg: 4, count: 3 })
  })

  it('produces fractional averages', () => {
    const stats = getAverageRating([mkRating('a', 5), mkRating('b', 2)])
    expect(stats?.avg).toBeCloseTo(3.5)
    expect(stats?.count).toBe(2)
  })
})

describe('filterRatingsToSelfAndFriends', () => {
  const ratings: Rating[] = [
    mkRating('me', 5),
    mkRating('alice', 4),
    mkRating('bob', 3),
    mkRating('stranger', 2),
  ]

  it('keeps own rating and friends, drops everyone else', () => {
    const out = filterRatingsToSelfAndFriends(ratings, 'me', ['alice', 'bob'])
    expect(out.map((r) => r.user_name).sort()).toEqual(['alice', 'bob', 'me'])
  })

  it('returns only own rating when no one is followed', () => {
    const out = filterRatingsToSelfAndFriends(ratings, 'me', [])
    expect(out.map((r) => r.user_name)).toEqual(['me'])
  })

  it('treats null userName as "no self match"', () => {
    const out = filterRatingsToSelfAndFriends(ratings, null, ['alice'])
    expect(out.map((r) => r.user_name)).toEqual(['alice'])
  })

  it('returns [] when no overlap', () => {
    const out = filterRatingsToSelfAndFriends(ratings, 'someone-else', [])
    expect(out).toEqual([])
  })
})

describe('paginateRatings', () => {
  const ratings: Rating[] = Array.from({ length: 25 }, (_, i) => mkRating(`u${i}`, (i % 5) + 1))

  it('returns first page by default', () => {
    const p = paginateRatings(ratings, 0, 10)
    expect(p.items.map((r) => r.user_name)).toEqual(['u0','u1','u2','u3','u4','u5','u6','u7','u8','u9'])
    expect(p.total).toBe(25)
    expect(p.pageSize).toBe(10)
    expect(p.totalPages).toBe(3)
    expect(p.page).toBe(0)
  })

  it('returns the requested middle page', () => {
    const p = paginateRatings(ratings, 1, 10)
    expect(p.items.map((r) => r.user_name)).toEqual(['u10','u11','u12','u13','u14','u15','u16','u17','u18','u19'])
    expect(p.page).toBe(1)
  })

  it('returns partial last page', () => {
    const p = paginateRatings(ratings, 2, 10)
    expect(p.items.map((r) => r.user_name)).toEqual(['u20','u21','u22','u23','u24'])
    expect(p.items).toHaveLength(5)
    expect(p.page).toBe(2)
  })

  it('clamps a too-high page index back to the last page', () => {
    const p = paginateRatings(ratings, 99, 10)
    expect(p.page).toBe(2)
    expect(p.items).toHaveLength(5)
  })

  it('clamps a negative page index up to 0', () => {
    const p = paginateRatings(ratings, -5, 10)
    expect(p.page).toBe(0)
    expect(p.items).toHaveLength(10)
  })

  it('returns empty items + single page for an empty list', () => {
    const p = paginateRatings([], 0, 10)
    expect(p.items).toEqual([])
    expect(p.total).toBe(0)
    expect(p.totalPages).toBe(1)
    expect(p.page).toBe(0)
    expect(p.pageSize).toBe(10)
  })

  it('honours a custom page size that divides evenly', () => {
    const p = paginateRatings(ratings, 0, 5)
    expect(p.totalPages).toBe(5)
    expect(p.items).toHaveLength(5)
  })

  it('is a pure function: does not mutate the input', () => {
    const copy = ratings.slice()
    paginateRatings(ratings, 1, 10)
    expect(ratings).toEqual(copy)
  })
})
