-- ============================================================================
--  CHIA SẺ SÁCH  —  chạy SAU schema-4-hardening.sql
-- ============================================================================
--  Hoạt động: mỗi tuần một học sinh giới thiệu một cuốn sách trước lớp.
--  Học sinh nộp nội dung + link trình chiếu TRƯỚC ngày báo cáo 3 ngày.
--
--  Đây là hoạt động của RIÊNG từng lớp, không phải lớp nào cũng làm — nên nó
--  nằm sau một công tắc do quản trị viên bật cho từng lớp.
--
--  Chạy lại bao nhiêu lần cũng được.
-- ============================================================================


-- ============================================================================
--  23. CÔNG TẮC TÍNH NĂNG THEO LỚP
-- ============================================================================
alter table public.classes
  add column if not exists book_share_enabled boolean not null default false;

comment on column public.classes.book_share_enabled is
  'Chỉ quản trị viên bật/tắt. Lớp chưa bật thì toàn bộ giao diện chia sẻ sách ẩn đi.';


-- ============================================================================
--  24. LỊCH TUẦN
-- ============================================================================
-- Lịch là DỮ LIỆU, không phải code. Tuần lễ 20/11, tuần thi, tuần nghỉ Tết chỉ
-- là những dòng khác nhau ở đây — sang năm lịch khác thì sửa dữ liệu, không phải
-- sửa phần mềm.
--
--  kind = 'share'   : tuần có chia sẻ
--         'reserve' : tuần dự phòng — không xếp ai, để dành khi cần dời lịch
--         'off'     : tuần nghỉ hẳn (ôn thi, thi, Tết)

create table if not exists public.book_share_weeks (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  week_no      smallint not null check (week_no between 1 and 60),
  starts_on    date not null,
  ends_on      date not null,
  kind         text not null default 'reserve' check (kind in ('share','reserve','off')),
  skip_reason  text check (skip_reason is null or char_length(skip_reason) <= 200),
  -- Ngày báo cáo: mặc định thứ Sáu của tuần, giáo viên dời được khi trùng lễ.
  report_date  date,
  -- Hạn nộp LUÔN là ngày báo cáo trừ 3 ngày. Là cột sinh tự động nên không ai
  -- ghi tay vào được, và đổi ngày báo cáo là nó tự tính lại — đúng như file Excel.
  due_date     date generated always as (report_date - 3) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (class_id, week_no),
  -- Tuần có chia sẻ thì bắt buộc phải có ngày báo cáo.
  constraint report_date_required check (kind <> 'share' or report_date is not null),
  constraint week_range_ok check (ends_on >= starts_on)
);

create index if not exists book_weeks_class_idx
  on public.book_share_weeks (class_id, starts_on);


-- ============================================================================
--  25. LƯỢT CHIA SẺ
-- ============================================================================
-- Gán theo MSHS chứ không theo user id: học sinh có thể chưa tạo tài khoản lúc
-- giáo viên xếp lịch, và MSHS là thứ theo em suốt các năm.

create table if not exists public.book_shares (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.classes(id) on delete cascade,
  week_id       uuid not null references public.book_share_weeks(id) on delete cascade,
  mshs          text not null,

  -- ---- Phần HỌC SINH được sửa ----
  book_title    text check (book_title is null or char_length(book_title) <= 200),
  author        text check (author is null or char_length(author) <= 200),
  summary       text check (summary is null or char_length(summary) <= 3000),
  lesson        text check (lesson is null or char_length(lesson) <= 2000),
  link_url      text check (link_url is null or char_length(link_url) <= 500),
  submitted_at  timestamptz,

  -- ---- Phần GIÁO VIÊN được sửa ----
  shared_on        date,
  teacher_rating   smallint check (teacher_rating is null or teacher_rating between 1 and 5),
  teacher_comment  text check (teacher_comment is null or char_length(teacher_comment) <= 1000),
  -- ON DELETE SET NULL: xoá tài khoản giáo viên cũ không được phép kéo theo việc
  -- xoá mất bài chia sẻ của học sinh, cũng không được chặn luôn thao tác xoá.
  teacher_by       uuid references public.profiles(id) on delete set null,
  teacher_at       timestamptz,

  -- ---- Phần CÁN SỰ THƯ VIỆN được sửa ----
  monitor_note  text check (monitor_note is null or char_length(monitor_note) <= 1000),
  monitor_by    uuid references public.profiles(id) on delete set null,
  monitor_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Một em không bị xếp hai lần vào cùng một tuần. Vẫn cho phép hai em chung một
  -- tuần khi giáo viên cần dồn lịch bù.
  unique (week_id, mshs)
);

