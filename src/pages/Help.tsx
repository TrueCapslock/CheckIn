import packageJson from '../../package.json'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

export default function Help() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const sections: { icon: string; title: string; body: string; link?: string }[] = [
    {
      icon: '📍',
      title: t('help.how_to_check_in', lang),
      body: t('help.how_to_check_in_body', lang),
    },
    {
      icon: '🪙',
      title: t('help.points_coins', lang),
      body: t('help.points_coins_body', lang),
      link: '/help/points',
    },
    {
      icon: '🎯',
      title: t('help.stickers', lang),
      body: t('help.stickers_body', lang),
    },
    {
      icon: '🏅',
      title: t('help.achievements', lang),
      body: t('help.achievements_body', lang),
    },
    {
      icon: '🏆',
      title: t('help.leaderboard', lang),
      body: t('help.leaderboard_body', lang),
    },
    {
      icon: '👑',
      title: t('help.mayor', lang),
      body: t('help.mayor_body', lang),
    },
    {
      icon: '👥',
      title: t('help.following', lang),
      body: t('help.following_body', lang),
    },
    {
      icon: '📷',
      title: t('help.profile_avatar', lang),
      body: t('help.profile_avatar_body', lang),
    },
    {
      icon: '📶',
      title: t('help.offline_mode', lang),
      body: t('help.offline_mode_body', lang),
    },
    {
      icon: '🔐',
      title: t('help.signing_in', lang),
      body: t('help.signing_in_body', lang),
    },
    {
      icon: '🔍',
      title: t('help.browsing_places', lang),
      body: t('help.browsing_places_body', lang),
    },
    {
      icon: '🗺️',
      title: t('help.place_details', lang),
      body: t('help.place_details_body', lang),
    },
    {
      icon: '📤',
      title: t('help.sharing_places', lang),
      body: t('help.sharing_places_body', lang),
    },
    {
      icon: '📊',
      title: t('help.home_feed', lang),
      body: t('help.home_feed_body', lang),
    },
    {
      icon: '📋',
      title: t('help.history', lang),
      body: t('help.history_body', lang),
    },
    {
      icon: '🌙',
      title: t('help.dark_mode', lang),
      body: t('help.dark_mode_body', lang),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="relative px-4 pt-6 pb-4 text-center">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute left-4 top-6 rounded-full p-2 text-[var(--ci-text)] transition-colors hover:bg-[var(--ci-hover-bg)]"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold dark:text-white">{t('help.title', lang)}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('help.description', lang)}</p>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto space-y-3">
        {sections.map((s) => (
          <div
            key={s.title}
            onClick={() => s.link && navigate(s.link)}
            className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${s.link ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{s.icon}</span>
              <h2 className="font-semibold dark:text-white">{s.title}</h2>
              {s.link && <span className="ml-auto text-xs text-emerald-400 font-medium">→</span>}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{s.body}</p>
          </div>
        ))}

        <button
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
            }
            window.location.reload()
          }}
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 pt-4 pb-2 transition-colors"
        >
          {t('help.version', lang).replace('{version}', packageJson.version)}
        </button>
      </div>
    </div>
  )
}
