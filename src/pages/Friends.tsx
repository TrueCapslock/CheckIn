import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFollowing, followUser, unfollowUser, isFollowing, loadFollowsFromDb } from '../lib/follow'
import { getUser, getUsername, getAvatar, fetchAvatarUrl } from '../lib/user'
import { supabase } from '../lib/supabase'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface FriendLeaderboardEntry {
  email: string
  name: string
  points: number
}

function rankIcon(index: number): string {
  if (index === 0) return '🥇'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return `#${index + 1}`
}

export default function Friends() {
  const { lang } = useLanguage()
  const username = getUsername()
  const [following, setFollowing] = useState(getFollowing())
  const [friendSearch, setFriendSearch] = useState('')
  const [searchResults, setSearchResults] = useState<{ email: string; name: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({})
  const [leaderboard, setLeaderboard] = useState<FriendLeaderboardEntry[]>([])

  useEffect(() => {
    if (getUser()) {
      loadFollowsFromDb().then(() => setFollowing(getFollowing()))
    }
    const handler = () => setFollowing(getFollowing())
    window.addEventListener('checkin:following-updated', handler)
    return () => window.removeEventListener('checkin:following-updated', handler)
  }, [])

  useEffect(() => {
    if (friendSearch.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      const q = friendSearch.trim()
      const { data } = await supabase
        .from('users')
        .select('email, name')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(10)
      setSearchResults((data || []) as { email: string; name: string }[])
      setSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [friendSearch])

  useEffect(() => {
    if (!username && following.length === 0) {
      setLeaderboard([])
      return
    }
    const names = Array.from(new Set([...(username ? [username] : []), ...following]))
    supabase
      .from('users')
      .select('email, name, points')
      .in('name', names)
      .then(({ data }) => {
        const byName = new Map((data || []).map((u) => [u.name, u as FriendLeaderboardEntry]))
        const rows = names.map((name) => {
          const user = byName.get(name)
          return { email: user?.email || '', name, points: user?.points ?? 0 }
        })
        setLeaderboard(rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)))
      })
  }, [following, username])

  useEffect(() => {
    Promise.all(
      following.map(async (name) => {
        const url = getAvatar(name) || (await fetchAvatarUrl(name))
        return url ? [name, url] as const : null
      }),
    ).then((entries) => {
      const map: Record<string, string> = {}
      for (const entry of entries) {
        if (entry) map[entry[0]] = entry[1]
      }
      setAvatarUrls(map)
    })
  }, [following])

  const handleFollowFriend = async (name: string) => {
    await followUser(name)
    setFollowing(getFollowing())
    setSearchResults([])
    setFriendSearch('')
  }

  const handleUnfollow = async (name: string) => {
    await unfollowUser(name)
    setFollowing(getFollowing())
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-6 pb-4">
        <h1 className="text-2xl font-bold dark:text-white">{t('friends.title', lang)}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('friends.description', lang)}</p>

        <input
          type="text"
          placeholder={t('friends.search_placeholder', lang)}
          value={friendSearch}
          onChange={(e) => setFriendSearch(e.target.value)}
          className="mt-5 w-full rounded-xl border border-[var(--ci-border)] bg-[var(--ci-input-bg)] px-3 py-2.5 text-sm text-[var(--ci-text)] outline-none placeholder:text-[var(--ci-muted)] focus:border-emerald-300"
        />
        {searching && <p className="mt-2 text-xs text-[var(--ci-muted)]">{t('friends.searching', lang)}</p>}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
              {searchResults.map((u) => {
                const already = isFollowing(u.name)
                const isMe = u.name === username
                return (
                  <div key={u.email} className="flex items-center justify-between rounded-xl border border-[var(--ci-border)] bg-[var(--ci-panel)] px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--ci-text)] truncate">{u.name}</div>
                      <div className="text-xs text-[var(--ci-muted)] truncate">{u.email}</div>
                    </div>
                    {already ? (
                      <span className="text-xs font-semibold text-[var(--ci-muted)]">{t('friends.following_label', lang)}</span>
                    ) : isMe ? (
                      <span className="text-xs font-semibold text-[var(--ci-muted)]">{t('friends.you', lang)}</span>
                    ) : (
                      <button onClick={() => handleFollowFriend(u.name)} className="text-xs font-bold text-[var(--ci-mint)]">
                        {t('friends.follow', lang)}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {friendSearch.trim().length >= 2 && !searching && searchResults.length === 0 && (
            <p className="mt-2 text-xs text-[var(--ci-muted)]">{t('friends.no_users', lang)}</p>
          )}
        </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-24">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-[var(--ci-text)]">{t('friends.section_leaderboard', lang)}</h2>
          <span className="text-xs font-semibold text-[var(--ci-muted)]">{following.length}</span>
        </div>

        {following.length === 0 ? (
          <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-6 text-center">
            <div className="mb-3 text-4xl">👥</div>
            <p className="text-sm font-semibold text-[var(--ci-text)]">{t('friends.empty_title', lang)}</p>
            <p className="mt-1 text-sm text-[var(--ci-muted)]">{t('friends.empty_desc', lang)}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => {
              const avatar = avatarUrls[entry.name] || getAvatar(entry.name)
              return (
                <div key={entry.name} className="flex items-center gap-3 rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-3">
                  <div className="w-8 shrink-0 text-center text-lg font-black text-[var(--ci-muted)]">
                    {rankIcon(index)}
                  </div>
                  {avatar ? (
                    <img src={avatar} alt="" className="h-11 w-11 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/20 text-sm font-black text-[var(--ci-mint)]">
                      {entry.name[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <Link to={`/user/${encodeURIComponent(entry.name)}`} className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--ci-text)]">{entry.name}</div>
                    <div className="text-xs font-semibold text-[var(--ci-mint)]">{entry.points.toLocaleString()} {t('friends.lifetime_points', lang)}</div>
                  </Link>
                  {entry.name === username ? (
                    <span className="text-xs font-semibold text-[var(--ci-muted)]">{t('friends.you', lang)}</span>
                  ) : (
                    <button onClick={() => handleUnfollow(entry.name)} className="text-xs font-semibold text-red-500">
                      {t('friends.remove', lang)}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
