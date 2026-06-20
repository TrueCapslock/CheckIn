import { createContext, useContext } from 'react'

interface DarkModeCtx {
  dark: boolean
  toggle: () => void
}

export const DarkModeContext = createContext<DarkModeCtx>({ dark: false, toggle: () => {} })
export const useDarkModeContext = () => useContext(DarkModeContext)
