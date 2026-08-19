-- ============================================================================
--  HỌC KỲ DO GIÁO VIÊN TỰ ĐẶT  —  chạy SAU schema-8-attendance.sql
-- ============================================================================
--  Hệ thống dùng cho TOÀN TRƯỜNG. Mỗi lớp có thể bắt đầu áp dụng kỷ luật ở một
--  thời điểm khác nhau, và mốc học kỳ thì đổi theo từng năm. Không được để hai
--  ngày đó thành hằng số trong mã nguồn — phải là ô nhập trên giao diện.
--
--  Chạy lại bao nhiêu lần cũng được.
-- ============================================================================


-- ============================================================================
--  45. HAI HỌC KỲ CÓ ĐẦU VÀ CUỐI
-- ============================================================================
-- Trước đây chỉ có `term2_from`, tức là ngầm hiểu học kỳ I kéo dài từ
-- `tracking_from` tới vô hạn. Như vậy không đếm đúng được: lần quên của học kỳ I
-- vẫn nằm trong khoảng của học kỳ II nếu giáo viên chưa kịp khai mốc.
alter table public.attendance_policy add column if not exists term1_from date;
alter table public.attendance_policy add column if not exists term1_to   date;
alter table public.attendance_policy add column if not exists term2_to   date;

-- Lớp đã khai từ trước: lấy tracking_from làm đầu học kỳ I, và ngày trước
-- term2_from làm cuối học kỳ I.
update public.attendance_policy
   set term1_from = coalesce(term1_from, tracking_from),
       term1_to   = coalesce(term1_to, term2_from - 1)
 where term1_from is null;

comment on column public.attendance_policy.tracking_from is
  'Ngay BAT DAU tinh ky luat. Co the muon hon dau hoc ky khi lop ap dung giua chung.';


-- ============================================================================
--  46. KHOẢNG ĐANG ÁP DỤNG
-- ============================================================================
-- Trả về khoảng ngày dùng để đếm số lần quên. Ba quy tắc:
--   · Hôm nay nằm trong học kỳ II  → đếm trong học kỳ II
--   · Ngược lại                     → đếm trong học kỳ I
--   · Không bao giờ đếm trước mốc `tracking_from`, kể cả khi học kỳ bắt đầu
--     sớm hơn — lớp áp dụng giữa chừng thì phần trước đó không tính.
create or replace function public.term_bounds(p_class uuid)
returns table (tu_ngay date, den_ngay date, ten text)
language sql stable security definer set search_path = public as $fn$
  select
    greatest(
      case when pol.term2_from is not null and public.vn_today() >= pol.term2_from
           then pol.term2_from else coalesce(pol.term1_from, pol.tracking_from) end,
      pol.tracking_from),
    case when pol.term2_from is not null and public.vn_today() >= pol.term2_from
         then pol.term2_to else pol.term1_to end,
    case when pol.term2_from is not null and public.vn_today() >= pol.term2_from
         then 'Học kỳ II' else 'Học kỳ I' end
  from public.attendance_policy pol
  where pol.class_id = p_class;
$fn$;

-- Giữ term_start() để phần đã viết không gãy, nhưng nay nó chỉ là lớp mỏng.
create or replace function public.term_start(p_class uuid)
returns date language sql stable security definer set search_path = public as $fn$
  select tu_ngay from public.term_bounds(p_class);
$fn$;


-- ============================================================================
--  47. ĐẾM ĐÚNG TRONG KHOẢNG — CÓ CẢ ĐẦU LẪN CUỐI
-- ============================================================================
create or replace function public.my_attendance_status()
returns json language plpgsql stable security definer set search_path = public as $fn$
declare
  v_class uuid; v_mshs text; v_uid uuid := auth.uid();
  pol record; b record; v_today date := public.vn_today();
  v_slots int; v_missing int; v_misses int;
