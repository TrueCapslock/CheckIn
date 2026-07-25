import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const UPSTREAMS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

function overpassProxy(): Plugin {
  return {
    name: 'overpass-proxy',
    configureServer(server) {
      server.middlewares.use('/api/overpass', async (req, res) => {
        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => resolve(data))
        })

        for (const upstream of UPSTREAMS) {
          try {
            const upRes = await fetch(upstream, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'CheckInApp/1.0 (+https://github.com/olehartvig/checkin)',
              },
              body,
            })
            const text = await upRes.text()
            if (!upRes.ok) {
              console.warn('Overpass upstream error:', upstream, upRes.status)
              continue
            }
            res.writeHead(upRes.status, { 'Content-Type': 'application/json' })
            res.end(text)
            return
          } catch (e) {
            console.warn('Overpass upstream unreachable:', upstream, (e as Error).cause || e)
          }
        }

        console.error('All Overpass upstreams failed')
        res.writeHead(502)
        res.end()
      })
    },
  }
}

const RESEND_API_KEY = (() => {
  const env = loadEnv('', process.cwd(), '')
  return env.RESEND_API_KEY || ''
})()
const AUTH_SECRET = (() => {
  const env = loadEnv('', process.cwd(), '')
  return env.AUTH_SECRET || env.RESEND_API_KEY || 'checkin-dev-secret'
})()
const SUPABASE_URL = (() => {
  const env = loadEnv('', process.cwd(), '')
  return env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
})()
const SUPABASE_SERVICE_ROLE_KEY = (() => {
  const env = loadEnv('', process.cwd(), '')
  return env.SUPABASE_SERVICE_ROLE_KEY || ''
})()

function signAuth(value: string): string {
  return crypto.createHmac('sha256', AUTH_SECRET).update(value).digest('base64url')
}

function createAuthToken(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${signAuth(body)}`
}

function readAuthToken(token: string): Record<string, unknown> | null {
  const [body, sig] = token.split('.')
  if (!body || !sig || signAuth(body) !== sig) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function authPlugin(): Plugin {
  return {
    name: 'auth-plugin',
    configureServer(server) {
      server.middlewares.use('/api/auth/send-code', async (req, res) => {
        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => resolve(data))
        })
        let parsed: { name?: string; email?: string }
        try {
          parsed = JSON.parse(body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }
        const { name, email } = parsed
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email required' }))
          return
        }

        const code = String(Math.floor(100000 + Math.random() * 900000))
        const trimmedEmail = email.trim()
        const displayName = name?.trim() || trimmedEmail.split('@')[0]
        const expires = Date.now() + 600_000
        const token = createAuthToken({
          email: trimmedEmail,
          name: displayName,
          expires,
          codeHash: signAuth(`${trimmedEmail}:${code}:${expires}`),
        })

        if (!RESEND_API_KEY) {
          console.log(`Dev mode: verification code for ${email} is ${code}`)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ message: 'code_sent', token, devCode: code }))
          return
        }

        try {
          const upRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'CheckIn <onboarding@resend.dev>',
              to: email,
              subject: 'Your CheckIn verification code',
              html: `<p>Hi ${displayName},</p><p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`,
            }),
          })
          if (!upRes.ok) {
            const text = await upRes.text()
            console.error('Resend error:', upRes.status, text)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Failed to send email' }))
            return
          }
        } catch (e) {
          console.error('Resend fetch failed:', e)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email service unreachable' }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'code_sent', token }))
      })

      server.middlewares.use('/api/auth/verify-code', async (req, res) => {
        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => resolve(data))
        })
        let parsed: { email?: string; code?: string; token?: string }
        try {
          parsed = JSON.parse(body)
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }
        const { email, code, token } = parsed
        const pending = readAuthToken(token || '')
        if (!email || !code || !pending) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email, code, and token required' }))
          return
        }
        if (pending.email !== email.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email mismatch' }))
          return
        }
        if (typeof pending.expires !== 'number' || Date.now() > pending.expires) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Code expired' }))
          return
        }
        if (signAuth(`${email.trim()}:${code}:${pending.expires}`) !== pending.codeHash) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid code' }))
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'verified', name: pending.name }))
      })
    },
  }
}

async function tryDeleteWhere(supabase: any, table: string, column: string, value: string) {
  const { error } = await supabase.from(table).delete().eq(column, value)
  if (error) console.warn(`Delete cleanup skipped for ${table}.${column}:`, error.message)
}

function deleteUserPlugin(): Plugin {
  return {
    name: 'delete-user-api',
    configureServer(server) {
      server.middlewares.use('/api/delete-user', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing Supabase credentials' }))
          return
        }

        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => resolve(data))
        })
        let parsed: { email?: string; name?: string } = {}
        try { parsed = JSON.parse(body) } catch { /* invalid body handled below */ }

        const email = parsed.email?.trim().toLowerCase()
        const name = parsed.name?.trim()
        if (!email || !name) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Email and name are required' }))
          return
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        try {
          await tryDeleteWhere(supabase, 'follows', 'follower_email', email)
          await tryDeleteWhere(supabase, 'follows', 'followed_name', name)
          await tryDeleteWhere(supabase, 'party_activity', 'user_name', name)
          await tryDeleteWhere(supabase, 'party_check_ins', 'user_name', name)
          await tryDeleteWhere(supabase, 'party_members', 'user_name', name)
          await tryDeleteWhere(supabase, 'parties', 'created_by', name)
          await tryDeleteWhere(supabase, 'check_ins', 'user_name', name)
          const { error } = await supabase.from('users').delete().eq('email', email)
          if (error) throw error
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          console.error('Delete user error:', e)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: (e as Error).message }))
        }
      })
    },
  }
}

function apiProxyPlugin(): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/', async (req, res, next) => {
        if (req.url?.startsWith('/api/auth/') || req.url?.startsWith('/api/overpass')) {
          return next()
        }

        const target = process.env.VITE_API_PROXY || 'https://checkin.hartvig.info'
        const reqPath = req.url || ''
        const apiPath = reqPath.startsWith('/api/') ? reqPath : `/api${reqPath.startsWith('/') ? reqPath : `/${reqPath}`}`
        const url = new URL(apiPath, target)
        const method = req.method || 'GET'

        const body = await new Promise<string>((resolve) => {
          let data = ''
          req.on('data', (chunk) => (data += chunk))
          req.on('end', () => resolve(data))
        })

        try {
          const upRes = await fetch(url.toString(), {
            method,
            headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
            body: body || undefined,
          })
          const text = await upRes.text()
          const contentType = upRes.headers.get('content-type') || 'application/json'
          res.writeHead(upRes.status, { 'Content-Type': contentType })
          res.end(text)
        } catch (e) {
          console.error('API proxy error:', e)
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'API proxy failed — run `vercel dev` instead of `npm run dev` for full API support' }))
        }
      })
    },
  }
}

export default defineConfig({
  server: {
    host: true,
    allowedHosts: true,
  },
  plugins: [
    overpassProxy(),
    authPlugin(),
    deleteUserPlugin(),
    apiProxyPlugin(),
    tailwindcss(),
    basicSsl(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'splash.png'],
      manifest: {
        name: 'CheckIn',
        short_name: 'CheckIn',
        description: 'Discover and check in at places around you.',
        theme_color: '#001d1c',
        background_color: '#001d1c',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['icon.svg', 'icon-192.png', 'icon-512.png', 'splash.png'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(js|css)$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'app-scripts',
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^\/$/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
