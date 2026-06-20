import { useState, useEffect } from 'react'
import { setUser } from '../lib/user'
import { sendVerificationCode, verifyCode } from '../lib/auth'
import type { StoredUser } from '../lib/auth'
import {
  lookupUserByEmail,
  registerUser,
  saveAchievementsToCache,
  saveCoinsToCache,
  savePointsToCache,
  saveStickersToCache,
} from '../lib/user-registry'
import { t } from '../lib/i18n'
import { useLanguage } from '../lib/language-context'

interface Props {
  onDone: () => void
}

type Step = 'email' | 'code' | 'name' | 'done'

export default function UsernamePrompt({ onDone }: Props) {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [displayCode, setDisplayCode] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [isReturning, setIsReturning] = useState(false)
  const { lang } = useLanguage()

  useEffect(() => {
    if (step === 'done') {
      const t = setTimeout(onDone, 1200)
      return () => clearTimeout(t)
    }
  }, [step, onDone])

  const loadExistingProfile = (existing: StoredUser, trimmedEmail: string) => {
    setUser(existing.name, trimmedEmail)
    if (existing.coins != null) saveCoinsToCache(existing.coins)
    if (existing.points != null) savePointsToCache(existing.points)
    if (existing.stickers != null) saveStickersToCache(existing.stickers)
    if (existing.achievements != null) saveAchievementsToCache(existing.achievements)
    setName(existing.name)
    setIsReturning(true)
    setStep('done')
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) return

    setSending(true)
    setError('')

    // Check if this email already has an account before sending code
    const existing = await lookupUserByEmail(trimmedEmail)

    const result = await sendVerificationCode(trimmedEmail)
    setSending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    setDisplayCode(result.code || '')
    setIsReturning(!!existing)
    setStep('code')
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedCode = code.trim()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedCode) return

    setSending(true)
    setError('')

    const result = await verifyCode(trimmedEmail, trimmedCode)

    if (!result.ok) {
      setError(result.error)
      setSending(false)
      return
    }

    const existing = await lookupUserByEmail(trimmedEmail)
    setSending(false)
    if (existing) {
      loadExistingProfile(existing, trimmedEmail)
      return
    }
    setName(result.name)
    setStep('name')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    setSending(true)
    setError('')

    const trimmedEmail = email.trim().toLowerCase()
    const existing = await lookupUserByEmail(trimmedEmail)
    if (existing) {
      setSending(false)
      loadExistingProfile(existing, trimmedEmail)
      return
    }

    const ok = await registerUser(trimmedName, trimmedEmail)
    if (!ok) {
      const existingAfterFailure = await lookupUserByEmail(trimmedEmail)
      if (existingAfterFailure) {
        setSending(false)
        loadExistingProfile(existingAfterFailure, trimmedEmail)
        return
      }
      setError('Failed to save profile. Try again.')
      setSending(false)
      return
    }

    setUser(trimmedName, trimmedEmail)
    setSending(false)
    setStep('done')
  }

  return (
    <div className="ci-splash fixed inset-0 z-50 flex flex-col overflow-hidden">
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

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        {/* App branding */}
        <div className="text-center mb-8">
          <img src="/icon-192.png" alt="" className="w-28 h-28 mx-auto mb-4 drop-shadow-2xl" />
          <h1 className="text-5xl font-black tracking-tight text-[var(--ci-text)] mb-2">{t('splash.title', lang)}</h1>
          <p className="text-[var(--ci-mint)] text-lg font-semibold">{t('splash.tagline', lang)}</p>
        </div>

        {/* Auth card */}
        <div className="ci-glass w-full max-w-sm rounded-[1.75rem] p-6 shadow-xl">
          {step === 'email' && (
            <>
              <h2 className="text-xl font-black text-center mb-1 text-[var(--ci-text)]">{t('auth.sign_in', lang)}</h2>
              <p className="text-sm text-[var(--ci-muted)] text-center mb-4">
                {t('auth.enter_email', lang)}
              </p>
              <form onSubmit={handleSendCode}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-center text-lg outline-none focus:ring-2 focus:ring-emerald-300"
                />
                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="ci-primary w-full mt-4 py-3 rounded-xl font-black disabled:opacity-40"
                >
                  {sending ? t('auth.sending', lang) : t('auth.send_code', lang)}
                </button>
              </form>
            </>
          )}

          {step === 'code' && (
            <>
              <h2 className="text-xl font-black text-center mb-1 text-[var(--ci-text)]">{t('auth.enter_code', lang)}</h2>
              <p className="text-sm text-[var(--ci-muted)] text-center mb-4">
                {displayCode ? (
                  <>Your code: <strong className="text-2xl tracking-widest text-[var(--ci-mint)]">{displayCode}</strong></>
                ) : (
                  <>We sent a code to <strong>{email}</strong></>
                )}
              </p>
              <form onSubmit={handleVerify}>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  inputMode="numeric"
                  className="w-full px-4 py-3 rounded-xl text-center text-2xl tracking-widest outline-none focus:ring-2 focus:ring-emerald-300"
                />
                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                <button
                  type="submit"
                  disabled={sending || code.length < 6}
                  className="ci-primary w-full mt-4 py-3 rounded-xl font-black disabled:opacity-40"
                >
                  {sending ? t('auth.verifying', lang) : t('auth.verify', lang)}
                </button>

              </form>
            </>
          )}

          {step === 'name' && (
            <>
              <h2 className="text-xl font-black text-center mb-1 text-[var(--ci-text)]">{t('auth.whats_your_name', lang)}</h2>
              <p className="text-sm text-[var(--ci-muted)] text-center mb-4">
                {t('auth.name_hint', lang)}
              </p>
              <form onSubmit={handleRegister}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={30}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl text-center text-lg outline-none focus:ring-2 focus:ring-emerald-300"
                />
                {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
                <button
                  type="submit"
                  disabled={sending || !name.trim()}
                  className="ci-primary w-full mt-4 py-3 rounded-xl font-black disabled:opacity-40"
                >
                  {sending ? t('auth.saving', lang) : t('auth.complete_sign_up', lang)}
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4 text-[var(--ci-text)]">
              <div className="text-5xl mb-3">{isReturning ? '👋' : '🎉'}</div>
              <p className="text-xl font-bold">
                {isReturning ? `${t('auth.welcome_back', lang)}, ${name}!` : `${t('auth.welcome', lang)}, ${name}!`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
