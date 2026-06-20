import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CheckIn, Place } from '../lib/types'
import { getCategories, getCategoryIcon } from '../lib/categories'
import { getAllCheckIns, getPlace } from '../lib/places'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface CheckInWithPlace extends CheckIn {
  place: Place | null
}

export default function History() {
  const [checkIns, setCheckIns] = useState<CheckInWithPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string | null>(null)
  const { lang } = useLanguage()

  useEffect(() => {
    getAllCheckIns().then(async (items) => {
      const withPlaces = await Promise.all(
        items.map(async (ci) => {
          const place = await getPlace(ci.place_id)
          return { ...ci, place }
        }),
      )
      setCheckIns(withPlaces)
      setLoading(false)
    })
  }, [])

  const filtered = filter
    ? checkIns.filter((ci) => ci.place?.type === filter)
    : checkIns

  const typeCounts = checkIns.reduce<Record<string, number>>((acc, ci) => {
    const t = ci.place?.type
    if (t) acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-xl font-bold mb-3 dark:text-white">{t('history.title', lang)}</h1>

        {checkIns.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setFilter(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium ${
                filter === null ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              {t('history.title', lang) + ' · ' + checkIns.length}
            </button>
            {getCategories().map((cat) => {
              const count = typeCounts[cat.id]
              if (!count) return null
              return (
                <button
                  key={cat.id}
                  onClick={() => setFilter(cat.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
                    filter === cat.id ? 'bg-blue-600 dark:bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {cat.icon} {cat.name} · {count}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center mt-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 dark:text-gray-400">
              {checkIns.length === 0
                ? t('history.empty', lang)
                : t('history.no_match', lang)}
            </p>
            {checkIns.length === 0 && (
              <Link
                to="/places"
                className="inline-block mt-4 bg-blue-600 dark:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-medium"
              >
                {t('history.find_place', lang)}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((checkIn) => (
              <Link
                key={checkIn.id}
                to={`/places/${checkIn.place_id}`}
                className="flex items-start gap-3 p-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 dark:text-white"
              >
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-950 rounded-lg flex items-center justify-center text-xl shrink-0">
                  {getCategoryIcon(checkIn.place?.type ?? '')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{checkIn.place?.name || t('history.unknown_place', lang)}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {checkIn.user_name} ·{' '}
                    {new Date(checkIn.created_at).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
