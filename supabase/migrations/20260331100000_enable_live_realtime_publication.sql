do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_match_leaderboard'
  ) then
    execute 'alter publication supabase_realtime add table public.league_match_leaderboard';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fantasy_teams'
  ) then
    execute 'alter publication supabase_realtime add table public.fantasy_teams';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_players'
  ) then
    execute 'alter publication supabase_realtime add table public.match_players';
  end if;
end
$$;