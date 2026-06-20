import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'checkin_dark_mode'

function getInitial(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'true'
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyDark(enabled: boolean) {
  document.documentElement.classList.toggle('dark', enabled)
}

export function useDarkMode() {
  const [dark, setDark] = useState(getInitial)

  useEffect(() => {
    applyDark(dark)
  }, [dark])

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      applyDark(next)
      return next
    })
  }, [])

  return { dark, toggle }
}
