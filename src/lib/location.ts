import { useState, useEffect } from 'react'

export interface UserLocation {
  latitude: number
  longitude: number
}

export function getDistance(a: UserLocation, b: { latitude: number; longitude: number }): number {
  const R = 6371
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const x =
    sinDLat * sinDLat +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sinDLon * sinDLon
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`
}

/**
 * Strict Mapbox/Leaflet LngLat validator.
 *
 * Accepts only finite numbers in their valid ranges:
 *   lat ∈ [-90, 90], lng ∈ [-180, 180]
 *
 * Treats null/undefined/NaN/Infinity as invalid. Accepts 0/0 (Null Island)
 * because it is mathematically a valid point — admins can edit/delete it
 * if it was entered by mistake.
 */
export function isValidLngLat(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported')
      setLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  return { location, error, loading }
}
