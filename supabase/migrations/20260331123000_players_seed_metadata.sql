alter table public.players
  add column if not exists normalized_name text,
  add column if not exists seed_season integer,
  add column if not exists source_provider text,
  add column if not exists source_url text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists seed_profile_url text,
  add column if not exists nationality text,
  add column if not exists batting_style text,
  add column if not exists bowling_style text;

update public.players
set normalized_name = lower(regexp_replace(coalesce(name, ''), '[^a-z0-9]+', '', 'g'))
where normalized_name is null or normalized_name = '';

create index if not exists idx_players_normalized_team_season
  on public.players (normalized_name, ipl_team_id, seed_season);

create index if not exists idx_players_seed_season
  on public.players (seed_season);

create or replace function public.set_player_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := lower(regexp_replace(coalesce(new.name, ''), '[^a-z0-9]+', '', 'g'));
  return new;
end;
$$;

drop trigger if exists trg_players_set_normalized_name on public.players;
create trigger trg_players_set_normalized_name
before insert or update of name on public.players
for each row execute function public.set_player_normalized_name();
