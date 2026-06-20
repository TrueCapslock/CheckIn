import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Place } from '../lib/types'
import { getCategories, getCategoryIcon } from '../lib/categories'
import { getCachedPlaces, refreshPlaces } from '../lib/places'
import { getUsername } from '../lib/user'
import { useUserLocation, getDistance, formatDistance } from '../lib/location'
import PlaceMap from '../components/PlaceMap'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

export default function Home() {
  const { lang } = useLanguage()
  const userName = getUsername()
  const { location } = useUserLocation()
  const [category, setCategory] = useState<string | null>(null)
  const [places, setPlaces] = useState<Place[]>(getCachedPlaces(category))
  const [showNearby, setShowNearby] = useState(false)

  useEffect(() => {
    function load() {
      const cached = getCachedPlaces(category)
      if (cached.length > 0) setPlaces(cached)
      refreshPlaces(category).then(setPlaces).catch(() => setPlaces(getCachedPlaces(category)))
    }

    load()

    const onVisibility = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [category])

  const distanceFor = (place: Place): number => {
    if (!location || place.latitude == null || place.longitude == null) return Infinity
    return getDistance(location, { latitude: place.latitude, longitude: place.longitude })
  }

  const nearbyPlaces = location ? [...places]
    .filter((place) => place.latitude != null && place.longitude != null)
    .sort((a, b) => distanceFor(a) - distanceFor(b) || a.name.localeCompare(b.name))
    .slice(0, 12) : []

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="z-10 shrink-0 px-5 pb-3 pt-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="ci-logo-mark h-14 w-14 rounded-[1.25rem]" />
          <div>
            <p className="text-sm font-semibold text-[var(--ci-mint)]">{t('splash.title', lang)}</p>
            <h1 className="text-2xl font-black tracking-tight text-[var(--ci-text)]">
              {userName ? t('home.hi_user', lang).replace('{name}', userName) : t('home.ready_to_explore', lang)}
            </h1>
            <p className="text-sm text-[var(--ci-muted)] mt-0.5">{t('home.checkin_earn_explore', lang)}</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory(null)}
            className={`${category === null ? 'ci-chip-active' : 'ci-chip'} shrink-0 rounded-full px-4 py-2 text-sm font-bold`}
          >
            {t('home.nearby_chip', lang)}
          </button>
          {getCategories().map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`${category === cat.id ? 'ci-chip-active' : 'ci-chip'} shrink-0 rounded-full px-4 py-2 text-sm font-semibold`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-h-[360px] flex-1 basis-0 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <PlaceMap places={places} userLocation={location} />
        </div>

        <button
          onClick={() => setShowNearby((open) => !open)}
          className="ci-primary absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-black shadow-2xl"
        >
          {showNearby ? t('home.hide_nearby', lang) : t('home.near_you_count', lang).replace('{count}', String(nearbyPlaces.length))}
        </button>

        {showNearby && (
        <div className="ci-glass absolute inset-x-4 bottom-20 z-20 flex max-h-[50%] flex-col overflow-hidden rounded-[1.75rem] p-4 shadow-2xl">
          <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[var(--ci-border-strong)]" />
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-[var(--ci-text)]">{t('home.near_you', lang)}</h2>
            <Link to="/places" className="text-xs font-bold text-[var(--ci-mint)]">{t('home.see_all', lang)}</Link>
          </div>
          {nearbyPlaces.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--ci-muted)]">{t('home.no_nearby_places', lang)}</p>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {nearbyPlaces.map((place) => {
                const distance = distanceFor(place)
                const distanceLabel = Number.isFinite(distance)
                  ? formatDistance(distance)
                  : null
                return (
                  <Link
                    key={place.id}
                    to={`/places/${place.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-[var(--ci-border)] bg-white/40 p-3 text-sm backdrop-blur dark:bg-emerald-950/30"
                  >
                    {place.photo_url ? (
                      <img src={place.photo_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100/20 text-xl">
                        {getCategoryIcon(place.type)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-[var(--ci-text)]">{place.name}</p>
                      <p className="truncate text-xs capitalize text-[var(--ci-muted)]">
                        {place.type}{distanceLabel ? ` · ${distanceLabel}` : ''}
                      </p>
                    </div>
                    <span className="text-lg text-[var(--ci-mint)]">›</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
        )}
      </div>

    </div>
  )
}
