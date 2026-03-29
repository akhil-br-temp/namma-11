# Namma 11 - IPL Fantasy App

Mobile-first private league fantasy cricket app for IPL 2026.

## Current Status

Phase 1 foundation is started:

- Next.js App Router + Tailwind setup
- Supabase SSR auth scaffolding (Google + email login screen)
- Protected app routes with middleware
- Planned route structure for dashboard, matches, teams, league, and live match views
- Initial Supabase migration with core schema + RLS baseline

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create local environment file:

```bash
cp .env.example .env.local
```

3. Fill Supabase and API keys in `.env.local`.

4. Start the app:

```bash
npm run dev
```

Open http://localhost:3000.

## Database

Initial schema migration is in:

- `supabase/migrations/20260329170000_initial_schema.sql`

Apply it using Supabase CLI in your linked project.

## Next Implementation Steps

- Add actual auth callbacks and profile onboarding
- Build fixture sync route with CricData + EntitySport failover
- Implement team builder with role and credit validations against live data
- Add league create/join APIs and leaderboard queries
