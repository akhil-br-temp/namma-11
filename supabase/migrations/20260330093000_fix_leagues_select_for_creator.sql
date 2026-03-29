drop policy if exists "Users can read leagues they belong to" on public.leagues;

create policy "Users can read leagues they belong to" on public.leagues
for select
using (
  created_by = auth.uid()
  or public.is_league_member(id, auth.uid())
);
