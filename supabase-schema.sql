-- Run this in the Supabase SQL Editor to set up your database

-- Categories table (dynamic — add/edit via Supabase dashboard)
CREATE TABLE categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  icon text NOT NULL,
  sort_order integer DEFAULT 0,
  google_query text NOT NULL DEFAULT ''
);

-- Places table (id is text to support OSM/Google place IDs)
-- No CHECK constraint on type — categories are managed in the categories table
CREATE TABLE places (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text NOT NULL,
  type text NOT NULL,
  address text NOT NULL,
  description text,
  photo_url text,
  latitude double precision,
  longitude double precision,
  website text,
  phone text,
  hours text[],
  created_at timestamptz DEFAULT now()
);

-- Check-ins table (place_id is text to match places.id)
CREATE TABLE check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_name text NOT NULL DEFAULT 'Anonymous',
  points_awarded integer DEFAULT 10,
  created_at timestamptz DEFAULT now()
);

-- ⚠ Migration if you already ran the old schema with uuid columns (run all 4 lines):
-- ALTER TABLE check_ins DROP CONSTRAINT IF EXISTS check_ins_place_id_fkey;
-- ALTER TABLE places ALTER COLUMN id TYPE text;
-- ALTER TABLE check_ins ALTER COLUMN place_id TYPE text;
-- ALTER TABLE check_ins ADD FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE;
-- ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS points_awarded integer DEFAULT 10;