begin
  v_mshs  := public.my_mshs();
  v_class := public.student_active_class(v_uid);
  if v_class is null or v_mshs is null then return null; end if;

  select * into pol from public.attendance_policy where class_id = v_class;
  if pol is null or not pol.enabled then return null; end if;

  select * into b from public.term_bounds(v_class);

  select count(*) into v_slots
    from public.class_schedule cs
   where cs.class_id = v_class
     and cs.weekday = extract(isodow from v_today)::smallint;

  -- Chỉ nhắc "chưa đăng ký hôm nay" khi hôm nay THỰC SỰ đang trong kỳ theo dõi.
  select count(*) into v_missing
    from public.class_schedule cs
   where cs.class_id = v_class
     and cs.weekday = extract(isodow from v_today)::smallint
     and v_today >= pol.tracking_from
     and not public.is_exempt(v_class, v_mshs, v_today, cs.period)
     and not exists (
       select 1 from public.plans p
       where p.student_id = v_uid and p.study_date = v_today
         and cs.period between p.period and p.period + p.span - 1);

  select count(*) into v_misses
    from public.attendance_misses m
   where m.class_id = v_class and m.mshs = v_mshs
     and m.study_date >= b.tu_ngay
     and (b.den_ngay is null or m.study_date <= b.den_ngay);

  return json_build_object(
    'bat',              true,
    'ngay',             v_today::text,
    'hoc_ky',           b.ten,
    'so_tiet_hom_nay',  v_slots,
    'con_thieu_hom_nay',v_missing,
    'da_quen',          v_misses,
    'quyen_mien_tru',   pol.free_passes,
    'con_lai',          greatest(pol.free_passes - v_misses, 0),
    'muc',              public.attendance_level(v_misses, pol.free_passes),
    'tu_ngay',          b.tu_ngay::text,
    'den_ngay',         b.den_ngay::text,
    'chua_bat_dau',     v_today < pol.tracking_from
  );
end;
$fn$;

create or replace function public.class_attendance_board(p_class uuid)
returns table (
  mshs text, full_name text, so_lan_quen int, bac int, nhan text, chi_tiet text,
  lan_gan_nhat date
) language sql stable security definer set search_path = public as $fn$
  select s.mshs, s.full_name,
         coalesce(m.n, 0)::int,
         (public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'bac')::int,
         public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'nhan',
         public.attendance_level(coalesce(m.n, 0)::int, pol.free_passes)->>'chi_tiet',
         m.gan_nhat
  from public.attendance_policy pol
  cross join lateral public.term_bounds(pol.class_id) b
  join public.enrollments e on e.class_id = pol.class_id and e.is_active
  join public.students   s on s.mshs = e.mshs
  left join lateral (
    select count(*) n, max(study_date) gan_nhat
    from public.attendance_misses am
    where am.class_id = pol.class_id and am.mshs = s.mshs
      and am.study_date >= b.tu_ngay
      and (b.den_ngay is null or am.study_date <= b.den_ngay)
  ) m on true
  where pol.class_id = p_class and pol.enabled and public.teaches_class(p_class)
  order by coalesce(m.n, 0) desc, s.full_name;
$fn$;


