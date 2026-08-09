-- ============================================================
-- 8A7 SELF-STUDY — SUPABASE SCHEMA
-- Chạy toàn bộ file này trong Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Core tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','teacher')),
  mshs text unique,
  full_name text not null,
  created_at timestamptz not null default now(),
  constraint student_requires_mshs check ((role = 'student' and mshs is not null) or role = 'teacher')
);

create table if not exists public.student_roster (
  mshs text primary key check (mshs ~ '^\d{7}$'),
  full_name text not null,
  claimed_user_id uuid unique references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  study_date date not null,
  period smallint not null check (period between 1 and 9),
  activity_type text not null,
  subject text not null,
  task text not null check (char_length(trim(task)) between 2 and 1000),
  priority text not null check (priority in ('Cao','Trung bình','Thấp')),
  goal text not null check (char_length(trim(goal)) between 2 and 1000),
  use_device boolean not null default false,
  device_purpose text check (device_purpose is null or char_length(device_purpose) <= 500),
  fallback_activity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, study_date, period),
  constraint device_purpose_required check (not use_device or nullif(trim(device_purpose),'') is not null)
);

create table if not exists public.reflections (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  completion_status text not null check (completion_status in ('Hoàn thành','Một phần','Chưa hoàn thành')),
  note text check (note is null or char_length(note) <= 1000),
  need_help boolean not null default false,
  help_note text check (help_note is null or char_length(help_note) <= 500),
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint help_note_required check (not need_help or nullif(trim(help_note),'') is not null)
);

create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('image','file','link')),
  storage_path text,
  external_url text,
  display_name text check (display_name is null or char_length(display_name) <= 255),
  created_at timestamptz not null default now(),
  constraint evidence_location check (
    (kind in ('image','file') and storage_path is not null and external_url is null)
    or (kind = 'link' and external_url is not null and storage_path is null)
  )
);

-- ---------- Helpers ----------
create or replace function public.vn_today()
returns date
language sql
stable
set search_path = public
as $$
  select timezone('Asia/Ho_Chi_Minh', now())::date;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_reflections_updated_at on public.reflections;
create trigger trg_reflections_updated_at before update on public.reflections
for each row execute function public.set_updated_at();

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

-- Max 3 evidence rows per plan.
create or replace function public.limit_evidence_per_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.evidence where plan_id = new.plan_id) >= 3 then
    raise exception 'Tối đa 3 minh chứng cho mỗi kế hoạch';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_evidence_per_plan on public.evidence;
create trigger trg_limit_evidence_per_plan before insert on public.evidence
for each row execute function public.limit_evidence_per_plan();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.student_roster enable row level security;
alter table public.plans enable row level security;
alter table public.reflections enable row level security;
alter table public.evidence enable row level security;

-- Clean existing policies when re-running this file.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname='public' and tablename in ('profiles','student_roster','plans','reflections','evidence')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- PROFILES: student reads only self; teacher reads all.
create policy profiles_select_self_or_teacher on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_teacher());

-- ROSTER: never exposed to students. Registration Edge Function uses service role.
create policy roster_teacher_select on public.student_roster
for select to authenticated
using (public.is_teacher());

-- PLANS
create policy plans_student_select on public.plans
for select to authenticated
using (student_id = auth.uid());

create policy plans_student_insert on public.plans
for insert to authenticated
with check (
  student_id = auth.uid()
  and study_date >= public.vn_today()
  and exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='student')
);

-- Can edit only while the OLD plan is still in the future. New date cannot be in the past.
create policy plans_student_update on public.plans
for update to authenticated
using (student_id = auth.uid() and study_date > public.vn_today())
with check (student_id = auth.uid() and study_date >= public.vn_today());

create policy plans_student_delete on public.plans
for delete to authenticated
using (student_id = auth.uid() and study_date > public.vn_today());

create policy plans_teacher_select on public.plans
for select to authenticated
using (public.is_teacher());

-- REFLECTIONS: only for own plan on or after study date.
create policy reflections_student_select on public.reflections
for select to authenticated
using (student_id = auth.uid());

create policy reflections_student_insert on public.reflections
for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.plans p
    where p.id = plan_id and p.student_id = auth.uid() and p.study_date <= public.vn_today()
  )
);

create policy reflections_student_update on public.reflections
for update to authenticated
using (
  student_id = auth.uid()
  and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid())
)
with check (
  student_id = auth.uid()
  and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid() and p.study_date <= public.vn_today())
);

create policy reflections_teacher_select on public.reflections
for select to authenticated
using (public.is_teacher());

-- EVIDENCE metadata: only own plan on/after study date; teacher can read.
create policy evidence_student_select on public.evidence
for select to authenticated
using (student_id = auth.uid());

create policy evidence_student_insert on public.evidence
for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.plans p
    where p.id = plan_id and p.student_id = auth.uid() and p.study_date <= public.vn_today()
  )
);

create policy evidence_student_delete on public.evidence
for delete to authenticated
using (
  student_id = auth.uid()
  and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid())
);

create policy evidence_teacher_select on public.evidence
for select to authenticated
using (public.is_teacher());

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence','evidence',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Drop only policies owned by this app if they exist.
drop policy if exists storage_student_insert_own_folder on storage.objects;
drop policy if exists storage_student_select_own_or_teacher on storage.objects;
drop policy if exists storage_student_delete_own on storage.objects;

create policy storage_student_insert_own_folder on storage.objects
for insert to authenticated
with check (
  bucket_id='evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.plans p
    where p.student_id = auth.uid()
      and p.id::text = (storage.foldername(name))[2]
      and p.study_date <= public.vn_today()
  )
);

create policy storage_student_select_own_or_teacher on storage.objects
for select to authenticated
using (
  bucket_id='evidence'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher())
);

create policy storage_student_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.plans p
    where p.student_id = auth.uid()
      and p.id::text = (storage.foldername(name))[2]
  )
);

-- ---------- API grants ----------
-- RLS is the primary row-level boundary. Grants are the second layer: revoke Supabase's
-- default blanket grants first, then hand back only the verbs each role actually needs.
revoke all on public.profiles, public.student_roster, public.plans, public.reflections, public.evidence from anon;
revoke all on public.profiles, public.student_roster, public.plans, public.reflections, public.evidence from authenticated;

grant select on public.profiles, public.student_roster, public.plans, public.reflections, public.evidence to authenticated;
-- profiles / student_roster stay read-only: they are written only by the Edge Functions
-- and scripts/create-teacher.mjs, which use the service role and bypass both layers.
grant insert, update, delete on public.plans to authenticated;
grant insert, update on public.reflections to authenticated;
grant insert, delete on public.evidence to authenticated;

-- Roster is seeded separately via supabase/seed-roster.private.sql.
