create extension if not exists pgcrypto;

create table if not exists public.ipl_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  logo_url text,
  api_team_id text
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  api_player_id text unique not null,
  name text not null,
  role text not null check (role in ('WK', 'BAT', 'AR', 'BOWL')),
  ipl_team_id uuid references public.ipl_teams(id),
  credit_value numeric(4,1) not null default 8.0,
  is_overseas boolean not null default false,
  photo_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  api_match_id text unique not null,
  team_a_id uuid references public.ipl_teams(id),
  team_b_id uuid references public.ipl_teams(id),
  match_date timestamptz not null,
  venue text,
  status text not null default 'upcoming' check (status in ('upcoming', 'lineup_announced', 'live', 'completed')),
  team_lock_time timestamptz,
  lineup_announced_at timestamptz,
  api_raw_scorecard jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id),
  is_playing boolean not null default false,
  is_impact_player boolean not null default false,
  is_concussion_substitute boolean not null default false,
  fantasy_points numeric(7,1) not null default 0,
  point_breakdown jsonb,
  last_updated timestamptz not null default now(),
  unique (match_id, player_id)
);

create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create table if not exists public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create table if not exists public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  league_id uuid not null references public.leagues(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  team_name text,
  captain_player_id uuid references public.players(id),
  vice_captain_player_id uuid references public.players(id),
  is_locked boolean not null default false,
  total_credits_used numeric(5,1) not null default 0,
  total_points numeric(7,1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, league_id, match_id)
);

create table if not exists public.fantasy_team_players (
  id uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.players(id),
  unique (fantasy_team_id, player_id)
);

create table if not exists public.league_match_leaderboard (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  fantasy_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  total_points numeric(7,1) not null default 0,
  rank integer,
  updated_at timestamptz not null default now(),
  unique (league_id, match_id, user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('lineup_announced', 'match_starting', 'match_complete')),
  match_id uuid references public.matches(id) on delete cascade,
  sent_at timestamptz not null default now(),
  payload jsonb
);

create index if not exists idx_matches_status_date on public.matches (status, match_date);
create index if not exists idx_match_players_match on public.match_players (match_id);
create index if not exists idx_fantasy_teams_match on public.fantasy_teams (match_id);
create index if not exists idx_fantasy_team_players_team on public.fantasy_team_players (fantasy_team_id);
create index if not exists idx_league_members_user on public.league_members (user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_touch_updated_at on public.players;
create trigger trg_players_touch_updated_at
before update on public.players
for each row execute function public.touch_updated_at();

drop trigger if exists trg_fantasy_teams_touch_updated_at on public.fantasy_teams;
create trigger trg_fantasy_teams_touch_updated_at
before update on public.fantasy_teams
for each row execute function public.touch_updated_at();

create or replace function public.assert_fantasy_team_rules()
returns trigger
language plpgsql
as $$
declare
  selected_count int;
  wk_count int;
  bat_count int;
  ar_count int;
  bowl_count int;
  max_from_one_team int;
  overseas_count int;
  credits_used numeric(5,1);
begin
  select count(*),
         count(*) filter (where p.role = 'WK'),
         count(*) filter (where p.role = 'BAT'),
         count(*) filter (where p.role = 'AR'),
         count(*) filter (where p.role = 'BOWL'),
         coalesce(max(team_count), 0),
         count(*) filter (where p.is_overseas),
         coalesce(sum(p.credit_value), 0)
    into selected_count, wk_count, bat_count, ar_count, bowl_count, max_from_one_team, overseas_count, credits_used
  from public.fantasy_team_players ftp
  join public.players p on p.id = ftp.player_id
  left join (
    select p2.ipl_team_id, count(*) as team_count
    from public.fantasy_team_players ftp2
    join public.players p2 on p2.id = ftp2.player_id
    where ftp2.fantasy_team_id = coalesce(new.fantasy_team_id, old.fantasy_team_id)
    group by p2.ipl_team_id
  ) teams on teams.ipl_team_id = p.ipl_team_id
  where ftp.fantasy_team_id = coalesce(new.fantasy_team_id, old.fantasy_team_id);

  if selected_count > 11 then
    raise exception 'A fantasy team cannot have more than 11 players';
  end if;

  if max_from_one_team > 7 then
    raise exception 'A fantasy team cannot have more than 7 players from one IPL side';
  end if;

  if overseas_count > 4 then
    raise exception 'A fantasy team cannot have more than 4 overseas players';
  end if;

  if credits_used > 100 then
    raise exception 'A fantasy team cannot exceed 100 credits';
  end if;

  if selected_count = 11 then
    if wk_count < 1 or wk_count > 4 then
      raise exception 'WK count must be between 1 and 4';
    end if;
    if bat_count < 1 or bat_count > 6 then
      raise exception 'BAT count must be between 1 and 6';
    end if;
    if ar_count < 1 or ar_count > 4 then
      raise exception 'AR count must be between 1 and 4';
    end if;
    if bowl_count < 1 or bowl_count > 6 then
      raise exception 'BOWL count must be between 1 and 6';
    end if;
  end if;

  update public.fantasy_teams
  set total_credits_used = credits_used,
      updated_at = now()
  where id = coalesce(new.fantasy_team_id, old.fantasy_team_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_assert_fantasy_team_rules_insert on public.fantasy_team_players;
create trigger trg_assert_fantasy_team_rules_insert
after insert on public.fantasy_team_players
for each row execute function public.assert_fantasy_team_rules();

drop trigger if exists trg_assert_fantasy_team_rules_delete on public.fantasy_team_players;
create trigger trg_assert_fantasy_team_rules_delete
after delete on public.fantasy_team_players
for each row execute function public.assert_fantasy_team_rules();

alter table public.ipl_teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.fantasy_teams enable row level security;
alter table public.fantasy_team_players enable row level security;
alter table public.league_match_leaderboard enable row level security;
alter table public.notifications enable row level security;

create policy "Public read for reference data" on public.ipl_teams for select using (true);
create policy "Public read for players" on public.players for select using (true);
create policy "Public read for matches" on public.matches for select using (true);
create policy "Public read for match players" on public.match_players for select using (true);

create policy "Users can read leagues they belong to" on public.leagues
for select using (
  exists (
    select 1
    from public.league_members lm
    where lm.league_id = leagues.id
      and lm.user_id = auth.uid()
  )
);

create policy "Users can create leagues" on public.leagues
for insert with check (created_by = auth.uid());

create policy "Users can read members in their leagues" on public.league_members
for select using (
  exists (
    select 1
    from public.league_members lm
    where lm.league_id = league_members.league_id
      and lm.user_id = auth.uid()
  )
);

create policy "Users can join leagues as themselves" on public.league_members
for insert with check (user_id = auth.uid());

create policy "Users can read own teams" on public.fantasy_teams
for select using (user_id = auth.uid());

create policy "Users can write own teams" on public.fantasy_teams
for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can manage players in own teams" on public.fantasy_team_players
for all using (
  exists (
    select 1
    from public.fantasy_teams ft
    where ft.id = fantasy_team_players.fantasy_team_id
      and ft.user_id = auth.uid()
  )
) with check (
  exists (
    select 1
    from public.fantasy_teams ft
    where ft.id = fantasy_team_players.fantasy_team_id
      and ft.user_id = auth.uid()
  )
);

create policy "Users can read leaderboard for own leagues" on public.league_match_leaderboard
for select using (
  exists (
    select 1
    from public.league_members lm
    where lm.league_id = league_match_leaderboard.league_id
      and lm.user_id = auth.uid()
  )
);

create policy "Users can read own notifications" on public.notifications
for select using (user_id = auth.uid());