-- Bảng có thể đã được tạo trước khi bổ sung ON DELETE SET NULL — sửa lại ràng buộc.
do $$ begin
  alter table public.book_shares drop constraint if exists book_shares_teacher_by_fkey;
  alter table public.book_shares add constraint book_shares_teacher_by_fkey
    foreign key (teacher_by) references public.profiles(id) on delete set null;
  alter table public.book_shares drop constraint if exists book_shares_monitor_by_fkey;
  alter table public.book_shares add constraint book_shares_monitor_by_fkey
    foreign key (monitor_by) references public.profiles(id) on delete set null;
end $$;

create index if not exists book_shares_class_idx on public.book_shares (class_id);
create index if not exists book_shares_mshs_idx  on public.book_shares (mshs);

drop trigger if exists trg_book_weeks_updated on public.book_share_weeks;
create trigger trg_book_weeks_updated before update on public.book_share_weeks
for each row execute function public.set_updated_at();

drop trigger if exists trg_book_shares_updated on public.book_shares;
create trigger trg_book_shares_updated before update on public.book_shares
for each row execute function public.set_updated_at();


-- ============================================================================
--  26. TRẠNG THÁI — TÍNH MỘT CHỖ DUY NHẤT
-- ============================================================================
-- Trạng thái xuất hiện ở bốn nơi: thẻ của học sinh, bảng giáo viên, bảng cán sự,
-- và nội dung thông báo. Nếu mỗi nơi tự suy ra thì sớm muộn cũng lệch nhau.

create or replace function public.book_share_state(
  p_link text, p_shared_on date, p_report date, p_due date, p_rating smallint
) returns text language sql immutable as $$
  select case
    when p_rating is not null                      then 'Đã đánh giá'
    when p_shared_on is not null                   then 'Đã chia sẻ'
    when p_report is null                          then 'Chưa xếp lịch'
    when nullif(trim(coalesce(p_link,'')),'') is not null then 'Đã nộp bài'
    when public.vn_today() > p_report               then 'Chưa chia sẻ'
    when public.vn_today() > p_due                  then 'Trễ hạn nộp'
    else 'Chờ đến lượt'
  end;
$$;

create or replace view public.book_share_board
with (security_invoker = true) as
select
  w.class_id,
  w.id            as week_id,
  w.week_no,
  w.starts_on,
  w.ends_on,
  w.kind,
  w.skip_reason,
  w.report_date,
  w.due_date,
  s.id            as share_id,
  s.mshs,
  st.full_name,
  s.book_title, s.author, s.summary, s.lesson, s.link_url, s.submitted_at,
  s.shared_on, s.teacher_rating, s.teacher_comment, s.monitor_note,
  public.book_share_state(s.link_url, s.shared_on, w.report_date, w.due_date, s.teacher_rating) as state,
  (w.report_date is not null and w.report_date < public.vn_today())                             as da_qua,
  (w.due_date is not null and public.vn_today() > w.due_date
     and nullif(trim(coalesce(s.link_url,'')),'') is null
     and s.shared_on is null)                                                                   as tre_han
from public.book_share_weeks w
left join public.book_shares s on s.week_id = w.id
left join public.students   st on st.mshs   = s.mshs;

