create or replace function public.is_league_member(target_league_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members lm
    where lm.league_id = target_league_id
      and lm.user_id = target_user_id
  );
$$;

revoke all on function public.is_league_member(uuid, uuid) from public;
grant execute on function public.is_league_member(uuid, uuid) to authenticated;

drop policy if exists "Users can read leagues they belong to" on public.leagues;
create policy "Users can read leagues they belong to" on public.leagues
for select using (
  public.is_league_member(id, auth.uid())
);

drop policy if exists "Users can read members in their leagues" on public.league_members;
create policy "Users can read members in their leagues" on public.league_members
for select using (
  public.is_league_member(league_id, auth.uid())
);
