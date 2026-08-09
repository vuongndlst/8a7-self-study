-- ============================================================
-- SELF-STUDY — SUPABASE SCHEMA v2 (đa năm học, đa lớp)
-- Chạy toàn bộ file này trong Supabase SQL Editor.
--
-- Mô hình: một học sinh giữ MỘT tài khoản suốt các năm.
--   students     : hồ sơ theo em (MSHS + họ tên), tồn tại qua nhiều năm
--   school_years : 2026-2027, 2027-2028…  (chỉ một năm is_active)
--   classes      : 8A7 của năm nào
--   enrollments  : em nào học lớp nào  → lên lớp = thêm dòng mới, giữ nguyên lịch sử
--   class_teachers: giáo viên phụ trách lớp nào → GV chỉ thấy lớp của mình
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Nâng cấp từ v1 ----------
-- v2 đổi cấu trúc bảng (plans thêm class_id NOT NULL, roster tách thành
-- students + enrollments) nên phải dựng lại các bảng dữ liệu tự học.
--
-- MẤT GÌ: toàn bộ plans / reflections / evidence / danh sách lớp, và dòng
--         trong profiles.
-- KHÔNG MẤT: tài khoản đăng nhập trong auth.users (không đụng tới), file
--         trong Storage, và danh sách 31 HS — nạp lại bằng seed-roster.private.sql.
-- SAU KHI CHẠY: chạy lại `npm run create-teacher` rồi seed-roster.private.sql.
--
-- Nếu đã có dữ liệu thật của học sinh, ĐỪNG chạy khối này — hãy viết migration
-- chuyển dữ liệu sang cấu trúc mới thay vì dựng lại.
drop table if exists public.evidence       cascade;
drop table if exists public.reflections    cascade;
drop table if exists public.plans          cascade;
drop table if exists public.student_roster cascade;
drop table if exists public.enrollments    cascade;
drop table if exists public.students       cascade;
drop table if exists public.class_teachers cascade;
drop table if exists public.profiles       cascade;
drop table if exists public.classes        cascade;
drop table if exists public.school_years   cascade;

-- ---------- Khung năm học / lớp ----------
create table if not exists public.school_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                    -- '2026-2027'
  start_date date not null,
  end_date date not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint year_range check (end_date > start_date)
);

-- Chỉ được phép có đúng một năm học đang hoạt động.
create unique index if not exists one_active_school_year
  on public.school_years ((is_active)) where is_active;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name text not null,                           -- '8A7'
  created_at timestamptz not null default now(),
  unique (school_year_id, name)
);

-- ---------- Người dùng ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('student','teacher')),
  mshs text unique,
  full_name text not null,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  constraint student_requires_mshs check ((role = 'student' and mshs is not null) or role = 'teacher')
);

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

-- ---------- Học sinh & ghi danh ----------
create table if not exists public.students (
  mshs text primary key check (mshs ~ '^\d{7}$'),
  full_name text not null,
  claimed_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  mshs text not null references public.students(mshs) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (mshs, class_id)
);

-- ---------- Dữ liệu tự học ----------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  study_date date not null,
  period smallint not null check (period between 1 and 9),
  activity_type text not null,
  subject text not null,
  task text not null check (char_length(trim(task)) between 2 and 1000),
  priority text not null check (priority in ('Cao','Trung bình','Thấp')),
  goal text not null check (char_length(trim(goal)) between 2 and 1000),
  use_device boolean not null default false,
  device_purpose text check (device_purpose is null or char_length(device_purpose) <= 500),
  -- Giáo viên duyệt đăng ký thiết bị điện tử
  device_status text not null default 'Không dùng'
    check (device_status in ('Không dùng','Chờ duyệt','Đã duyệt','Từ chối')),
  device_reviewed_by uuid references public.profiles(id) on delete set null,
  device_reviewed_at timestamptz,
  device_review_note text check (device_review_note is null or char_length(device_review_note) <= 500),
  fallback_activity text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id, study_date, period),
  constraint device_purpose_required check (not use_device or nullif(trim(device_purpose),'') is not null),
  constraint device_status_matches_use check ((use_device and device_status <> 'Không dùng') or (not use_device and device_status = 'Không dùng'))
);

