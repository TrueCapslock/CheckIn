import { getUsername } from './user'

export interface PlacePhoto {
  id: string
  userName: string
  photoUrl: string
  createdAt: string
}

function storageKey(placeId: string): string {
  return `checkin_place_photos_${placeId}`
}

function loadLocal(placeId: string): PlacePhoto[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(placeId)) || '[]')
  } catch {
    return []
  }
}

function saveLocal(placeId: string, photos: PlacePhoto[]) {
  localStorage.setItem(storageKey(placeId), JSON.stringify(photos))
}

export async function getPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const local = loadLocal(placeId)
  // Fetch from Supabase in background and merge
  try {
    const { supabase } = await import('./supabase')
    const { data, error } = await supabase
      .from('place_photos')
      .select('*')
      .eq('place_id', placeId)
      .order('created_at', { ascending: false })
    if (!error && data) {
      const remoteIds = new Set<string>()
      const remote: PlacePhoto[] = data.map((p: Record<string, unknown>) => {
        const id = p.id as string
        remoteIds.add(id)
        return {
          id,
          userName: p.user_name as string,
          photoUrl: p.photo_url as string,
          createdAt: p.created_at as string,
        }
      })
      // Push any local-only photos to Supabase
      const toSync = local.filter((p) => !remoteIds.has(p.id))
      for (const p of toSync) {
        try {
          await supabase.from('place_photos').upsert(
            {
              id: p.id,
              place_id: placeId,
              user_name: p.userName,
              photo_url: p.photoUrl,
              created_at: p.createdAt,
            },
            { onConflict: 'id' },
          )
        } catch { /* best effort */ }
      }
      const byId = new Map<string, PlacePhoto>()
      for (const p of remote) byId.set(p.id, p)
      for (const p of local) byId.set(p.id, p)
      const merged = [...byId.values()]
      saveLocal(placeId, merged)
      return merged
    }
  } catch { /* fall through to local */ }
  return local
}

export async function addPlacePhoto(placeId: string, file: File): Promise<PlacePhoto | null> {
  const name = getUsername()
  if (!name) return null

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

  const photo: PlacePhoto = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userName: name,
    photoUrl: dataUrl,
    createdAt: new Date().toISOString(),
  }

  // Save locally immediately
  const photos = loadLocal(placeId)
  photos.push(photo)
  saveLocal(placeId, photos)

  // Sync to Supabase
  try {
    const { supabase } = await import('./supabase')
    await supabase.from('place_photos').upsert(
      {
        id: photo.id,
        place_id: placeId,
        user_name: photo.userName,
        photo_url: photo.photoUrl,
        created_at: photo.createdAt,
      },
      { onConflict: 'id' },
    )
  } catch (e) {
    console.warn('Failed to sync place photo to DB:', e)
  }

  return photo
}
