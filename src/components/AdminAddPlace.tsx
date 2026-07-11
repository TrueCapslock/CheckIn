import { useState, useEffect } from 'react'
import { getCategories } from '../lib/categories'
import { batchUpsertPlaces, deletePlaceInSupabase } from '../lib/places'
import { isValidLngLat } from '../lib/location'
import { isQuotaError } from '../lib/local-places'
import type { Place } from '../lib/types'
import MiniMapPicker from './MiniMapPicker'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface FormState {
  name: string
  type: string
  address: string
  latitude: string
  longitude: string
  phone: string
  website: string
  description: string
}

const emptyForm: FormState = {
  name: '',
  type: 'bar',
  address: '',
  latitude: '',
  longitude: '',
  phone: '',
  website: '',
  description: '',
}

interface Props {
  selectedLocation?: { lat: number; lng: number; address?: string } | null
  editing?: Place | null
  onSaved?: () => void
  onDeleted?: () => void
}

export default function AdminAddPlace({ selectedLocation, editing, onSaved, onDeleted }: Props) {
  const categories = getCategories()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const { lang } = useLanguage()
  const isEditing = !!editing

  // When editing prop changes (keyed by id to avoid re-pill when parent re-renders
  // with the same place object), prefill the form. Guard null/undefined DB values
  // with `?? ''` so that submit-time `.trim()` calls don't throw on nulls.
  useEffect(() => {
    if (!editing) return
    setForm({
      name: editing.name ?? '',
      type: editing.type ?? 'bar',
      address: editing.address ?? '',
      latitude: editing.latitude != null ? String(editing.latitude) : '',
      longitude: editing.longitude != null ? String(editing.longitude) : '',
      phone: editing.phone ?? '',
      website: editing.website ?? '',
      description: editing.description ?? '',
    })
  }, [editing?.id])

  useEffect(() => {
    if (selectedLocation && isValidLngLat(selectedLocation.lat, selectedLocation.lng)) {
      setForm((prev) => ({
        ...prev,
        latitude: String(selectedLocation.lat),
        longitude: String(selectedLocation.lng),
        ...(selectedLocation.address ? { address: selectedLocation.address } : {}),
      }))
    }
  }, [selectedLocation])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    const lat = parseFloat(form.latitude)
    const lng = parseFloat(form.longitude)
    if (!form.name.trim()) { setMessage({ ok: false, text: 'Name is required.' }); return }
    if (!form.address.trim()) { setMessage({ ok: false, text: 'Address is required.' }); return }
    if (isNaN(lat) || isNaN(lng)) { setMessage({ ok: false, text: 'Latitude and longitude must be valid numbers.' }); return }
    if (!isValidLngLat(lat, lng)) { setMessage({ ok: false, text: 'Coordinates out of range. Latitude must be in [-90, 90], longitude in [-180, 180].' }); return }

    setSaving(true)
    try {
      const place: Place = {
        id: editing?.id ?? crypto.randomUUID(),
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim(),
        latitude: lat,
        longitude: lng,
        description: form.description.trim() || null,
        photo_url: editing?.photo_url ?? null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        created_at: editing?.created_at ?? new Date().toISOString(),
      }

      await batchUpsertPlaces([place])

      setMessage({ ok: true, text: isEditing ? `"${place.name}" updated.` : `"${place.name}" added.` })
      if (!isEditing) setForm(emptyForm)
      onSaved?.()
    } catch (e) {
      if (isQuotaError(e)) {
        // Browser localStorage hit its per-origin cap (Safari / iOS users hit
        // this after accumulating many cached check-ins / places). The Supabase
        // upsert in `batchUpsertPlaces` swallows its own errors and warns, so
        // we can't know for certain whether the server row saved — surface a
        // clear next-step instead of the cryptic "The quota has been exceeded."
        setMessage({
          ok: false,
          text:
            'Browser storage is full on this device. The place may still have been saved to the server. ' +
            'Free space in Safari → Settings → [this site] → Clear Website Data, then try again.',
        })
      } else {
        setMessage({ ok: false, text: `Failed: ${(e as Error).message}` })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing) return
    if (!window.confirm(`Delete "${editing.name}"? This cannot be undone.`)) return
    setSaving(true)
    setMessage(null)
    try {
      const result = await deletePlaceInSupabase(editing.id)
      if (!result.ok) {
        if (result.code === '23503') {
          setMessage({ ok: false, text: t('admin.delete_place_in_use', lang) })
        } else {
          setMessage({ ok: false, text: `${t('admin.delete_place_failed', lang)}: ${result.error}` })
        }
        return
      }
      setMessage({ ok: true, text: `"${editing.name}" deleted.` })
      onDeleted?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="font-semibold text-lg mb-2 dark:text-white">
        {isEditing ? t('admin.edit_place', lang) : t('admin.add_place_title', lang)}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {t('admin.add_place_desc', lang)}
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_name', lang)}</label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Place name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_type', lang)}</label>
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_address', lang)}</label>
          <input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Street address"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_latitude', lang)}</label>
            <input
              value={form.latitude}
              onChange={(e) => set('latitude', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="59.9139"
              type="number" step="any"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_longitude', lang)}</label>
            <input
              value={form.longitude}
              onChange={(e) => set('longitude', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="10.7522"
              type="number" step="any"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowPicker((v) => !v)}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          {showPicker ? t('admin.add_hide_map', lang) : t('admin.add_pick_map', lang)}
        </button>

        {showPicker && (
          <MiniMapPicker
            lat={form.latitude ? parseFloat(form.latitude) || undefined : undefined}
            lng={form.longitude ? parseFloat(form.longitude) || undefined : undefined}
            onSelect={(lat, lng) => {
              setForm((prev) => ({ ...prev, latitude: String(lat), longitude: String(lng) }))
              setShowPicker(false)
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_phone', lang)}</label>
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+1 555-0123"
              type="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_website', lang)}</label>
            <input
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com"
              type="url"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('admin.add_description', lang)}</label>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional description"
            rows={2}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
        >
          {saving ? t('admin.add_saving', lang) : isEditing ? t('admin.save_btn', lang) : t('admin.add_btn', lang)}
        </button>

        {isEditing && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="w-full px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
          >
            {t('admin.delete_place', lang)}
          </button>
        )}

        {message && (
          <div className={`text-sm ${message.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.text}
          </div>
        )}
      </form>
    </div>
  )
}