create table if not exists public.reflections (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  completion_status text not null check (completion_status in ('Hoàn thành','Một phần','Chưa hoàn thành')),
  note text check (note is null or char_length(note) <= 1000),
  need_help boolean not null default false,
  help_note text check (help_note is null or char_length(help_note) <= 500),
  -- Phản hồi của giáo viên
  teacher_comment text check (teacher_comment is null or char_length(teacher_comment) <= 1000),
  teacher_comment_by uuid references public.profiles(id) on delete set null,
  teacher_comment_at timestamptz,
  help_resolved boolean not null default false,
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

-- ---------- Hàm tiện ích ----------
create or replace function public.vn_today()
returns date language sql stable set search_path = public as $$
  select timezone('Asia/Ho_Chi_Minh', now())::date;
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_plans_updated_at on public.plans;
create trigger trg_plans_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists trg_reflections_updated_at on public.reflections;
create trigger trg_reflections_updated_at before update on public.reflections
for each row execute function public.set_updated_at();

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher');
$$;

-- Giáo viên đang đăng nhập có phụ trách lớp này không?
create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_teachers
    where class_id = p_class and teacher_id = auth.uid()
  );
$$;

-- Giáo viên đang đăng nhập có phụ trách học sinh này (trong năm đang hoạt động) không?
create or replace function public.teaches_user(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students s
    join public.enrollments e   on e.mshs = s.mshs and e.is_active
    join public.classes c       on c.id = e.class_id
    join public.school_years y  on y.id = c.school_year_id and y.is_active
    join public.class_teachers ct on ct.class_id = c.id
    where s.claimed_user_id = p_student and ct.teacher_id = auth.uid()
  );
$$;

-- Giáo viên đang đăng nhập có phụ trách MSHS này không?
-- Phải là security definer: policy của students tra bảng enrollments, mà policy của
-- enrollments lại tra ngược students → Postgres báo 42P17 infinite recursion.
-- Hàm definer bỏ qua RLS bên trong nên cắt được vòng lặp.
create or replace function public.teaches_mshs(p_mshs text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c         on c.id = e.class_id
    join public.school_years y    on y.id = c.school_year_id and y.is_active
    join public.class_teachers ct on ct.class_id = c.id
    where e.mshs = p_mshs and e.is_active and ct.teacher_id = auth.uid()
  );
$$;

-- MSHS của học sinh đang đăng nhập (cũng để cắt vòng lặp policy).
create or replace function public.my_mshs()
returns text language sql stable security definer set search_path = public as $$
  select mshs from public.students where claimed_user_id = auth.uid() limit 1;
$$;

