import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

const THRESHOLD = 90

export default function PullToRefresh() {
  const { lang } = useLanguage()
  const location = useLocation()
  const [state, setState] = useState<'idle' | 'pulling' | 'ready'>('idle')
  const [progress, setProgress] = useState(0)
  const startY = useRef(0)

  // Disable pull-to-refresh on the Home/check-in page
  const isHomeOrCheckInPage = location.pathname === '/' || location.pathname === '/check-in'

  useEffect(() => {
    if (isHomeOrCheckInPage) {
      setState('idle')
      setProgress(0)
      return
    }

    const shell = document.querySelector('.app-shell') as HTMLElement | null
    if (!shell) return

    function scrollTop(): number {
      return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
    }

    function onTouchStart(e: TouchEvent) {
      if (scrollTop() > 0) return
      startY.current = e.touches[0].clientY
      setState('idle')
      setProgress(0)
    }

    function onTouchMove(e: TouchEvent) {
      if (scrollTop() > 0) return
      const d = e.touches[0].clientY - startY.current
      if (d <= 0) { setState('idle'); setProgress(0); return }
      setProgress(Math.min(d, 100))
      setState(d >= THRESHOLD ? 'ready' : 'pulling')
    }

    function onTouchEnd() {
      if (state === 'ready') window.location.reload()
      setState('idle')
      setProgress(0)
    }

    shell.addEventListener('touchstart', onTouchStart, { passive: true })
    shell.addEventListener('touchmove', onTouchMove, { passive: true })
    shell.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      shell.removeEventListener('touchstart', onTouchStart)
      shell.removeEventListener('touchmove', onTouchMove)
      shell.removeEventListener('touchend', onTouchEnd)
    }
  }, [isHomeOrCheckInPage, state])

  if (isHomeOrCheckInPage || state === 'idle') return null

  return (
    <div className="fixed left-0 right-0 top-0 z-50 flex items-center justify-center pointer-events-none" style={{ height: Math.min(progress, 80) }}>
      <span className={`text-sm font-semibold transition-colors ${state === 'ready' ? 'text-emerald-500' : 'text-gray-400'}`}>
        {state === 'ready' ? t('pull_to_refresh.release', lang) : t('pull_to_refresh.pull', lang)}
      </span>
    </div>
  )
}
