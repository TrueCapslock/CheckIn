import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function readBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  try { return body ? JSON.parse(body) : {} } catch { return {} }
}

export default async function handler(req, res) {
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('app_config').select('*').eq('id', 1).maybeSingle()
      if (error) return res.status(500).json({ error: error.message })
      return res.status(200).json(data || { max_check_in_distance: 100, party_enabled: true })
    }

    if (req.method === 'POST') {
      const body = await readBody(req)
      const updates = {}
      if (body.max_check_in_distance !== undefined) updates.max_check_in_distance = body.max_check_in_distance
      if (body.party_enabled !== undefined) updates.party_enabled = body.party_enabled
      if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields to update' })
      updates.updated_at = new Date().toISOString()

      const { error } = await supabase.from('app_config').upsert({ id: 1, ...updates }, { onConflict: 'id' })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('Config API error:', e)
    return res.status(500).json({ error: e.message || 'Config operation failed' })
  }
}
