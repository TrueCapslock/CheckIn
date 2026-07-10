import { useEffect, useRef, useState } from 'react'
import Map, { Layer, Marker, NavigationControl, Source, type MapRef } from 'react-map-gl/mapbox'
import { searchGeoapifyPlaces } from '../lib/geoapify'
import { getOverpassPlaces, overpassToPlace } from '../lib/overpass'
import { batchUpsertPlaces } from '../lib/places'
import { isValidLngLat } from '../lib/location'
import 'mapbox-gl/dist/mapbox-gl.css'

const token = import.meta.env.VITE_MAPBOX_TOKEN
const DEFAULT_VIEW = { longitude: 10.7522, latitude: 59.9139, zoom: 11 }
const EARTH_RADIUS_M = 6_371_000
const IMPORT_RADIUS_M = 10_000

const mapStyles = `
  .mapboxgl-ctrl-logo, .mapboxgl-ctrl-attrib { display: none !important; }
  .mapboxgl-ctrl-top-right { z-index: 2 !important; }
`

interface Props {
  onPlaceAdded: () => void
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

export default function PlaceAddMap({ onPlaceAdded }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [locating, setLocating] = useState(false)
  const [viewState, setViewState] = useState<{ longitude: number; latitude: number; zoom: number } | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setViewState(DEFAULT_VIEW)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        if (!isValidLngLat(latitude, longitude)) {
          // Garbage coordinates from the GPS — fall back to default
          setViewState(DEFAULT_VIEW)
          return
        }
        setPoint({ lat: latitude, lng: longitude })
        setViewState({ longitude, latitude, zoom: 14 })
      },
      () => setViewState(DEFAULT_VIEW),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

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
        if (isValidLngLat(latitude, longitude)) {
          setPoint({ lat: latitude, lng: longitude })
          mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 14, duration: 1000 })
        }
        setLocating(false)
      },
      (err) => {
        setResult({ ok: false, message: `Location error: ${err.message}` })
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function handleImport() {
    if (!point || !isValidLngLat(point.lat, point.lng)) return
    setImporting(true)
    setResult(null)
    try {
      const location = { latitude: point.lat, longitude: point.lng }
      let places = await searchGeoapifyPlaces(location)

      if (places.length === 0) {
        const overpassResults = await getOverpassPlaces(null, location)
        places = overpassResults.map(overpassToPlace)
      }

      if (places.length === 0) {
        setResult({ ok: true, message: 'No places found within 10 km of this location.' })
        return
      }

      await batchUpsertPlaces(places)
      setResult({ ok: true, message: `Imported ${places.length} place${places.length === 1 ? '' : 's'}.` })
      onPlaceAdded()
    } catch (e) {
      setResult({ ok: false, message: `Import failed: ${(e as Error).message}` })
    } finally {
      setImporting(false)
    }
  }

  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
        Set VITE_MAPBOX_TOKEN to import places on the map.
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative flex-1 min-h-0">
        <style>{mapStyles}</style>
        {viewState && (
          <Map
            ref={mapRef}
            mapboxAccessToken={token}
            initialViewState={viewState}
            style={{ width: '100%', height: '100%' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
            onClick={(e) => {
              if (isValidLngLat(e.lngLat.lat, e.lngLat.lng)) {
                setPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                setResult(null)
              }
            }}
          >
            <NavigationControl position="top-right" />
            {point && isValidLngLat(point.lat, point.lng) && (
              <>
                <Source id="import-radius-circle" type="geojson" data={circleGeoJSON(point, IMPORT_RADIUS_M)}>
                  <Layer
                    id="import-radius-circle-fill"
                    type="fill"
                    paint={{ 'fill-color': '#3b82f6', 'fill-opacity': 0.1 }}
                  />
                  <Layer
                    id="import-radius-circle-outline"
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

      <div className="shrink-0 bg-[var(--ci-panel)] border-t border-[var(--ci-border)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={centerOnMe}
            disabled={locating}
            className="px-3 py-1.5 bg-[var(--ci-muted-surface)] disabled:opacity-50 text-sm rounded-lg font-medium transition-colors"
          >
            {locating ? 'Locating...' : 'Center on me'}
          </button>
          {point && (
            <span className="text-xs text-[var(--ci-muted)]">
              {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
            </span>
          )}
        </div>
        <button
          disabled={!point || importing}
          onClick={handleImport}
          className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
        >
          {importing ? 'Importing...' : 'Import places within 10 km'}
        </button>
        {result && (
          <div className={`text-sm ${result.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {result.message}
          </div>
        )}
      </div>
    </div>
  )
}
