import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl/mapbox'
import type { Place, CheckIn } from '../lib/types'
import { getCategoryIcon } from '../lib/categories'
import { getPlace, getCheckInsForPlace, getCheckInCount, createCheckIn, getAllCheckIns } from '../lib/places'
import type { CheckInResult } from '../lib/places'
import { getUsername } from '../lib/user'
import { followUser, unfollowUser, isFollowing } from '../lib/follow'
import { getRatingsForPlace, getMyRatingForPlace, submitRating, getAverageRating, paginateRatings } from '../lib/ratings'
import type { Rating } from '../lib/types'
import { getMayorFromCheckIns } from '../lib/points'
import { getPlacePhotos, addPlacePhoto } from '../lib/place-photos'
import type { PlacePhoto } from '../lib/place-photos'
import { useUserLocation } from '../lib/location'
import { getActiveParty, linkCheckInToParty } from '../lib/party'
import ShareSheet from '../components/ShareSheet'
import { TIER_STYLE } from '../lib/levels'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import 'mapbox-gl/dist/mapbox-gl.css'

const token = import.meta.env.VITE_MAPBOX_TOKEN

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating % 1 >= 0.5
  return (
    <span className="text-amber-400 dark:text-amber-300 text-sm">
      {'★'.repeat(full)}{half ? '½' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
    </span>
  )
}

function PriceLevel({ level }: { level: number }) {
  return <span className="text-green-600 dark:text-green-400 text-sm">{'$'.repeat(level)}</span>
}

