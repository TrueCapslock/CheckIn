import packageJson from '../../package.json'
import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

export default function About() {
  const navigate = useNavigate()
  const { lang } = useLanguage()

  return (
    <div className="flex h-full flex-col">
      <div className="relative px-4 pt-6 pb-4 text-center">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute left-4 top-6 rounded-full p-2 text-[var(--ci-text)] transition-colors hover:bg-[var(--ci-hover-bg)]"
        >
          ←
        </button>
        <h1 className="text-2xl font-bold dark:text-white">{t('about.title', lang)}</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-20">
        <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-5 text-center shadow-sm">
          <img src="/icon-512.png" alt="" className="mx-auto mb-4 h-20 w-20 rounded-3xl shadow-lg" />
          <h2 className="text-2xl font-black tracking-tight text-[var(--ci-text)]">{t('splash.title', lang)}</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--ci-mint)]">{t('home.checkin_earn_explore', lang)}</p>
        </div>

        <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-4">
          <h2 className="mb-2 font-semibold text-[var(--ci-text)]">{t('about.what_it_does', lang)}</h2>
          <p className="text-sm leading-relaxed text-[var(--ci-muted)]">
            {t('about.description', lang)}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--ci-border)] bg-[var(--ci-panel)] p-4">
          <h2 className="mb-2 font-semibold text-[var(--ci-text)]">{t('about.version', lang)}</h2>
          <p className="text-sm text-[var(--ci-muted)]">{packageJson.version}</p>
        </div>
      </div>
    </div>
  )
}
