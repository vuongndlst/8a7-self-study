-- ============================================================================
--  QUÊN ĐĂNG KÝ TỰ HỌC — QUYỀN MIỄN TRỪ, KỶ LUẬT, VÀ MIỄN BUỔI
-- ============================================================================
--  Chạy SAU schema-7-bulk-rating.sql. Chạy lại bao nhiêu lần cũng được.
--
--  Ba việc:
--   1. Ghi nhận em nào quên đăng ký, tính theo học kỳ.
--   2. Ba lần đầu mỗi học kỳ được miễn trừ; từ lần thứ tư thì có kỷ luật.
--   3. Giáo viên "miễn" được một buổi — cho cả lớp (có sự kiện) hoặc cho
--      riêng một em (nghỉ học). Buổi đã miễn thì không ai bị tính là quên.
-- ============================================================================


-- ============================================================================
--  35. CHÍNH SÁCH THEO LỚP
-- ============================================================================
-- Mốc bắt đầu tính và ngày sang học kỳ II là DỮ LIỆU, không phải hằng số trong
-- code: mỗi lớp bắt đầu áp dụng ở một thời điểm khác nhau, và lịch học kỳ đổi
-- theo từng năm.
create table if not exists public.attendance_policy (
  class_id      uuid primary key references public.classes(id) on delete cascade,
  enabled       boolean not null default false,
  free_passes   smallint not null default 3 check (free_passes between 0 and 10),
  tracking_from date not null,
  term2_from    date,
  updated_at    timestamptz not null default now()
);

comment on table public.attendance_policy is
  'Lop chua co dong o day thi toan bo phan ky luat quen dang ky tat hoan toan.';


