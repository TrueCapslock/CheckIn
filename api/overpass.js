const UPSTREAMS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let body = ''
  for await (const chunk of req) body += chunk

  for (const upstream of UPSTREAMS) {
    try {
      const upRes = await fetch(upstream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CheckInApp/1.0 (+https://github.com/TrueCapslock/CheckIn)',
        },
        body,
      })
      const text = await upRes.text()
      if (!upRes.ok) continue
      return res.status(200).setHeader('Content-Type', 'application/json').send(text)
    } catch (e) {
      console.warn('Overpass upstream unreachable:', upstream, e.cause || e)
    }
  }

  res.status(502).json({ error: 'All Overpass upstreams failed' })
}
