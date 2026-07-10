import { describe, it, expect } from 'vitest'
import type { Rating } from './types'
import { getAverageRating, filterRatingsToSelfAndFriends } from './ratings'

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
