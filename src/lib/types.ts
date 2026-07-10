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
  created_at: string
}