-- ============================================================================
--  48. GIÁO VIÊN TỰ ĐẶT MỐC
-- ============================================================================
-- Một hàm duy nhất cho cả bật/tắt lẫn khai mốc, để giao diện chỉ có một nút Lưu
-- và không thể lưu ra trạng thái nửa vời.
create or replace function public.set_attendance_policy(
  p_class uuid,
  p_enabled boolean,
  p_free_passes smallint,
  p_tracking_from date,
  p_term1_from date default null,
  p_term1_to   date default null,
  p_term2_from date default null,
  p_term2_to   date default null
) returns json language plpgsql security definer set search_path = public as $fn$
begin
  if not public.teaches_class(p_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;
  if p_tracking_from is null then
    raise exception 'Hãy chọn ngày bắt đầu tính.';
  end if;
  if p_free_passes is null or p_free_passes < 0 or p_free_passes > 10 then
    raise exception 'Số lần miễn trừ phải từ 0 đến 10.';
  end if;

  -- Bắt lỗi khai ngược ngay tại đây thay vì để CHECK của bảng ném ra thông báo
  -- khó hiểu bằng tiếng Anh.
  if p_term1_from is not null and p_term1_to is not null and p_term1_to < p_term1_from then
    raise exception 'Học kỳ I: ngày kết thúc phải sau ngày bắt đầu.';
  end if;
  if p_term2_from is not null and p_term2_to is not null and p_term2_to < p_term2_from then
    raise exception 'Học kỳ II: ngày kết thúc phải sau ngày bắt đầu.';
  end if;
  if p_term1_to is not null and p_term2_from is not null and p_term2_from <= p_term1_to then
    raise exception 'Học kỳ II phải bắt đầu sau khi học kỳ I kết thúc.';
  end if;

  insert into public.attendance_policy
    (class_id, enabled, free_passes, tracking_from, term1_from, term1_to, term2_from, term2_to, updated_at)
  values (p_class, coalesce(p_enabled, false), p_free_passes, p_tracking_from,
          p_term1_from, p_term1_to, p_term2_from, p_term2_to, now())
  on conflict (class_id) do update set
    enabled = excluded.enabled, free_passes = excluded.free_passes,
    tracking_from = excluded.tracking_from,
    term1_from = excluded.term1_from, term1_to = excluded.term1_to,
    term2_from = excluded.term2_from, term2_to = excluded.term2_to,
    updated_at = now();

  return (select json_build_object('tu_ngay', tu_ngay::text, 'den_ngay', den_ngay::text, 'hoc_ky', ten)
          from public.term_bounds(p_class));
end;
$fn$;

-- Đọc chính sách hiện tại kèm khoảng đang áp dụng, cho màn hình cài đặt.
create or replace function public.get_attendance_policy(p_class uuid)
returns json language sql stable security definer set search_path = public as $fn$
  select json_build_object(
    'co_chinh_sach', pol.class_id is not null,
    'enabled',       coalesce(pol.enabled, false),
    'free_passes',   coalesce(pol.free_passes, 3),
    'tracking_from', pol.tracking_from::text,
    'term1_from',    pol.term1_from::text,
    'term1_to',      pol.term1_to::text,
    'term2_from',    pol.term2_from::text,
    'term2_to',      pol.term2_to::text,
    'dang_ap_dung',  (select json_build_object('tu_ngay', tu_ngay::text, 'den_ngay', den_ngay::text, 'hoc_ky', ten)
                      from public.term_bounds(p_class))
  )
  from public.attendance_policy pol
  right join (select 1) z on true
  where (pol.class_id = p_class or pol.class_id is null)
    and public.teaches_class(p_class)
  limit 1;
$fn$;


-- ============================================================================
--  49. GHI NHẬN CHỈ TRONG KHOẢNG ĐÃ KHAI
-- ============================================================================
create or replace function public.record_attendance_misses(p_date date default null)
returns json language plpgsql security definer set search_path = public as $fn$
declare v_date date := coalesce(p_date, public.vn_today()); n int := 0;
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
    -- Ngoài khoảng học kỳ đã khai thì KHÔNG ghi: nghỉ hè, nghỉ Tết, thời gian
    -- giữa hai học kỳ đều là lúc lớp không tự học.
    and (
      (pol.term1_from is null or v_date >= pol.term1_from)
      and (pol.term1_to is null or v_date <= pol.term1_to)
      or (pol.term2_from is not null and v_date >= pol.term2_from
          and (pol.term2_to is null or v_date <= pol.term2_to))
    )
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


-- ============================================================================
--  50. QUYỀN
-- ============================================================================
do $mig$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('term_bounds','term_start','my_attendance_status',
                        'class_attendance_board','set_attendance_policy','get_attendance_policy')
  loop
    execute format('revoke all on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $mig$;

revoke all on function public.record_attendance_misses(date) from anon, public, authenticated;
