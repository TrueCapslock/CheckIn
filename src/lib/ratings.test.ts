import { describe, it, expect, beforeEach } from 'vitest'
import type { Rating } from './types'
import { getAverageRating, filterRatingsToSelfAndFriends, paginateRatings } from './ratings'
import { evaluateRatingAchievements } from './achievements'
import { getRatingQueue, addRatingToQueue } from './sync'

// Minimal in-memory localStorage shim for the node test environment.
// The queue helpers in ./sync read/write localStorage, so we provide a
// tiny Map-backed implementation rather than pulling in jsdom.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
}

const mkRating = (userName: string, rating: number, comment: string | null = null): Rating => ({
  id: `id-${userName}-${rating}`,
  place_id: 'p',
  user_name: userName,
  rating,
  comment,
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

describe('evaluateRatingAchievements', () => {
  const emptyStats = { ratings: 0, comments: 0, fiveStars: 0 }

  it('returns no unlocks for a fresh user with zero stats', () => {
    const { newUnlocks, nextState } = evaluateRatingAchievements(emptyStats, {})
    expect(newUnlocks).toEqual([])
    expect(nextState).toEqual({})
  })

  it('unlocks first_rating at exactly 1 place rated', () => {
    const { newUnlocks } = evaluateRatingAchievements({ ...emptyStats, ratings: 1 }, {})
    expect(newUnlocks.map((u) => u.achievement.id)).toEqual(['first_rating'])
  })

  it('unlocks every ratings tier up to the user\'s count (4 → 1 + 5 not yet, 5 → 1+5, 25 → 1+5+25, 100 → all four)', () => {
    const four = evaluateRatingAchievements({ ...emptyStats, ratings: 4 }, {})
    expect(four.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_rating'])

    const five = evaluateRatingAchievements({ ...emptyStats, ratings: 5 }, {})
    expect(five.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_rating', 'ratings_5'])

    const twentyFive = evaluateRatingAchievements({ ...emptyStats, ratings: 25 }, {})
    expect(twentyFive.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_rating', 'ratings_5', 'ratings_25'])

    const hundred = evaluateRatingAchievements({ ...emptyStats, ratings: 100 }, {})
    expect(hundred.newUnlocks.map((u) => u.achievement.id)).toEqual([
      'first_rating', 'ratings_5', 'ratings_25', 'ratings_100',
    ])
  })

  it('unlocks comment tiers (1, 10, 50)', () => {
    const one = evaluateRatingAchievements({ ...emptyStats, comments: 1 }, {})
    expect(one.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_comment'])

    const ten = evaluateRatingAchievements({ ...emptyStats, comments: 10 }, {})
    expect(ten.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_comment', 'comments_10'])

    const fifty = evaluateRatingAchievements({ ...emptyStats, comments: 50 }, {})
    expect(fifty.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_comment', 'comments_10', 'comments_50'])
  })

  it('unlocks five-star tiers (1, 25)', () => {
    const one = evaluateRatingAchievements({ ...emptyStats, fiveStars: 1 }, {})
    expect(one.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_five_star'])

    const twentyFive = evaluateRatingAchievements({ ...emptyStats, fiveStars: 25 }, {})
    expect(twentyFive.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_five_star', 'five_stars_25'])
  })

  it('combines all three families when stats are all high', () => {
    const { newUnlocks } = evaluateRatingAchievements(
      { ratings: 25, comments: 50, fiveStars: 25 },
      {},
    )
    expect(newUnlocks.map((u) => u.achievement.id).sort()).toEqual([
      'comments_10', 'comments_50', 'first_comment', 'first_five_star', 'first_rating',
      'five_stars_25', 'ratings_25', 'ratings_5',
    ])
  })

  it('is idempotent: already-unlocked ids are not re-emitted', () => {
    const first = evaluateRatingAchievements({ ratings: 1, comments: 1, fiveStars: 1 }, {})
    expect(first.newUnlocks.map((u) => u.achievement.id).sort()).toEqual([
      'first_comment', 'first_five_star', 'first_rating',
    ])
    const second = evaluateRatingAchievements(
      { ratings: 1, comments: 1, fiveStars: 1 },
      first.nextState,
    )
    expect(second.newUnlocks).toEqual([])
    expect(second.nextState).toEqual(first.nextState)
  })

  it('emits new unlocks when crossing a tier, even with prior unlocks', () => {
    const baseline = evaluateRatingAchievements({ ratings: 4, comments: 0, fiveStars: 0 }, {})
    expect(baseline.newUnlocks.map((u) => u.achievement.id)).toEqual(['first_rating'])
    const crossTier = evaluateRatingAchievements(
      { ratings: 5, comments: 0, fiveStars: 0 },
      baseline.nextState,
    )
    expect(crossTier.newUnlocks.map((u) => u.achievement.id)).toEqual(['ratings_5'])
  })

  it('stamps unlockedAt on each newly-unlocked id', () => {
    const before = Date.now()
    const { nextState } = evaluateRatingAchievements({ ...emptyStats, ratings: 1 }, {})
    const after = Date.now()
    const at = Date.parse(nextState.first_rating.unlockedAt!)
    expect(Number.isFinite(at)).toBe(true)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(after)
  })

  it('is a pure function: does not mutate the input state', () => {
    const state = { foo: { unlocked: true, unlockedAt: 'x' } }
    const copy = JSON.parse(JSON.stringify(state))
    evaluateRatingAchievements({ ratings: 5, comments: 5, fiveStars: 5 }, state)
    expect(state).toEqual(copy)
  })

  it('preserves unrelated keys in the passed-in state', () => {
    const state = {
      first_checkin: { unlocked: true, unlockedAt: '2024-01-01T00:00:00Z' },
      unrelated: { unlocked: true, unlockedAt: 'never' },
    }
    const { nextState } = evaluateRatingAchievements({ ...emptyStats, ratings: 5 }, state)
    expect(nextState.first_checkin).toEqual(state.first_checkin)
    expect(nextState.unrelated).toEqual(state.unrelated)
    expect(nextState.first_rating?.unlocked).toBe(true)
    expect(nextState.ratings_5?.unlocked).toBe(true)
  })
})

describe('rating offline queue (delete + back-compat + dedupe)', () => {
  const KEY = 'checkin_rating_offline_queue'

  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy v0.4.27 entries (no `op` field) to `op: "upsert"` on read', () => {
    // Simulate a queue left behind by a v0.4.27 install: entries have no `op` field.
    const legacy = [
      {
        id: 'legacy-1',
        placeId: 'p1',
        userName: 'alice',
        rating: 5,
        comment: 'great',
        timestamp: '2025-01-01T00:00:00Z',
        retries: 0,
      },
    ]
    localStorage.setItem(KEY, JSON.stringify(legacy))
    const queue = getRatingQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('upsert')
    // Type narrowing: upsert entries must carry rating + comment.
    if (queue[0].op === 'upsert') {
      expect(queue[0].rating).toBe(5)
      expect(queue[0].comment).toBe('great')
    }
  })

  it('drops malformed entries and never throws', () => {
    localStorage.setItem(KEY, JSON.stringify([null, 42, 'nope', { not: 'a queue entry' }]))
    expect(() => getRatingQueue()).not.toThrow()
    expect(getRatingQueue()).toEqual([])
  })

  it('addRatingToQueue dedupes by (placeId, userName) — the latest op wins', () => {
    addRatingToQueue({ op: 'upsert', placeId: 'p1', userName: 'alice', rating: 4, comment: 'meh' })
    addRatingToQueue({ op: 'upsert', placeId: 'p1', userName: 'alice', rating: 5, comment: 'amazing' })
    const queue = getRatingQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('upsert')
    if (queue[0].op === 'upsert') {
      expect(queue[0].rating).toBe(5)
      expect(queue[0].comment).toBe('amazing')
    }
  })

  it('a queued delete for (placeId, userName) replaces a queued upsert for the same pair', () => {
    addRatingToQueue({ op: 'upsert', placeId: 'p1', userName: 'alice', rating: 5, comment: 'loved it' })
    addRatingToQueue({ op: 'delete', placeId: 'p1', userName: 'alice' })
    const queue = getRatingQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('delete')
  })

  it('a queued upsert for (placeId, userName) replaces a queued delete for the same pair', () => {
    addRatingToQueue({ op: 'delete', placeId: 'p1', userName: 'alice' })
    addRatingToQueue({ op: 'upsert', placeId: 'p1', userName: 'alice', rating: 3, comment: null })
    const queue = getRatingQueue()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('upsert')
  })

  it('keeps distinct (placeId, userName) pairs independent', () => {
    addRatingToQueue({ op: 'delete', placeId: 'p1', userName: 'alice' })
    addRatingToQueue({ op: 'upsert', placeId: 'p2', userName: 'alice', rating: 5, comment: null })
    addRatingToQueue({ op: 'upsert', placeId: 'p1', userName: 'bob', rating: 4, comment: 'good' })
    const queue = getRatingQueue()
    expect(queue).toHaveLength(3)
  })
})
