import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

const BASE = 10
const FIRST_TIME = 2
const MAYOR = 5
const FRIEND = 3
const MAX_STREAK = 5
const STICKER_COSTS = [0, 100, 500, 1000, 2000]
const MULTIPLIERS = [1, 2, 3, 5, 8]

function row(label: string, pts: number | string, desc: string) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--ci-border)] last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ci-text)]">{label}</p>
        <p className="text-xs text-[var(--ci-muted)] mt-0.5">{desc}</p>
      </div>
      <span className="ml-4 shrink-0 text-sm font-bold text-emerald-400">
        {typeof pts === 'number' && pts > 0 ? '+' : ''}{pts}
      </span>
    </div>
  )
}

export default function HelpPoints() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const T = (key: string) => t(`help.points.${key}`, lang)
  const pts = (n: number) => String(n)

  const example = {
    base: BASE,
    first: FIRST_TIME,
    mayor: MAYOR,
    friend: FRIEND,
    streak: 3,
    mul: 3,
  }
  const exampleTotal = (example.base + example.first + example.mayor + example.friend + example.streak) * example.mul

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
        <h1 className="text-2xl font-bold dark:text-white">{T('title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{T('description')}</p>
      </div>

      <div className="flex-1 px-4 pb-20 overflow-y-auto space-y-4">
        {/* Breakdown */}
        <div className="rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] px-4">
          {row(T('base'), pts(BASE), T('base_desc').replace('{pts}', pts(BASE)))}
          {row(T('first_time'), pts(FIRST_TIME), T('first_time_desc').replace('{pts}', pts(FIRST_TIME)))}
          {row(T('mayor'), pts(MAYOR), T('mayor_desc').replace('{pts}', pts(MAYOR)))}
          {row(T('friend'), pts(FRIEND), T('friend_desc').replace('{pts}', pts(FRIEND)))}
          {row(T('streak'), `+${MAX_STREAK}`, T('streak_desc').replace('{pts}', pts(MAX_STREAK)))}
          {row(T('multiplier'), '1×–8×', T('multiplier_desc').replace('{from}', '1').replace('{to}', '8'))}
          {row(T('coins'), '=', T('coins_desc'))}
        </div>

        {/* Upgrade costs */}
        <div className="rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--ci-text)] mb-3">{T('upgrade_costs')}</h3>
          {/* On md+, render each tier as its own horizontal card so the row
              is legible instead of a cramped 3-col min/max grid. */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm md:hidden">
            <div className="text-xs font-semibold text-[var(--ci-muted)]">{T('level')}</div>
            <div className="text-xs font-semibold text-[var(--ci-muted)]">{T('multiplier')}</div>
            <div className="text-xs font-semibold text-[var(--ci-muted)]">{T('cost')}</div>
            {MULTIPLIERS.map((mul, i) => (
              <div key={i} className="contents">
                <div className="font-medium text-[var(--ci-text)]">{i}</div>
                <div className="font-bold text-emerald-400">{mul}×</div>
                <div className="text-[var(--ci-muted)]">{i === 0 ? '—' : `${STICKER_COSTS[i]} 🪙`}</div>
              </div>
            ))}
          </div>
          <div className="hidden md:grid md:grid-cols-5 md:gap-3">
            {MULTIPLIERS.map((mul, i) => (
              <div
                key={i}
                className={`rounded-xl border border-[var(--ci-border)] bg-[var(--ci-muted-surface)] px-3 py-3 text-center transition-colors ${
                  i === 0 ? 'opacity-60' : 'hover:border-emerald-300'
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ci-muted)]">{T('level')} {i}</div>
                <div className="my-1 text-lg font-black text-emerald-400">{mul}×</div>
                <div className="text-xs font-semibold text-[var(--ci-text)]">{i === 0 ? '—' : `${STICKER_COSTS[i]} 🪙`}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Example */}
        <div className="rounded-2xl bg-[var(--ci-panel)] border border-[var(--ci-border)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--ci-text)] mb-2">{T('example')}</h3>
          <p className="text-xs text-[var(--ci-muted)] leading-relaxed">
            {T('example_desc')
              .replace('{base}', String(example.base))
              .replace('{first}', String(example.first))
              .replace('{mayor}', String(example.mayor))
              .replace('{friend}', String(example.friend))
              .replace('{streak}', String(example.streak))
              .replace('{mul}', String(example.mul))
              .replace('{total}', String(exampleTotal))}
          </p>
        </div>

        <p className="text-xs text-center text-[var(--ci-muted)] pt-2">{T('coins_earned')}</p>
      </div>
    </div>
  )
}
