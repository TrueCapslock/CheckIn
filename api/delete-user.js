import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function tryDeleteWhere(supabase, table, column, value) {
  const { error } = await supabase.from(table).delete().eq(column, value)
  if (error) console.warn(`Delete cleanup skipped for ${table}.${column}:`, error.message)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  let body = ''
  for await (const chunk of req) body += chunk
  let parsed = {}
  try { parsed = JSON.parse(body) } catch { /* no body or invalid */ }

  const email = parsed.email?.trim().toLowerCase()
  const name = parsed.name?.trim()
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

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

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('Delete user error:', e)
    return res.status(500).json({ error: e.message })
  }
}
