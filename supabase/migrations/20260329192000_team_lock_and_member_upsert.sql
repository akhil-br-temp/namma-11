create policy "Users can update own league membership" on public.league_members
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

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
  team_locked boolean;
begin
  select (m.team_lock_time is not null and now() >= m.team_lock_time)
    into team_locked
  from public.fantasy_teams ft
  join public.matches m on m.id = ft.match_id
  where ft.id = coalesce(new.fantasy_team_id, old.fantasy_team_id);

  if coalesce(team_locked, false) then
    raise exception 'Teams are locked for this match';
  end if;

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