comment on view public.book_share_board is
  'security_invoker: kế thừa RLS của người gọi. Ai đọc được bảng gốc thì đọc được view.';


-- ============================================================================
--  27. KHOÁ CỘT — HỌC SINH CHỈ SỬA ĐƯỢC NỘI DUNG SÁCH
-- ============================================================================
-- RLS chặn được DÒNG chứ không chặn được CỘT. Nếu chỉ dựa vào RLS thì em nào
-- biết gọi API là tự chấm điểm cho mình được. Cùng cơ chế với plans_guard_columns.

create or replace function public.book_shares_guard_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_is_staff boolean; v_is_monitor boolean; v_is_owner boolean;
begin
  if auth.uid() is null then return new; end if;      -- service role: bỏ qua

  v_is_staff := public.teaches_class(old.class_id);
  v_is_owner := old.mshs = public.my_mshs();
  v_is_monitor := exists (
    select 1 from public.class_assistants ca
    where ca.class_id = old.class_id and ca.student_id = auth.uid()
      and ca.can_review_books);

  -- ---- Không ai ngoài giáo viên được đổi phân công ----
  if not v_is_staff then
    new.class_id := old.class_id;
    new.week_id  := old.week_id;
    new.mshs     := old.mshs;
  end if;

  -- ---- Cột của giáo viên ----
  if not v_is_staff then
    new.shared_on      := old.shared_on;
    new.teacher_rating := old.teacher_rating;
    new.teacher_comment:= old.teacher_comment;
    new.teacher_by     := old.teacher_by;
    new.teacher_at     := old.teacher_at;
  elsif new.teacher_rating is distinct from old.teacher_rating
     or new.teacher_comment is distinct from old.teacher_comment then
    new.teacher_by := auth.uid();
    new.teacher_at := now();
  end if;

  -- ---- Cột của cán sự thư viện (giáo viên cũng ghi được) ----
  if not (v_is_staff or v_is_monitor) then
    new.monitor_note := old.monitor_note;
    new.monitor_by   := old.monitor_by;
    new.monitor_at   := old.monitor_at;
  elsif new.monitor_note is distinct from old.monitor_note then
    new.monitor_by := auth.uid();
    new.monitor_at := now();
  end if;

  -- ---- Cột nội dung: chủ nhân hoặc giáo viên ----
  if not (v_is_owner or v_is_staff) then
    new.book_title := old.book_title;
    new.author     := old.author;
    new.summary    := old.summary;
    new.lesson     := old.lesson;
    new.link_url   := old.link_url;
  end if;

  -- Mốc nộp do hệ thống ghi, không nhận từ giao diện.
  if nullif(trim(coalesce(new.link_url,'')),'') is not null
     and nullif(trim(coalesce(old.link_url,'')),'') is null then
    new.submitted_at := now();
  elsif nullif(trim(coalesce(new.link_url,'')),'') is null then
    new.submitted_at := null;
  else
    new.submitted_at := old.submitted_at;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_book_shares_guard on public.book_shares;
create trigger trg_book_shares_guard before update on public.book_shares
for each row execute function public.book_shares_guard_columns();

-- Cờ quyền cho cán sự thư viện. Tái dùng bảng trợ giảng sẵn có thay vì dựng
-- một hệ vai trò thứ hai.
alter table public.class_assistants
  add column if not exists can_review_books boolean not null default false;


-- ============================================================================
--  28. RLS
-- ============================================================================
alter table public.book_share_weeks enable row level security;
alter table public.book_shares      enable row level security;

-- Ai thuộc lớp thì đọc được cả lớp: hoạt động này vốn là để cả lớp cùng xem.
-- Nhưng chỉ TRONG lớp — không mở cho người chưa đăng nhập.
create or replace function public.in_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.teaches_class(p_class)
      or public.student_active_class(auth.uid()) = p_class;
$$;

drop policy if exists book_weeks_read on public.book_share_weeks;
create policy book_weeks_read on public.book_share_weeks
  for select using (public.in_class(class_id));

