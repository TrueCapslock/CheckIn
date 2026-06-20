export interface StoredUser {
  name: string
  email: string
  coins?: number
  points?: number
  stickers?: Record<string, unknown>
  achievements?: Record<string, unknown>
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
