# Project conventions

## Commit messages
- Always describe the changes in the commit message (not just version numbers like "1.1.6")
- For version bumps, use a descriptive message plus version: "Add feature X, bump to 1.1.6"

## Build
- `npm run build` runs `tsc -b && vite build`
- Always verify the build passes before committing

## Key implementation details
- Avatar images are stored as data URLs directly in `users.avatar_url` column (not Supabase Storage)
- Reverse geocoding uses Nominatim API via `src/lib/places.ts`
- Serverless functions (`api/*.js`) use `SUPABASE_SERVICE_ROLE_KEY` env var
- Client uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` env vars
