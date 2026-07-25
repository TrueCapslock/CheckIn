// src/components/UpdateBanner.tsx
//
// Bottom banner that surfaces "new version available" and "ready for offline"
// from the PWA Service Worker. Sits above the bottom tab nav (5rem from
// viewport bottom) so it doesn't fight the existing chrome.

import { useEffect, useState } from 'react'
import {
  applyUpdate,
  dismissForNow,
  onUpdateState,
  checkForUpdate,
  type UpdateState,
} from '../lib/update'
import { useLanguage } from '../lib/language-context'
import { t } from '../lib/i18n'

export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const { lang } = useLanguage()

  useEffect(() => {
    const unsub = onUpdateState(setState)
    return unsub
  }, [])

  // Re-check whenever the tab becomes visible again, so a user who
  // backgrounds the app sees the banner the moment they come back.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [])

  if (state.status === 'idle') return null

  const isAvailable = state.status === 'available'

  return (
    <div
      role="status"
      aria-live="polite"
      className="ci-update-banner fixed inset-x-0 bottom-[5rem] z-40 mx-auto flex w-[min(28rem,calc(100%-1.5rem))] flex-col gap-3 rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 via-white to-emerald-50 px-4 py-3 shadow-[0_12px_28px_-12px_rgba(180,83,9,0.45)] backdrop-blur transition-all animate-[ci-banner-in_280ms_ease-out] sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md md:left-0 md:translate-x-0 md:max-w-full md:mx-3 dark:from-amber-950/70 dark:via-stone-900/85 dark:to-emerald-950/70 dark:border-amber-500/40 dark:shadow-[0_12px_28px_-12px_rgba(0,0,0,0.6)]"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/90 text-lg shadow-sm dark:bg-amber-500/80"
        >
          {isAvailable ? '🚀' : '📦'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold tracking-tight text-amber-900 dark:text-amber-100">
            {isAvailable
              ? t('update.available_title', lang)
              : t('update.offline_ready_title', lang)}
          </p>
          <p className="mt-0.5 text-xs font-medium text-amber-800/80 dark:text-amber-100/75">
            {isAvailable
              ? t('update.available_desc', lang)
              : t('update.offline_ready_desc', lang)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAvailable ? (
          <>
            <button
              type="button"
              onClick={() => void applyUpdate()}
              className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] dark:from-amber-400 dark:to-amber-500 dark:text-stone-900"
            >
              {t('update.reload', lang)}
            </button>
            <button
              type="button"
              onClick={() => dismissForNow()}
              className="rounded-full border border-amber-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-white/90 dark:border-amber-500/40 dark:bg-stone-800/60 dark:text-amber-100 dark:hover:bg-stone-800/90"
            >
              {t('update.later', lang)}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => dismissForNow()}
            className="flex-1 rounded-full border border-emerald-400/60 bg-white/60 px-4 py-2 text-sm font-semibold text-emerald-900 transition-colors hover:bg-white/90 dark:border-emerald-400/40 dark:bg-stone-800/60 dark:text-emerald-100"
          >
            {t('update.dismiss', lang)}
          </button>
        )}
      </div>

      <style>{`
        @keyframes ci-banner-in {
          from { opacity: 0; transform: translateY(0.75rem); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
