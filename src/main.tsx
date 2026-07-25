import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startUpdateFlow } from './lib/update'
import './index.css'
import App from './App'

// Boot the PWA update flow (registerSW + cooldown-aware event bus) before
// React mounts so the first paint of <UpdateBanner /> picks up the correct
// initial state. No-op in dev where `virtual:pwa-register` is absent.
void startUpdateFlow()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
