# Database Trim Guide

Instructions for finding what's using space and safely trimming the database.

> ⚠️ **Current status (checked 2026-08-16):** the database is only **~4.6 MB** — well
> under the 500 MB free-tier cap. It does **not** need trimming. The
> "The quota has been exceeded" error is a Supabase *platform* issue (typically a
> paused free project), **not** a storage issue. Only use the steps below if the
> size query shows usage approaching the cap.

---

## Step 1 — Diagnose (find what's actually big)

Run these in the Supabase SQL editor.

### Per-table size + exact row counts

```sql
WITH sizes AS (
  SELECT c.relname AS table_name,
         pg_total_relation_size(c.oid) AS total_bytes,
         pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
         pg_relation_size(c.oid) AS data_bytes,
         pg_indexes_size(c.oid) AS index_bytes
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
),
counts AS (
  SELECT 'categories' t, count(*) c FROM categories
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
  UNION ALL SELECT 'messages', count(*) FROM messages
)
SELECT s.table_name, s.total_size, s.index_bytes, coalesce(ct.c, 0) AS exact_rows
FROM sizes s
LEFT JOIN counts ct ON ct.t = s.table_name
ORDER BY s.total_bytes DESC;
```

### Where the blob space is hiding

Avatars and place photos are stored as **base64 data URLs** inside the DB columns.
This query shows how much space those blobs use.

```sql
SELECT 'place_photos' AS src,
       count(*) AS rows,
       pg_size_pretty(sum(octet_length(photo_url)::bigint)) AS blob_bytes
FROM place_photos
UNION ALL
SELECT 'users.avatar', count(*),
       pg_size_pretty(sum(octet_length(avatar_url)::bigint))
FROM users WHERE avatar_url IS NOT NULL
UNION ALL
SELECT 'places.photo', count(*),
       pg_size_pretty(sum(octet_length(photo_url)::bigint))
FROM places WHERE photo_url IS NOT NULL;

-- Biggest individual offenders
SELECT id, user_name, created_at,
       pg_size_pretty(octet_length(photo_url)::bigint) AS size
FROM place_photos
ORDER BY octet_length(photo_url) DESC
LIMIT 20;
```

> Note: `octet_length()` returns `integer`, which is ambiguous for
> `pg_size_pretty()` — always cast with `::bigint`.

---

## Step 2 — Trim in this order (safe → aggressive)

### Tier 1 — safe, no user history lost

```sql
-- 1. Place photos (base64 blobs). Photos stay on the devices that uploaded them.
DELETE FROM place_photos;
-- or keep recent ones:
-- DELETE FROM place_photos WHERE created_at < now() - interval '7 days';

-- 2. Read messages older than 14 days (the client-side follower fanout)
DELETE FROM messages
WHERE read_at IS NOT NULL
  AND created_at < now() - interval '14 days';

-- 3. Ended parties + everything attached (cascades members/check-ins/activity)
DELETE FROM parties
WHERE ends_at < now() - interval '14 days';

-- 4. (Optional) Free avatar space — users lose profile pictures, keep stats
UPDATE users SET avatar_url = NULL;
-- or only the heaviest:
-- UPDATE users SET avatar_url = NULL
-- WHERE octet_length(avatar_url) > 200000;   -- > ~200 KB
```

### Tier 2 — trims history (only if still over)

```sql
-- 5. Old check-ins (affects leaderboard / lifetime stats!)
--    Cascades party_check_ins via FK.
DELETE FROM check_ins
WHERE created_at < now() - interval '90 days';

-- 6. Imported places that nobody ever checked into
--    Cascades their photos + ratings.
DELETE FROM places p
WHERE NOT EXISTS (SELECT 1 FROM check_ins ci WHERE ci.place_id = p.id)
  AND p.created_at < now() - interval '30 days';
```

### Tier 3 — aggressive (last resort)

```sql
-- Keep only the latest 50 check-ins per user
DELETE FROM check_ins c
WHERE c.id NOT IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY user_name ORDER BY created_at DESC) rn
    FROM check_ins
  ) ranked WHERE rn <= 50
);
```

---

## Step 3 — Actually reclaim the disk

`DELETE` marks rows as dead but **doesn't shrink the table** on disk. Run after
deleting, during low traffic (it briefly locks tables):

```sql
VACUUM FULL;
```

If the DB is at the hard cap and the full vacuum fails for lack of space, vacuum
the biggest table alone first:

```sql
VACUUM FULL place_photos;
```

---

## Step 4 — Prevent it from ever hitting the cap

1. **Stop storing images in Postgres (the real fix).** Move avatars/photos to
   object storage (e.g. Cloudflare R2, free 10 GB) and store only a short URL in
   `avatar_url` / `photo_url`. This keeps all images forever while keeping the DB
   tiny.
2. **Retention policy** (run on a schedule or lazily on writes):
   - `messages`: delete read > 14 days
   - `parties`: delete ended > 14 days
   - `check_ins`: delete > 90 days (only if lifetime leaderboards aren't needed)
3. **Cap places import** — the radius is already limited; additionally drop
   imported places with zero check-ins after 30 days.
4. **Schedule it** — either a `/api/cleanup` serverless function hit by a cron,
   or `pg_cron` running the Tier-1 SQL daily.

---

## Foreign-key cascade cheat sheet

Deleting a parent row automatically removes its children via `ON DELETE CASCADE`:

- `places` → `check_ins`, `place_photos`, `place_ratings`, `messages.place_id`
- `parties` → `party_members`, `party_check_ins`, `party_activity`
- `check_ins` → `party_check_ins`

`users`, `follows`, `app_config`, `categories` have no cascade children.
