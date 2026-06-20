import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const ACHIEVEMENT_COINS = {
  first_checkin: 10, first_bar: 15, first_restaurant: 15,
  first_cafe: 15, first_club: 15, first_lounge: 15,
  first_park: 15, first_things_to_do: 15,
  streak_3: 30, streak_7: 100, bar_streak_7: 100,
  checkins_10: 25, checkins_50: 100, checkins_100: 250,
}

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

  const targetEmail = parsed.email?.trim() || null

  try {
    // Get users to recalculate
    let query = supabase.from('users').select('email, name, achievements')
    if (targetEmail) query = query.eq('email', targetEmail)
    const { data: users, error: userError } = await query

    if (userError) throw userError
    if (!users || users.length === 0) {
      return res.status(404).json({ error: 'No users found' })
    }

    const results = []

    for (const user of users) {
      // Sum points_awarded from check_ins by user_name
      const { data: checkIns, error: ciError } = await supabase
        .from('check_ins')
        .select('points_awarded')
        .eq('user_name', user.name)

      if (ciError) {
        results.push({ email: user.email, error: ciError.message })
        continue
      }

      const points = checkIns.reduce((sum, ci) => sum + (ci.points_awarded ?? 10), 0)

      // Calculate achievement coin rewards
      const achievements = user.achievements || {}
      let achievementCoins = 0
      for (const [id, state] of Object.entries(achievements)) {
        if (state && typeof state === 'object' && 'unlocked' in state && state.unlocked) {
          achievementCoins += ACHIEVEMENT_COINS[id] || 0
        }
      }

      const coins = points + achievementCoins

      // Update user
      const { error: updateError } = await supabase
        .from('users')
        .update({ points, coins })
        .eq('email', user.email)

      if (updateError) {
        results.push({ email: user.email, error: updateError.message })
      } else {
        results.push({ email: user.email, points, coins })
      }
    }

    return res.status(200).json({ ok: true, updated: results.length, results })
  } catch (e) {
    console.error('Recalculate error:', e)
    return res.status(500).json({ error: e.message })
  }
}
