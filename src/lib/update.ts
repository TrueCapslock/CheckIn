/// <reference types="vite-plugin-pwa/client" />
// src/lib/update.ts
//
// Lightweight wrapper around `virtual:pwa-register` so the rest of the app can
// react to "new version available" without coupling to vite-plugin-pwa.
//
// Design:
//   * Module-level EventTarget (`bus`) so any component can subscribe without
//     React context plumbing.
//   * Cooldown memory in localStorage — if the user dismisses the banner, we
//     won't re-prompt for the same waiting SW within DISMISS_COOLDOWN_MS.
//     Timestamp is used instead of semver-version because a waiting Service
//     Worker doesn't expose its own version number to the client without a
//     custom postMessage handshake.
//   * Re-check cadence: mount (handled by vite-plugin-pwa), focus/visibility
//     (handled by the React component), and 60 minutes while the tab is
//     visible (handled in onRegistered).
//   * `applyUpdate()` calls the SW's `updateServiceWorker(true)` which sends
//     SKIP_WAITING and reloads the page once the new SW activates.

export type UpdateState = {
  status: 'idle' | 'available' | 'offline-ready'
}

export const DISMISS_KEY = 'checkin_update_dismissed_at'
export const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000 // 24 hours
const RECHECK_INTERVAL_MS = 60 * 60 * 1000 // 60 minutes

const bus = new EventTarget()
let updateFn: ((reloadPage?: boolean) => Promise<void>) | null = null
let currentState: UpdateState = { status: 'idle' }

// --- Pure localStorage helpers (exported so they're testable in isolation) ---

function safeGet(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

function safeSet(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* quota / private mode — ignore */
  }
}

export function readLastDismissed(): number {
  return safeGet(DISMISS_KEY)
}

export function writeLastDismissed(at: number = Date.now()): void {
  safeSet(DISMISS_KEY, at)
}

export function isCooldownActive(
  lastDismissed: number,
  now: number,
  cooldownMs: number = DISMISS_COOLDOWN_MS,
): boolean {
  // Missing key.
  if (!lastDismissed) return false
  // Future timestamp (e.g. clock skew or someone wrote a non-Date value) —
  // don't keep the banner hidden forever; treat "now" as if it has cooled down.
  if (lastDismissed > now) return false
  return now - lastDismissed < cooldownMs
}

function emit(state: UpdateState) {
  currentState = state
  bus.dispatchEvent(new CustomEvent('state', { detail: state }))
}

// --- Public API ---

/**
 * Subscribe to update state changes. Returns an unsubscribe function.
 * The handler fires once on subscribe with the current state.
 */
export function onUpdateState(handler: (state: UpdateState) => void): () => void {
  // Fire the current state once on subscribe so consumers can render their
  // initial UI synchronously without an extra round-trip.
  handler(currentState)
  const fn = (e: Event) => handler((e as CustomEvent).detail as UpdateState)
  bus.addEventListener('state', fn)
  return () => bus.removeEventListener('state', fn)
}

export function getCurrentState(): UpdateState {
  return currentState
}

/** @internal — used by the test suite only. */
export function _resetForTests(): void {
  currentState = { status: 'idle' }
  updateFn = null
  bus.dispatchEvent(new CustomEvent('state', { detail: currentState }))
}

/**
 * Manually trigger a re-check of the Service Worker. Safe to call multiple
 * times — duplicate calls collapse in the registration.update() Promise chain.
 */
export async function checkForUpdate(): Promise<void> {
  if (typeof window === 'undefined') return
  if (!navigator.onLine) return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  } catch {
    /* ignored — best-effort */
  }
}

/**
 * Boot the SW registration. Call once at app start (main.tsx).
 * Safe to call multiple times — only the first call wires up the callbacks.
 */
export async function startUpdateFlow(): Promise<void> {
  if (typeof window === 'undefined') return
  if (updateFn) return // already started

  try {
    // virtual:pwa-register is a vite-plugin-pwa virtual module; it exists in
    // production builds and (no-op) in dev with `devOptions.enabled = true`.
    const mod = await import('virtual:pwa-register')
    const registerSW = (mod as { registerSW: (opts: unknown) => (r?: boolean) => Promise<void> }).registerSW

    updateFn = registerSW({
      immediate: true,
      onNeedRefresh: () => emitUpdateIfNotCooledDown(),
      onOfflineReady: () => emit({ status: 'offline-ready' }),
      onRegistered: (registration: ServiceWorkerRegistration | undefined) => {
        schedulePeriodicRecheck(registration)
      },
      onRegisterError: () => {
        /* ignored — non-fatal */
      },
    })
  } catch {
    // virtual:pwa-register not available (dev without PWA devtools enabled, or
    // stripped build). This is expected and never fatal — the rest of the app
    // keeps working.
  }
}

function emitUpdateIfNotCooledDown() {
  const lastDismissed = readLastDismissed()
  if (isCooldownActive(lastDismissed, Date.now())) return
  emit({ status: 'available' })
}

function schedulePeriodicRecheck(registration: ServiceWorkerRegistration | undefined) {
  if (!registration) return
  const tick = () => {
    if (document.visibilityState !== 'visible') return
    if (!navigator.onLine) return
    registration.update().catch(() => {
      /* swallow — registration.update() rejects on offline / opaque origins */
    })
  }
  // Don't tick immediately — the SW file was just fetched; wait one interval.
  window.setInterval(tick, RECHECK_INTERVAL_MS)
}

/**
 * Apply the waiting update. Reloads the page once the new SW activates.
 * Stamps `dismissed_at` first so even if reload fails, the banner stays hidden.
 */
export async function applyUpdate(): Promise<void> {
  writeLastDismissed()
  if (!updateFn) {
    // SW plugin not active in dev — fall back to a manual reload so the dev
    // server returns the freshly built module graph.
    window.location.reload()
    return
  }
  try {
    await updateFn(true)
  } catch {
    /* auto-reload by vite-plugin-pwa on success */
  }
}

/**
 * User tapped "Later". Suppresses the banner for DISMISS_COOLDOWN_MS.
 */
export function dismissForNow(): void {
  writeLastDismissed()
  emit({ status: 'idle' })
}