-- Users table (cross-device login — email is the key)
CREATE TABLE IF NOT EXISTS users (
  email text PRIMARY KEY,
  name text NOT NULL,
  coins integer DEFAULT 0,
  points integer DEFAULT 0,
  stickers jsonb DEFAULT '{}'::jsonb,
  achievements jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ⚠ Migration if users table already exists:
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stickers jsonb DEFAULT '{}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements jsonb DEFAULT '{}'::jsonb;

-- Migration: add avatar_url to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- Migration: add streaks to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS streaks jsonb DEFAULT '{}'::jsonb;

-- Follows table (friend/follow relationships)
CREATE TABLE IF NOT EXISTS follows (
  follower_email text NOT NULL,
  followed_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_email, followed_name)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows"
  ON follows FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert follows"
  ON follows FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can delete follows"
  ON follows FOR DELETE
  USING (true);

-- Migration: relax type CHECK constraint for dynamic categories (run if places have a type check)
ALTER TABLE places DROP CONSTRAINT IF EXISTS places_type_check;

-- Migration: add website, phone, hours columns (run if missing)
ALTER TABLE places ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE places ADD COLUMN IF NOT EXISTS hours text[];

-- Parties table
CREATE TABLE IF NOT EXISTS parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read parties"
  ON parties FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert parties"
  ON parties FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update parties"
  ON parties FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Party members table (invitations)
CREATE TABLE IF NOT EXISTS party_members (
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  status text DEFAULT 'invited',
  joined_at timestamptz,
  PRIMARY KEY (party_id, user_name)
);

ALTER TABLE party_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read party_members"
  ON party_members FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert party_members"
  ON party_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update party_members"
  ON party_members FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete party_members"
  ON party_members FOR DELETE
  USING (true);

-- Party check-ins table (links check-ins to parties)
CREATE TABLE IF NOT EXISTS party_check_ins (
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  check_in_id uuid NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (party_id, check_in_id)
);

ALTER TABLE party_check_ins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read party_check_ins"
  ON party_check_ins FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert party_check_ins"
  ON party_check_ins FOR INSERT
  WITH CHECK (true);

-- Party activity feed table
CREATE TABLE IF NOT EXISTS party_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  type text NOT NULL,
  user_name text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE party_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read party_activity"
  ON party_activity FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert party_activity"
  ON party_activity FOR INSERT
  WITH CHECK (true);

-- Place photos (uploaded by users on place detail pages)
CREATE TABLE IF NOT EXISTS place_photos (
  id text PRIMARY KEY,
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  photo_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_place_photos_place_id ON place_photos (place_id);

ALTER TABLE place_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read place_photos"
  ON place_photos FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert place_photos"
  ON place_photos FOR INSERT
  WITH CHECK (true);

-- Global app config (single row, id=1)
CREATE TABLE IF NOT EXISTS app_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_check_in_distance integer NOT NULL DEFAULT 100,
  party_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app_config"
  ON app_config FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update app_config"
  ON app_config FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can insert app_config"
  ON app_config FOR INSERT
  WITH CHECK (true);

INSERT INTO app_config (id, max_check_in_distance, party_enabled)
VALUES (1, 100, true)
ON CONFLICT (id) DO NOTHING;

-- Grant table-level access to the anon and service_role roles
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON follows TO service_role;
GRANT SELECT, INSERT, DELETE ON follows TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT INSERT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON places, users, parties, party_members, app_config, place_photos TO anon;
GRANT DELETE ON follows, party_members TO anon;

-- Enable Row Level Security
ALTER TABLE places ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Public read access for places
CREATE POLICY "Anyone can read places"
  ON places FOR SELECT
  USING (true);

-- Anyone can insert places (for caching checked-in places from OSM/Google)
CREATE POLICY "Anyone can insert places"
  ON places FOR INSERT
  WITH CHECK (true);

-- Anyone can update places (for upserting OSM imports)
CREATE POLICY "Anyone can update places"
  ON places FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Anyone can insert check-ins
CREATE POLICY "Anyone can check in"
  ON check_ins FOR INSERT
  WITH CHECK (true);

-- Anyone can read check-ins
CREATE POLICY "Anyone can read check-ins"
  ON check_ins FOR SELECT
  USING (true);

-- Anyone can read categories
CREATE POLICY "Anyone can read categories"
  ON categories FOR SELECT
  USING (true);

-- Anyone can read users
CREATE POLICY "Anyone can read users"
  ON users FOR SELECT
  USING (true);

-- Anyone can insert users
CREATE POLICY "Anyone can insert users"
  ON users FOR INSERT
  WITH CHECK (true);

-- Anyone can update users (profile/stat sync)
CREATE POLICY "Anyone can update users"
  ON users FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Seed categories
INSERT INTO categories (id, name, icon, sort_order, google_query) VALUES
  ('bar', 'Bar', '🍸', 1, 'bars'),
  ('restaurant', 'Restaurant', '🍽️', 2, 'restaurants'),
  ('cafe', 'Cafe', '☕', 3, 'cafes'),
  ('club', 'Club', '🎵', 4, 'night clubs'),
  ('lounge', 'Lounge', '🥂', 5, 'lounges'),
  ('park', 'Park', '🌳', 6, 'parks'),
  ('things_to_do', 'Things to Do', '🎪', 7, 'things to do')
ON CONFLICT (id) DO NOTHING;

-- Seed places (Portland, OR area)
INSERT INTO places (id, name, type, address, description, latitude, longitude) VALUES
  ('1', 'The Rusty Tap', 'bar', '124 Main St, Portland, OR', 'A cozy craft beer bar with rotating taps.', 45.5152, -122.6784),
  ('2', 'Saffron Kitchen', 'restaurant', '256 Elm St, Portland, OR', 'Farm-to-table Mediterranean cuisine.', 45.5200, -122.6850),
  ('3', 'Bean & Brew', 'cafe', '78 Oak Ave, Portland, OR', 'Specialty coffee and house-made pastries.', 45.5185, -122.6750),
  ('4', 'Neon Lounge', 'lounge', '910 Pine St, Portland, OR', 'Dim-lit cocktail lounge with live jazz.', 45.5220, -122.6800),
  ('5', 'The Basement Club', 'club', '42 Pearl St, Portland, OR', 'Underground electronic music venue.', 45.5250, -122.6820),
  ('6', 'Olive Tree Bistro', 'restaurant', '333 Cedar Ln, Portland, OR', 'Modern Italian small plates and wine.', 45.5160, -122.6900),
  ('7', 'Hops & Barley', 'bar', '567 Birch Dr, Portland, OR', 'Neighborhood pub with 20 beers on tap.', 45.5210, -122.6760),
  ('8', 'Roast & Toast', 'cafe', '189 Maple Dr, Portland, OR', 'Artisan coffee roastery and brunch spot.', 45.5190, -122.6720)
ON CONFLICT (id) DO NOTHING;

-- Place ratings (1–5 stars per user, optional free-text comment, latest upsert wins)
CREATE TABLE IF NOT EXISTS place_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id text NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  rating smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(place_id, user_name)
);

-- Migration: add the comment column to an existing place_ratings table
ALTER TABLE place_ratings ADD COLUMN IF NOT EXISTS comment text;

CREATE INDEX IF NOT EXISTS idx_place_ratings_place_id ON place_ratings (place_id);

ALTER TABLE place_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ratings"
  ON place_ratings FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert ratings"
  ON place_ratings FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update ratings"
  ON place_ratings FOR UPDATE
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON place_ratings TO anon;