-- ============================================================================
--  36. MIỄN BUỔI
-- ============================================================================
--  mshs   NULL = miễn cho CẢ LỚP (hôm đó có sự kiện, lớp không tự học)
--         có   = miễn cho riêng một em (em nghỉ học hôm đó)
--  period NULL = miễn cả ngày
--         có   = miễn đúng một tiết
create table if not exists public.attendance_exemptions (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  study_date date not null,
  period     smallint check (period is null or period between 1 and 9),
  mshs       text,
  reason     text not null check (char_length(trim(reason)) between 1 and 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Không tạo hai lệnh miễn trùng nhau. NULL trong UNIQUE của Postgres không so
-- bằng nhau được, nên dùng chỉ mục trên biểu thức đã quy đổi NULL.
create unique index if not exists attendance_exempt_uniq
  on public.attendance_exemptions
     (class_id, study_date, coalesce(period, 0), coalesce(mshs, '*'));

create index if not exists attendance_exempt_lookup
  on public.attendance_exemptions (class_id, study_date);

-- Một buổi/tiết có được miễn cho em này không?
create or replace function public.is_exempt(p_class uuid, p_mshs text, p_date date, p_period smallint)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.attendance_exemptions x
    where x.class_id = p_class
      and x.study_date = p_date
      and (x.mshs is null or x.mshs = p_mshs)
      and (x.period is null or x.period = p_period)
  );
$fn$;


-- ============================================================================
--  37. SỔ GHI NHỮNG LẦN QUÊN
-- ============================================================================
-- Vì sao phải LƯU thay vì đếm lại mỗi lần cần?
--   Lịch tự học của lớp có thể đổi giữa năm. Đếm lại theo lịch hiện tại sẽ làm
--   những lần quên trong quá khứ biến mất hoặc tự mọc thêm — mà đây là dữ liệu
--   dùng để kỷ luật học sinh, không được phép đổi sau lưng.
create table if not exists public.attendance_misses (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  mshs        text not null,
  study_date  date not null,
  period      smallint,
  recorded_at timestamptz not null default now()
);

create unique index if not exists attendance_misses_uniq
  on public.attendance_misses (class_id, mshs, study_date, coalesce(period, 0));

create index if not exists attendance_misses_lookup
  on public.attendance_misses (class_id, mshs, study_date);


-- ============================================================================
--  38. BẬC KỶ LUẬT
-- ============================================================================
-- Bậc tính theo TỔNG số lần quên trong học kỳ, KHÔNG cộng dồn hình phạt:
-- quên lần thứ 5 thì mức là "10 lượt lao động công ích", không phải 5 + 10.
create or replace function public.attendance_level(p_misses int, p_free int default 3)
returns json language sql immutable as $fn$
  select case
    when p_misses <= p_free then json_build_object(
      'bac', 0, 'nhan', 'Còn quyền miễn trừ',
      'chi_tiet', 'Em còn ' || (p_free - p_misses) || ' lần được miễn trừ trong học kỳ này.')
    when p_misses = p_free + 1 then json_build_object(
      'bac', 1, 'nhan', 'Lao động công ích 5 lượt',
      'chi_tiet', 'Em đã dùng hết ' || p_free || ' lần miễn trừ. Lần quên thứ '
                  || p_misses || ' tương ứng 5 lượt lao động công ích.')
    when p_misses = p_free + 2 then json_build_object(
      'bac', 2, 'nhan', 'Lao động công ích 10 lượt',
      'chi_tiet', 'Đây là lần quên thứ ' || p_misses || ' — mức kỷ luật là 10 lượt lao động công ích.')
    else json_build_object(
      'bac', 3, 'nhan', 'Trao đổi với phụ huynh',
      'chi_tiet', 'Em đã quên ' || p_misses || ' lần. Thầy cô sẽ trao đổi trực tiếp với phụ huynh.')
  end;
$fn$;

-- Mốc đầu học kỳ đang áp dụng cho một lớp.
create or replace function public.term_start(p_class uuid)
returns date language sql stable security definer set search_path = public as $fn$
  select case
    when pol.term2_from is not null and public.vn_today() >= pol.term2_from
      then pol.term2_from
    else pol.tracking_from
  end
  from public.attendance_policy pol where pol.class_id = p_class;
$fn$;


-- ============================================================================
--  39. GHI NHẬN NHỮNG LẦN QUÊN — CHẠY SAU KHI NGÀY KẾT THÚC
-- ============================================================================
-- Chạy lúc 00:05 giờ Việt Nam của ngày kế tiếp, sau mốc chốt 24:00. Lùi v_date
-- một ngày để ghi nhận đúng ngày vừa kết thúc. Nhờ vậy, học sinh đăng ký trong
-- giờ cuối cùng của ngày vẫn được tính là có đăng ký.
create or replace function public.record_attendance_misses(p_date date default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare v_date date := coalesce(p_date, public.vn_today() - 1); n int := 0;
begin
  insert into public.attendance_misses (class_id, mshs, study_date, period)
  select pol.class_id, s.mshs, v_date, cs.period
  from public.attendance_policy pol
  join public.class_schedule cs on cs.class_id = pol.class_id
                               and cs.weekday = extract(isodow from v_date)::smallint
  join public.enrollments e on e.class_id = pol.class_id and e.is_active
  join public.students   s on s.mshs = e.mshs and s.claimed_user_id is not null
  where pol.enabled
    and v_date >= pol.tracking_from
    and not public.is_exempt(pol.class_id, s.mshs, v_date, cs.period)
    and not exists (
      select 1 from public.plans p
      where p.student_id = s.claimed_user_id and p.study_date = v_date
        and cs.period between p.period and p.period + p.span - 1)
  on conflict do nothing;
  get diagnostics n = row_count;

  return json_build_object('ngay', v_date::text, 'so_luot_quen_moi', n);
end;
$fn$;

do $mig$ begin perform cron.unschedule('attendance-misses'); exception when others then null; end $mig$;
-- 17:05 UTC = 00:05 giờ Việt Nam của ngày hôm sau.
do $mig$ begin
  perform cron.schedule('attendance-misses', '5 17 * * *',
                        'select public.record_attendance_misses()');
exception when others then raise notice 'Chua bat pg_cron'; end $mig$;


-- ============================================================================
--  40. HÀM CHO GIAO DIỆN HỌC SINH
-- ============================================================================
-- Trả về mọi thứ trang học sinh cần để dựng popup: hôm nay có phải ngày tự học
-- không, đã đăng ký chưa, đã quên mấy lần, đang ở bậc kỷ luật nào.
create or replace function public.my_attendance_status()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  v_class uuid; v_mshs text; v_uid uuid := auth.uid();
  pol record; v_today date := public.vn_today();
  v_slots int; v_missing int; v_misses int; v_term date;
begin
  v_mshs  := public.my_mshs();
  v_class := public.student_active_class(v_uid);
  if v_class is null or v_mshs is null then return null; end if;

  select * into pol from public.attendance_policy where class_id = v_class;
  if pol is null or not pol.enabled then return null; end if;

  v_term := public.term_start(v_class);

  -- Hôm nay lớp có bao nhiêu tiết tự học, và em còn thiếu mấy tiết.
  select count(*) into v_slots
    from public.class_schedule cs
   where cs.class_id = v_class
     and cs.weekday = extract(isodow from v_today)::smallint;

  select count(*) into v_missing
    from public.class_schedule cs
   where cs.class_id = v_class
     and cs.weekday = extract(isodow from v_today)::smallint
     and not public.is_exempt(v_class, v_mshs, v_today, cs.period)
     and not exists (
       select 1 from public.plans p
       where p.student_id = v_uid and p.study_date = v_today
         and cs.period between p.period and p.period + p.span - 1);

  select count(*) into v_misses
    from public.attendance_misses m
   where m.class_id = v_class and m.mshs = v_mshs and m.study_date >= v_term;

  return json_build_object(
    'bat',              true,
    'ngay',             v_today::text,
    'so_tiet_hom_nay',  v_slots,
    'con_thieu_hom_nay',v_missing,
    'da_quen',          v_misses,
    'quyen_mien_tru',   pol.free_passes,
    'con_lai',          greatest(pol.free_passes - v_misses, 0),
    'muc',              public.attendance_level(v_misses, pol.free_passes),
    'tu_ngay',          v_term::text
  );
end;
$fn$;


-- ============================================================================
--  41. HÀM CHO DASHBOARD GIÁO VIÊN
-- ============================================================================
-- Danh sách em đang có kỷ luật. Trả cả những em bậc 0 để giáo viên nhìn được
-- toàn cảnh, giao diện tự lọc theo nhu cầu.
create or replace function public.class_attendance_board(p_class uuid)
returns table (
  mshs text, full_name text, so_lan_quen int, bac int, nhan text, chi_tiet text,
  lan_gan_nhat date
) language sql stable security definer set search_path = public as $fn$
  select s.mshs, s.full_name,
         coalesce(m.n, 0)::int as so_lan_quen,
         (public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'bac')::int,
         public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'nhan',
         public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'chi_tiet',
         m.gan_nhat
  from public.attendance_policy pol
  join public.enrollments e on e.class_id = pol.class_id and e.is_active
  join public.students   s on s.mshs = e.mshs
  left join lateral (
    select count(*) n, max(study_date) gan_nhat
    from public.attendance_misses am
    where am.class_id = pol.class_id and am.mshs = s.mshs
      and am.study_date >= public.term_start(pol.class_id)
  ) m on true
  where pol.class_id = p_class and pol.enabled and public.teaches_class(p_class)
  order by coalesce(m.n, 0) desc, s.full_name;
$fn$;


-- ============================================================================
--  42. GIÁO VIÊN MIỄN / BỎ MIỄN MỘT BUỔI
-- ============================================================================
-- p_mshs   null = cả lớp;  p_period null = cả ngày.
create or replace function public.set_attendance_exemption(
  p_class uuid, p_date date, p_reason text,
  p_period smallint default null, p_mshs text default null
) returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_norm text;
begin
  if not public.teaches_class(p_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Hãy ghi lý do miễn buổi này.';
  end if;

  v_norm := public.norm_mshs(nullif(p_mshs, ''));
  if v_norm is not null and not exists (
       select 1 from public.enrollments e
       where e.mshs = v_norm and e.class_id = p_class and e.is_active) then
    raise exception 'Học sinh % không thuộc lớp này.', v_norm;
  end if;

  insert into public.attendance_exemptions (class_id, study_date, period, mshs, reason, created_by)
  values (p_class, p_date, p_period, v_norm, trim(p_reason), auth.uid())
  on conflict (class_id, study_date, coalesce(period, 0), coalesce(mshs, '*'))
  do update set reason = excluded.reason, created_by = excluded.created_by, created_at = now()
  returning id into v_id;

  -- Đã miễn thì gỡ luôn những lần quên ĐÃ ghi cho buổi đó. Giáo viên bấm miễn
  -- sau khi hết ngày là chuyện bình thường (em xin phép muộn), và lúc đó sổ đã
  -- ghi rồi — không gỡ thì em vẫn bị tính oan.
  delete from public.attendance_misses m
   where m.class_id = p_class and m.study_date = p_date
     and (p_period is null or m.period = p_period)
     and (v_norm is null or m.mshs = v_norm);

  return v_id;
end;
$fn$;

create or replace function public.clear_attendance_exemption(p_id uuid)
returns void language plpgsql security definer set search_path = public as $fn$
declare v_class uuid;
begin
  select class_id into v_class from public.attendance_exemptions where id = p_id;
  if v_class is null then return; end if;
  if not public.teaches_class(v_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;
  delete from public.attendance_exemptions where id = p_id;
end;
$fn$;

-- Danh sách lệnh miễn quanh một ngày, để giáo viên thấy mình đã miễn những gì.
create or replace function public.class_exemptions(p_class uuid, p_from date, p_to date)
returns table (
  id uuid, study_date date, period smallint, mshs text, full_name text,
  reason text, created_at timestamptz
) language sql stable security definer set search_path = public as $fn$
  select x.id, x.study_date, x.period, x.mshs, s.full_name, x.reason, x.created_at
  from public.attendance_exemptions x
  left join public.students s on s.mshs = x.mshs
  where x.class_id = p_class and x.study_date between p_from and p_to
    and public.teaches_class(p_class)
  order by x.study_date desc, x.period nulls first;
$fn$;


-- ============================================================================
--  43. TAB "HS CHƯA ĐĂNG KÝ" PHẢI TÔN TRỌNG LỆNH MIỄN
-- ============================================================================
-- Nếu không, giáo viên vừa bấm miễn cả lớp xong mở tab ra vẫn thấy 31 em bị
-- gắn cờ thiếu — nút miễn nhìn như không có tác dụng gì.
create or replace function public.missing_registrations(p_class uuid, p_date date)
returns table (student_id uuid, mshs text, full_name text, period smallint)
language sql stable security definer set search_path = public as $fn$
  with allowed as (
    select 1 where public.staff_perm(p_class, 'view_plans')
  ),
  slots as (
    select cs.period
    from public.class_schedule cs
    where cs.class_id = p_class
      and cs.weekday = extract(isodow from p_date)::smallint
  ),
  has_schedule as (
    select 1 from public.class_schedule where class_id = p_class limit 1
  ),
  roster as (
    select s.claimed_user_id as sid, s.mshs, s.full_name
    from public.enrollments e
    join public.students s on s.mshs = e.mshs
    where e.class_id = p_class and e.is_active and s.claimed_user_id is not null
  )
  select r.sid, r.mshs, r.full_name, sl.period
  from roster r
  cross join slots sl
  where exists (select 1 from allowed)
    and not public.is_exempt(p_class, r.mshs, p_date, sl.period)
    and not exists (
      select 1 from public.plans p
      where p.student_id = r.sid and p.study_date = p_date
        and sl.period between p.period and p.period + p.span - 1
    )
  union all
  select r.sid, r.mshs, r.full_name, null::smallint
  from roster r
  where exists (select 1 from allowed)
    and not exists (select 1 from has_schedule)
    and not public.is_exempt(p_class, r.mshs, p_date, null)
    and not exists (
      select 1 from public.plans p
      where p.student_id = r.sid and p.study_date = p_date
    )
  order by 3, 4;
$fn$;


-- ============================================================================
--  44. RLS VÀ QUYỀN
-- ============================================================================
alter table public.attendance_policy     enable row level security;
alter table public.attendance_exemptions enable row level security;
alter table public.attendance_misses     enable row level security;

-- Chính sách và lệnh miễn: cả lớp đọc được (em cần biết hôm nay có được miễn
-- không), chỉ giáo viên sửa.
drop policy if exists att_policy_read on public.attendance_policy;
create policy att_policy_read on public.attendance_policy
  for select using (public.in_class(class_id));
drop policy if exists att_policy_write on public.attendance_policy;
create policy att_policy_write on public.attendance_policy
  for all using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

drop policy if exists att_exempt_read on public.attendance_exemptions;
create policy att_exempt_read on public.attendance_exemptions
  for select using (public.in_class(class_id));
drop policy if exists att_exempt_write on public.attendance_exemptions;
create policy att_exempt_write on public.attendance_exemptions
  for all using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

-- Sổ ghi lần quên: em CHỈ đọc được dòng của chính mình. Số lần quên của bạn
-- khác là chuyện riêng của bạn ấy — cả lớp đọc được là không ổn.
drop policy if exists att_miss_read on public.attendance_misses;
create policy att_miss_read on public.attendance_misses
  for select using (public.teaches_class(class_id) or mshs = public.my_mshs());
-- Không ai được ghi tay vào sổ này: chỉ cron (service role) và hàm miễn buổi.
drop policy if exists att_miss_write on public.attendance_misses;
create policy att_miss_write on public.attendance_misses
  for all using (false) with check (false);

revoke all on public.attendance_policy, public.attendance_exemptions,
              public.attendance_misses from anon;
grant select on public.attendance_policy, public.attendance_exemptions,
                public.attendance_misses to authenticated;
grant insert, update, delete on public.attendance_policy, public.attendance_exemptions
  to authenticated;

do $mig$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_exempt','attendance_level','term_start','my_attendance_status',
                        'class_attendance_board','set_attendance_exemption',
                        'clear_attendance_exemption','class_exemptions','missing_registrations')
  loop
    execute format('revoke all on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $mig$;

-- Hàm cron chạy dưới quyền chủ sở hữu, không cấp cho ai.
revoke all on function public.record_attendance_misses(date) from anon, public, authenticated;

analyze public.attendance_misses;
