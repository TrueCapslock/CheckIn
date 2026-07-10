import { Component, type ErrorInfo, type ReactNode } from 'react'
import { t } from '../lib/i18n'
import { LanguageContext } from '../lib/language-context'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
  showDetails: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    componentStack: null,
    showDetails: false,
  }
  static contextType = LanguageContext
  declare context: React.ContextType<typeof LanguageContext>

  static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Always log to console for DevTools / Sentry-style capture.
    console.error('[ErrorBoundary] Caught error:', error)
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack)
    this.setState({ componentStack: errorInfo.componentStack ?? null })
  }

  // Clears PWA / Service Worker caches and unregisters SWs before reloading, so a
  // stale cached bundle (with a removed export or stale ref) can't re-throw
  // immediately and trap the user in a retry loop. Mirrors the cache-busting
  // pattern in App.tsx SplashScreen.handleReload.
  handleReload = (): void => {
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
    }
    window.location.reload()
  }

  toggleDetails = (): void => {
    this.setState((s) => ({ showDetails: !s.showDetails }))
  }

  render() {
    if (this.state.hasError) {
      const lang = this.context.lang
      const { error, componentStack, showDetails } = this.state
      return (
        <div className="flex flex-col items-center justify-center min-h-svh p-4 text-center max-w-xl mx-auto">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold mb-1">{t('error_boundary.title', lang)}</h1>
          <p className="text-gray-500 text-sm mb-4">{t('error_boundary.message', lang)}</p>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={this.handleReload}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium"
            >
              {t('error_boundary.reload', lang)}
            </button>
            <button
              onClick={this.toggleDetails}
              className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium"
            >
              {showDetails
                ? t('error_boundary.hide_details', lang)
                : t('error_boundary.show_details', lang)}
            </button>
          </div>

          {showDetails && error && (
            <div
              className="mt-4 w-full text-left bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-3 overflow-auto max-h-[50vh] text-left"
              role="region"
              aria-live="polite"
            >
              <div className="font-mono text-xs">
                <div className="font-bold text-red-700 dark:text-red-300 mb-1 break-words">
                  {error.name}: {error.message}
                </div>
                {error.stack && (
                  <pre className="whitespace-pre-wrap text-[10px] text-gray-700 dark:text-gray-300 leading-snug">
                    {error.stack}
                  </pre>
                )}
                {componentStack && (
                  <details className="mt-3 border-t border-gray-300 dark:border-gray-700 pt-2">
                    <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-300">
                      Component stack
                    </summary>
                    <pre className="whitespace-pre-wrap text-[10px] text-gray-700 dark:text-gray-300 leading-snug mt-2">
                      {componentStack}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
