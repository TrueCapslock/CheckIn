import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body = ''
  for await (const chunk of req) body += chunk
  let parsed = {}
  try { parsed = JSON.parse(body) } catch { /* no body or invalid */ }

  const fullReset = parsed.fullReset === true

  try {
    if (fullReset) {
      await supabase.from('party_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('party_check_ins').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('party_members').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('parties').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('follows').delete().neq('follower_email', '')
      await supabase.from('users').delete().neq('email', '')
      await supabase.from('app_config').delete().neq('id', 0)
    }

    // place_ratings has a FK to places, so it must be cleared before places.
    await supabase.from('place_ratings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('place_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('check_ins').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('places').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    return res.status(200).json({ ok: true, fullReset })
  } catch (e) {
    console.error('Reset error:', e)
    return res.status(500).json({ error: e.message })
  }
}
