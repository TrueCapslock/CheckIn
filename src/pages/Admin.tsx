import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isAdmin, getMaxCheckInDistance, setMaxCheckInDistance, isPartyEnabled, setPartyEnabled, recalculateStats, syncConfig, resetApp, deleteUser } from '../lib/admin'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import { getCategories } from '../lib/categories'
import { getAllCheckIns, getPlaces, getPlace } from '../lib/places'
import type { CheckIn, Place } from '../lib/types'
import AdminImportMap from '../components/AdminImportMap'
import AdminAddPlace from '../components/AdminAddPlace'
import { getUser } from '../lib/user'

interface CheckInWithPlace extends CheckIn {
  place: Place | null
}

interface AdminStats {
  places: number
  checkIns: number
  categories: number
  users: number
}

async function getUserCount(): Promise<number> {
  try {
    const { supabase } = await import('../lib/supabase')
    const { count, error } = await supabase.from('users').select('email', { count: 'exact', head: true })
    if (error) return 0
    return count || 0
  } catch {
    return 0
  }
}



interface UserRow {
  email: string
  name: string
  points: number
  coins: number
  created_at: string
}

export default function Admin() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const allowed = isAdmin()
  const currentUserEmail = getUser()?.email?.trim().toLowerCase() || ''
  const [stats, setStats] = useState<AdminStats>({ places: 0, checkIns: 0, categories: 0, users: 0 })
  const [recent, setRecent] = useState<CheckInWithPlace[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [maxDist, setMaxDist] = useState(getMaxCheckInDistance())
  const [partyEnabled, setPartyEnabledState] = useState(isPartyEnabled())
  const [recalcState, setRecalcState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [recalcMessage, setRecalcMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'running' | 'done' | 'error'>('idle')
  const [resetMessage, setResetMessage] = useState('')
  const [fullReset, setFullReset] = useState(false)
  const [popup, setPopup] = useState<'checkins' | 'users' | 'addplace' | null>(null)
  const [recalcUserEmail, setRecalcUserEmail] = useState<string | null>(null)
  const [recalcUserMessage, setRecalcUserMessage] = useState<Record<string, string>>({})
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState<string | null>(null)
  const [deletingUserEmail, setDeletingUserEmail] = useState<string | null>(null)
  const [deleteUserMessage, setDeleteUserMessage] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!allowed) return
    Promise.all([getPlaces(), getAllCheckIns(), getUserCount()]).then(async ([places, checkIns, users]) => {
      const recentItems = await Promise.all(
        checkIns.slice(0, 10).map(async (ci) => ({ ...ci, place: await getPlace(ci.place_id) })),
      )
      setStats({ places: places.length, checkIns: checkIns.length, categories: getCategories().length, users })
      setRecent(recentItems)
      setLoading(false)
    })
  }, [allowed])

  async function loadUsers() {
    try {
      const { supabase } = await import('../lib/supabase')
      const { data, error } = await supabase.from('users').select('email, name, points, coins, created_at').order('created_at', { ascending: false })
      if (!error && data) setUsers(data as UserRow[])
    } catch {}
  }

  async function handleRecalculateUser(user: UserRow) {
    setRecalcUserEmail(user.email)
    setRecalcUserMessage((prev) => ({ ...prev, [user.email]: '' }))
    const res = await recalculateStats(user.email)
    setRecalcUserEmail(null)

    if (!res.ok) {
      setRecalcUserMessage((prev) => ({ ...prev, [user.email]: res.error || t('admin.recalc_failed', lang) }))
      return
    }

    const result = res.results?.[0] as { points?: number; coins?: number; error?: string } | undefined
    if (result?.error) {
      setRecalcUserMessage((prev) => ({ ...prev, [user.email]: result.error || t('admin.recalc_failed', lang) }))
      return
    }

    setUsers((prev) => prev.map((u) => (
      u.email === user.email
        ? { ...u, points: result?.points ?? u.points, coins: result?.coins ?? u.coins }
        : u
    )))
    setRecalcUserMessage((prev) => ({
      ...prev,
      [user.email]: t('admin.recalculated_user', lang).replace('{points}', String(result?.points ?? user.points)),
    }))
  }

  async function handleDeleteUser(user: UserRow) {
    if (user.email.trim().toLowerCase() === currentUserEmail) return
    if (deleteConfirmEmail !== user.email) {
      setDeleteConfirmEmail(user.email)
      setDeleteUserMessage((prev) => ({ ...prev, [user.email]: t('admin.delete_user_confirm', lang) }))
      return
    }

    setDeletingUserEmail(user.email)
    const res = await deleteUser(user.email, user.name)
    setDeletingUserEmail(null)

    if (!res.ok) {
      setDeleteUserMessage((prev) => ({ ...prev, [user.email]: res.error || t('admin.delete_user_failed', lang) }))
      return
    }

    setUsers((prev) => prev.filter((u) => u.email !== user.email))
    setStats((prev) => ({ ...prev, users: Math.max(0, prev.users - 1) }))
    setDeleteConfirmEmail(null)
  }

  if (!allowed) {
    return (
      <div className="flex flex-col h-full px-4 pt-6">
        <div className="mb-4 flex items-center justify-center">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="absolute left-4 rounded-full p-2 text-white transition-colors hover:bg-white/10"
          >
            ←
          </button>
          <h1 className="text-2xl font-bold dark:text-white">{t('admin.title', lang)}</h1>
        </div>
        <div className="mt-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <p className="font-semibold dark:text-white">{t('admin.access_denied', lang)}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('admin.email_mismatch', lang)}</p>
          <Link to="/help" className="inline-block mt-4 text-blue-600 dark:text-blue-400 text-sm font-medium">{t('admin.back_to_help', lang)}</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="relative px-4 pt-6 pb-4 text-center">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute left-4 top-6 rounded-full p-2 text-white transition-colors hover:bg-white/10"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold dark:text-white">{t('admin.title', lang)}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('admin.description', lang)}</p>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {([
                [t('admin.users', lang), stats.users, 'users'],
                [t('admin.places', lang), stats.places, null],
                [t('admin.checkins', lang), stats.checkIns, 'checkins'],
                [t('admin.categories', lang), stats.categories, null],
              ] as [string, number, string | null][]).map(([label, value, popupKey]) => (
                popupKey ? (
                  <button key={label} onClick={() => { setPopup(popupKey as 'checkins' | 'users'); if (popupKey === 'users') loadUsers() }} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors w-full">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{value}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                  </button>
                ) : (
                  <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{value}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
                  </div>
                )
              ))}
            </div>

            {/* Check-ins popup */}
            {popup === 'checkins' && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                onClick={() => setPopup(null)}
              >
                <div
                  className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold dark:text-white">{t('admin.checkins_count', lang).replace('{count}', String(stats.checkIns))}</h2>
                    <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                  </div>
                  <div className="space-y-2">
                    {recent.map((ci) => (
                      <Link key={ci.id} to={`/places/${ci.place_id}`} onClick={() => setPopup(null)} className="block bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                        <div className="font-medium text-sm dark:text-white">{ci.user_name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{ci.place?.name || t('admin.unknown_place', lang)}</div>
                        <div className="text-xs text-gray-400 mt-1">{new Date(ci.created_at).toLocaleString()}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Users popup */}
            {popup === 'users' && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                onClick={() => setPopup(null)}
              >
                <div
                  className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-sm max-h-[80vh] overflow-y-auto shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold dark:text-white">{t('admin.users_count', lang).replace('{count}', String(users.length))}</h2>
                    <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                  </div>
                  <div className="space-y-2">
                    {users.map((u) => (
                      <div key={u.email} className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm dark:text-white">{u.name}</div>
                            <div className="text-xs text-gray-400">{u.email}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold dark:text-white">{u.points ?? 0} pts</div>
                            <div className="text-xs text-yellow-600 dark:text-yellow-400">{u.coins ?? 0} coins</div>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">Joined {new Date(u.created_at).toLocaleDateString()}</div>
                        <button
                          onClick={() => handleRecalculateUser(u)}
                          disabled={recalcUserEmail === u.email}
                          className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700"
                        >
                          {recalcUserEmail === u.email ? t('admin.recalculating', lang) : t('admin.recalculate_user', lang)}
                        </button>
                        {recalcUserMessage[u.email] && (
                          <div className={`mt-2 text-xs ${recalcUserMessage[u.email].includes('failed') || recalcUserMessage[u.email].includes('mislyktes') ? 'text-red-500' : 'text-green-600 dark:text-green-400'}`}>
                            {recalcUserMessage[u.email]}
                          </div>
                        )}
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={deletingUserEmail === u.email || u.email.trim().toLowerCase() === currentUserEmail}
                          className="mt-2 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700"
                        >
                          {deletingUserEmail === u.email
                            ? t('admin.deleting_user', lang)
                            : deleteConfirmEmail === u.email
                              ? t('admin.delete_user_confirm_button', lang)
                              : u.email.trim().toLowerCase() === currentUserEmail
                                ? t('admin.delete_self_disabled', lang)
                                : t('admin.delete_user', lang)}
                        </button>
                        {deleteUserMessage[u.email] && (
                          <div className="mt-2 text-xs text-red-500">
                            {deleteUserMessage[u.email]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-8 space-y-6">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-3 dark:text-white">{t('admin.checkin_settings', lang)}</h3>
                <label className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">{t('admin.max_distance', lang).replace('{dist}', String(maxDist))}</span>
                  <input
                    type="range"
                    min={20}
                    max={1000}
                    step={10}
                    value={maxDist}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setMaxDist(v)
                      setMaxCheckInDistance(v)
                    }}
                    className="flex-1"
                  />
                </label>
                <p className="text-xs text-gray-400 mt-2">{t('admin.max_distance_desc', lang)}</p>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-3 dark:text-white">{t('admin.feature_toggles', lang)}</h3>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('admin.party_feature', lang)}</span>
                  <button
                    onClick={async () => {
                      setSyncError('')
                      const next = !partyEnabled
                      setPartyEnabledState(next)
                      setPartyEnabled(next)
                      const result = await syncConfig()
                      if (result !== true) {
                        setSyncError(result)
                        setPartyEnabledState(!next)
                        setPartyEnabled(!next)
                      }
                    }}
                    className={`w-12 h-6 rounded-full transition-colors flex items-center px-[2px] ${
                      partyEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                  >
                    <span
                      className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        partyEnabled ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </label>
                {syncError && <p className="text-xs text-red-500 mt-2">{syncError}</p>}
                <p className="text-xs text-gray-400 mt-2">{t('admin.party_feature_desc', lang)}</p>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h3 className="font-semibold mb-3 dark:text-white">{t('admin.recalculate_stats', lang)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {t('admin.recalculate_desc', lang)}
                </p>
                <button
                  onClick={async () => {
                    setRecalcState('running')
                    setRecalcMessage('')
                    const res = await recalculateStats()
                    if (res.ok) {
                      setRecalcState('done')
                      setRecalcMessage(t('admin.updated_users', lang).replace('{count}', String(res.results?.length || 0)))
                    } else {
                      setRecalcState('error')
                      setRecalcMessage(res.error || t('admin.recalc_failed', lang))
                    }
                  }}
                  disabled={recalcState === 'running'}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 rounded-xl font-medium text-sm transition-colors"
                >
                  {recalcState === 'running' ? t('admin.recalculating', lang) : t('admin.recalculate_btn', lang)}
                </button>
                {recalcMessage && (
                  <div className={`mt-2 text-sm ${recalcState === 'done' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {recalcMessage}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 p-4">
                <h3 className="font-semibold mb-3 dark:text-white text-red-600 dark:text-red-400">{t('admin.reset_app', lang)}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  {resetState === 'done' ? t('admin.reset_complete', lang) : resetState === 'confirm' ? t('admin.reset_confirm', lang) : t('admin.reset_desc', lang)}
                </p>
                {resetState === 'confirm' && (
                  <div className="space-y-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fullReset}
                        onChange={(e) => setFullReset(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">{t('admin.reset_full_label', lang)}</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setResetState('running')
                          setResetMessage('')
                          const res = await resetApp(fullReset)
                          if (res.ok) {
                            setResetState('done')
                            setResetMessage(fullReset ? t('admin.reset_complete', lang) : t('admin.reset_partial', lang))
                          } else {
                            setResetState('error')
                            setResetMessage(res.error || t('admin.reset_failed', lang))
                          }
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-sm transition-colors"
                      >
                        {t('admin.confirm_reset', lang)}
                      </button>
                      <button
                        onClick={() => { setResetState('idle'); setFullReset(false) }}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium text-sm transition-colors"
                      >
                        {t('admin.cancel', lang)}
                      </button>
                    </div>
                  </div>
                )}
                {resetState !== 'done' && resetState !== 'running' && resetState !== 'confirm' && (
                  <button
                    onClick={() => setResetState('confirm')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium text-sm transition-colors"
                  >
                    {resetState === 'error' ? t('admin.retry', lang) : t('admin.reset_app', lang)}
                  </button>
                )}
                {resetMessage && (
                  <div className={`mt-2 text-sm ${resetState === 'done' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {resetMessage}
                  </div>
                )}
              </div>

              <AdminImportMap />

              <button onClick={() => setPopup('addplace')} className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium text-sm transition-colors">
                {t('admin.add_place', lang)}
              </button>
            </div>

            {/* Add Place Manually popup */}
            {popup === 'addplace' && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                onClick={() => setPopup(null)}
              >
                <div
                  className="bg-white dark:bg-gray-900 rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold dark:text-white">{t('admin.add_place', lang)}</h2>
                    <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">&times;</button>
                  </div>
                  <AdminAddPlace />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
