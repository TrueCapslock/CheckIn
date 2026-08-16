import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

async function readBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  try { return body ? JSON.parse(body) : {} } catch { return {} }
}

async function upsertInvitees(supabase, partyId, invitees) {
  if (!invitees || invitees.length === 0) return
  const members = invitees.map((userName) => ({
    party_id: partyId,
    user_name: userName,
    status: 'invited',
  }))
  const { error } = await supabase
    .from('party_members')
    .upsert(members, { onConflict: 'party_id,user_name', ignoreDuplicates: true })
  if (error) throw error
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
        supabase.from('parties').select('*').eq('created_by', userName).order('created_at', { ascending: false }),
        supabase.from('party_members').select('*, parties(*)').eq('user_name', userName).neq('status', 'declined'),
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
      const { name, created_by, starts_at, ends_at, invitees, id } = await readBody(req)
      if (!name || !created_by || !starts_at || !ends_at) {
        return res.status(400).json({ error: 'name, created_by, starts_at, ends_at required' })
      }

      const inviteeList = Array.isArray(invitees) ? invitees.map((n) => String(n)).filter(Boolean) : []

      // Idempotency: reuse a client-supplied uuid so network-level retries of the
      // same submission don't create a second party.
      const partyId =
        typeof id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
          ? id.trim()
          : undefined

      // Dedupe re-taps: return an existing identical party instead of inserting a
      // duplicate (same name, creator, and start/end times).
      const { data: existing, error: existingErr } = await supabase
        .from('parties')
        .select('*')
        .eq('name', name)
        .eq('created_by', created_by)
        .eq('starts_at', starts_at)
        .eq('ends_at', ends_at)
        .limit(1)
        .maybeSingle()

      if (existingErr) throw existingErr

      if (existing) {
        await upsertInvitees(supabase, existing.id, inviteeList)
        return res.status(200).json({ ok: true, party: existing })
      }

      const payload = { name, created_by, starts_at, ends_at, status: 'active' }
      if (partyId) payload.id = partyId

      const { data: party, error: partyErr } = partyId
        ? await supabase.from('parties').upsert(payload, { onConflict: 'id' }).select().single()
        : await supabase.from('parties').insert(payload).select().single()

      if (partyErr) throw partyErr

      await upsertInvitees(supabase, party.id, inviteeList)

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

    /* ───── DELETE: leave party, remove member, or delete party (creator) ───── */
    if (req.method === 'DELETE') {
      const { party_id, user_name, delete_party } = await readBody(req)
      if (!party_id) return res.status(400).json({ error: 'party_id required' })

      // Creator-only: delete the whole party. Cascades members/check-ins/activity.
      if (delete_party) {
        if (!user_name) return res.status(400).json({ error: 'user_name required' })

        const { data: party, error: getErr } = await supabase
          .from('parties')
          .select('created_by')
          .eq('id', party_id)
          .maybeSingle()
        if (getErr) throw getErr
        if (!party || party.created_by !== user_name) {
          return res.status(403).json({ error: 'Only the party creator can delete the party' })
        }

        const { error } = await supabase.from('parties').delete().eq('id', party_id)
        if (error) throw error
        return res.status(200).json({ ok: true })
      }

      // Leave party / remove member (default).
      if (!user_name) return res.status(400).json({ error: 'party_id and user_name required' })
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
