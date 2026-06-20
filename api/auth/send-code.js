import crypto from 'node:crypto'

const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const AUTH_SECRET = process.env.AUTH_SECRET || RESEND_API_KEY || 'checkin-dev-secret'

function sign(value) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url')
}

function createToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
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
  const name = parsed.name?.trim() || email?.split('@')[0] || ''
  if (!email) {
    return res.status(400).json({ error: 'Email required' })
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  const expires = Date.now() + 600_000
  const codeHash = sign(`${email}:${code}:${expires}`)
  const token = createToken({ email, name, expires, codeHash })

  if (!RESEND_API_KEY) {
    return res.status(200).json({ message: 'ok', token, devCode: code })
  }

  try {
    const upRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'CheckIn <noreply@hartvig.info>',
        to: email,
        subject: 'Your CheckIn verification code',
        html: `<p>Hi ${name},</p><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
      }),
    })
    if (!upRes.ok) {
      const text = await upRes.text()
      console.error('Resend error:', upRes.status, text)
      return res.status(500).json({ error: 'Failed to send email' })
    }
  } catch (e) {
    console.error('Resend fetch failed:', e)
    return res.status(500).json({ error: 'Email service unreachable' })
  }

  return res.status(200).json({ message: 'ok', token })
}
