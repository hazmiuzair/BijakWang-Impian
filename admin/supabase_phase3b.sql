-- =========================================================
-- BIJAKWANG IMPIAN - PHASE 3B
-- ADMIN AUTH + ADMIN-ONLY QUESTION MANAGEMENT
-- =========================================================

-- 1) Admin table
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Admin can see only their own admin row.
drop policy if exists "admin_users_self_select" on public.admin_users;
create policy "admin_users_self_select"
on public.admin_users
for select
to authenticated
using (auth.uid() = user_id);


-- 2) Helper: questions remain publicly readable when active,
-- but writes are restricted to authenticated users listed in admin_users.

drop policy if exists "questions_select_active" on public.questions;
create policy "questions_select_active"
on public.questions
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "questions_admin_insert" on public.questions;
create policy "questions_admin_insert"
on public.questions
for insert
to authenticated
with check (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "questions_admin_update" on public.questions;
create policy "questions_admin_update"
on public.questions
for update
to authenticated
using (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "questions_admin_delete" on public.questions;
create policy "questions_admin_delete"
on public.questions
for delete
to authenticated
using (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

-- 3) Verification
select 'admin_users table ready' as status;
select id, category, answer, is_active
from public.questions
order by created_at desc;
