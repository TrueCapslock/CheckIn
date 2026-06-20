import crypto from 'node:crypto'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const AUTH_SECRET = process.env.AUTH_SECRET || RESEND_API_KEY || 'checkin-dev-secret'

function sign(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url')
}

function readToken(token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig || sign(body) !== sig) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  const email = parsed.email?.trim()
  const code = parsed.code?.trim()
  const pending = readToken(parsed.token)
  if (!email || !code || !pending) {
    return res.status(400).json({ error: 'Email, code, and token required' })
  }
  if (pending.email !== email) {
    return res.status(400).json({ error: 'Email mismatch' })
  }
  if (Date.now() > pending.expires) {
    return res.status(400).json({ error: 'Code expired' })
  }
  if (sign(`${email}:${code}:${pending.expires}`) !== pending.codeHash) {
    return res.status(400).json({ error: 'Invalid code' })
  }

  return res.status(200).json({ message: 'verified', name: pending.name || email.split('@')[0] })
}
