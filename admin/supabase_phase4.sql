-- =========================================================
-- BIJAKWANG IMPIAN - PHASE 4
-- REALTIME MULTIPLAYER + RLS FOR 1-5 PLAYERS
-- Run this ONCE in Supabase SQL Editor.
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;

alter table public.rooms enable row level security;
alter table public.players enable row level security;

drop policy if exists "rooms_public_select" on public.rooms;
create policy "rooms_public_select" on public.rooms
for select to anon, authenticated using (true);

drop policy if exists "rooms_public_insert" on public.rooms;
create policy "rooms_public_insert" on public.rooms
for insert to anon, authenticated with check (true);

drop policy if exists "rooms_public_update" on public.rooms;
create policy "rooms_public_update" on public.rooms
for update to anon, authenticated using (true) with check (true);

drop policy if exists "rooms_public_delete" on public.rooms;
create policy "rooms_public_delete" on public.rooms
for delete to anon, authenticated using (true);

drop policy if exists "players_public_select" on public.players;
create policy "players_public_select" on public.players
for select to anon, authenticated using (true);

drop policy if exists "players_public_insert" on public.players;
create policy "players_public_insert" on public.players
for insert to anon, authenticated with check (true);

drop policy if exists "players_public_update" on public.players;
create policy "players_public_update" on public.players
for update to anon, authenticated using (true) with check (true);

drop policy if exists "players_public_delete" on public.players;
create policy "players_public_delete" on public.players
for delete to anon, authenticated using (true);

create index if not exists idx_rooms_code on public.rooms(code);
create index if not exists idx_players_room_id on public.players(room_id);
create index if not exists idx_players_client_id on public.players(client_id);

select 'PHASE 4 READY' as status;
select tablename
from pg_publication_tables
where pubname='supabase_realtime'
  and schemaname='public'
  and tablename in ('rooms','players')
order by tablename;
