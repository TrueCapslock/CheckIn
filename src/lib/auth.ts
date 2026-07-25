export interface StoredUser {
  name: string
  email: string
  coins?: number
  points?: number
  stickers?: Record<string, unknown>
  achievements?: Record<string, unknown>
}

// Emails that are allowed to skip the code-entry step entirely. The owner
// adds their own inbox here so testing the full app flow doesn't require
// intercepting the verification email in dev tooling.
//
// SECURITY NOTE: this only short-circuits on the CLIENT. The server-side
// /api/auth/send-code and /api/auth/verify-code endpoints still enforce the
// HMAC-signed token + email ownership rules, so a network attacker who
// impersonates the email address still has to actually own the inbox.
export const INSTANT_AUTH_EMAILS: ReadonlySet<string> = new Set([
  'rune.glad@gmail.com',
])

function norm(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * True iff `email` (after trim+lowercase) is on the instant-auth allowlist.
 * Truthy but unsafe inputs (null/undefined/non-string) return false.
 */
export function isInstantAuthEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false
  return INSTANT_AUTH_EMAILS.has(norm(email))
}

export async function sendVerificationCode(email: string, name?: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const trimmedEmail = email.trim()
  try {
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmedEmail, name }),
    })
    const data = await res.json().catch(() => ({})) as { token?: string; devCode?: string; error?: string }
    if (!res.ok || !data.token) return { ok: false, error: data.error || 'Failed to send code' }
    sessionStorage.setItem('checkin_pending_token', data.token)
    sessionStorage.setItem('checkin_pending_email', trimmedEmail)
    return { ok: true, code: data.devCode || '' }
  } catch {
    return { ok: false, error: 'Could not reach verification server' }
  }
}

export async function verifyCode(email: string, code: string): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const expectedEmail = sessionStorage.getItem('checkin_pending_email')
  const token = sessionStorage.getItem('checkin_pending_token')

  if (email.trim() !== expectedEmail || !token) {
    return { ok: false, error: 'No verification code pending' }
  }

  try {
    const res = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), code, token }),
    })
    const data = await res.json().catch(() => ({})) as { name?: string; error?: string }
    if (!res.ok) return { ok: false, error: data.error || 'Invalid code' }
    sessionStorage.removeItem('checkin_pending_token')
    sessionStorage.removeItem('checkin_pending_email')
    return { ok: true, name: data.name || email.split('@')[0] }
  } catch {
    return { ok: false, error: 'Could not reach verification server' }
  }
}
