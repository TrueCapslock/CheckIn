import { Outlet, NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getPendingInviteCount } from '../lib/party'
import { usePartyEnabled } from '../lib/admin'
import { useLanguage } from '../lib/language-context'
import { t } from '../lib/i18n'
import PullToRefresh from './PullToRefresh'

type TabIcon = 'friends' | 'explore' | 'check' | 'activity' | 'profile'

const tabs = [
  { to: '/friends', label: 'nav.friends', icon: 'friends' },
  { to: '/places', label: 'nav.places', icon: 'explore' },
  { to: '/', label: 'nav.check_in', icon: 'check', center: true },
  { to: '/feed', label: 'nav.feed', icon: 'activity' },
  { to: '/profile', label: 'nav.profile', icon: 'profile' },
]

function NavIcon({ icon }: { icon: TabIcon }) {
  if (icon === 'check') {
    return (
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
        <path
          d="M24 4c-8.6 0-15.5 6.7-15.5 15 0 10.6 12.3 23.4 14.3 25.4.7.7 1.7.7 2.4 0 2-2 14.3-14.8 14.3-25.4C39.5 10.7 32.6 4 24 4Zm0 23.5a8.5 8.5 0 1 1 0-17 8.5 8.5 0 0 1 0 17Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path
          d="M20.5 16.5 24.5 21.5l9.5-10"
          fill="none"
          stroke="white"
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  const common = {
    className: 'h-5 w-5',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }

  switch (icon) {
    case 'friends':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="8.5" cy="7.5" r="3" />
          <path d="M3.5 19.5c.5-3 2.2-4.5 5-4.5s4.5 1.5 5 4.5" />
          <circle cx="16" cy="8" r="2.8" />
          <path d="M12.5 19.5c.5-2.5 1.8-3.8 4.2-3.8s3.7 1.3 4.2 3.8" />
        </svg>
      )
    case 'explore':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
          <path d="M11 7.7v6.6M7.7 11h6.6" />
        </svg>
      )
    case 'activity':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M5 19V9" />
          <path d="M12 19V5" />
          <path d="M19 19v-7" />
          <path d="M4 19h16" />
        </svg>
      )
    case 'profile':
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5.2 20c.8-3.4 3.2-5.1 6.8-5.1s6 1.7 6.8 5.1" />
        </svg>
      )
  }
}

export default function Layout() {
  const [inviteCount, setInviteCount] = useState(0)
  const partyEnabled = usePartyEnabled()
  const { lang } = useLanguage()

  useEffect(() => {
    setInviteCount(getPendingInviteCount())
    const interval = setInterval(() => setInviteCount(getPendingInviteCount()), 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app-shell max-w-lg mx-auto min-h-svh flex flex-col overflow-hidden sm:my-5 sm:min-h-[calc(100svh-2.5rem)] sm:rounded-[2rem]">
      <PullToRefresh />
      <main className="app-content flex min-h-0 flex-1 flex-col overflow-hidden pb-[4.5rem]">
        <Outlet />
      </main>

      <nav className="app-bottom-nav fixed bottom-0 left-1/2 z-30 flex w-full -translate-x-1/2 border-t px-3 pb-1 pt-1">
        {tabs.map((tab) => (
          <NavLink
            key={tab.label}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              `app-nav-item ${tab.center ? 'app-nav-center' : ''} flex-1 py-0.5 text-center text-[10px] font-semibold transition-all ${
                isActive ? 'app-nav-item-active' : ''
              }`
            }
          >
            <div className="app-nav-icon relative flex items-center justify-center leading-none">
              {tab.label === 'nav.profile' && inviteCount > 0 && partyEnabled && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-1 z-10">
                  {inviteCount}
                </span>
              )}
              <NavIcon icon={tab.icon as TabIcon} />
            </div>
            {t(tab.label, lang)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
