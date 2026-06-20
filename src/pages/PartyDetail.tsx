import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'
import type { Party, PartyMember } from '../lib/types'
import { getParties, getPartyMembers, getPartyLeaderboard, endParty, leaveParty, respondToInvitation, inviteToParty } from '../lib/party'
import type { PartyLeaderboardEntry } from '../lib/party'
import { getUsername } from '../lib/user'
import { getFollowing } from '../lib/follow'
import { checkPartyAchievements } from '../lib/achievements'
import { usePartyEnabled } from '../lib/admin'

export default function PartyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const userName = getUsername()
  const { lang } = useLanguage()

  const [party, setParty] = useState<Party | null>(null)
  const [members, setMembers] = useState<PartyMember[]>([])
  const [leaderboard, setLeaderboard] = useState<PartyLeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteNames, setInviteNames] = useState<string[]>([])

  const partyEnabled = usePartyEnabled()

  useEffect(() => {
    if (!partyEnabled) navigate('/profile', { replace: true })
  }, [partyEnabled, navigate])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { created, invited } = await getParties()
    const found = [...created, ...invited].find((p) => p.id === id)
    if (!found) { setError(t('party_detail.not_found', lang)); setLoading(false); return }
    setParty(found)

    const [mems, lb] = await Promise.all([
      getPartyMembers(id),
      getPartyLeaderboard(id),
    ])
    setMembers(mems)
    setLeaderboard(lb)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const isCreator = party?.created_by === userName
  const isActive = party?.status === 'active'
  const now = new Date()
  const startTime = party ? new Date(party.starts_at) : null
  const endTime = party ? new Date(party.ends_at) : null
  const hasStarted = startTime && now >= startTime
  const hasEnded = endTime && now >= endTime

  const myMemberStatus = members.find((m) => m.user_name === userName)?.status

  const handleRespond = async (accept: boolean) => {
    if (!id) return
    const ok = await respondToInvitation(id, accept)
    if (ok) {
      if (accept && party) {
        await checkPartyAchievements(id, party.created_by, userName || '')
      }
      load()
    }
  }

  const handleEndParty = async () => {
    if (!id) return
    const ok = await endParty(id)
    if (ok) load()
  }

  const handleLeave = async () => {
    if (!id) return
    await leaveParty(id)
    navigate('/profile')
  }

  const toggleInvite = (name: string) => {
    setInviteNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )
  }

  const handleInvite = async () => {
    if (!id || inviteNames.length === 0) return
    const ok = await inviteToParty(id, inviteNames)
    if (ok) {
      setInviteNames([])
      setShowInvite(false)
      load()
    }
  }

  if (loading) {
    return (
      <div className="px-4 pt-6 space-y-4">
        <div className="h-8 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-4 w-32 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (error || !party) {
    return (
      <div className="p-4 pt-6">
        <p className="text-gray-500 dark:text-gray-400">{error || t('party_detail.not_found', lang)}</p>
        <Link to="/profile" className="text-blue-600 dark:text-blue-400 text-sm mt-2 inline-block">{t('party_detail.back_to_profile', lang)}</Link>
      </div>
    )
  }

  const acceptedMembers = members.filter((m) => m.status === 'accepted')
  const invitedMembers = members.filter((m) => m.status === 'invited')

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-6 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center text-lg">&larr;</button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold dark:text-white truncate">{party.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isActive ? (
              <span className="text-green-600 dark:text-green-400 font-medium">{t('party_detail.active', lang)}</span>
            ) : (
              <span className="text-gray-400">{t('party_detail.ended', lang)}</span>
            )}
            {' · '}by {party.created_by}
          </p>
        </div>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto space-y-4">
        {!hasStarted && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
            {t('party_detail.party_starts', lang)} {startTime?.toLocaleString()}
          </div>
        )}

        {hasEnded && isActive && (
          <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
            {t('party_detail.past_end', lang)}
          </div>
        )}

        {myMemberStatus === 'invited' && isActive && (
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-center">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">{t('party_detail.youre_invited', lang)}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => handleRespond(true)}
                className="px-6 py-2 bg-green-600 text-white rounded-xl text-sm font-medium active:scale-95"
              >
                {t('party_detail.accept', lang)}
              </button>
              <button
                onClick={() => handleRespond(false)}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium active:scale-95"
              >
                {t('party_detail.decline', lang)}
              </button>
            </div>
          </div>
        )}

        {/* Time info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400">{t('party_detail.starts', lang)}</p>
            <p className="text-sm font-medium dark:text-white">{startTime?.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-400">{t('party_detail.ends', lang)}</p>
            <p className="text-sm font-medium dark:text-white">{endTime?.toLocaleString()}</p>
          </div>
        </div>

        {/* Members */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="font-semibold text-sm dark:text-white">
              {t('party_detail.participants', lang).replace('{count}', String(acceptedMembers.length))}
            </h2>
            {isCreator && isActive && (
              <button
                onClick={() => setShowInvite(!showInvite)}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium"
              >
                {t('party_detail.invite', lang)}
              </button>
            )}
          </div>
          {showInvite && (
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
              {getFollowing().filter((n) => !members.some((m) => m.user_name === n)).length === 0 ? (
                <p className="text-xs text-gray-400">{t('party_detail.no_more_to_invite', lang)}</p>
              ) : (
                <>
                  {getFollowing().filter((n) => !members.some((m) => m.user_name === n)).map((name) => (
                    <button
                      key={name}
                      onClick={() => toggleInvite(name)}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm ${
                        inviteNames.includes(name)
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                        inviteNames.includes(name)
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-gray-400'
                      }`}>
                        {inviteNames.includes(name) ? '✓' : ''}
                      </div>
                      {name}
                    </button>
                  ))}
                  <button
                    onClick={handleInvite}
                    disabled={inviteNames.length === 0}
                    className="mt-2 w-full py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-40"
                  >
                    {t('party_detail.send_invites', lang)}
                  </button>
                </>
              )}
            </div>
          )}
          {acceptedMembers.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {acceptedMembers.map((m) => (
                <Link
                  key={m.user_name}
                  to={`/user/${encodeURIComponent(m.user_name)}`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 dark:text-blue-300">
                    {m.user_name[0].toUpperCase()}
                  </div>
                  <span className="dark:text-white">{m.user_name}</span>
                  {m.user_name === party.created_by && (
                    <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-auto">{t('party_detail.host', lang)}</span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">{t('party_detail.no_one_joined', lang)}</div>
          )}
          {invitedMembers.length > 0 && (
            <>
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs text-gray-400 font-medium">{t('party_detail.invited_label', lang)}</p>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {invitedMembers.map((m) => (
                  <div key={m.user_name} className="flex items-center gap-3 px-4 py-2 text-sm">
                    <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center text-xs font-bold text-gray-400">
                      {m.user_name[0].toUpperCase()}
                    </div>
                    <span className="text-gray-500">{m.user_name}</span>
                    <span className="text-xs text-gray-400 ml-auto">{t('party_detail.invited_label', lang)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Leaderboard */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h2 className="font-semibold text-sm dark:text-white">Leaderboard</h2>
          </div>
          {leaderboard.length > 0 ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {leaderboard.map((entry, i) => (
                <div key={entry.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300' :
                    i === 1 ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' :
                    i === 2 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                    'bg-gray-50 dark:bg-gray-800/50 text-gray-400'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 dark:text-white">{entry.name}</span>
                  <div className="text-right">
                    <span className="font-semibold dark:text-white">{entry.score}</span>
                    <span className="text-xs text-gray-400 ml-1">{t('party_detail.checkins_count', lang).replace('{count}', String(entry.checkIns))}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              {t('party_detail.no_checkins_yet', lang)}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {isCreator && isActive && (
            <button
              onClick={handleEndParty}
              className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium active:scale-95"
            >
              {t('party_detail.end_party', lang)}
            </button>
          )}
          {!isCreator && isActive && myMemberStatus === 'accepted' && (
            <button
              onClick={handleLeave}
              className="flex-1 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium active:scale-95"
            >
              {t('party_detail.leave_party', lang)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
