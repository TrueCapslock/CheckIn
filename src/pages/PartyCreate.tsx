import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import { createParty } from '../lib/party'
import { getAvailableFriends } from '../lib/party'
import { checkPartyAchievements } from '../lib/achievements'
import { getUsername } from '../lib/user'
import { usePartyEnabled } from '../lib/admin'

export default function PartyCreate() {
  const navigate = useNavigate()
  const partyEnabled = usePartyEnabled()
  const { lang } = useLanguage()

  useEffect(() => {
    if (!partyEnabled) navigate('/profile', { replace: true })
  }, [partyEnabled, navigate])

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 16))
  const [endDate, setEndDate] = useState(new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 16))
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const friends = getAvailableFriends()

  const toggleFriend = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )
  }

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('party_create.required_name', lang)); return }
    if (!startDate || !endDate) { setError(t('party_create.required_times', lang)); return }
    if (new Date(endDate) <= new Date(startDate)) { setError(t('party_create.end_after_start', lang)); return }
    setSaving(true)
    setError('')
    const result = await createParty(name.trim(), new Date(startDate).toISOString(), new Date(endDate).toISOString(), selected)
    setSaving(false)
    if (result.ok && result.party) {
      const userName = getUsername() || 'Anonymous'
      checkPartyAchievements(result.party.id, userName, userName)
      navigate(`/party/${result.party.id}`)
    } else {
      setError(result.error || t('party_create.failed', lang))
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center text-lg">&larr;</button>
        <h1 className="text-2xl font-bold dark:text-white">{t('party_create.title', lang)}</h1>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto space-y-5">
        {error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('party_create.party_name', lang)}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Friday Night Out"
            className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-base outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('party_create.start', lang)}</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1 block">{t('party_create.end', lang)}</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-100 dark:bg-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 block">
            {t('party_create.invite_friends', lang).replace('{count}', String(selected.length))}
          </label>
          {friends.length === 0 ? (
            <p className="text-sm text-gray-400 italic">{t('party_create.follow_first', lang)}</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {friends.map((name) => (
                <button
                  key={name}
                  onClick={() => toggleFriend(name)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    selected.includes(name)
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs ${
                    selected.includes(name)
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-gray-400 dark:border-gray-500'
                  }`}>
                    {selected.includes(name) ? '✓' : ''}
                  </div>
                  <span>{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full py-3.5 bg-blue-600 dark:bg-blue-500 text-white rounded-2xl font-bold text-base active:scale-95 transition-all shadow-lg shadow-blue-600/30 disabled:opacity-50"
        >
          {saving ? t('party_create.creating', lang) : t('party_create.title', lang)}
        </button>
      </div>
    </div>
  )
}