drop policy if exists book_weeks_write on public.book_share_weeks;
create policy book_weeks_write on public.book_share_weeks
  for all using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));

drop policy if exists book_shares_read on public.book_shares;
create policy book_shares_read on public.book_shares
  for select using (public.in_class(class_id));

-- Học sinh KHÔNG được tự thêm hay xoá lượt của mình — lịch là việc của giáo viên.
drop policy if exists book_shares_insert on public.book_shares;
create policy book_shares_insert on public.book_shares
  for insert with check (public.teaches_class(class_id));

drop policy if exists book_shares_delete on public.book_shares;
create policy book_shares_delete on public.book_shares
  for delete using (public.teaches_class(class_id));

-- Sửa: giáo viên, chính chủ, hoặc cán sự thư viện. Ai sửa được CỘT nào thì do
-- trigger ở mục 27 quyết định.
drop policy if exists book_shares_update on public.book_shares;
create policy book_shares_update on public.book_shares
  for update using (
    public.teaches_class(class_id)
    or mshs = public.my_mshs()
    or exists (select 1 from public.class_assistants ca
               where ca.class_id = book_shares.class_id and ca.student_id = auth.uid()
                 and ca.can_review_books)
  );


-- ============================================================================
--  29. HÀM CHO GIAO DIỆN
-- ============================================================================

