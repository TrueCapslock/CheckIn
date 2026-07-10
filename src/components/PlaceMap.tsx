import { Link } from 'react-router-dom'
import Map, { Marker, Popup, NavigationControl, GeolocateControl, Source, Layer } from 'react-map-gl/mapbox'
import type { Place } from '../lib/types'
import { getCategoryIcon } from '../lib/categories'
import { useDarkModeContext } from '../lib/dark-mode-context'
import { getMaxCheckInDistance } from '../lib/admin'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useState, useRef } from 'react'
import { isValidLngLat } from '../lib/location'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

const mapStyles = `
  .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
  .mapboxgl-ctrl-top-right { z-index: 2 !important; }
  .mapboxgl-popup-content {
    background: var(--ci-panel-strong) !important;
    color: var(--ci-text) !important;
    padding: 14px 18px !important;
    border: 1px solid var(--ci-border) !important;
    border-radius: 14px !important;
    box-shadow: 0 18px 50px rgba(0,0,0,0.35) !important;
  }
  .mapboxgl-popup-close-button {
    font-size: 20px !important;
    padding: 6px 10px !important;
    color: var(--ci-muted) !important;
  }
  .mapboxgl-popup-close-button:hover {
    color: var(--ci-text) !important;
    background: var(--ci-hover-bg) !important;
  }
  .mapboxgl-popup-tip { display: none !important; }
`

interface PlaceMapProps {
  places: Place[]
  userLocation?: { latitude: number; longitude: number } | null
}

const EARTH_RADIUS_M = 6_371_000

function circleGeoJSON(center: { lat: number; lng: number }, radiusM: number, points = 64): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const latRad = (center.lat * Math.PI) / 180
  const lonRad = (center.lng * Math.PI) / 180
  const dist = radiusM / EARTH_RADIUS_M

  for (let i = 0; i <= points; i++) {
    const bearing = (i * 360) / points
    const brngRad = (bearing * Math.PI) / 180
    const lat2 = Math.asin(Math.sin(latRad) * Math.cos(dist) + Math.cos(latRad) * Math.sin(dist) * Math.cos(brngRad))
    const lon2 = lonRad + Math.atan2(Math.sin(brngRad) * Math.sin(dist) * Math.cos(latRad), Math.cos(dist) - Math.sin(latRad) * Math.sin(lat2))
    coords.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  }
}

const token = import.meta.env.VITE_MAPBOX_TOKEN

const DEFAULT_CENTER_LNG = -122.6784
const DEFAULT_CENTER_LAT = 45.5152

// Module-level dedupe of console.warn() for invalid-coord places so re-renders
// don't spam the dev console. Reset only on full page reload.
const warnedInvalidPlaceIds = new Set<string>()

