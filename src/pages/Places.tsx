import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { List } from 'react-window'
import type { ListImperativeAPI } from 'react-window'
import type { Place } from '../lib/types'
import { getCategories, getCategory, getCategoryIcon } from '../lib/categories'
import { getCachedPlaces, refreshPlaces, searchPlaces } from '../lib/places'
import { useUserLocation, getDistance, formatDistance } from '../lib/location'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import PlaceMap from '../components/PlaceMap'
import PlaceAddMap from '../components/PlaceAddMap'

const PLACE_ITEM_HEIGHT = 104

interface PlaceRowProps {
  places: Place[]
  location: { latitude: number; longitude: number } | null
}

function PlaceRow({
  index,
  style,
  places,
  location,
}: PlaceRowProps & {
  index: number
  style: React.CSSProperties
}) {
  const place = places[index]
  const loc = location
  return (
    <div style={style} className="pb-3">
    <Link
      to={`/places/${place.id}`}
      className="flex h-full items-start gap-3 overflow-hidden rounded-xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-4 text-[var(--ci-text)]"
    >
      {place.photo_url ? (
        <img src={place.photo_url} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
      ) : (
        <div className="w-12 h-12 bg-[var(--ci-muted-surface)] rounded-xl flex items-center justify-center text-2xl shrink-0">
          {getCategoryIcon(place.type)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{place.name}</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">{getCategory(place.type)?.name || place.type}</div>
        <div className="text-sm text-gray-400 truncate">{place.address}</div>
        {place.rating && (
          <div className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
            {'★'.repeat(Math.floor(place.rating))}
            <span className="text-gray-400 ml-1">{place.rating}</span>
          </div>
        )}
      </div>
      {loc && place.latitude && place.longitude && (
        <div className="shrink-0 text-xs text-gray-400 mt-1">
          {formatDistance(getDistance(loc, { latitude: place.latitude, longitude: place.longitude }))}
        </div>
      )}
    </Link>
    </div>
  )
}

export default function Places() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'map' | 'add'>('list')
  const [sort, setSort] = useState<'name' | 'distance'>('distance')
  const [priceFilter, setPriceFilter] = useState<number | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const { location, loading: locLoading } = useUserLocation()
  const { lang } = useLanguage()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const listRef = useRef<ListImperativeAPI>(null)

  useEffect(() => {
    if (locLoading) return

    clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      setLoading(true)
      setFetchError(null)
      if (!search) {
        const cached = getCachedPlaces(filter)
        if (cached.length > 0) {
          setPlaces(cached)
          setLoading(false)
        }
      }
      const fetch = search ? searchPlaces(search, location) : refreshPlaces(filter, location)
      fetch.then((data) => {
        setPlaces(data)
        setLoading(false)
      }).catch(() => {
        setFetchError('Failed to load places. Check your connection.')
        setLoading(false)
      })
    }, 400)

    return () => clearTimeout(debounceRef.current)
  }, [filter, search, location, locLoading])

  useEffect(() => {
    listRef.current?.scrollToRow({ index: 0, behavior: 'auto' })
  }, [places])

  const sortedPlaces = useMemo(() => {
    let out = [...places]
    if (priceFilter !== null) {
      // When a specific price level is selected, hide places with no price data
      // (user asked for $$-tier; null priceLevel is unknown and not $-tier).
      out = out.filter((p) => p.priceLevel === priceFilter)
    }
    if (sort === 'name') {
      out.sort((a, b) => a.name.localeCompare(b.name))
    } else if (location) {
      out.sort((a, b) => {
        const aDist = a.latitude && a.longitude
          ? getDistance(location, { latitude: a.latitude, longitude: a.longitude })
          : Infinity
        const bDist = b.latitude && b.longitude
          ? getDistance(location, { latitude: b.latitude, longitude: b.longitude })
          : Infinity
        return aDist - bDist
      })
    }
    return out
  }, [places, sort, location, priceFilter])

  const rowProps = useMemo<PlaceRowProps>(() => ({ places: sortedPlaces, location }), [sortedPlaces, location])

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-[var(--ci-bg)] text-[var(--ci-text)]">
      <div className="px-4 pt-6 pb-4 shrink-0 sticky top-0 z-10 bg-[var(--ci-bg)]">
        <h1 className="text-2xl font-bold dark:text-white">{t('places.title', lang)}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('places.description', lang)}</p>

        <input
          type="text"
          placeholder={t('places.search', lang)}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-3 w-full px-4 py-2.5 bg-[var(--ci-input-bg)] border border-[var(--ci-border)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-300 text-[var(--ci-text)] placeholder:text-[var(--ci-muted)]"
        />

        <div className="flex gap-2 overflow-x-auto pb-2 mt-3">
          <button
            onClick={() => setFilter(null)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
              filter === null ? 'bg-[var(--ci-mint)] text-emerald-950' : 'bg-[var(--ci-muted-surface)] text-[var(--ci-muted)]'
            }`}
          >
            {t('places.all', lang)}
          </button>
          {getCategories().map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium capitalize ${
                filter === cat.id ? 'bg-[var(--ci-mint)] text-emerald-950' : 'bg-[var(--ci-muted-surface)] text-[var(--ci-muted)]'
              }`}
            >
              {cat.icon} {cat.name}
            </button>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mt-2">
          <button
            onClick={() => setPriceFilter(null)}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium ${
              priceFilter === null ? 'bg-[var(--ci-mint)] text-emerald-950' : 'bg-[var(--ci-muted-surface)] text-[var(--ci-muted)]'
            }`}
          >
            {t('places.price_any', lang)}
          </button>
          {[1, 2, 3, 4].map((level) => (
            <button
              key={level}
              onClick={() => setPriceFilter(level)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium text-green-700 dark:text-green-300 ${
                priceFilter === level
                  ? 'bg-green-100 dark:bg-green-900/30 ring-2 ring-green-500 dark:ring-green-400'
                  : 'bg-[var(--ci-muted-surface)]'
              }`}
            >
              {'$'.repeat(level)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 mt-3 bg-[var(--ci-muted-surface)] rounded-lg p-1 text-[var(--ci-text)]">
          <button
            onClick={() => setView('list')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${
              view === 'list' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : ''
            }`}
          >
            {t('places.list', lang)}
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${
              view === 'map' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : ''
            }`}
          >
            {t('places.map', lang)}
          </button>
          <button
            onClick={() => setView('add')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${
              view === 'add' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : ''
            }`}
          >
            {t('places.import', lang)}
          </button>
        </div>

        <div className="flex gap-1 mt-2 bg-[var(--ci-muted-surface)] rounded-lg p-1 text-[var(--ci-text)]">
          <button
            onClick={() => setSort('name')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${
              sort === 'name' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : ''
            }`}
          >
            {t('places.a_z', lang)}
          </button>
          <button
            onClick={() => setSort('distance')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md ${
              sort === 'distance' ? 'bg-[var(--ci-panel-strong)] shadow-sm' : ''
            }`}
          >
            {t('places.distance', lang)}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center mt-20">
          <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : view === 'map' ? (
        <div className="relative flex-1 min-h-0">
          <div className="absolute inset-0 overflow-hidden border border-gray-200 dark:border-gray-700">
            <PlaceMap places={sortedPlaces} userLocation={location} />
          </div>
        </div>
      ) : view === 'add' ? (
        <PlaceAddMap onPlaceAdded={() => { refreshPlaces(filter, location).then(setPlaces) }} />
      ) : sortedPlaces.length === 0 ? (
        <div className="flex-1 text-center mt-10 px-4">
          {fetchError ? (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <p className="text-red-700 dark:text-red-300 font-medium">{t('places.something_wrong', lang)}</p>
              <p className="text-red-500 dark:text-red-400 text-sm mt-1">{fetchError}</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs mt-3">
                {t('places.try_refresh', lang)}
              </p>
            </div>
          ) : locLoading ? (
            <p className="text-gray-500 dark:text-gray-400">{t('places.getting_location', lang)}</p>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">{t('places.no_places', lang)}</p>
          )}
        </div>
      ) : (
        <div className="flex-1 px-4 pb-20 overflow-hidden">
          <List<PlaceRowProps>
            listRef={listRef}
            defaultHeight={400}
            rowComponent={PlaceRow}
            rowCount={sortedPlaces.length}
            rowHeight={PLACE_ITEM_HEIGHT}
            rowProps={rowProps}
            overscanCount={3}
            style={{ flexGrow: 1, height: '100%' }}
          />
        </div>
      )}
    </div>
  )
}
