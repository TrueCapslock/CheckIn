import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getAllCheckIns, getPlace } from '../lib/places'
import { fetchAvatarUrl } from '../lib/user'
import { followUser, unfollowUser, isFollowing } from '../lib/follow'
import { getCheckInStreaks, getLifetimePoints } from '../lib/points'
import { getLevelFromPoints, getLevelProgress, TIER_STYLE } from '../lib/levels'
import { getCategories } from '../lib/categories'
import { supabase } from '../lib/supabase'
import type { CheckIn, Place } from '../lib/types'
import { getUsername } from '../lib/user'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface CheckInWithPlace extends CheckIn {
  place: Place | null
}

export default function UserProfile() {
  const { name } = useParams<{ name: string }>()
  const myName = getUsername()
  const [checkIns, setCheckIns] = useState<CheckInWithPlace[]>([])
  const [avatar, setAvatar] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [points, setPoints] = useState(0)
  const { lang } = useLanguage()

  useEffect(() => {
    if (!name) return
    fetchAvatarUrl(name).then(setAvatar)
    supabase.from('users').select('points').eq('name', name).maybeSingle().then(({ data }) => {
      if (data?.points) setPoints(data.points)
    })
  }, [name])

  useEffect(() => {
    if (!name) return
    getAllCheckIns().then(async (items) => {
      const mine = items.filter((ci) => ci.user_name === name)
      const withPlaces = await Promise.all(
        mine.map(async (ci) => {
          const place = await getPlace(ci.place_id)
          return { ...ci, place }
        }),
      )
      setCheckIns(withPlaces)
      setLoading(false)
    })
  }, [name])

  const handleFollow = async () => {
    if (!name) return
    if (isFollowing(name)) {
      await unfollowUser(name)
    } else {
      await followUser(name)
    }
  }

  if (!name) return <div className="p-4 text-gray-500">{t('user_profile.not_found', lang)}</div>
  const streaks = getCheckInStreaks(checkIns, name)
  const totalCheckIns = checkIns.length
  const uniquePlaces = new Set(checkIns.map((c) => c.place_id)).size

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-6 pb-4">
        <Link to="/" className="text-blue-600 dark:text-blue-400 text-sm mb-4 inline-block">{t('user_profile.back', lang)}</Link>
        <div className="flex items-center gap-4 mb-4">
          {avatar ? (
            <img src={avatar} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700" />
          ) : (
            <div className="w-16 h-16 bg-blue-600 dark:bg-blue-500 rounded-full flex items-center justify-center text-2xl text-white font-bold shrink-0">
              {name[0].toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold dark:text-white">{name}</h1>
            {name !== myName && (
              <button
                onClick={handleFollow}
                className={`mt-1 text-sm font-medium ${isFollowing(name) ? 'text-gray-400' : 'text-blue-600 dark:text-blue-400'}`}
              >
                {isFollowing(name) ? t('place_detail.following', lang) : t('place_detail.follow', lang)}
              </button>
            )}
          </div>
        </div>

        {/* Level badge */}
        {(() => {
          const pts = points || getLifetimePoints()
          const level = getLevelFromPoints(pts)
          const progress = getLevelProgress(pts)
          const style = TIER_STYLE[level.tier]
          return (
            <div className={`mb-4 rounded-xl border ${style.border} ${style.bg} p-3`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 flex items-center justify-center shrink-0">
                  <img src={level.image} alt={level.name} className="w-full h-full object-contain drop-shadow-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm ${style.text}`}>{level.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{pts} pts</div>
                </div>
              </div>
              {progress.next && (
                <div className="mt-2">
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div className={`h-full rounded-full ${style.progressBg}`} style={{ width: `${Math.min(progress.progress * 100, 100)}%` }} />
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                    {pts}/{progress.next.pointsRequired} to {progress.next.name}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* 2×2 on phones; single horizontal row of 4 at md+ to use the
            wider iPad shell without making each card too wide. */}
        <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalCheckIns}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('user_profile.checkins', lang)}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{uniquePlaces}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Places</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{points || getLifetimePoints()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('user_profile.lifetime_pts', lang)}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{checkIns.reduce((s, c) => s + (c.points_awarded ?? 10), 0)}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('user_profile.earned', lang)}</div>
          </div>
        </div>

        {streaks.current > 0 && (
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            🔥 {streaks.current} {t('user_profile.day_streak', lang)} · Best: {streaks.longest}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {checkIns.toReversed().map((ci) => (
              <Link key={ci.id} to={`/places/${ci.place_id}`} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
                <span className="text-xl shrink-0">{getCategories().find((c) => c.id === ci.place?.type)?.icon || '📍'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium dark:text-white truncate">{ci.place?.name || t('user_profile.unknown_place', lang)}</div>
                  <div className="text-xs text-gray-400">{new Date(ci.created_at).toLocaleDateString()}</div>
                </div>
                <div className="text-xs font-semibold text-green-600 dark:text-green-400">+{ci.points_awarded ?? 10}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