-- Lớp của học sinh trong năm đang hoạt động.
create or replace function public.student_active_class(p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.class_id
  from public.students s
  join public.enrollments e  on e.mshs = s.mshs and e.is_active
  join public.classes c      on c.id = e.class_id
  join public.school_years y on y.id = c.school_year_id and y.is_active
  where s.claimed_user_id = p_user
  limit 1;
$$;

revoke all on function public.is_teacher(), public.teaches_class(uuid), public.teaches_user(uuid),
                      public.teaches_mshs(text), public.my_mshs(), public.student_active_class(uuid) from public;
grant execute on function public.is_teacher(), public.teaches_class(uuid), public.teaches_user(uuid),
                          public.teaches_mshs(text), public.my_mshs(), public.student_active_class(uuid) to authenticated;

-- Khi TẠO kế hoạch: lớp do server gán, và trạng thái duyệt thiết bị luôn bắt đầu
-- ở 'Chờ duyệt' — học sinh không thể tự khai là đã được duyệt.
create or replace function public.plans_set_class()
returns trigger language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  c := public.student_active_class(new.student_id);
  if c is null then
    raise exception 'Học sinh chưa được ghi danh vào lớp nào của năm học hiện hành';
  end if;
  new.class_id := c;

  -- auth.uid() null nghĩa là service role (script quản trị / seed) — giữ nguyên giá trị.
  if auth.uid() is not null then
    new.device_status      := case when new.use_device then 'Chờ duyệt' else 'Không dùng' end;
    new.device_reviewed_by := null;
    new.device_reviewed_at := null;
    new.device_review_note := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plans_set_class on public.plans;
create trigger trg_plans_set_class before insert on public.plans
for each row execute function public.plans_set_class();

-- Tối đa 3 minh chứng mỗi kế hoạch.
create or replace function public.limit_evidence_per_plan()
returns trigger language plpgsql security definer set search_path = public as $$
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

-- ---------- Phân tách cột theo vai trò ----------
-- RLS chặn được DÒNG nhưng không chặn được CỘT. Hai trigger dưới đây bảo đảm
-- học sinh không sửa được ô của giáo viên và ngược lại.

create or replace function public.plans_guard_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.student_id then
    -- Học sinh: không đụng vào kết quả duyệt thiết bị.
    new.device_status      := old.device_status;
    new.device_reviewed_by := old.device_reviewed_by;
    new.device_reviewed_at := old.device_reviewed_at;
    new.device_review_note := old.device_review_note;
    -- Bật/tắt thiết bị thì trạng thái duyệt quay về đúng trạng thái khởi đầu.
    if new.use_device is distinct from old.use_device then
      new.device_status := case when new.use_device then 'Chờ duyệt' else 'Không dùng' end;
      new.device_reviewed_by := null;
      new.device_reviewed_at := null;
      new.device_review_note := null;
    end if;
  elsif public.is_teacher() then
    -- Giáo viên: CHỈ được duyệt thiết bị, không sửa nội dung kế hoạch của HS.
    new.student_id        := old.student_id;
    new.class_id          := old.class_id;
    new.study_date        := old.study_date;
    new.period            := old.period;
    new.activity_type     := old.activity_type;
    new.subject           := old.subject;
    new.task              := old.task;
    new.priority          := old.priority;
    new.goal              := old.goal;
    new.use_device        := old.use_device;
    new.device_purpose    := old.device_purpose;
    new.fallback_activity := old.fallback_activity;
    if new.device_status is distinct from old.device_status then
      new.device_reviewed_by := auth.uid();
      new.device_reviewed_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plans_guard_columns on public.plans;
create trigger trg_plans_guard_columns before update on public.plans
for each row execute function public.plans_guard_columns();

create or replace function public.reflections_guard_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.student_id then
    -- Học sinh: không tự viết nhận xét giáo viên, không tự đánh dấu đã xử lý.
    new.teacher_comment    := old.teacher_comment;
    new.teacher_comment_by := old.teacher_comment_by;
    new.teacher_comment_at := old.teacher_comment_at;
    new.help_resolved      := old.help_resolved;
  elsif public.is_teacher() then
    -- Giáo viên: CHỈ nhận xét và đánh dấu đã xử lý.
    new.student_id        := old.student_id;
    new.completion_status := old.completion_status;
    new.note              := old.note;
    new.need_help         := old.need_help;
    new.help_note         := old.help_note;
    new.completed_at      := old.completed_at;
    if new.teacher_comment is distinct from old.teacher_comment then
      new.teacher_comment_by := auth.uid();
      new.teacher_comment_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reflections_guard_columns on public.reflections;
create trigger trg_reflections_guard_columns before update on public.reflections
for each row execute function public.reflections_guard_columns();

-- ---------- RLS ----------
alter table public.school_years   enable row level security;
alter table public.classes        enable row level security;
alter table public.class_teachers enable row level security;
alter table public.students       enable row level security;
alter table public.enrollments    enable row level security;
alter table public.profiles       enable row level security;
alter table public.plans          enable row level security;
alter table public.reflections    enable row level security;
alter table public.evidence       enable row level security;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname='public'
             and tablename in ('school_years','classes','class_teachers','students','enrollments',
                               'profiles','plans','reflections','evidence')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Khung năm học / lớp: ai đăng nhập cũng đọc được (chỉ là tên năm và tên lớp).
create policy years_read on public.school_years
for select to authenticated using (true);

create policy classes_read on public.classes
for select to authenticated using (true);

create policy class_teachers_read on public.class_teachers
for select to authenticated using (teacher_id = auth.uid());

-- Danh sách lớp: học sinh KHÔNG đọc được của bạn khác; GV chỉ đọc lớp mình phụ trách.
-- Lọc theo GHI DANH chứ không theo claimed_user_id — nếu không, em nào chưa tạo
-- tài khoản sẽ biến mất khỏi danh sách lớp của giáo viên.
create policy students_teacher_read on public.students
for select to authenticated using (public.teaches_mshs(mshs));

-- Học sinh đọc đúng dòng của chính mình — để biết mình đang học lớp nào.
create policy students_self_read on public.students
for select to authenticated using (claimed_user_id = auth.uid());

create policy enrollments_teacher_read on public.enrollments
for select to authenticated using (public.teaches_class(class_id));

create policy enrollments_student_read on public.enrollments
for select to authenticated using (mshs = public.my_mshs());

-- Hồ sơ: HS đọc của mình; GV đọc HS lớp mình + chính mình.
create policy profiles_read on public.profiles
for select to authenticated
using (id = auth.uid() or public.teaches_user(id));

-- KẾ HOẠCH
create policy plans_student_select on public.plans
for select to authenticated using (student_id = auth.uid());

create policy plans_student_insert on public.plans
for insert to authenticated
with check (
  student_id = auth.uid()
  and study_date >= public.vn_today()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'student')
);

