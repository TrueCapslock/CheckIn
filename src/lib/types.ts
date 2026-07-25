export interface Place {
  id: string
  name: string
  type: string
  address: string
  description: string | null
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  created_at: string

  googlePlaceId?: string
  rating?: number | null
  priceLevel?: number | null
  photoRefs?: string[]
  website?: string | null
  phone?: string | null
  hours?: string[] | null
}

export interface CheckIn {
  id: string
  place_id: string
  user_id: string
  user_name: string
  created_at: string
  points_awarded?: number | null
}

export interface Party {
  id: string
  name: string
  created_by: string
  starts_at: string
  ends_at: string
  status: 'active' | 'completed'
  created_at: string
}

export interface PartyMember {
  party_id: string
  user_name: string
  status: 'invited' | 'accepted' | 'declined'
  joined_at: string | null
}

export interface PartyCheckIn {
  party_id: string
  check_in_id: string
  user_name: string
  created_at: string
}

export interface PartyActivity {
  id: string
  party_id: string
  type: string
  user_name: string | null
  data: Record<string, unknown>
  created_at: string
}

export interface Rating {
  id: string
  place_id: string
  user_name: string
  rating: number // 1-5 stars
  comment: string | null
  created_at: string
}

/**
 * In-app message shown in a user's inbox (currently only the "X checked in at Y"
 * variant). The recipient is the follower; from_user_name is the actor.
 *
 * `id` is filled in by Supabase on read — leave it empty when constructing a
 * row to insert. `read_at` is null until the user marks the message read.
 */
export interface Message {
  id: string
  recipient_email: string
  from_user_name: string
  type: string // 'check_in' for now; extensible for future event types
  place_id: string | null
  check_in_id: string | null
  preview: string
  read_at: string | null
  created_at: string
}

