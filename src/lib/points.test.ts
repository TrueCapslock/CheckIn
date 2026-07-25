// src/lib/points.test.ts
//
// Tests for getMayorFromCheckIns and friends. The mayor rule changed in this
// version so we explicitly cover the tie-break: in a tie on check-in count,
// the user whose first check-in was earliest keeps the throne (instead of the
// later-arriving challenger winning, which is a more frustrating UX).

import { describe, it, expect } from 'vitest'
import { getMayorFromCheckIns } from './points'
import type { CheckIn } from './types'

/** Build a stub CheckIn with the only fields the mayor logic inspects. */
function ci(placeId: string, userName: string, createdAt: string, id = `${userName}-${createdAt}`): CheckIn {
  return {
    id,
    place_id: placeId,
    user_name: userName,
    user_id: '00000000-0000-0000-0000-000000000000',
    created_at: createdAt,
    points_awarded: 10,
  }
}

describe('getMayorFromCheckIns', () => {
  it('returns null for an empty input array', () => {
    expect(getMayorFromCheckIns([], 'p1')).toBe(null)
  })

  it('returns null when no check-ins match the target place', () => {
    const ins: CheckIn[] = [ci('p2', 'alice', '2025-01-01T00:00:00Z')]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe(null)
  })

  it('returns the sole checker when there is only one user', () => {
    const ins: CheckIn[] = [ci('p1', 'alice', '2025-01-01T00:00:00Z')]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe('alice')
  })

  it('picks the user with strictly more check-ins, regardless of order', () => {
    // bob registers LATER but has more check-ins — higher count still wins.
    const ins: CheckIn[] = [
      ci('p1', 'bob', '2025-01-05T00:00:00Z'),
      ci('p1', 'bob', '2025-01-06T00:00:00Z'),
      ci('p1', 'alice', '2025-01-01T00:00:00Z'),
      ci('p1', 'bob', '2025-01-07T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe('bob')
  })

  it('on a tie, gives the throne to the user whose FIRST check-in was earliest', () => {
    // Both Alice and Bob have 3 check-ins.
    // Alice's earliest was 2025-01-01 (registered first).
    // Bob's earliest was 2025-01-10 (challenger, even though his last check-in
    // is later than Alice's last check-in).
    const ins: CheckIn[] = [
      ci('p1', 'alice', '2025-01-01T10:00:00Z'),
      ci('p1', 'bob',   '2025-01-10T10:00:00Z'),
      ci('p1', 'alice', '2025-01-02T10:00:00Z'),
      ci('p1', 'bob',   '2025-01-11T10:00:00Z'),
      ci('p1', 'bob',   '2025-01-12T10:00:00Z'),
      ci('p1', 'alice', '2025-01-03T10:00:00Z'),
    ]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe('alice')
  })

  it('on a tie with the same earliest timestamp, preserves first-to-arrive', () => {
    // Both reached 2 check-ins at exactly the same moment. The user listed
    // earlier in the input remains the mayor.
    const ins: CheckIn[] = [
      ci('p1', 'alice', '2025-01-01T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-01T00:00:00Z'),
      ci('p1', 'alice', '2025-01-02T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-02T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe('alice')
  })

  it('only counts check-ins at the target place', () => {
    // Alice has more check-ins overall but only 1 at p1; Bob has 2 at p1.
    const ins: CheckIn[] = [
      ci('p1', 'alice', '2025-01-01T00:00:00Z'),
      ci('p2', 'alice', '2025-01-02T00:00:00Z'),
      ci('p2', 'alice', '2025-01-03T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-04T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-05T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(ins, 'p1')).toBe('bob')
  })

  it('transfers the throne cleanly when one user overtakes the count, then resets to first-earlier on a re-tie', () => {
    // Alice and Bob are tied at 2 check-ins; Alice's firstAt is earlier so
    // she's mayor.
    const before: CheckIn[] = [
      ci('p1', 'alice', '2025-01-01T00:00:00Z'),
      ci('p1', 'alice', '2025-01-02T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-05T00:00:00Z'),
      ci('p1', 'bob',   '2025-01-06T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(before, 'p1')).toBe('alice')

    // Bob adds one more → strictly more check-ins than Alice → throne transfers.
    const overtaken: CheckIn[] = [
      ...before,
      ci('p1', 'bob', '2025-01-15T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(overtaken, 'p1')).toBe('bob')

    // Alice also catches up → back to a 3-3 tie; earliest firstAt wins again.
    const retied: CheckIn[] = [
      ...overtaken,
      ci('p1', 'alice', '2025-01-20T00:00:00Z'),
    ]
    expect(getMayorFromCheckIns(retied, 'p1')).toBe('alice')
  })
})