create policy plans_student_update on public.plans
for update to authenticated
using (student_id = auth.uid() and study_date > public.vn_today())
with check (student_id = auth.uid() and study_date >= public.vn_today());

create policy plans_student_delete on public.plans
for delete to authenticated
using (student_id = auth.uid() and study_date > public.vn_today());

create policy plans_teacher_select on public.plans
for select to authenticated using (public.teaches_class(class_id));

-- GV được UPDATE để duyệt thiết bị; trigger phía trên khóa mọi cột khác lại.
create policy plans_teacher_update on public.plans
for update to authenticated
using (public.teaches_class(class_id))
with check (public.teaches_class(class_id));

-- PHẢN TƯ
create policy reflections_student_select on public.reflections
for select to authenticated using (student_id = auth.uid());

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
using (student_id = auth.uid() and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid()))
with check (
  student_id = auth.uid()
  and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid() and p.study_date <= public.vn_today())
);

create policy reflections_teacher_select on public.reflections
for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and public.teaches_class(p.class_id)));

create policy reflections_teacher_update on public.reflections
for update to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and public.teaches_class(p.class_id)))
with check (exists (select 1 from public.plans p where p.id = plan_id and public.teaches_class(p.class_id)));

-- MINH CHỨNG
create policy evidence_student_select on public.evidence
for select to authenticated using (student_id = auth.uid());

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
using (student_id = auth.uid() and exists (select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid()));

create policy evidence_teacher_select on public.evidence
for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and public.teaches_class(p.class_id)));

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence','evidence',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.teaches_user(((storage.foldername(name))[1])::uuid)
  )
);

create policy storage_student_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id='evidence'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.plans p
    where p.student_id = auth.uid() and p.id::text = (storage.foldername(name))[2]
  )
);

-- ---------- Quyền cấp bảng ----------
-- RLS là lớp chặn theo dòng. Grant là lớp thứ hai: thu hồi toàn bộ quyền mặc định
-- của Supabase rồi trả lại đúng những verb thực sự cần.
revoke all on public.school_years, public.classes, public.class_teachers, public.students,
              public.enrollments, public.profiles, public.plans, public.reflections, public.evidence
       from anon, authenticated;

grant select on public.school_years, public.classes, public.class_teachers, public.students,
                public.enrollments, public.profiles, public.plans, public.reflections, public.evidence
      to authenticated;

-- profiles / students / enrollments / classes chỉ được ghi bởi Edge Function và script
-- quản trị (chạy bằng service role, bỏ qua cả hai lớp).
grant insert, update, delete on public.plans to authenticated;
grant insert, update on public.reflections to authenticated;
grant insert, delete on public.evidence to authenticated;

-- Danh sách lớp được nạp riêng bằng supabase/seed-roster.private.sql
