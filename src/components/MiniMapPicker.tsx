import { useState } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

const token = import.meta.env.VITE_MAPBOX_TOKEN

const DEFAULT_VIEW = { longitude: 10.7522, latitude: 59.9139, zoom: 11 }

interface Props {
  lat?: number
  lng?: number
  onSelect: (lat: number, lng: number) => void
}

export default function MiniMapPicker({ lat, lng, onSelect }: Props) {
  const { lang } = useLanguage()
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(
    lat !== undefined && lng !== undefined ? { lat, lng } : null
  )

  if (!token) {
    return (
      <div className="rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 p-4 text-sm text-gray-500 text-center">
        {t('place_map.map_token', lang)}
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600" style={{ height: 280 }}>
      <Map
        mapboxAccessToken={token}
        initialViewState={point ? { longitude: point.lng, latitude: point.lat, zoom: 14 } : DEFAULT_VIEW}
        mapStyle="mapbox://styles/mapbox/streets-v12"
        onClick={(e) => {
          const p = { lat: e.lngLat.lat, lng: e.lngLat.lng }
          setPoint(p)
          onSelect(p.lat, p.lng)
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        {point && <Marker longitude={point.lng} latitude={point.lat} />}
      </Map>
    </div>
  )
}
