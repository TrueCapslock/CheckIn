import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getUser, setUser, getUsername, getAvatar, setAvatar, removeAvatar, uploadAvatar } from '../lib/user'
import { clearAllAppData } from '../lib/user-registry'
import { useDarkModeContext } from '../lib/dark-mode-context'
import { useLanguage } from '../lib/language-context'
import { t, LANGUAGES } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import { isAdmin } from '../lib/admin'

function SettingsRow({ label, value, danger, onClick, to }: { label: string; value?: string; danger?: boolean; onClick?: () => void; to?: string }) {
  const content = (
    <>
      <span className={danger ? 'text-red-500 dark:text-red-400' : 'text-gray-800 dark:text-white'}>{label}</span>
      <span className="ml-auto truncate text-right text-xs text-gray-400">{value}</span>
      <span className={danger ? 'text-red-400' : 'text-gray-400'}>›</span>
    </>
  )

  const className = 'flex w-full items-center gap-3 border-b border-white/10 px-4 py-3 text-left text-sm font-semibold last:border-b-0'
  if (to) return <Link to={to} className={className}>{content}</Link>
  return <button type="button" onClick={onClick} className={className}>{content}</button>
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 px-1 text-xs font-semibold text-gray-500 dark:text-emerald-100/60">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/70 shadow-sm dark:bg-emerald-950/35">
        {children}
      </div>
    </section>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const user = getUser()
  const username = getUsername()
  const showAdmin = isAdmin()
  const { dark, toggle } = useDarkModeContext()
  const { lang, setLang } = useLanguage()
  const _ = (key: string) => t(key, lang)
  const [avatarState, setAvatarState] = useState(getAvatar(username) || '')
  const [avatarMsg, setAvatarMsg] = useState('')
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(username)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarMsg(_('settings.uploading'))
    const dataUrl = await uploadAvatar(file)
    if (dataUrl) {
      setAvatar(dataUrl)
      setAvatarState(dataUrl)
      setAvatarMsg('')
    } else {
      setAvatarMsg(_('settings.upload_failed'))
    }
  }

  const handleRemoveAvatar = () => {
    removeAvatar()
    setAvatarState('')
  }

  const handleSaveName = () => {
    const trimmed = nameInput.trim()
    if (trimmed && user) setUser(trimmed, user.email)
    setEditing(false)
  }

  const handleLogout = () => {
    clearAllAppData()
    sessionStorage.removeItem('checkin_pending_token')
    sessionStorage.removeItem('checkin_pending_email')
    navigate('/')
    window.location.reload()
  }

  return (
    <div className="min-h-full px-4 pb-24 pt-6">
      <div className="mb-7 flex items-center justify-center">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="absolute left-4 rounded-full p-2 text-gray-600 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-emerald-950/60"
        >
          ←
        </button>
        <h1 className="text-lg font-black text-gray-900 dark:text-white">{_('settings.title')}</h1>
      </div>

      {/* Profile card */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-white/70 p-4 shadow-sm dark:bg-emerald-950/35">
        <label className="relative cursor-pointer shrink-0">
          {avatarState ? (
            <img src={avatarState} alt="" className="h-16 w-16 rounded-full border-2 border-gray-200 object-cover dark:border-gray-700" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white dark:bg-blue-500">
              {username ? username[0].toUpperCase() : '?'}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-xs font-medium text-white">{_('settings.edit_name')}</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </label>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={30}
                autoFocus
                className="flex-1 rounded-lg bg-gray-100 px-3 py-1.5 text-base outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-white"
              />
              <button onClick={handleSaveName} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white dark:bg-blue-500">
                {_('settings.save')}
              </button>
            </div>
          ) : (
            <>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{username || _('profile.anonymous')}</div>
              <div className="text-sm text-gray-400">{user?.email || ''}</div>
            </>
          )}
          {avatarMsg && <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">{avatarMsg}</p>}
        </div>
      </div>

      {!editing && (
        <div className="-mt-4 mb-6 flex gap-3 px-1">
          <button onClick={() => { setNameInput(username); setEditing(true) }} className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {_('settings.edit_name')}
          </button>
          <button onClick={() => fileRef.current?.click()} className="text-sm font-medium text-blue-600 dark:text-blue-400">
            {_('settings.change_photo')}
          </button>
          {avatarState && (
            <button onClick={handleRemoveAvatar} className="text-sm font-medium text-red-500 dark:text-red-400">
              {_('settings.remove_photo')}
            </button>
          )}
        </div>
      )}

      <SettingsSection title={_('settings.preferences')}>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-sm font-semibold last:border-b-0">
          <span className="text-gray-800 dark:text-white">{_('settings.dark_mode')}</span>
          <button
            onClick={toggle}
            className={`ml-auto flex h-7 w-12 items-center rounded-full px-1 transition-colors ${dark ? 'bg-emerald-400' : 'bg-gray-300'}`}
            aria-pressed={dark}
          >
            <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 text-sm font-semibold last:border-b-0">
          <span className="text-gray-800 dark:text-white">{_('settings.language')}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="ml-auto rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <SettingsRow label={_('settings.points_rewards')} value={_('settings.coins_stickers')} to="/help/points" />
      </SettingsSection>

      <SettingsSection title={_('settings.other')}>
        {showAdmin && <SettingsRow label={_('settings.admin_dashboard')} to="/admin" />}
        <SettingsRow label={_('settings.help')} to="/help" />
        <SettingsRow label={_('settings.about')} to="/about" />
        <SettingsRow label={_('settings.log_out')} danger onClick={handleLogout} />
      </SettingsSection>
    </div>
  )
}
