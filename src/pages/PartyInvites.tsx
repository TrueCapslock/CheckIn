import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import type { Party } from '../lib/types'
import { getParties, respondToInvitation } from '../lib/party'
import { usePartyEnabled } from '../lib/admin'

export default function PartyInvites() {
  const navigate = useNavigate()
  const partyEnabled = usePartyEnabled()
  const { lang } = useLanguage()

  useEffect(() => {
    if (!partyEnabled) navigate('/profile', { replace: true })
  }, [partyEnabled, navigate])

  const [invites, setInvites] = useState<Party[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const { invited } = await getParties()
    const pending = invited.filter((p) => {
      const mStatus = (p as unknown as Record<string, unknown>).member_status
      return mStatus === 'invited'
    })
    setInvites(pending)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleRespond = async (partyId: string, accept: boolean) => {
    const ok = await respondToInvitation(partyId, accept)
    if (ok) load()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center text-lg">&larr;</button>
        <h1 className="text-2xl font-bold dark:text-white">{t('party_invites.title', lang)}</h1>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-400">{t('party_invites.empty', lang)}</p>
          </div>
        ) : (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {invites.map((party) => (
              <div
                key={party.id}
                className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Link to={`/party/${party.id}`} className="font-semibold dark:text-white hover:text-blue-600">
                      {party.name}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">by {party.created_by}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    party.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                    {party.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  {new Date(party.starts_at).toLocaleString()} — {new Date(party.ends_at).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond(party.id, true)}
                    className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:scale-95"
                  >
                    {t('party_invites.accept', lang)}
                  </button>
                  <button
                    onClick={() => handleRespond(party.id, false)}
                    className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium active:scale-95"
                  >
                    {t('party_invites.decline', lang)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
