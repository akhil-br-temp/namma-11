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

## Cron Endpoints

Protected cron routes (all require `CRON_SECRET`):

- `/api/cron/sync-fixtures` -> sync IPL fixtures and teams
- `/api/cron/sync-squads` -> sync full match squads into `players` and `match_players`
- `/api/cron/sync-lineups` -> poll playing XI and set lock windows
- `/api/cron/live-score` -> advance match statuses and lock teams by lock time

## CricketData API Notes

- This app uses CricketData/CricAPI host: `https://api.cricapi.com/v1`
- `CRICDATA_API_KEY` must be the API key from developer console.
- Your CricketData website login password is not used in API requests.

### Manual Run (Local or Production)

Use Bearer auth header with your cron secret:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://namma-11.vercel.app/api/cron/sync-fixtures
curl -H "Authorization: Bearer <CRON_SECRET>" https://namma-11.vercel.app/api/cron/sync-squads
curl -H "Authorization: Bearer <CRON_SECRET>" https://namma-11.vercel.app/api/cron/sync-lineups
curl -H "Authorization: Bearer <CRON_SECRET>" https://namma-11.vercel.app/api/cron/live-score
```

You can also call via query param when testing quickly:

```bash
https://namma-11.vercel.app/api/cron/sync-fixtures?secret=<CRON_SECRET>
```

## Cron Setup

### Vercel Cron

1. Ensure `CRON_SECRET` is added in Vercel Project -> Settings -> Environment Variables.
2. Deploy this repo with `vercel.json` included.
3. Vercel will schedule:
	 - fixtures: `0 0 * * *` (daily UTC)
	 - squads: `15 0 * * *` (daily UTC)
	 - lineups: `30 0 * * *` (daily UTC)
	 - live-score pipeline: `45 0 * * *` (daily UTC)
4. Check runs in Vercel Dashboard -> Functions -> Cron Jobs.

Note: On Vercel Hobby, cron jobs must run at most once per day. If you need higher-frequency lineups/live updates, use Supabase `pg_cron` (or upgrade to Vercel Pro).

### Supabase Cron (pg_cron)

If you prefer Supabase scheduling, run SQL in Supabase SQL Editor:

```sql
select cron.schedule(
	'ipl-sync-fixtures',
	'0 0 * * *',
	$$
	select net.http_get(
		url := 'https://namma-11.vercel.app/api/cron/sync-fixtures?secret=' || current_setting('app.settings.cron_secret', true)
	);
	$$
);

select cron.schedule(
	'ipl-sync-lineups',
	'*/30 * * * *',
	$$
	select net.http_get(
		url := 'https://namma-11.vercel.app/api/cron/sync-lineups?secret=' || current_setting('app.settings.cron_secret', true)
	);
	$$
);

select cron.schedule(
	'ipl-live-score',
	'* * * * *',
	$$
	select net.http_get(
		url := 'https://namma-11.vercel.app/api/cron/live-score?secret=' || current_setting('app.settings.cron_secret', true)
	);
	$$
);
```

If you do not store `cron_secret` in DB settings, replace it directly in URL for initial setup.

## Next Implementation Steps

- Add actual auth callbacks and profile onboarding
- Build fixture sync route with CricData + EntitySport failover
- Implement team builder with role and credit validations against live data
- Add league create/join APIs and leaderboard queries
