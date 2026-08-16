# Supabase → Neon Migration Plan

Goal: move the app's database from Supabase to Neon **while keeping all data**.

> ⚠️ **Correction to earlier assumption:** Neon's free tier is **0.5 GB storage** — essentially the same as Supabase's 500 MB database cap, not bigger. Neon *does* fix the "project paused after 7 days of inactivity" problem, but it does **not** fix a "database is full" problem. If the data is larger than ~0.5 GB, the destination must be Neon's paid plan (Launch, ~$19/mo ≈ 10 GB) or data must be trimmed first.

---

## Current architecture (as of this plan)

- **13 tables** in the `public` schema:
  `categories`, `places`, `check_ins`, `users`, `follows`, `parties`,
  `party_members`, `party_check_ins`, `party_activity`, `place_photos`,
  `app_config`, `place_ratings`, `messages`.
- **Two access layers:**
  1. **Client → PostgREST directly** — the browser talks to Supabase with the anon
     key via `@supabase/supabase-js`. Used by ~11 `src/lib/*.ts` modules + 4 pages.
  2. **Serverless `api/*.js`** (service-role key): `config`, `party`, `delete-user`,
     `recalculate-stats`, `reset`, plus `auth/send-code`, `auth/verify-code`,
     `overpass` (the last three don't touch the DB).
- **Not used (nothing to migrate):**
  - Supabase Auth — the app uses custom HMAC + Resend email codes.
  - Supabase Storage — avatars and photos are data URLs stored in DB columns.
  - Realtime — the app uses polling.

---

## Phase 0 — Preflight & size gate

1. Run the table-size query in the Supabase SQL editor. **If total `public`
   schema > ~0.4 GB, stop** — Neon free won't fit; use Neon Launch or trim data.
2. Note the Supabase **Postgres version** (Settings → Database). Create the Neon
   project on the **same version**.
3. Supabase → Project Settings → Database → copy the **unpooled** connection string
   (Host / DB name / Port / User / Password).
4. Neon console → Connect → copy the Neon connection string.

---

## Phase 1 — Data migration (keep all data)

Official Neon approach (`pg_dump` → `pg_restore`).

```bash
# 1. Export from Supabase (unpooled connection string, custom -Fc format)
pg_dump -Fc -v \
  -d "postgresql://USER:PASSWORD@HOST:5432/postgres" \
  --schema=public \
  -f supabase_dump.bak

# 2. Restore into Neon (--no-owner --no-acl skips Supabase's roles/privileges)
pg_restore -d "postgresql://neon_user:neon_pass@neon_host/neondb" \
  -v --no-owner --no-acl supabase_dump.bak
```

3. **Disable RLS in Neon.** The dump carries `ENABLE ROW LEVEL SECURITY`,
   `CREATE POLICY`, and `GRANT TO anon/service_role`. Those roles don't exist in
   Neon. Run in the Neon SQL editor:

```sql
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
```

4. **Verify row counts** match on every table before/after:

```sql
SELECT 'categories' t, count(*) FROM categories
UNION ALL SELECT 'places', count(*) FROM places
UNION ALL SELECT 'check_ins', count(*) FROM check_ins
UNION ALL SELECT 'users', count(*) FROM users
UNION ALL SELECT 'follows', count(*) FROM follows
UNION ALL SELECT 'parties', count(*) FROM parties
UNION ALL SELECT 'party_members', count(*) FROM party_members
UNION ALL SELECT 'party_check_ins', count(*) FROM party_check_ins
UNION ALL SELECT 'party_activity', count(*) FROM party_activity
UNION ALL SELECT 'place_photos', count(*) FROM place_photos
UNION ALL SELECT 'app_config', count(*) FROM app_config
UNION ALL SELECT 'place_ratings', count(*) FROM place_ratings
UNION ALL SELECT 'messages', count(*) FROM messages;
```

Keep `supabase_dump.bak` as a backup until cutover is verified.

---

## Phase 2 — Serverless layer (`api/*.js` → Neon driver)

1. Install the driver: `bun add @neondatabase/serverless`
   (works over HTTP/fetch, so it runs in both Vercel-style serverless and the
   Node dev server).
2. Create a shared client, e.g. `api/lib/db.js`:

```js
import { neon } from '@neondatabase/serverless'
export const sql = neon(process.env.DATABASE_URL)
```

3. Rewrite these 5 DB functions from supabase-js query-builder to `sql`:
   - `api/config.js` — GET/POST `app_config`
   - `api/party.js` — all 5 methods
   - `api/delete-user.js` — deletes across 8 tables
   - `api/recalculate-stats.js` — aggregate + update
   - `api/reset.js` — truncate/delete all
4. **No change:** `api/auth/send-code.js`, `api/auth/verify-code.js`,
   `api/overpass.js` (no DB access).

---

## Phase 3 — Client layer (bulk of the work)

Neon has **no PostgREST and no anon key**, and `DATABASE_URL` must never ship to
the browser. Every client-side `supabase.from(...)` call must be replaced with
`fetch('/api/...')`.

**Approach:** one dedicated endpoint per domain (matches the existing `api/*`
style). Do **not** build a generic query passthrough (insecure, hard to maintain).

| New endpoint | Replaces direct calls in |
|---|---|
| `/api/places` (list/search/nearby/get/insert/upsert/delete) | `places.ts` |
| `/api/check-ins` (create, list for place, recent, count) | `places.ts`, `sync.ts` |
| `/api/categories` | `categories.ts` |
| `/api/users` (register/upsert, get by email, update stats/stickers/achievements/streaks, avatar) | `user-registry.ts`, `user.ts`, `points.ts`, `achievements.ts`, `sync.ts`, `Profile.tsx`, `UserProfile.tsx` |
| `/api/follows` | `follow.ts`, `Friends.tsx` |
| `/api/messages` (fanout, inbox, unread count, mark-read) | `messages.ts` |
| `/api/ratings` | `ratings.ts` |
| `/api/photos` | `place-photos.ts` |
| `/api/party-check-ins` | `party.ts` |
| `/api/admin/*` | `Admin.tsx` |

Edit the client modules:
`places.ts`, `categories.ts`, `achievements.ts`, `points.ts`, `party.ts`,
`place-photos.ts`, `follow.ts`, `messages.ts`, `ratings.ts`, `user-registry.ts`,
`user.ts`, `sync.ts`, and pages `Admin.tsx`, `Friends.tsx`, `Profile.tsx`,
`UserProfile.tsx`.

**Important:** the offline/retry queues in `sync.ts` and `ratings.ts` also speak
PostgREST today — they must go through the same endpoints.

**Also update `vite.config.ts`:** its `deleteUserPlugin` dev middleware uses the
service-role client. Point it at `@neondatabase/serverless`, or proxy
`/api/delete-user` to the real function. `authPlugin` and `overpassProxy` don't
touch the DB — leave them.

---

## Phase 4 — Env vars

- **Add (server only):** `DATABASE_URL` (Neon pooled connection string).
  Never `VITE_`-prefixed.
- **Remove:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.
- **Keep:** `RESEND_API_KEY`, `AUTH_SECRET`, `VITE_GOOGLE_PLACES_API_KEY`,
  Geoapify/Overpass config.

Side effect: the anon key disappears from the client bundle — a security improvement.

---

## Phase 5 — Verify & cut over

1. `bun tsc -b --noEmit` + `bun vitest run`. Note: unit tests currently
   mock/import `supabase`, so several test files need their setup updated to the
   new fetch-based modules.
2. Point **dev** at Neon and smoke-test: check-in, party create, follow + message
   badge, ratings, avatar upload, admin reset, offline queue drain.
3. Set production `DATABASE_URL` (Freebuff deploy env), deploy, re-smoke prod.
4. **Rollback plan:** keep the Supabase project alive + the dump file for at least
   a week. Rollback = revert `DATABASE_URL` env and redeploy. Supabase data is
   never deleted during cutover.

---

## Phase 6 — Cleanup

- Remove `@supabase/supabase-js` from `package.json`; delete `src/lib/supabase.ts`.
- Replace `supabase-schema.sql` with a clean `neon-schema.sql`
  (no RLS/policies/grants).
- Update README + env docs.

---

## Risks & gotchas

1. **Free-tier size is the #1 blocker** — verify size before anything else.
2. **RLS** — must be disabled on Neon (Phase 1 step 3) or writes fail with
   permission errors.
3. **`gen_random_uuid()`, `jsonb`, `text[]`, `timestamptz`** — standard Postgres,
   work unchanged in Neon.
4. **Supabase-js query sugar** — `.ilike`, `.or`, `.match`, `.upsert(onConflict)`,
   `.maybeSingle`, `.single`, `.count('exact')` must be rewritten to explicit SQL.
   Go domain-by-domain and test each.
5. **Offline queues** — `sync.ts` / `ratings.ts` are easy to miss; leave them on
   PostgREST and offline check-ins silently break after cutover.
6. **Dev vs prod auth** — auth is duplicated in `vite.config.ts` (dev) and
   `api/auth/*` (prod); only the DB-touching parts change, but verify both paths.

---

## Effort estimate

| Phase | Estimate |
|---|---|
| 0–1: migrate + verify data | ~half day |
| 2: 5 serverless functions | ~half day |
| 3: client libs + ~8 new endpoints | ~2 focused days |
| 4–6: env, tests, cutover, cleanup | ~half day |
| **Total** | **~3–4 working days + one cutover window** |