-- Dựng lịch N tuần từ một ngày thứ Hai. Ngày báo cáo mặc định là thứ Sáu.
-- Chạy lại không xoá dữ liệu cũ: tuần đã có thì giữ nguyên.
create or replace function public.generate_book_share_weeks(
  p_class uuid, p_first_monday date, p_weeks int default 43
) returns int language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if not public.teaches_class(p_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;
  insert into public.book_share_weeks (class_id, week_no, starts_on, ends_on, kind, report_date)
  select p_class, g,
         p_first_monday + (g - 1) * 7,
         p_first_monday + (g - 1) * 7 + 4,
         'reserve',
         p_first_monday + (g - 1) * 7 + 4
  from generate_series(1, p_weeks) g
  on conflict (class_id, week_no) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Giáo viên sửa một tuần: đổi loại tuần, dời ngày báo cáo, ghi lý do nghỉ.
create or replace function public.set_book_share_week(
  p_week uuid, p_kind text, p_report_date date default null, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_class uuid;
begin
  select class_id into v_class from public.book_share_weeks where id = p_week;
  if v_class is null then raise exception 'Không tìm thấy tuần.'; end if;
  if not public.teaches_class(v_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;
  if p_kind not in ('share','reserve','off') then
    raise exception 'Loại tuần không hợp lệ.';
  end if;
  update public.book_share_weeks
     set kind = p_kind,
         report_date = case when p_kind = 'off' then null
                            else coalesce(p_report_date, report_date, ends_on) end,
         skip_reason = p_reason
   where id = p_week;
end;
$$;

-- Xếp / đổi / gỡ học sinh của một tuần.
-- p_mshs = null nghĩa là gỡ lượt của tuần đó.
create or replace function public.assign_book_share(p_week uuid, p_mshs text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_class uuid; v_id uuid; v_norm text;
begin
  select class_id into v_class from public.book_share_weeks where id = p_week;
  if v_class is null then raise exception 'Không tìm thấy tuần.'; end if;
  if not public.teaches_class(v_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;

  if p_mshs is null then
    delete from public.book_shares where week_id = p_week;
    return null;
  end if;

  v_norm := public.norm_mshs(p_mshs);
  if not exists (select 1 from public.enrollments e
                 where e.mshs = v_norm and e.class_id = v_class and e.is_active) then
    raise exception 'Học sinh % không thuộc lớp này.', v_norm;
  end if;

  -- Đổi người: giữ nguyên dòng để không mất nội dung em cũ đã nộp thì vô lý —
  -- đổi người là đổi hẳn, nên xoá rồi tạo mới.
  delete from public.book_shares where week_id = p_week and mshs is distinct from v_norm;

  insert into public.book_shares (class_id, week_id, mshs)
  values (v_class, p_week, v_norm)
  on conflict (week_id, mshs) do update set updated_at = now()
  returning id into v_id;

  -- Tuần đã xếp người thì đương nhiên là tuần có chia sẻ.
  update public.book_share_weeks
     set kind = 'share', report_date = coalesce(report_date, ends_on)
   where id = p_week and kind <> 'share';

  return v_id;
end;
$$;

-- Lượt của chính em đang đăng nhập: lượt SẮP TỚI hoặc lượt vừa qua mà chưa xong.
-- Xong hẳn rồi (đã chia sẻ) thì trả rỗng — thẻ trên trang học sinh tự ẩn đi.
create or replace function public.my_book_share()
returns setof public.book_share_board
language sql stable security definer set search_path = public as $$
  select * from public.book_share_board b
  where b.mshs = public.my_mshs()
    and b.class_id = public.student_active_class(auth.uid())
    and b.shared_on is null            -- đã chia sẻ xong thì thôi
  -- Sắp theo NGÀY BÁO CÁO chứ không phải ngày bắt đầu tuần: giáo viên dời lịch
  -- là hai mốc này lệch nhau, và thứ quyết định "sắp tới lượt" là ngày báo cáo.
  order by b.report_date nulls last, b.starts_on
  limit 1;
$$;

-- N tuần chia sẻ kế tiếp — dùng chung cho ô dashboard, bảng giáo viên, bảng cán
-- sự và nội dung thông báo, nên bốn chỗ đó không thể lệch nhau.
create or replace function public.upcoming_book_shares(p_class uuid, p_weeks int default 4)
returns setof public.book_share_board
language sql stable security definer set search_path = public as $$
  select * from public.book_share_board b
  where b.class_id = p_class
    and b.kind = 'share'
    and b.report_date is not null
    and (b.report_date >= public.vn_today() or b.shared_on is null)
    and public.in_class(p_class)
  order by b.report_date, b.starts_on
  limit greatest(p_weeks, 1);
$$;

-- Bảng toàn lớp cho tab công khai trong lớp.
create or replace function public.class_book_shares(p_class uuid)
returns setof public.book_share_board
language sql stable security definer set search_path = public as $$
  select * from public.book_share_board b
  where b.class_id = p_class and public.in_class(p_class)
  order by b.week_no;
$$;

-- Quản trị viên bật/tắt tính năng cho từng lớp.
create or replace function public.set_book_share_enabled(p_class uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới bật/tắt được tính năng này.';
  end if;
  update public.classes set book_share_enabled = p_on where id = p_class;
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case when p_on then 'book_share_on' else 'book_share_off' end,
          'class', p_class, jsonb_build_object('bat', p_on));
end;
$$;

-- Nhập lịch hàng loạt từ file mẫu.
-- p_rows: [{"week_no":4,"kind":"share","report_date":"2026-08-28","mshs":"2406001","reason":null}, …]
create or replace function public.import_book_share_plan(p_class uuid, p_rows jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r jsonb; v_week uuid; n_week int := 0; n_assign int := 0; v_mshs text; v_kind text;
begin
  if not public.teaches_class(p_class) then
    raise exception 'Bạn không phụ trách lớp này.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_kind := coalesce(r->>'kind', 'reserve');
    if v_kind not in ('share','reserve','off') then v_kind := 'reserve'; end if;

    select id into v_week from public.book_share_weeks
     where class_id = p_class and week_no = (r->>'week_no')::smallint;
    if v_week is null then continue; end if;

    update public.book_share_weeks
       set kind = v_kind,
           report_date = case when v_kind = 'off' then null
                              else coalesce(nullif(r->>'report_date','')::date, report_date, ends_on) end,
           skip_reason = nullif(r->>'reason','')
     where id = v_week;
    n_week := n_week + 1;

    v_mshs := public.norm_mshs(nullif(r->>'mshs',''));
    if v_mshs is not null and v_kind = 'share' then
      if exists (select 1 from public.enrollments e
                 where e.mshs = v_mshs and e.class_id = p_class and e.is_active) then
        delete from public.book_shares where week_id = v_week and mshs is distinct from v_mshs;
        insert into public.book_shares (class_id, week_id, mshs)
        values (p_class, v_week, v_mshs)
        on conflict (week_id, mshs) do nothing;
        n_assign := n_assign + 1;
      end if;
    end if;
  end loop;

  return json_build_object('tuan_da_cap_nhat', n_week, 'luot_da_xep', n_assign);
end;
$$;


-- ============================================================================
--  30. NHẮC LỊCH
-- ============================================================================
-- Năm mốc. `dedupe_key` đảm bảo mỗi mốc chỉ nhắc đúng một lần dù cron chạy 2
-- lần/ngày.

create or replace function public.process_book_share_reminders()
returns json language plpgsql security definer set search_path = public as $$
declare
  r record; n int := 0; v_today date := public.vn_today();
  v_staff record; v_body text;
begin
  for r in
    select b.*, c.name as class_name, st.claimed_user_id as student_uid
    from public.book_share_board b
    join public.classes c   on c.id = b.class_id and c.book_share_enabled
    left join public.students st on st.mshs = b.mshs
    where b.kind = 'share' and b.report_date is not null and b.mshs is not null
      and b.report_date between v_today - 14 and v_today + 14
  loop
    -- 1) Trước 7 ngày: báo em biết sắp tới lượt.
    if r.student_uid is not null and r.report_date = v_today + 7 then
      insert into public.notifications (user_id, kind, title, body, dedupe_key)
      values (r.student_uid, 'book_turn',
        'Tuần sau tới lượt em chia sẻ sách',
        'Em chia sẻ vào ngày ' || to_char(r.report_date,'DD/MM') ||
        '. Hạn nộp nội dung và link trình chiếu là ' || to_char(r.due_date,'DD/MM') || '.',
        'book-turn:' || r.share_id)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if found then n := n + 1; end if;
    end if;

    -- 2) Đúng hạn nộp mà link còn trống.
    if r.student_uid is not null and r.due_date = v_today
       and nullif(trim(coalesce(r.link_url,'')),'') is null then
      insert into public.notifications (user_id, kind, title, body, dedupe_key)
      values (r.student_uid, 'book_due',
        'Hôm nay là hạn nộp bài chia sẻ sách',
        'Em cập nhật tên sách, nội dung và link trình chiếu trước khi hết ngày nhé.',
        'book-due:' || r.share_id)
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
      if found then n := n + 1; end if;
    end if;

    -- 3) Quá hạn nộp: báo cho giáo viên và cán sự.
    -- 4) Trước 1 ngày: nhắc cả hai.
    if (r.tre_han and r.report_date >= v_today) or r.report_date = v_today + 1 then
      if r.report_date = v_today + 1 then
        v_body := coalesce(r.full_name,'(chưa xếp)') || ' chia sẻ sách vào ngày mai' ||
                  case when nullif(trim(coalesce(r.link_url,'')),'') is null
                       then ' — CHƯA có link trình chiếu.' else ' — đã nộp bài.' end;
      else
        v_body := coalesce(r.full_name,'(chưa xếp)') || ' chưa nộp link, còn ' ||
                  (r.report_date - v_today) || ' ngày tới buổi chia sẻ.';
      end if;

      for v_staff in
        select ct.teacher_id as uid from public.class_teachers ct
         where ct.class_id = r.class_id and ct.status = 'active'
        union
        select ca.student_id from public.class_assistants ca
         where ca.class_id = r.class_id and ca.can_review_books
      loop
        insert into public.notifications (user_id, kind, title, body, dedupe_key)
        values (v_staff.uid, 'book_watch',
          'Chia sẻ sách ' || r.class_name || ' · tuần ' || r.week_no, v_body,
          'book-watch:' || r.share_id || ':' || v_today ||
          case when r.report_date = v_today + 1 then ':d1' else ':late' end)
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
        if found then n := n + 1; end if;
      end loop;
    end if;
  end loop;

  -- 5) Sáng thứ Hai: bản tóm tắt tuần này + tuần sau cho giáo viên và cán sự.
  if extract(isodow from v_today) = 1 then
    for r in select distinct class_id, name from public.classes c
             join public.book_share_weeks w on w.class_id = c.id
             where c.book_share_enabled
    loop
      select string_agg(
               'Tuần ' || x.week_no || ' (' || to_char(x.report_date,'DD/MM') || '): ' ||
               coalesce(x.full_name,'chưa xếp') ||
               case when nullif(trim(coalesce(x.link_url,'')),'') is null then ' — chưa nộp link'
                    else ' — đã nộp' end, E'\n' order by x.starts_on)
        into v_body
        from (select * from public.book_share_board b
               where b.class_id = r.class_id and b.kind = 'share'
                 and b.report_date >= v_today
               order by b.starts_on limit 2) x;

      if v_body is not null then
        for v_staff in
          select ct.teacher_id as uid from public.class_teachers ct
           where ct.class_id = r.class_id and ct.status = 'active'
          union
          select ca.student_id from public.class_assistants ca
           where ca.class_id = r.class_id and ca.can_review_books
        loop
          insert into public.notifications (user_id, kind, title, body, dedupe_key)
          values (v_staff.uid, 'book_watch',
            'Lịch chia sẻ sách tuần này', v_body,
            'book-week:' || r.class_id || ':' || v_today)
          on conflict (dedupe_key) where dedupe_key is not null do nothing;
          if found then n := n + 1; end if;
        end loop;
      end if;
    end loop;
  end if;

  return json_build_object('chay_luc', timezone('Asia/Ho_Chi_Minh', now())::text, 'da_nhac', n);
end;
$$;

do $$ begin
  perform cron.unschedule('book-share-reminders');
exception when others then null;
end $$;

-- 01:00 UTC = 08:00 giờ Việt Nam.
do $$ begin
  perform cron.schedule('book-share-reminders', '0 1 * * *',
                        'select public.process_book_share_reminders()');
exception when others then
  raise notice 'Chưa bật pg_cron — bỏ qua lịch nhắc chia sẻ sách';
end $$;


-- ============================================================================
--  31. QUYỀN — hai bảng mới cũng phải bị thu hồi như mục 17/18
-- ============================================================================
revoke all on public.book_share_weeks, public.book_shares, public.book_share_board
  from anon;

grant select on public.book_share_board to authenticated;
grant select, update on public.book_shares to authenticated;
grant select on public.book_share_weeks to authenticated;
grant insert, delete on public.book_shares to authenticated;      -- RLS: chỉ giáo viên
grant insert, update, delete on public.book_share_weeks to authenticated;  -- RLS: chỉ giáo viên

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('book_share_state','in_class','generate_book_share_weeks',
                        'set_book_share_week','assign_book_share','my_book_share',
                        'upcoming_book_shares','class_book_shares','set_book_share_enabled',
                        'import_book_share_plan')
  loop
    execute format('revoke all on function %s from anon, public', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- Hàm cron và hàm trigger chạy dưới quyền chủ sở hữu, không cấp cho ai.
-- Hàm trigger nằm ngoài danh sách whitelist ở trên nên vẫn giữ nguyên quyền mặc
-- định Supabase cấp cho anon — phải thu hồi tay, đúng như bài học ở mục 18.
revoke all on function public.process_book_share_reminders() from anon, public, authenticated;
revoke all on function public.book_shares_guard_columns() from anon, public, authenticated;

analyze public.book_share_weeks;
analyze public.book_shares;
