import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { getUser } from './lib/user'
import { loadUserProfileFromDb, clearAllAppData } from './lib/user-registry'
import { loadFollowsFromDb } from './lib/follow'
import { loadConfigFromDb } from './lib/admin'
import { loadStreaksFromDb } from './lib/achievements'
import { processQueue, processRatingsQueue, isOnline } from './lib/sync'
import { loadCategories } from './lib/categories'
import { useDarkMode } from './lib/use-dark-mode'
import { DarkModeContext } from './lib/dark-mode-context'
import { LanguageProvider, useLanguage } from './lib/language-context'
import { t } from './lib/i18n'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import UsernamePrompt from './components/UsernamePrompt'
import Home from './pages/Home'
import Friends from './pages/Friends'
import Places from './pages/Places'
import PlaceDetail from './pages/PlaceDetail'
import History from './pages/History'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import Help from './pages/Help'
import HelpPoints from './pages/HelpPoints'
import About from './pages/About'
import Admin from './pages/Admin'
import UserProfile from './pages/UserProfile'
import Feed from './pages/Feed'
import PartyCreate from './pages/PartyCreate'
import PartyDetail from './pages/PartyDetail'
import PartyInvites from './pages/PartyInvites'

function SyncQueue() {
  const sync = useCallback(async () => {
    if (!isOnline()) return
    const { ok } = await processQueue()
    if (ok > 0) console.log(`Synced ${ok} queued check-ins`)
    const { ok: okRatings } = await processRatingsQueue()
    if (okRatings > 0) console.log(`Synced ${okRatings} queued ratings`)
  }, [])

  useEffect(() => {
    sync()
    window.addEventListener('online', sync)
    const interval = setInterval(sync, 30000)
    return () => {
      window.removeEventListener('online', sync)
      clearInterval(interval)
    }
  }, [sync])

  return null
}

function SplashScreen() {
  const { lang } = useLanguage()
  const handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    }
    window.location.reload()
  }

  return (
    <div className="ci-splash fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-8">
      <div className="ci-splash-cloud ci-splash-cloud-left" />
      <div className="ci-splash-cloud ci-splash-cloud-right" />
      <div className="ci-splash-sun" />
      <div className="ci-splash-city" aria-hidden="true">
        <span className="ci-building ci-building-store" />
        <span className="ci-building ci-building-small" />
        <span className="ci-building ci-building-tower" />
        <span className="ci-building ci-building-wide" />
        <span className="ci-splash-table" />
        <span className="ci-splash-chair" />
        <span className="ci-splash-plant" />
      </div>
      <div className="relative z-10 flex -translate-y-16 flex-col items-center text-center">
        <img src="/icon-512.png" alt="" className="ci-splash-icon mb-7" />
        <h1 className="text-6xl font-black tracking-tight text-[var(--ci-text)] drop-shadow-sm">{t('splash.title', lang)}</h1>
        <p className="mt-3 text-xl font-semibold text-[var(--ci-mint)]">{t('splash.tagline', lang)}</p>
      </div>
      <button
        onClick={handleReload}
        className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--ci-border)] bg-white/45 px-4 py-2 text-xs font-semibold text-[var(--ci-muted)] shadow-sm backdrop-blur transition-colors hover:text-[var(--ci-text)] dark:bg-emerald-950/35"
      >
        {t('splash.reload', lang)}
      </button>
    </div>
  )
}

export default function App() {
  const [hasUser, setHasUser] = useState(!!getUser())
  const [showSplash, setShowSplash] = useState(true)
  const darkMode = useDarkMode()

  useEffect(() => {
    loadCategories()
    loadUserProfileFromDb().then((status) => {
      if (status === 'not_found') {
        clearAllAppData()
        setHasUser(false)
      }
    })
    if (getUser()) loadFollowsFromDb()
    loadStreaksFromDb()

    // Refresh config on mount, when tab becomes visible, and every 30s
    loadConfigFromDb()
    const onVisibility = () => { if (document.visibilityState === 'visible') loadConfigFromDb() }
    document.addEventListener('visibilitychange', onVisibility)
    const interval = setInterval(loadConfigFromDb, 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (hasUser) {
      loadFollowsFromDb().then(() => {
        window.dispatchEvent(new CustomEvent('checkin:following-updated'))
      })
    }
  }, [hasUser])

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1500)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <DarkModeContext.Provider value={darkMode}>
    <LanguageProvider>
    <ErrorBoundary>
      <SyncQueue />
      {showSplash && <SplashScreen />}
      {!hasUser && <UsernamePrompt onDone={() => setHasUser(true)} />}
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/check-in" element={<Home />} />
            <Route path="/places" element={<Places />} />
            <Route path="/places/:id" element={<PlaceDetail />} />
            <Route path="/history" element={<History />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
            <Route path="/help/points" element={<HelpPoints />} />
            <Route path="/about" element={<About />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/user/:name" element={<UserProfile />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/party/create" element={<PartyCreate />} />
            <Route path="/party/invites" element={<PartyInvites />} />
            <Route path="/party/:id" element={<PartyDetail />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
    </LanguageProvider>
    </DarkModeContext.Provider>
  )
}
