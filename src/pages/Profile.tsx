import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CheckIn, Place } from '../lib/types'
import { getCategories } from '../lib/categories'
import { getPlace } from '../lib/places'
import { getAllCheckIns } from '../lib/places'
import { getUsername, getUser, getAvatar, setAvatar, uploadAvatar, fetchAvatarUrl } from '../lib/user'
import { getFollowing } from '../lib/follow'
import { getActiveParty, getParties, getPartyLeaderboard, getPendingInviteCount } from '../lib/party'
import type { Party } from '../lib/types'
import { usePartyEnabled } from '../lib/admin'
import {
  getCoins,
  getLifetimePoints,
  getStickers,
  canUpgradeSticker,
  upgradeSticker,
  upgradeStickerCost,
  getCheckInStreaks,
  getAllTimeLeaderboardFromCheckIns,
} from '../lib/points'
import type { LeaderboardEntry } from '../lib/points'
import type { PartyLeaderboardEntry } from '../lib/party'
import { ACHIEVEMENTS, getUnlockedAchievements } from '../lib/achievements'
import type { AchievementDef } from '../lib/achievements'
import { parsePlaceAddress } from '../lib/address'
import { supabase } from '../lib/supabase'
import { LEVELS, getLevelFromPoints, getLevelProgress } from '../lib/levels'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface CheckInWithPlace extends CheckIn {
  place: Place | null
}

type LeaderboardMode = 'total' | 'party'

