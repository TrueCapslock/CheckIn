import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { Lang } from './i18n'
import { getSavedLanguage, saveLanguage } from './i18n'

interface LanguageCtx {
  lang: Lang
  setLang: (l: Lang) => void
}

export const LanguageContext = createContext<LanguageCtx>({ lang: 'en', setLang: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(getSavedLanguage)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    saveLanguage(l)
  }, [])

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
