import { Component, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { LanguageContext } from '../lib/language-context'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false }
  static contextType = LanguageContext
  declare context: React.ContextType<typeof LanguageContext>

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // Clears PWA / Service Worker caches and unregisters SWs before reloading,
  // so a stale cached bundle (with a removed export or stale ref) can't
  // re-throw immediately and trap the user in a retry loop. Mirrors the
  // cache-busting pattern in App.tsx SplashScreen.handleReload.
  handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
    }
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      const lang = this.context.lang
      return (
        <div className="flex flex-col items-center justify-center min-h-svh p-4 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold mb-1">{t('error_boundary.title', lang)}</h1>
          <p className="text-gray-500 text-sm mb-4">{t('error_boundary.message', lang)}</p>
          <button
            onClick={this.handleReload}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium"
          >
            {t('error_boundary.reload', lang)}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
