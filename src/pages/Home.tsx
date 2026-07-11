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

  // Reused for both the mobile slide-up panel and the lg+ inline rail list.
  // Renders only the icon + name + type/distance, no close buttons.
  function renderNearbyRows(className: string) {
    if (nearbyPlaces.length === 0) {
      return (
        <p className={`${className} py-8 text-center text-sm text-[var(--ci-muted)]`}>
          {t('home.no_nearby_places', lang)}
        </p>
      )
    }
    return (
      <div className={className}>
        {nearbyPlaces.map((place) => {
          const distance = distanceFor(place)
          const distanceLabel = Number.isFinite(distance) ? formatDistance(distance) : null
          return (
            <Link
              key={place.id}
              to={`/places/${place.id}`}
              className="flex items-center gap-3 rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-3 text-sm hover:bg-[var(--ci-hover-bg)] transition-colors"
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
    )
  }

  return (
    // Tablet/iPad/iPad Pro (≥lg): 2-column — left rail with greeting + vertical
    // category list + inline nearby list, right pane fills with the map.
    // Below lg: a single-column stack — greeting → pills → map → floating
    // "Near you" button → optional slide-up nearby list.
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* LEFT RAIL (lg+) / TOP STACK (<lg) */}
      <div className="z-10 flex shrink-0 flex-col px-5 pb-3 pt-6 lg:h-full lg:w-[360px] lg:overflow-y-auto lg:border-r lg:border-[var(--ci-border)] lg:bg-[var(--ci-bg-deep)]/40">

        {/* Greeting — same look on mobile and tablet, but bigger avatar on lg+. */}
        <div className="mb-4 flex items-center gap-3">
          <div className="ci-logo-mark h-14 w-14 rounded-[1.25rem] lg:h-16 lg:w-16" />
          <div>
            <p className="text-sm font-semibold text-[var(--ci-mint)]">{t('splash.title', lang)}</p>
            <h1 className="text-2xl font-black tracking-tight text-[var(--ci-text)]">
              {userName ? t('home.hi_user', lang).replace('{name}', userName) : t('home.ready_to_explore', lang)}
            </h1>
            <p className="text-sm text-[var(--ci-muted)] mt-0.5">{t('home.checkin_earn_explore', lang)}</p>
          </div>
        </div>

        {/* MOBILE: horizontal pill row */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
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

        {/* TABLET (lg+): vertical category list, each row with icon + name.
            Active row is highlighted with the mint color so it reads like a
            native iPad sidebar selector. */}
        <div className="hidden lg:flex lg:flex-col lg:gap-1">
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ci-muted)]">
            {t('home.categories_heading', lang)}
          </p>
          <button
            onClick={() => setCategory(null)}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
              category === null
                ? 'border-[var(--ci-mint)] bg-[color-mix(in_srgb,var(--ci-mint)_18%,transparent)] text-[var(--ci-text)] font-bold'
                : 'border-[var(--ci-border)] bg-[var(--ci-panel)] text-[var(--ci-text)] hover:bg-[var(--ci-hover-bg)]'
            }`}
          >
            <span className="text-lg">📍</span>
            <span className="font-semibold">{t('home.nearby_chip', lang)}</span>
          </button>
          {getCategories().map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                category === cat.id
                  ? 'border-[var(--ci-mint)] bg-[color-mix(in_srgb,var(--ci-mint)_18%,transparent)] text-[var(--ci-text)] font-bold'
                  : 'border-[var(--ci-border)] bg-[var(--ci-panel)] text-[var(--ci-text)] hover:bg-[var(--ci-hover-bg)]'
              }`}
            >
              <span className="text-lg">{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>

        {/* TABLET (lg+): inline nearby list. Replaces the old slide-up
            overlay so the map and the list coexist on the same screen. */}
        <div className="hidden lg:mt-4 lg:flex lg:flex-col lg:gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-[var(--ci-text)]">{t('home.near_you', lang)}</h2>
            <Link to="/places" className="text-xs font-bold text-[var(--ci-mint)]">
              {t('home.see_all', lang)}
            </Link>
          </div>
          {renderNearbyRows('space-y-2')}
        </div>
      </div>

      {/* MAP AREA — fills the row on mobile, fills the right cell on lg+. */}
      <div className="relative min-h-[360px] flex-1 basis-0 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <PlaceMap places={places} userLocation={location} />
        </div>

        {/* MOBILE-ONLY: "Near you (12)" pill centered above the map and
            slide-up panel. Hidden at lg+ because the list is already inline
            in the rail. */}
        <button
          onClick={() => setShowNearby((open) => !open)}
          className="ci-primary absolute bottom-6 left-1/2 z-20 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-black shadow-2xl lg:hidden"
        >
          {showNearby ? t('home.hide_nearby', lang) : t('home.near_you_count', lang).replace('{count}', String(nearbyPlaces.length))}
        </button>

        {showNearby && (
          <div className="lg:hidden ci-glass absolute inset-x-4 bottom-20 z-20 flex max-h-[50%] flex-col overflow-hidden rounded-[1.75rem] p-4 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[var(--ci-border-strong)]" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-[var(--ci-text)]">{t('home.near_you', lang)}</h2>
              <Link to="/places" className="text-xs font-bold text-[var(--ci-mint)]">{t('home.see_all', lang)}</Link>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {renderNearbyRows('space-y-2')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
