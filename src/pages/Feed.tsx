import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAllCheckIns, getPlace } from '../lib/places'
import { getCategoryIcon } from '../lib/categories'
import { getAvatar, fetchAvatarUrl, getUsername } from '../lib/user'
import { getParties, getPartyLeaderboard } from '../lib/party'
import type { PartyLeaderboardEntry } from '../lib/party'
import type { CheckIn, Place, Party } from '../lib/types'
import { usePartyEnabled } from '../lib/admin'
import { parsePlaceAddress } from '../lib/address'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface CheckInWithPlace extends CheckIn {
  place: Place | null
}

export default function Feed() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const partyEnabled = usePartyEnabled()
  const [checkIns, setCheckIns] = useState<CheckInWithPlace[]>([])
  const [completedParties, setCompletedParties] = useState<Party[]>([])
  const [partyLeaderboards, setPartyLeaderboards] = useState<Record<string, PartyLeaderboardEntry[]>>({})
  const [loading, setLoading] = useState(true)
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({})

  const loadAvatars = async (names: string[]) => {
    const entries = await Promise.all(
      [...new Set(names)].map(async (name) => {
        const url = getAvatar(name) || (await fetchAvatarUrl(name))
        return url ? [name, url] as const : null
      }),
    )
    const map: Record<string, string> = {}
    for (const e of entries) {
      if (e) map[e[0]] = e[1]
    }
    setAvatarUrls(map)
  }

  useEffect(() => {
    getAllCheckIns().then(async (checkInItems) => {
      const withPlaces = await Promise.all(
        checkInItems.map(async (ci) => {
          const place = await getPlace(ci.place_id)
          return { ...ci, place }
        }),
      )
      const username = getUsername()
      const filtered = username ? withPlaces.filter((ci) => ci.user_name === username) : []
      setCheckIns(filtered)
      loadAvatars(filtered.map((ci) => ci.user_name))

      if (partyEnabled) {
        const partyResult = await getParties()
        const allParties = [...partyResult.created, ...partyResult.invited]
        const completed = allParties.filter((p) => p.status === 'completed')
        setCompletedParties(completed)
        const lbs: Record<string, PartyLeaderboardEntry[]> = {}
        await Promise.all(completed.map(async (p) => {
          lbs[p.id] = await getPartyLeaderboard(p.id)
        }))
        setPartyLeaderboards(lbs)
      }
      setLoading(false)
    })
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold dark:text-white">
          {t('feed.title', lang)}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          {t('feed.follow_hint', lang)}
        </p>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : checkIns.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400">
              {t('feed.no_checkins', lang)}
            </p>
            <Link to="/places" className="inline-block mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium">
              {t('feed.explore_places', lang)}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Party activity cards */}
            {partyEnabled && completedParties.map((party) => {
              const lb = partyLeaderboards[party.id] || []
              const winner = lb[0]
              return (
                <Link
                  key={party.id}
                  to={`/party/${party.id}`}
                  className="block p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 rounded-2xl border border-purple-200 dark:border-purple-800"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🎊</span>
                    <div>
                      <span className="font-semibold text-sm dark:text-white">{party.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{t('feed.ended', lang)}</span>
                    </div>
                  </div>
                  {winner ? (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-yellow-700 dark:text-yellow-300">{winner.name}</span> {t('feed.won_pts', lang).replace('{pts}', String(winner.score))}
                      <span className="text-xs ml-1">({t('feed.checkins_count', lang).replace('{count}', String(winner.checkIns))})</span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">{t('feed.no_party_checkins', lang)}</div>
                  )}
                  <div className="mt-1 text-xs text-gray-400">
                    {lb.length} participant{lb.length !== 1 ? 's' : ''} · {t('feed.participant_by', lang)} {party.created_by}
                  </div>
                </Link>
              )
            })}

            {checkIns.map((ci) => {
              const avatar = avatarUrls[ci.user_name]
              const parsed = ci.place?.address ? parsePlaceAddress(ci.place.address) : null
              return (
                <Link
                  key={ci.id}
                  to={`/places/${ci.place_id}`}
                  className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700"
                >
                  {avatar ? (
                    <img src={avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300 shrink-0">
                      {ci.user_name[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-sm">
                    <span
                      className="font-medium hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); navigate(`/user/${encodeURIComponent(ci.user_name)}`) }}
                    >
                      {ci.user_name}
                    </span>{' '}
                    <span className="text-gray-500 dark:text-gray-400">{t('feed.checked_in', lang)}</span>
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {getCategoryIcon(ci.place?.type ?? '')} {ci.place?.name || 'unknown'}
                    </div>
                    {(parsed?.city || parsed?.country) && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        📍 {[parsed?.city, parsed?.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">
                    {new Date(ci.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric',
                    })}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