function RateStars({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onChange(i)}
          aria-label={`${i} star`}
          className={`text-2xl leading-none transition-colors disabled:opacity-50 ${
            i <= value
              ? 'text-amber-500 dark:text-amber-400'
              : 'text-gray-300 dark:text-gray-600 hover:text-amber-300 disabled:hover:text-gray-300'
          }`}
        >
          {i <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

export default function PlaceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [place, setPlace] = useState<Place | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkInCount, setCheckInCount] = useState(0)
  const [checkedIn, setCheckedIn] = useState(false)
  const [recentCheckIns, setRecentCheckIns] = useState<CheckIn[]>([])
  const [showShare, setShowShare] = useState(false)
  const [bonus, setBonus] = useState<CheckInResult['bonus'] | null>(null)
  const [achievements, setAchievements] = useState<NonNullable<CheckInResult['achievements']>>([])
  const [levelUp, setLevelUp] = useState<NonNullable<CheckInResult['levelUp']> | null>(null)
  const [mayor, setMayor] = useState<string | null>(null)
  const [farError, setFarError] = useState(false)
  const [, setRerender] = useState(0)
  const [placePhotos, setPlacePhotos] = useState<PlacePhoto[]>([])
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [myRating, setMyRating] = useState<Rating | null>(null)
  const [allRatings, setAllRatings] = useState<Rating[]>([])
  const [submittingRating, setSubmittingRating] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)
  const RATINGS_PAGE_SIZE = 10
  const [ratingsPage, setRatingsPage] = useState(0)


  const userName = getUsername() || 'Anonymous'
  const { lang } = useLanguage()
  const { location: userLocation } = useUserLocation()
  const communityAvg = getAverageRating(allRatings)
  // Show every rating to every visitor, not just self + friends.
  const visibleRatings = allRatings
  const pagination = paginateRatings(visibleRatings, ratingsPage, RATINGS_PAGE_SIZE)

  useEffect(() => {
    if (!id) return
    getPlacePhotos(id).then(setPlacePhotos)
  }, [id])

  useEffect(() => {
    if (!id) return
    getPlace(id).then((data) => {
      setPlace(data)
      setLoading(false)
    })
  }, [id])

  useEffect(() => {
    void loadRatings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, userName])

  // Reset to the first page whenever the place (id) changes; the underlying
  // list size is the same set unless the place itself changes, so we don't
  // bounce the user back to page 0 just because someone submitted a new rating.
  useEffect(() => {
    setRatingsPage(0)
  }, [id])

  useEffect(() => {
    if (!id) return
    getCheckInCount(id).then(setCheckInCount)
    getAllCheckIns().then((all) => setMayor(getMayorFromCheckIns(all, id!)))
  }, [id])

  useEffect(() => {
    if (!id) return
    getCheckInsForPlace(id).then((items) => {
      setRecentCheckIns(items)
      const today = new Date().toISOString().slice(0, 10)
      setCheckedIn(items.some((ci) => (
        ci.user_name === userName && ci.created_at.slice(0, 10) === today
      )))
    })
  }, [id, userName])

  const handleCheckIn = async () => {
    if (!id || checkedIn) return
    const result = await createCheckIn(id, userName, userLocation)
    if (result.ok) {
      setCheckedIn(true)
      setCheckInCount((c) => c + 1)
      getCheckInsForPlace(id).then(setRecentCheckIns)
      getAllCheckIns().then((all) => setMayor(getMayorFromCheckIns(all, id!)))
      getActiveParty().then((party) => {
        if (party && result.checkInId) {
          linkCheckInToParty(party.id, result.checkInId)
        }
      })
      if (result.bonus) {
        setBonus(result.bonus)
        setTimeout(() => setBonus(null), 3000)
      }
      if (result.achievements && result.achievements.length > 0) {
        setAchievements(result.achievements)
        setTimeout(() => setAchievements([]), 5000)
      }
      if (result.levelUp) {
        setLevelUp(result.levelUp)
        setTimeout(() => setLevelUp(null), 5000)
      }
    } else if (result.reason === 'too_far') {
      setFarError(true)
      setTimeout(() => setFarError(false), 3000)
    } else {
      setCheckedIn(true)
    }
  }

  const handleFollow = async (name: string) => {
    if (isFollowing(name)) {
      await unfollowUser(name)
    } else {
      await followUser(name)
    }
    setRerender((n) => n + 1)
  }

  const handleSubmitRating = async (stars: number) => {
    if (!id || submittingRating) return
    // Defensive guard: a user is only allowed to rate a place once. The RateStars
    // component is already disabled when `myRating` is set, but a stale state
    // (e.g. optimistic tap arrives before getMyRatingForPlace finishes) can race
    // past the disabled prop — this guard catches that.
    if (myRating) return
    setSubmittingRating(true)
    setRatingError(null)
    const optimistic: Rating = {
      id: `local-${crypto.randomUUID()}`,
      place_id: id,
      user_name: userName,
      rating: stars,
      created_at: new Date().toISOString(),
    }
    setMyRating(optimistic)
    setAllRatings((prev) => {
      const without = prev.filter((r) => r.user_name !== userName)
      return [optimistic, ...without]
    })
    const res = await submitRating(id, userName, stars)
    setSubmittingRating(false)
    if (!res.ok) {
      setRatingError(res.error ?? null)
      return
    }
  }

  async function loadRatings() {
    if (!id) return
    const [all, mine] = await Promise.all([
      getRatingsForPlace(id),
      getMyRatingForPlace(id, userName),
    ])
    setAllRatings(all)
    setMyRating(mine)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !id) return
    const photo = await addPlacePhoto(id, file)
    if (photo) getPlacePhotos(id).then(setPlacePhotos)
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="h-48 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse mb-4" />
        <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse mb-2" />
        <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
    )
  }

  if (!place) return <div className="p-4 text-gray-500 dark:text-gray-400">{t('place_detail.not_found', lang)}</div>

  return (
    <div className="pb-24">
      {/* Hero with photo or gradient */}
      <div className="relative h-56 bg-gradient-to-br from-emerald-300 to-teal-600 dark:from-emerald-900 dark:to-teal-950 flex items-center justify-center overflow-hidden">
        {place.photo_url ? (
          <img
            src={place.photo_url}
            alt={place.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span className="text-6xl relative z-10">{getCategoryIcon(place.type)}</span>
        )}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 w-8 h-8 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white text-sm z-10"
        >
          &larr;
        </button>
        <button
          onClick={() => setShowShare(true)}
          className="absolute top-4 right-4 w-8 h-8 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white text-sm z-10"
        >
          📤
        </button>
        <button
          onClick={() => photoRef.current?.click()}
          className="absolute top-4 right-14 w-8 h-8 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white text-sm z-10"
        >
          📷
        </button>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        {mayor && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full z-10 shadow-lg whitespace-nowrap">
            👑 {mayor === userName ? t('place.you_are_mayor', lang) : t('place.mayor', lang) + ': ' + mayor}
          </div>
        )}
      </div>

      {/* Place photos */}
      {placePhotos.length > 0 && (
        <div className="px-4 mt-2 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {placePhotos.map((p) => (
              <div key={p.id} className="shrink-0">
                <button onClick={() => setSelectedPhoto(p.photoUrl)} className="p-0 border-0 bg-transparent cursor-pointer">
                  <img src={p.photoUrl} alt="" className="w-20 h-20 rounded-xl object-cover border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity" title={`by ${p.userName}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column layout from lg+ (≥1024px viewport, iPad landscape).
          Left = details card + map. Right = recent check-ins + ratings list
          (sticky). Below lg, children stack normally. */}
      <div className="px-4 mt-2 lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start">
        <div className="bg-white dark:bg-gray-900 rounded-2xl pt-6 p-4 shadow-sm border border-gray-100 dark:border-gray-700 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold dark:text-white">{place.name}</h1>
              <span className="inline-block capitalize text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {place.type}
              </span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{checkInCount}</div>
              <div className="text-xs text-gray-400">{t('place_detail.checkins_label', lang)}</div>
            </div>
          </div>

          {/* Google ratings + community avg + interactive rate-this */}
          {(place.rating || place.priceLevel || communityAvg) && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {place.rating && (
                <div className="flex items-center gap-1">
                  <Stars rating={place.rating} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{place.rating.toFixed(1)} · Google</span>
                </div>
              )}
              {place.priceLevel && <PriceLevel level={place.priceLevel} />}
              {communityAvg && (
                <div className="flex items-center gap-1">
                  <Stars rating={communityAvg.avg} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {communityAvg.avg.toFixed(1)} · {t('place_detail.community_avg', lang)} ({communityAvg.count})
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {myRating ? t('place_detail.your_rating', lang) : t('place_detail.rate_this', lang)}
            </span>
            <RateStars
              value={myRating?.rating ?? 0}
              onChange={(v) => void handleSubmitRating(v)}
              disabled={submittingRating || !!myRating}
            />
            {submittingRating && (
              <span className="text-xs text-gray-400">{t('place_detail.submitting_rating', lang)}</span>
            )}
          </div>
          {ratingError && (
            <div className="mt-2 text-xs text-red-500">{t('place_detail.ratings_table_missing', lang)}</div>
          )}

          <p className="text-gray-600 dark:text-gray-400 text-sm flex items-center gap-1 mt-2">
            <span className="text-base">📍</span> {place.address}
          </p>

          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 text-sm flex items-center gap-1 mt-1"
            >
              {t('place_detail.website', lang)}
            </a>
          )}
          {place.phone && (
            <a href={`tel:${place.phone}`} className="text-blue-600 dark:text-blue-400 text-sm flex items-center gap-1 mt-1">
              📞 {place.phone}
            </a>
          )}

          {place.description && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              {place.description}
            </p>
          )}

          {/* Opening hours */}
          {place.hours && place.hours.length > 0 && (
            <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{t('place_detail.hours', lang)}</p>
              {place.hours.map((h, i) => (
                <p key={i} className="text-xs text-gray-500 dark:text-gray-400">{h}</p>
              ))}
            </div>
          )}

          {place.latitude && place.longitude && (
            <div className="mt-4 h-32 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              {token ? (
                <Map
                  mapboxAccessToken={token}
                  initialViewState={{ longitude: place.longitude, latitude: place.latitude, zoom: 16 }}
                  style={{ width: '100%', height: '100%' }}
                  mapStyle="mapbox://styles/mapbox/streets-v12"
                  scrollZoom={false} dragPan={false} dragRotate={false}
                  doubleClickZoom={false} touchZoomRotate={false} keyboard={false}
                >
                  <Marker longitude={place.longitude} latitude={place.latitude}>
                    <div className="text-2xl">📍</div>
                  </Marker>
                </Map>
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-400 text-sm">
                  {t('place_detail.map_token', lang)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column at lg+ (sticky); below lg, just a normal mt-4 section. */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mt-4 lg:mt-0 lg:sticky lg:top-6 min-w-0">
          <h2 className="font-semibold mb-2 dark:text-white">{t('place_detail.recent_checkins', lang)}</h2>
          {recentCheckIns.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('place_detail.no_checkins_yet', lang)}</p>
          ) : (
            <div className="space-y-2">
              {recentCheckIns.slice(0, 10).map((ci) => {
                const following = isFollowing(ci.user_name)
                return (
                  <div key={ci.id} className="flex items-center gap-2 text-sm">
                    <span className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xs font-medium text-blue-700 dark:text-blue-300 shrink-0">
                      {ci.user_name[0].toUpperCase()}
                    </span>
                    <Link to={`/user/${encodeURIComponent(ci.user_name)}`} className="font-medium dark:text-white hover:text-blue-600 dark:hover:text-blue-400">{ci.user_name}</Link>
                    {ci.user_name !== userName && (
                      <button
                        onClick={() => handleFollow(ci.user_name)}
                        className={`text-xs font-medium ml-auto ${following ? 'text-gray-400' : 'text-blue-600 dark:text-blue-400'}`}
                      >
                        {following ? t('place_detail.following', lang) : t('place_detail.follow', lang)}
                      </button>
                    )}
                    <span className="text-gray-400 text-xs">
                      {new Date(ci.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* User + friends ratings — sits inside the right column at lg+. */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 mt-4 lg:mt-3 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold dark:text-white">{t('place_detail.ratings_section', lang)}</h2>
            {visibleRatings.length > 0 && (
              <span className="text-xs text-gray-400">{t('place_detail.ratings_count', lang).replace('{count}', String(visibleRatings.length))}</span>
            )}
          </div>
          {visibleRatings.length === 0 ? (
            <p className="text-gray-400 text-sm">{t('place_detail.no_ratings_yet', lang)}</p>
          ) : (
            <>
              <div className="space-y-2">
                {pagination.items.map((r) => {
                  const following = isFollowing(r.user_name)
                  const isMe = r.user_name === userName
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-xs font-medium text-emerald-700 dark:text-emerald-300 shrink-0">
                        {r.user_name[0].toUpperCase()}
                      </span>
                      <Link to={`/user/${encodeURIComponent(r.user_name)}`} className="font-medium dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400">
                        {isMe ? t('friends.you', lang) : r.user_name}
                      </Link>
                      <span className="ml-1 text-amber-500 text-xs whitespace-nowrap">
                        <Stars rating={r.rating} /> <span className="ml-1 text-gray-400">({r.rating})</span>
                      </span>
                      {r.user_name !== userName && (
                        <button
                          onClick={() => handleFollow(r.user_name)}
                          className={`text-xs font-medium ml-auto ${following ? 'text-gray-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {following ? t('place_detail.following', lang) : t('place_detail.follow', lang)}
                        </button>
                      )}
                      <span className="text-gray-400 text-xs">
                        {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  )
                })}
              </div>
              {pagination.totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    onClick={() => setRatingsPage((p) => Math.max(0, p - 1))}
                    disabled={pagination.page === 0}
                    aria-label={t('place_detail.prev', lang)}
                    className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  >
                    ← {t('place_detail.prev', lang)}
                  </button>
                  <span className="font-medium whitespace-nowrap">
                    {t('place_detail.page_of', lang)
                      .replace('{page}', String(pagination.page + 1))
                      .replace('{total}', String(pagination.totalPages))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setRatingsPage((p) => Math.min(pagination.totalPages - 1, p + 1))}
                    disabled={pagination.page >= pagination.totalPages - 1}
                    aria-label={t('place_detail.next', lang)}
                    className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  >
                    {t('place_detail.next', lang)} →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom action stack (check-in button + toasts).
          • Phone: floating card centered at max-w-md (mirrors the nav).
          • iPad+: full bleed against the bottom of the screen. */}
      <div className="fixed bottom-16 inset-x-0 px-4 pb-3 pointer-events-none z-20 sm:max-w-md sm:mx-auto md:max-w-full">
        <div className="space-y-2 pointer-events-auto">
        {/* Too far error toast */}
        {farError && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 text-center animate-bounce shadow-lg">
            <span className="text-lg font-bold text-red-800 dark:text-red-200">
              {t('place_detail.too_far', lang)}
            </span>
            <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {t('place_detail.too_far_msg', lang)}
            </div>
          </div>
        )}

        {/* Coins earned toast */}
        {bonus && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-2xl px-4 py-3 text-center animate-bounce shadow-lg">
            <span className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
              🪙 +{bonus.total} coins
            </span>
            <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5">
              {t('place_detail.base', lang)} {bonus.base}{bonus.mayorBonus > 0 ? ` ${t('place_detail.mayor_bonus', lang).replace('{bonus}', String(bonus.mayorBonus))}` : ''}
              {bonus.streakBonus > 0 ? ` ${t('place_detail.streak_bonus', lang).replace('{bonus}', String(bonus.streakBonus))}` : ''}
              {bonus.friendBonus > 0 ? ` ${t('place_detail.trailblazer', lang).replace('{bonus}', String(bonus.friendBonus))}` : ''}
              {bonus.multiplier > 1 ? ` ${t('place_detail.sticker_mult', lang).replace('{mult}', String(bonus.multiplier))}` : ''}
            </div>
          </div>
        )}

        {/* Achievement unlocks */}
        {achievements.map((a) => (
          <div key={a.achievement.id} className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-2xl px-4 py-3 text-center animate-bounce shadow-lg">
            <span className="text-lg font-bold text-green-800 dark:text-green-200">
              {a.achievement.icon} {a.achievement.title}
            </span>
            <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">
              {a.achievement.description} — 🪙+{a.total}
            </div>
          </div>
        ))}

        {/* Level-up toast */}
        {levelUp && (() => {
          const style = TIER_STYLE[levelUp.to.tier]
          return (
            <div className={`${style.bg} ${style.border} rounded-2xl px-4 py-3 text-center animate-bounce shadow-lg`}>
              <div className="flex items-center justify-center gap-2">
                <img src={levelUp.to.image} alt="" className="w-8 h-8 object-contain inline-block" />
                <span className={`text-lg font-bold ${style.text}`}>
                  ⬆ {levelUp.to.name}
                </span>
              </div>
              <div className={`text-xs ${style.text} mt-0.5 opacity-80`}>
                {levelUp.from.name} → {levelUp.to.name}
              </div>
            </div>
          )
        })()}

        <button
          onClick={handleCheckIn}
          disabled={checkedIn}
          className={`w-full py-4 rounded-2xl font-bold text-lg transition-all ${
            checkedIn
              ? 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-blue-600 dark:bg-blue-500 text-white active:scale-95 shadow-lg shadow-blue-600/30 dark:shadow-blue-600/10'
          }`}
        >
          {checkedIn ? t('place_detail.checked_in_as', lang).replace('{name}', userName) : t('place_detail.check_in', lang)}
        </button>
        </div>
      </div>

      {showShare && place && (
        <ShareSheet placeId={place.id} placeName={place.name} onClose={() => setShowShare(false)} />
      )}

      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setSelectedPhoto(null)}
        >
          <img
            src={selectedPhoto}
            alt=""
            className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl cursor-default"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