function StreakCalendar({ dates }: { dates: string[] }) {
  const dateSet = new Set(dates)
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 363)
  const dayOfWeek = start.getDay()
  start.setDate(start.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek))

  const days: string[] = []
  const cursor = new Date(start)
  while (cursor <= today) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 1)
  }

  const weeks: (string | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    const week: (string | null)[] = days.slice(i, i + 7)
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }

  const recentWeeks = weeks.slice(-20).reverse()

  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div className="flex gap-1 overflow-hidden pb-1">
      <div className="flex flex-col gap-[3px] pt-0.5 text-[9px] font-medium text-gray-400 leading-none">
        {labels.map((l, i) => (
          <span key={i} className="w-3 h-[10px] flex items-center justify-center">{l}</span>
        ))}
      </div>
      {recentWeeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((date) => (
                <div
                  key={date ?? `empty-${wi}`}
                  className={`w-[10px] h-[10px] rounded-[2px] ${
                    date === null
                      ? ''
                      : dateSet.has(date)
                        ? 'bg-green-500 dark:bg-green-400'
                        : 'bg-[var(--ci-border)] opacity-40'
                  }`}
              title={date ? `${date}${dateSet.has(date) ? ' ✓' : ''}` : ''}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Profile() {
  const { lang } = useLanguage()
  const partyEnabled = usePartyEnabled()
  const username = getUsername()
  const user = getUser()
  const [avatar, setAvatarState] = useState(getAvatar())
  const [allCheckIns, setAllCheckIns] = useState<CheckIn[]>([])
  const [checkIns, setCheckIns] = useState<CheckInWithPlace[]>([])
  const [filter, setFilter] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [points, setPoints] = useState(getLifetimePoints())
  const [coins, setCoins] = useState(getCoins())
  const [stickers, setStickers] = useState(getStickers())
  const [unlockedAchievements, setUnlockedAchievements] = useState<string[]>([])
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementDef | null>(null)
  const [avatarMsg, setAvatarMsg] = useState('')
  const [popup, setPopup] = useState<'checkins' | 'places' | null>(null)
  const [lbMode, setLbMode] = useState<LeaderboardMode>('total')
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({})
  const [parties, setParties] = useState<Party[]>([])
  const [activeParty, setActiveParty] = useState<Party | null>(null)
  const [partyLeaderboard, setPartyLeaderboard] = useState<PartyLeaderboardEntry[]>([])
  const [inviteCount, setInviteCount] = useState(0)

  useEffect(() => {
    getParties().then(({ created, invited }) => {
      setParties([...created, ...invited])
    })
    getActiveParty().then((party) => {
      setActiveParty(party)
      if (party) getPartyLeaderboard(party.id).then(setPartyLeaderboard)
    })
    setInviteCount(getPendingInviteCount())
  }, [])

  useEffect(() => {
    setUnlockedAchievements(getUnlockedAchievements().map((a) => a.id))
  }, [])

  useEffect(() => {
    if (!user?.email) return

    const localCoins = getCoins()
    const localPoints = getLifetimePoints()

    // Pull first so stale local storage never overwrites a higher lifetime total.
    supabase.from('users').select('coins, points').eq('email', user.email).maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return
        const remoteCoins = data.coins ?? 0
        const remotePoints = data.points ?? 0
        const bestCoins = Math.max(localCoins.total, remoteCoins)
        const bestPoints = Math.max(localPoints, remotePoints)
        const merged = { ...localCoins, total: bestCoins }
        localStorage.setItem('checkin_coins', JSON.stringify(merged))
        setCoins(merged)
        localStorage.setItem('checkin_lifetime_points', String(bestPoints))
        setPoints(bestPoints)
        if (bestCoins !== remoteCoins || bestPoints !== remotePoints) {
          supabase.from('users').update({ coins: bestCoins, points: bestPoints }).eq('email', user.email).then(({ error: pushErr }) => {
            if (pushErr) console.warn('Push stats failed:', pushErr.message)
          })
        }
      })
  }, [])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarMsg(t('profile.uploading', lang))
    const dataUrl = await uploadAvatar(file)
    if (dataUrl) {
      setAvatar(dataUrl)
      setAvatarState(dataUrl)
      setAvatarMsg('')
    } else {
      setAvatarMsg(t('profile.upload_failed', lang))
    }
  }

  useEffect(() => {
    getAllCheckIns().then(async (items) => {
      setAllCheckIns(items)
      const mine = items.filter((ci) => ci.user_name === getUsername())
      const withPlaces = await Promise.all(
        mine.map(async (ci) => {
          const place = await getPlace(ci.place_id)
          return { ...ci, place }
        }),
      )
      setCheckIns(withPlaces)
    })
  }, [])

  const [following] = useState(getFollowing())

  const totalCheckIns = checkIns.length
  const uniquePlaces = new Set(checkIns.map((c) => c.place_id)).size

  const typeCounts = checkIns.reduce<Record<string, number>>((acc, ci) => {
    const t = ci.place?.type
    if (t) acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})

  const streaks = username ? getCheckInStreaks(allCheckIns, username) : { current: 0, longest: 0, dailyDates: [] }
  const totalLeaderboard = useMemo(() => {
    const raw = getAllTimeLeaderboardFromCheckIns(allCheckIns)
    const visibleNames = new Set([username, ...following].filter(Boolean))
    return visibleNames.size > 0 ? raw.filter((entry) => visibleNames.has(entry.name)) : raw
  }, [allCheckIns, following, username])
  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const source = lbMode === 'party' && activeParty ? partyLeaderboard : totalLeaderboard
    return source.map((entry) => ({ name: entry.name, score: entry.score })).slice(0, 3)
  }, [activeParty, lbMode, partyLeaderboard, totalLeaderboard])

  useEffect(() => {
    Promise.all(
      leaderboard.map(async (entry) => {
        const url = getAvatar(entry.name) || (await fetchAvatarUrl(entry.name))
        return url ? [entry.name, url] as const : null
      }),
    ).then((entries) => {
      const map: Record<string, string> = {}
      for (const entry of entries) {
        if (entry) map[entry[0]] = entry[1]
      }
      setAvatarUrls(map)
    })
  }, [leaderboard])

  const level = getLevelFromPoints(points)
  const levelProgress = getLevelProgress(points)
  const levelNumber = LEVELS.findIndex((l) => l.id === level.id) + 1
  const progressPercent = Math.min(levelProgress.progress * 100, 100)
  const earnedAchievements = ACHIEVEMENTS.filter((a) => unlockedAchievements.includes(a.id))
  const previewAchievements = earnedAchievements.slice(0, 5)

  // Compute the lists of cities / counties / countries the user has visited from the
  // already-loaded check-ins. We re-parse on every render where checkIns changes —
  // the parser is synchronous and trivially cheap.
  const visitedRegions = useMemo(() => {
    const cities = new Set<string>()
    const counties = new Set<string>()
    const countries = new Set<string>()
    for (const ci of checkIns) {
      const addr = ci.place?.address
      if (!addr) continue
      const r = parsePlaceAddress(addr)
      if (r.city) cities.add(r.city)
      if (r.county) counties.add(r.county)
      if (r.country) countries.add(r.country)
    }
    const sort = (arr: string[]) => arr.sort((a, b) => a.localeCompare(b))
    return { cities: sort(Array.from(cities)), counties: sort(Array.from(counties)), countries: sort(Array.from(countries)) }
  }, [checkIns])

  const isRegionAchievement = (id: string) => id === 'first_city' || id.startsWith('city_') || id === 'first_county' || id.startsWith('county_')
  const showRegionDetails =
    !!selectedAchievement &&
    isRegionAchievement(selectedAchievement.id) &&
    (visitedRegions.cities.length > 0 || visitedRegions.counties.length > 0 || visitedRegions.countries.length > 0)

  return (
    <div className="min-h-full bg-[var(--ci-bg)] text-[var(--ci-text)] pb-24">
      <div className="relative px-5 pt-8 pb-5">
        <Link
          to="/settings"
          aria-label="Settings"
          className="absolute right-5 top-8 flex h-10 w-10 items-center justify-center rounded-full text-[var(--ci-text)] transition-colors hover:bg-[var(--ci-hover-bg)]"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.8 1.8 0 0 0 15 19.4a1.8 1.8 0 0 0-1 .6l-.16.24a2 2 0 0 1-3.68 0L10 20a1.8 1.8 0 0 0-1-.6 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-.6-1l-.24-.16a2 2 0 0 1 0-3.68L4 10a1.8 1.8 0 0 0 .6-1 1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-.6l.16-.24a2 2 0 0 1 3.68 0L14 4a1.8 1.8 0 0 0 1 .6 1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.8 1.8 0 0 0 19.4 9c.08.36.28.7.6 1l.24.16a2 2 0 0 1 0 3.68L20 14a1.8 1.8 0 0 0-.6 1Z" />
          </svg>
        </Link>

        {/* Avatar & name */}
        <div className="flex items-center gap-5 pt-2 mb-7">
          <label className="relative cursor-pointer group shrink-0">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="w-24 h-24 rounded-full object-cover border-2 border-[var(--ci-border-strong)] shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center text-4xl text-white font-bold shadow-xl">
                {username ? username[0].toUpperCase() : '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">{t('profile.edit', lang)}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </label>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight">{username || t('profile.anonymous', lang)}</h1>
            {user?.email && <p className="text-sm font-semibold text-emerald-300 mt-1">{user.email}</p>}
            {avatarMsg && <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{avatarMsg}</p>}
          </div>
        </div>

        {/* Level badge */}
        <div className="mb-6 rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] px-4 py-5 shadow-xl shadow-black/10 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--ci-muted)]">{t('profile.level', lang)} {levelNumber}</p>
              <h2 className="text-2xl font-extrabold tracking-tight mt-1">{level.name.replace(/^(Bronze|Silver|Gold) /, '')}</h2>
              <p className="text-sm font-semibold text-yellow-500 mt-1">{coins.total.toLocaleString()} {t('profile.coins', lang)}</p>
              {levelProgress.next ? (
                <>
                  <div className="mt-5 h-2.5 rounded-full bg-[var(--ci-muted-surface)] overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.55)]" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p className="text-sm font-semibold text-[var(--ci-muted)] mt-3">
                    {points.toLocaleString()} / {levelProgress.next.pointsRequired.toLocaleString()} poeng
                  </p>
                </>
              ) : (
                <p className="text-sm font-semibold text-emerald-300 mt-4">{t('profile.max_level', lang)}</p>
              )}
            </div>
            <img src={level.image} alt={level.name} className="w-24 h-24 object-contain drop-shadow-2xl shrink-0" />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 mb-6 rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] shadow-xl shadow-black/10 divide-x divide-[var(--ci-border)] overflow-hidden">
          <button onClick={() => setPopup('checkins')} className="px-2 py-4 text-center active:bg-[var(--ci-hover-bg)] transition-colors">
            <div className="text-2xl font-extrabold">{totalCheckIns}</div>
            <div className="text-xs text-[var(--ci-muted)] mt-1">{t('profile.checkins', lang)}</div>
          </button>
          <button onClick={() => setPopup('places')} className="px-2 py-4 text-center active:bg-[var(--ci-hover-bg)] transition-colors">
            <div className="text-2xl font-extrabold">{uniquePlaces}</div>
            <div className="text-xs text-[var(--ci-muted)] mt-1">{t('profile.places', lang)}</div>
          </button>
          <a href="#profile-achievements" className="px-2 py-4 text-center active:bg-[var(--ci-hover-bg)] transition-colors">
            <div className="text-2xl font-extrabold">{earnedAchievements.length}</div>
            <div className="text-xs text-[var(--ci-muted)] mt-1">{t('profile.badges', lang)}</div>
          </a>
        </div>

        {/* Badges preview */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[var(--ci-muted)]">{t('profile.your_badges', lang)}</h2>
            <a href="#profile-achievements" className="text-sm font-bold text-emerald-300">{t('profile.see_all', lang)}</a>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {(previewAchievements.length > 0 ? previewAchievements : [null, null, null, null, null]).map((a, index) => (
              <button
                key={a?.id || `empty-${index}`}
                disabled={!a}
                onClick={() => a && setSelectedAchievement(a)}
                className="aspect-square rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] flex items-center justify-center shadow-lg shadow-black/10 disabled:opacity-55"
              >
                {a ? <span className="text-3xl">{a.icon}</span> : <span className="text-2xl text-[var(--ci-muted)]">?</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Streak calendar */}
        {username && (
          <div className="mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--ci-muted)]">{t('profile.streaks', lang)}</h2>
              <span className="text-sm text-[var(--ci-muted)]">
                {t('profile.streak_days', lang).replace('{current}', String(streaks.current)).replace('{longest}', String(streaks.longest))}
              </span>
            </div>
            <div className="rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] p-4">
              <StreakCalendar dates={streaks.dailyDates} />
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-[var(--ci-muted)]">{t('profile.leaderboard', lang)}</h2>
              {partyEnabled && activeParty && (
              <div className="flex gap-1 bg-[var(--ci-muted-surface)] rounded-lg p-0.5">
                <button
                  onClick={() => setLbMode('total')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    lbMode === 'total' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : 'text-[var(--ci-muted)]'
                  }`}
                >
                  {t('profile.total', lang)}
                </button>
                <button
                  onClick={() => setLbMode('party')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                    lbMode === 'party' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : 'text-[var(--ci-muted)]'
                  }`}
                >
                  {t('profile.party', lang)}
                </button>
              </div>
              )}
            </div>
            {leaderboard.length === 0 ? (
              <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-4 text-center text-sm text-[var(--ci-muted)]">
                {t('profile.leaderboard_empty', lang)}
              </div>
            ) : (
            <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] divide-y divide-[var(--ci-border)] overflow-hidden">
              {leaderboard.map((entry, index) => {
                const entryAvatar = avatarUrls[entry.name] || getAvatar(entry.name)
                return (
                  <div key={entry.name} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-6 text-center font-bold text-sm text-[var(--ci-muted)]">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </span>
                    {entryAvatar ? (
                      <img src={entryAvatar} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-8 h-8 bg-emerald-400/20 rounded-full flex items-center justify-center text-xs font-bold text-emerald-200 shrink-0">
                        {entry.name[0].toUpperCase()}
                      </span>
                    )}
                    <Link to={`/user/${encodeURIComponent(entry.name)}`} className="flex-1 font-medium text-sm hover:text-emerald-300">
                      {entry.name}
                    </Link>
                    <span className="text-sm font-bold text-emerald-300">{entry.score} {t('profile.pts', lang)}</span>
                  </div>
                )
              })}
            </div>
            )}
          </div>

        {/* Parties */}
        {partyEnabled && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[var(--ci-muted)]">{t('profile.parties', lang)}</h2>
            <Link
              to="/party/invites"
              className="text-xs font-medium text-blue-600 dark:text-blue-400"
            >
              {t('profile.invitations', lang)}
            </Link>
          </div>
          <div className="flex gap-2">
            <Link
              to="/party/create"
              className="flex-1 bg-blue-600 dark:bg-blue-500 text-white px-3 py-2.5 rounded-xl text-sm font-medium text-center active:scale-95 transition-transform"
            >
              {t('profile.create_party', lang)}
            </Link>
            <Link
              to="/party/invites"
              className="flex-1 bg-[var(--ci-panel)] border border-[var(--ci-border)] px-3 py-2.5 rounded-xl text-sm font-medium text-center text-[var(--ci-text)] active:scale-95 transition-transform relative"
            >
              {t('profile.invitations', lang)}
              {inviteCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                  {inviteCount}
                </span>
              )}
            </Link>
          </div>
          {parties.length > 0 && (
            <div className="mt-2 space-y-1">
              {parties.map((p) => (
                <Link
                  key={p.id}
                  to={`/party/${p.id}`}
                  className="flex items-center gap-3 bg-[var(--ci-panel)] rounded-xl border border-[var(--ci-border)] px-3 py-2.5 text-sm"
                >
                  <span className="text-base">{p.status === 'active' ? '🎉' : '🎊'}</span>
                  <span className="flex-1 text-[var(--ci-text)] font-medium truncate">{p.name}</span>
                  <span className={`text-xs font-medium ${
                    p.status === 'active'
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400'
                  }`}>
                    {p.status === 'active' ? t('profile.live', lang) : t('profile.ended', lang)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
        )}



      </div>

      {/* Multipliers */}
      <div className="px-4 pb-4">
        <h2 className="font-semibold text-[var(--ci-muted)] mb-4">{t('profile.stickers', lang)}</h2>
        <div className="grid grid-cols-4 gap-2">
          {getCategories().map((cat) => {
            const s = stickers[cat.id] || { level: 0, lastUsed: null }
            const canUp = canUpgradeSticker(cat.id)
            const cost = upgradeStickerCost(cat.id)
            const multiplier = [1, 2, 3, 5, 8][s.level] || 1
            return (
              <div key={cat.id} className="relative bg-[var(--ci-panel)] rounded-xl border border-[var(--ci-border)] p-3 text-center">
                {multiplier > 1 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 dark:bg-yellow-500 text-yellow-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shadow-sm">
                    {multiplier}×
                  </span>
                )}
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs capitalize text-[var(--ci-muted)] mb-1">{cat.name}</div>
                {canUp && (
                  <button
                    onClick={() => {
                      upgradeSticker(cat.id)
                      setCoins(getCoins())
                      setStickers(getStickers())
                    }}
                    className="mt-2 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 px-2 py-0.5 rounded-full font-medium"
                  >
                    ↑{cost}🪙
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Achievements */}
      <div id="profile-achievements" className="px-4 pb-4 scroll-mt-4">
        <h2 className="font-semibold text-[var(--ci-muted)] mb-4">{t('profile.achievements', lang)}</h2>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.filter((a) => unlockedAchievements.includes(a.id)).map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAchievement(a)}
                className="w-full rounded-xl border border-emerald-300/25 bg-[var(--ci-panel)] p-3 text-center"
              >
                <div className="text-2xl mb-1">{a.icon}</div>
                <div className="text-xs font-medium text-[var(--ci-text)] leading-tight">{a.title}</div>
                <div className="text-[10px] text-[var(--ci-muted)] mt-1">{t('profile.unlocked', lang)}</div>
              </button>
          ))}
        </div>

        {/* Achievement popup */}
        {selectedAchievement && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
            onClick={() => setSelectedAchievement(null)}
          >
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-xs sm:max-w-sm text-center shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-5xl mb-3">{selectedAchievement.icon}</div>
              <h3 className="text-lg font-bold mb-1 dark:text-white">{selectedAchievement.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{selectedAchievement.description}</p>
              <div className="text-yellow-700 dark:text-yellow-400 font-semibold text-lg mb-4">🪙+{selectedAchievement.coins}</div>

              {showRegionDetails && (
                <div className="text-left mb-4 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  {visitedRegions.cities.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                        {t('profile.cities_visited', lang).replace('{count}', String(visitedRegions.cities.length))}
                      </p>
                      <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
                        {visitedRegions.cities.map((c) => (
                          <span key={c} className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs px-2 py-0.5 rounded-full font-medium">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {visitedRegions.counties.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                        {t('profile.counties_visited', lang).replace('{count}', String(visitedRegions.counties.length))}
                      </p>
                      <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
                        {visitedRegions.counties.map((c) => (
                          <span key={c} className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs px-2 py-0.5 rounded-full font-medium">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {visitedRegions.countries.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                        {t('profile.countries_visited', lang).replace('{count}', String(visitedRegions.countries.length))}
                      </p>
                      <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 pr-1">
                        {visitedRegions.countries.map((c) => (
                          <span key={c} className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full font-medium">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => setSelectedAchievement(null)}
                className="w-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-2.5 rounded-xl font-medium"
              >
                {t('profile.close', lang)}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Check-ins popup */}
      {popup === 'checkins' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold dark:text-white">{t('profile.checkins_count', lang).replace('{count}', String(totalCheckIns))}</h2>
              <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
            </div>

            {/* Type breakdown inside popup */}
            {totalCheckIns > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
                {getCategories().map((cat) => {
                  const count = typeCounts[cat.id] || 0
                  if (count === 0) return null
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setFilter(filter === cat.id ? null : cat.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
                        filter === cat.id
                          ? 'bg-blue-600 dark:bg-blue-500 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {cat.icon} {cat.name} · {count}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="space-y-2">
              {(filter ? checkIns.filter((ci) => ci.place?.type === filter) : checkIns).toReversed().map((ci) => (
                <div key={ci.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  {ci.place && (
                    <span className="text-xl shrink-0">{getCategories().find((c) => c.id === ci.place?.type)?.icon || '📍'}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium dark:text-white truncate">{ci.place?.name || t('profile.unknown_place', lang)}</div>
                    <div className="text-xs text-gray-400">{new Date(ci.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Places popup */}
      {popup === 'places' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setPopup(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold dark:text-white">{t('profile.places_count', lang).replace('{count}', String(uniquePlaces))}</h2>
              <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
            </div>

            <div className="space-y-2">
              {Array.from(new Map(checkIns.map((ci) => [ci.place_id, ci])).values()).map((ci) => (
                <div key={ci.place_id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  {ci.place && (
                    <span className="text-xl shrink-0">{getCategories().find((c) => c.id === ci.place?.type)?.icon || '📍'}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium dark:text-white truncate">{ci.place?.name || t('profile.unknown_place', lang)}</div>
                    <div className="text-xs text-gray-400">{ci.place?.address || ci.place?.type}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
