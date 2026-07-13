import { useState, useRef, useEffect } from 'react'
import Map, { Marker, NavigationControl, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import { searchGeoapifyPlaces } from '../lib/geoapify'
import { getOverpassPlaces, overpassToPlace } from '../lib/overpass'
import { batchUpsertPlaces, reverseGeocode } from '../lib/places'
import 'mapbox-gl/dist/mapbox-gl.css'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

const token = import.meta.env.VITE_MAPBOX_TOKEN

const mapStyles = `
  .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
  .mapboxgl-ctrl-top-right { z-index: 2 !important; }
`

const DEFAULT_VIEW = { longitude: 10.7522, latitude: 59.9139, zoom: 11 }

const EARTH_RADIUS_M = 6_371_000

const RADIUS_MIN_KM = 1
const RADIUS_MAX_KM = 10
const RADIUS_STEP_KM = 0.5
const DEFAULT_RADIUS_KM = 10

function formatKm(km: number): string {
  // Whole km render as "X km", fractional km as "X.X km"
  return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`
}

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

interface Props {
  onLocationSelect?: (lat: number, lng: number, address?: string) => void
}

export default function AdminImportMap({ onLocationSelect }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string; progress?: boolean } | null>(null)
  const [locating, setLocating] = useState(false)
  const [viewState, setViewState] = useState<{ longitude: number; latitude: number; zoom: number } | null>(null)
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const { lang } = useLanguage()

  function handleSetPoint(lat: number, lng: number) {
    setPoint({ lat, lng })
  }

  function handleSelectPoint(lat: number, lng: number) {
    handleSetPoint(lat, lng)
    if (!onLocationSelect) return
    onLocationSelect?.(lat, lng)
    reverseGeocode(lat, lng).then((address) => {
      if (address) onLocationSelect?.(lat, lng, address)
    })
  }

  function centerOnMe() {
    if (!navigator.geolocation) {
      setResult({ ok: false, message: 'Geolocation is not available in this browser.' })
      return
    }
    setLocating(true)
    setResult(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        handleSetPoint(latitude, longitude)
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1500 })
        setLocating(false)
        // Don't auto-navigate — user clicked "center on me", keep import pane open
      },
      (err) => {
        setResult({ ok: false, message: `Location error: ${err.message}` })
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  useEffect(() => {
    if (!navigator.geolocation) {
      setViewState(DEFAULT_VIEW)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        handleSetPoint(latitude, longitude)
        setViewState({ longitude, latitude, zoom: 14 })
      },
      () => setViewState(DEFAULT_VIEW),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  async function handleImport() {
    if (!point) return
    setImporting(true)
    setResult(null)
    try {
      const location = { latitude: point.lat, longitude: point.lng }
      const radiusM = Math.round(radiusKm * 1000)

      // Try Geoapify first (fast, structured data). Surface page-by-page
      // progress so long imports in dense areas don't look hung.
      let places = await searchGeoapifyPlaces(location, radiusM, undefined, (p) => {
        if (p.done) return
        setResult({ ok: true, progress: true, message: `Fetching page ${p.page}… (${p.fetched} so far)` })
      })

      // Fall back to Overpass if Geoapify returned nothing or isn't configured
      if (places.length === 0) {
        const overpassResults = await getOverpassPlaces(null, location, radiusM)
        places = overpassResults.map(overpassToPlace)
      }

      if (places.length === 0) {
        setResult({ ok: true, message: `No places found within ${formatKm(radiusKm)} of this location.` })
        return
      }
      await batchUpsertPlaces(places)
      setResult({ ok: true, message: `Imported ${places.length} place${places.length === 1 ? '' : 's'}.` })
    } catch (e) {
      setResult({ ok: false, message: `Import failed: ${(e as Error).message}` })
    } finally {
      setImporting(false)
    }
  }

  if (!token) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
        <p className="text-gray-400 dark:text-gray-500 text-sm">{t('place_map.token_msg', lang)}</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="font-semibold text-lg mb-2 dark:text-white">{t('admin.import_popup', lang)}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {t('admin.import_desc', lang)}
      </p>
      <style>{mapStyles}</style>
      <div className="relative rounded-xl overflow-hidden" style={{ height: '400px' }}>
        {viewState && (
          <Map
            ref={mapRef}
            mapboxAccessToken={token}
            initialViewState={viewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            onClick={(e) => handleSelectPoint(e.lngLat.lat, e.lngLat.lng)}
          >
            <NavigationControl position="top-right" />
        {point && (
          <>
            <Source id="radius-circle" type="geojson" data={circleGeoJSON(point, Math.round(radiusKm * 1000))}>
                  <Layer
                    id="radius-circle-fill"
                    type="fill"
                    paint={{
                      'fill-color': '#3b82f6',
                      'fill-opacity': 0.1,
                    }}
                  />
                  <Layer
                    id="radius-circle-outline"
                    type="line"
                    paint={{
                      'line-color': '#3b82f6',
                      'line-width': 2,
                      'line-opacity': 0.5,
                      'line-dasharray': [4, 4],
                    }}
                  />
                </Source>
                <Marker longitude={point.lng} latitude={point.lat}>
                  <div className="w-5 h-5 bg-red-500 rounded-full border-2 border-white shadow-lg" />
                </Marker>
              </>
            )}
          </Map>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={centerOnMe}
          disabled={locating}
          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 text-sm rounded-lg font-medium transition-colors"
        >
          {locating ? t('admin.locating', lang) : t('admin.center_on_me', lang)}
        </button>
        {point && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </span>
        )}
      </div>

      {point && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="admin-import-radius" className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('admin.radius_label', lang)}
            </label>
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
              {formatKm(radiusKm)}
            </span>
          </div>
          <input
            id="admin-import-radius"
            type="range"
            min={RADIUS_MIN_KM}
            max={RADIUS_MAX_KM}
            step={RADIUS_STEP_KM}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            disabled={importing}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={t('admin.radius_label', lang)}
          />
          <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-0.5">
            <span>{RADIUS_MIN_KM} km</span>
            <span>{RADIUS_MAX_KM} km</span>
          </div>
        </div>
      )}

      <button
        disabled={!point || importing}
        onClick={handleImport}
        className="mt-3 w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
      >
        {importing ? t('admin.importing', lang) : t('admin.import_btn', lang)}
      </button>

      {result && (
        <div className={`mt-2 text-sm ${
          result.progress
            ? 'text-blue-600 dark:text-blue-400'
            : result.ok
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
        }`}>
          {result.message}
        </div>
      )}
    </div>
  )
}
