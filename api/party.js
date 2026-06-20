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
    const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)

    /* ───── GET: list parties for a user ───── */
    if (req.method === 'GET') {
      const userName = url.searchParams.get('user_name')?.trim()
      if (!userName) return res.status(400).json({ error: 'user_name required' })

      const [createdRes, memberRes] = await Promise.all([
        supabase.from('parties').select('*').or(`created_by.eq.${userName},status.eq.active`).order('created_at', { ascending: false }),
        supabase.from('party_members').select('*, parties(*)').eq('user_name', userName),
      ])
      if (createdRes.error) throw createdRes.error
      if (memberRes.error) throw memberRes.error

      const created = createdRes.data || []
      const invited = (memberRes.data || [])
        .filter((m) => m.parties)
        .map((m) => ({ ...m.parties, member_status: m.status, joined_at: m.joined_at }))

      return res.status(200).json({ created, invited })
    }

    /* ───── POST: create party ───── */
    if (req.method === 'POST') {
      const { name, created_by, starts_at, ends_at, invitees } = await readBody(req)
      if (!name || !created_by || !starts_at || !ends_at) {
        return res.status(400).json({ error: 'name, created_by, starts_at, ends_at required' })
      }

      const { data: party, error: partyErr } = await supabase
        .from('parties')
        .insert({ name, created_by, starts_at, ends_at, status: 'active' })
        .select()
        .single()

      if (partyErr) throw partyErr

      if (invitees && invitees.length > 0) {
        const members = invitees.map((name) => ({
          party_id: party.id,
          user_name: name,
          status: 'invited',
        }))
        const { error: memberErr } = await supabase.from('party_members').insert(members)
        if (memberErr) throw memberErr
      }

      return res.status(200).json({ ok: true, party })
    }

    /* ───── PATCH: update party (status change, etc.) ───── */
    if (req.method === 'PATCH') {
      const { party_id, status } = await readBody(req)
      if (!party_id) return res.status(400).json({ error: 'party_id required' })

      const updates = {}
      if (status) updates.status = status

      const { error } = await supabase.from('parties').update(updates).eq('id', party_id)
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    /* ───── PUT: respond to invitation ───── */
    if (req.method === 'PUT') {
      const { party_id, user_name, accept } = await readBody(req)
      if (!party_id || !user_name) return res.status(400).json({ error: 'party_id and user_name required' })

      const status = accept ? 'accepted' : 'declined'
      const updates = { status }
      if (accept) updates.joined_at = new Date().toISOString()

      const { error } = await supabase.from('party_members').update(updates).match({ party_id, user_name })
      if (error) throw error
      return res.status(200).json({ ok: true, status })
    }

    /* ───── DELETE: leave party or remove member ───── */
    if (req.method === 'DELETE') {
      const { party_id, user_name } = await readBody(req)
      if (!party_id || !user_name) return res.status(400).json({ error: 'party_id and user_name required' })

      const { error } = await supabase.from('party_members').delete().match({ party_id, user_name })
      if (error) throw error
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    console.error('Party API error:', e)
    return res.status(500).json({ error: e.message || 'Party operation failed' })
  }
}