export default function PlaceMap({ places, userLocation }: PlaceMapProps) {
  const { dark } = useDarkModeContext()
  const [popupId, setPopupId] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const mapRef = useRef<any>(null)
  const { lang } = useLanguage()

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const handleContextLost = (e: any) => {
    e.preventDefault?.()
    console.log('[Map] Context lost, forcing reload in 2s')
    setMapError('WebGL context lost. Reloading map...')
    setTimeout(() => {
      window.location.reload()
    }, 2000)
  }

  const handleContextRestored = () => {
    setMapError(null)
  }

  // Strict coordinate check prevents Mapbox from throwing when a place row has
  // an out-of-range lat or lng (e.g., lat=200 entered by mistake).
  const validUserLocation = isValidLngLat(userLocation?.latitude, userLocation?.longitude)
  const center: [number, number] = validUserLocation
    ? [userLocation!.longitude, userLocation!.latitude]
    : [DEFAULT_CENTER_LNG, DEFAULT_CENTER_LAT]

  return (
    <>
      <style>{mapStyles}</style>
    {!online ? (
      <div className="absolute inset-0 min-h-[240px] overflow-y-auto rounded-xl bg-[var(--ci-bg)] p-4 text-[var(--ci-text)]">
        <div className="mb-4 rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-4">
          <p className="text-sm font-black text-[var(--ci-text)]">{t('place_map.offline_title', lang)}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ci-muted)]">{t('place_map.offline_body', lang)}</p>
        </div>
        {places.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-6 text-center text-sm text-[var(--ci-muted)]">
            {t('place_map.offline_empty', lang)}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ci-muted)]">{t('place_map.cached_places', lang)}</p>
            <div className="space-y-2">
              {places.slice(0, 12).map((place) => (
                <Link
                  key={place.id}
                  to={`/places/${place.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-3 text-sm"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--ci-muted-surface)] text-xl">
                    {getCategoryIcon(place.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[var(--ci-text)]">{place.name}</p>
                    <p className="truncate text-xs capitalize text-[var(--ci-muted)]">{place.type}</p>
                  </div>
                  <span className="text-lg text-[var(--ci-mint)]">›</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    ) : !token ? (
      <div className="absolute inset-0 flex min-h-[240px] items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-400 text-sm">
        {t('place_map.token_msg', lang)}
      </div>
    ) : mapError ? (
      <div className="absolute inset-0 flex min-h-[240px] items-center justify-center bg-red-50 dark:bg-red-900/20 rounded-xl text-sm p-4 text-center">
        <div>
          <p className="text-red-700 dark:text-red-300 font-medium mb-1">{t('place_map.error', lang)}</p>
          <p className="text-red-500 dark:text-red-400 text-xs">{mapError}</p>
        </div>
      </div>
    ) : (
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <Map
        ref={(map) => { mapRef.current = map?.getMap() }}
        key={`${center[0]},${center[1]},${dark ? 'dark' : 'light'}`}
        mapboxAccessToken={token}
        initialViewState={{ longitude: center[0], latitude: center[1], zoom: 14 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={dark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
        onError={(e) => {
          console.error('[Map Error]', e.error)
          setMapError(e.error?.message || String(e.error))
        }}
        onLoad={(e) => {
          const glMap = e.target
          console.log('[Map] Loaded, attaching WebGL handlers')
          glMap.on('webglcontextlost', (e: any) => {
            console.log('[Map] webglcontextlost', e)
            handleContextLost(e)
          })
          glMap.on('webglcontextrestored', () => {
            console.log('[Map] webglcontextrestored')
            handleContextRestored()
          })
        }}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          positionOptions={{ enableHighAccuracy: true }}
          trackUserLocation={false}
          showUserHeading
        />

      {/* User location dot */}
      {userLocation && validUserLocation && (
        <Marker longitude={userLocation.longitude} latitude={userLocation.latitude}>
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg" />
        </Marker>
      )}

      {/* Check-in radius circle */}
      {userLocation && validUserLocation && (
        <Source id="checkin-radius" type="geojson" data={circleGeoJSON({ lat: userLocation.latitude, lng: userLocation.longitude }, getMaxCheckInDistance())}>
          <Layer
            id="checkin-radius-fill"
            type="fill"
            paint={{
              'fill-color': '#10b981',
              'fill-opacity': 0.08,
            }}
          />
          <Layer
            id="checkin-radius-outline"
            type="line"
            paint={{
              'line-color': '#10b981',
              'line-width': 2,
              'line-opacity': 0.3,
              'line-dasharray': [2, 4],
            }}
          />
        </Source>
      )}

      {places.map((place) => {
        if (!isValidLngLat(place.latitude, place.longitude)) {
          if (!warnedInvalidPlaceIds.has(place.id)) {
            warnedInvalidPlaceIds.add(place.id)
            console.warn('[PlaceMap] skipping place with invalid LngLat:', place.id, place.latitude, place.longitude)
          }
          return null
        }
        // isValidLngLat is a value-returning predicate (not a TS type predicate), so
        // TS can't narrow place.latitude/longitude from `number | null` to `number`.
        // Use non-null assertion since we've just verified they are valid numbers.
        return (
          <Marker
            key={place.id}
            longitude={place.longitude!}
            latitude={place.latitude!}
            onClick={() => setPopupId(place.id)}
          >
            <div className="w-9 h-9 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center text-lg shadow-lg border-2 border-white dark:border-gray-700 cursor-pointer">{getCategoryIcon(place.type)}</div>
          </Marker>
        )
      })}
      {places.map((place) => {
        if (popupId !== place.id || !isValidLngLat(place.latitude, place.longitude)) return null
        return (
          <Popup
            key={`popup-${place.id}`}
            longitude={place.longitude!}
            latitude={place.latitude!}
            closeOnClick={false}
            onClose={() => setPopupId(null)}
            offset={18}
            maxWidth="320px"
          >
            <div className="text-sm">
              <div className="font-semibold">
                {getCategoryIcon(place.type)} {place.name}
              </div>
              <div className="text-gray-500 dark:text-gray-400 capitalize">{place.type}</div>
              <Link
                to={`/places/${place.id}`}
                className="text-blue-600 dark:text-blue-400 text-xs mt-1 inline-block"
              >
                {t('place_map.view_place', lang)}
              </Link>
            </div>
          </Popup>
        )
      })}
      </Map>
      <div className="pointer-events-none absolute inset-0 z-[1] dark:bg-emerald-400/20 dark:mix-blend-overlay" />
    </div>
    )}
    </>
  )
}
