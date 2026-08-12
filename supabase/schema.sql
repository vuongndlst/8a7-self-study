-- ============================================================
-- SELF-STUDY — SUPABASE SCHEMA v3
-- Chạy toàn bộ file này trong Supabase SQL Editor. CHẠY LẠI NHIỀU LẦN ĐƯỢC:
-- file chỉ tạo thêm và cập nhật, không xóa bảng nào, không mất dữ liệu.
--
-- Mô hình: một học sinh giữ MỘT tài khoản suốt các năm.
--   students      : hồ sơ theo em (MSHS + họ tên), tồn tại qua nhiều năm
--   school_years  : 2026-2027, 2027-2028…  (chỉ một năm is_active)
--   classes       : 8A7 của năm nào
--   enrollments   : em nào học lớp nào → lên lớp = thêm dòng mới, giữ nguyên lịch sử
--   class_teachers: giáo viên phụ trách lớp nào → GV chỉ thấy lớp của mình
--   class_assistants: học sinh được cử làm trợ giảng, kèm bảng tick quyền
--
-- v3 thêm: chấm sao + nhận xét cho từng tiết, chat theo luồng của mỗi học sinh,
--          thông báo trong ứng dụng, và vai trò trợ giảng (TA).
-- ============================================================

create extension if not exists pgcrypto;

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

-- Ảnh đại diện: chỉ lưu đường dẫn trong Storage, không lưu URL (URL có hạn).
alter table public.profiles add column if not exists avatar_path text;

create table if not exists public.class_teachers (
  class_id uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

-- ---------- Trợ giảng (TA) ----------
-- TA vẫn là học sinh: profiles.role giữ nguyên 'student', dữ liệu cá nhân của em
-- vẫn riêng tư. Chỉ thêm dòng ở đây kèm bảng tick quyền do giáo viên bật/tắt.
-- Mặc định đóng các quyền nhạy cảm: TA là bạn cùng lớp, phản tư và ghi chú
-- riêng của học sinh viết ra với giả định chỉ giáo viên đọc.
create table if not exists public.class_assistants (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  can_view_plans       boolean not null default true,   -- kế hoạch: môn, nhiệm vụ, đúng hạn
  can_view_help        boolean not null default true,   -- danh sách "em cần hỗ trợ"
  can_chat             boolean not null default true,   -- nhắn tin với bạn trong lớp
  can_view_reflections boolean not null default false,  -- nội dung phản tư đầy đủ
  can_view_evidence    boolean not null default false,  -- file minh chứng
  can_rate             boolean not null default false,  -- chấm sao 1–5
  can_comment          boolean not null default false,  -- viết nhận xét
  can_review_device    boolean not null default false,  -- duyệt đăng ký thiết bị
  granted_by uuid references public.profiles(id) on delete set null,
  -- v5: duyệt kế hoạch (khác với duyệt thiết bị). Mặc định đóng.
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
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
  -- Phản hồi của giáo viên / trợ giảng
  teacher_comment text check (teacher_comment is null or char_length(teacher_comment) <= 1000),
  teacher_comment_by uuid references public.profiles(id) on delete set null,
  teacher_comment_at timestamptz,
  help_resolved boolean not null default false,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint help_note_required check (not need_help or nullif(trim(help_note),'') is not null)
);

alter table public.class_assistants add column if not exists can_approve_plan boolean not null default false;

-- v5: DUYỆT KẾ HOẠCH — tách hẳn khỏi tiến độ cập nhật kết quả.
-- Một kế hoạch có hai chiều độc lập: "đã duyệt chưa" và "đã cập nhật kết quả chưa".
-- Ví dụ hoàn toàn hợp lệ: Đã duyệt · Trễ hạn cập nhật.
alter table public.plans add column if not exists review_status text not null default 'Chờ duyệt';
alter table public.plans add column if not exists review_by uuid references public.profiles(id) on delete set null;
alter table public.plans add column if not exists review_at timestamptz;
alter table public.plans add column if not exists review_note text;
-- Tăng mỗi lần đổi kết luận duyệt — dùng làm khóa chống trùng thông báo.
alter table public.plans add column if not exists review_version integer not null default 0;

-- 'Không cần duyệt': kế hoạch KHÔNG dùng thiết bị điện tử thì không phải qua tay
-- giáo viên. Để riêng một trạng thái thay vì gộp vào 'Đã duyệt' để thầy cô phân
-- biệt được "tôi đã xem" và "hệ thống bỏ qua vì không cần".
do $$ begin
  alter table public.plans drop constraint if exists plans_review_status_check;
  alter table public.plans add constraint plans_review_status_check
    check (review_status in ('Chờ duyệt','Đã duyệt','Cần điều chỉnh','Không cần duyệt'));
exception when others then null; end $$;

do $$ begin
  alter table public.plans add constraint plans_review_note_check
    check (review_note is null or char_length(review_note) <= 500);
exception when duplicate_object then null; end $$;

create index if not exists plans_review_idx on public.plans (class_id, review_status);

-- Phần chuyển dữ liệu cũ nằm ở CUỐI FILE, sau khi mọi trigger đã được thay thế.
-- Nếu để ở đây, trigger bản cũ vẫn đang hiệu lực sẽ hoàn nguyên lệnh update.

-- ---------- BUỔI TỰ HỌC (session) vs NHIỆM VỤ (task) ----------
-- Một buổi tự học = (học sinh, ngày, tiết). Trong một buổi em có thể đăng ký
-- NHIỀU nhiệm vụ. Trước v7 mỗi dòng plans là một buổi kèm đúng một nhiệm vụ,
-- và ràng buộc unique(student, date, period) chặn cứng việc thêm nhiệm vụ thứ hai.
--
-- Cách làm: giữ nguyên bảng plans làm bảng NHIỆM VỤ (mọi thứ đang trỏ vào
-- plans.id — reflections, evidence, notifications — nên đổi tên bảng sẽ rất tốn
-- kém và rủi ro), chỉ thêm session_id. Ngày/tiết/lớp vẫn nằm trên plans nhưng
-- do trigger sao chép từ session nên KHÔNG thể lệch nhau.
create table if not exists public.self_study_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id   uuid not null references public.classes(id) on delete cascade,
  study_date date not null,
  period     smallint not null check (period between 1 and 9),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, study_date, period)
);

create index if not exists sessions_class_date_idx on public.self_study_sessions (class_id, study_date desc);
create index if not exists sessions_student_idx    on public.self_study_sessions (student_id, study_date desc);

alter table public.plans add column if not exists session_id uuid references public.self_study_sessions(id) on delete cascade;
-- Môn "Khác" cần ghi rõ là môn gì, nếu không thống kê môn sẽ mất dữ liệu.
alter table public.plans add column if not exists subject_other text;

do $$ begin
  alter table public.plans add constraint plans_subject_other_check
    check (subject_other is null or char_length(subject_other) <= 100);
exception when duplicate_object then null; end $$;

create index if not exists plans_session_idx on public.plans (session_id);

-- ---------- Lịch tự học cố định của lớp ----------
-- Lớp được phân giờ tự học cố định theo tuần (ví dụ: thứ Hai tiết 5, thứ Tư tiết 1).
-- Khai báo ở đây để: (1) học sinh chỉ chọn được đúng khung giờ của lớp,
-- (2) giáo viên biết chính xác ngày nào ai chưa đăng ký.
create table if not exists public.class_schedule (
  class_id uuid not null references public.classes(id) on delete cascade,
  weekday  smallint not null check (weekday between 1 and 7),   -- 1 = Thứ Hai … 7 = Chủ nhật
  period   smallint not null check (period between 1 and 9),
  created_at timestamptz not null default now(),
  primary key (class_id, weekday, period)
);

-- v4: đánh dấu bản ghi do hệ thống tự sinh khi học sinh không cập nhật kết quả.
alter table public.reflections add column if not exists auto_evaluated boolean not null default false;
alter table public.reflections add column if not exists auto_evaluated_at timestamptz;
-- Học sinh cập nhật bổ sung SAU khi đã bị tự đánh giá → giáo viên cần xem lại.
alter table public.reflections add column if not exists late_result_at timestamptz;
alter table public.reflections add column if not exists needs_recheck boolean not null default false;

-- v3: chấm sao 1–5 và phần học sinh phải phản hồi khi bị đánh giá thấp.
alter table public.reflections add column if not exists rating smallint;
alter table public.reflections add column if not exists rating_by uuid references public.profiles(id) on delete set null;
alter table public.reflections add column if not exists rating_at timestamptz;
alter table public.reflections add column if not exists student_ack_note text;
alter table public.reflections add column if not exists student_ack_at timestamptz;

do $$ begin
  alter table public.reflections add constraint rating_range check (rating is null or rating between 1 and 5);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.reflections add constraint ack_note_length check (student_ack_note is null or char_length(student_ack_note) <= 500);
exception when duplicate_object then null; end $$;

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

-- Minh chứng dạng CHỮ: không phải sản phẩm nào cũng có file hay link (giải xong
-- bài trên vở, học thuộc một đoạn…). Cho em mô tả bằng lời để vẫn có gì đó nộp.
alter table public.evidence add column if not exists body_text text;

do $$ begin
  alter table public.evidence drop constraint if exists evidence_kind_check;
  alter table public.evidence add constraint evidence_kind_check
    check (kind in ('image','file','link','text'));

  alter table public.evidence drop constraint if exists evidence_location;
  alter table public.evidence add constraint evidence_location check (
    (kind in ('image','file') and storage_path is not null and external_url is null)
    or (kind = 'link' and external_url is not null and storage_path is null)
    or (kind = 'text'  and storage_path is null and external_url is null
        and char_length(trim(coalesce(body_text, ''))) between 1 and 2000)
  );
end $$;

-- ---------- Chat ----------
-- Mỗi học sinh có ĐÚNG MỘT luồng trong lớp. Giáo viên và trợ giảng (nếu được bật
-- quyền chat) cùng đọc và trả lời trong luồng đó; học sinh không thấy luồng của bạn.
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- Mốc đã đọc của từng người trong từng luồng — dùng để đếm tin chưa đọc.
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ---------- Thông báo trong ứng dụng ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('rating','comment','message','device','system')),
  title text not null,
  body text,
  plan_id uuid references public.plans(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Mở rộng loại thông báo cho phần tự động (nhắc trễ hạn, tự đánh giá).
do $$ begin
  alter table public.notifications drop constraint if exists notifications_kind_check;
  alter table public.notifications add constraint notifications_kind_check
    check (kind in ('rating','comment','message','device','system','overdue','auto_rating','late_result'));
exception when others then null; end $$;

-- Khóa chống trùng: mỗi sự kiện chỉ sinh đúng một thông báo, dù job chạy lại
-- bao nhiêu lần. Ví dụ 'task-overdue:<plan_id>'.
alter table public.notifications add column if not exists dedupe_key text;
create unique index if not exists notifications_dedupe_idx
  on public.notifications (dedupe_key) where dedupe_key is not null;

-- ---------- Cấu hình hạn cập nhật kết quả ----------
-- Để ở bảng thay vì hằng số trong code: nhà trường đổi quy định thì sửa một dòng.
create table if not exists public.app_settings (
  key text primary key,
  value_int integer,
  note text,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value_int, note) values
  ('overdue_hours', 48,  'Sau bao nhiêu giờ kể từ khi hết buổi tự học mà chưa cập nhật kết quả thì coi là trễ hạn'),
  ('auto_rating_hours', 120, 'Sau bao nhiêu giờ thì hệ thống tự đánh giá 1 sao'),
  ('period_end_hour', 22, 'Giờ (theo giờ VN) coi như kết thúc buổi tự học trong ngày — mốc bắt đầu đếm hạn')
on conflict (key) do nothing;

-- 10 mẫu phản hồi thiện chí dùng khi hệ thống tự đánh giá.
create table if not exists public.auto_feedback_templates (
  id smallint primary key,
  body text not null
);

insert into public.auto_feedback_templates (id, body) values
 (1,'Thầy/cô chưa nhận được phần cập nhật kết quả của kế hoạch này. Em nhớ cập nhật sau mỗi giờ tự học để việc theo dõi tiến độ của mình được đầy đủ hơn nhé.'),
 (2,'Kế hoạch đã qua thời hạn cập nhật kết quả. Lần tới em hãy dành vài phút sau giờ tự học để ghi lại những gì mình đã hoàn thành nhé.'),
 (3,'Em đã có bước lập kế hoạch, nhưng phần kết quả vẫn chưa được cập nhật. Hãy cố gắng hoàn thành cả hai bước để việc tự học hiệu quả hơn nhé.'),
 (4,'Thầy/cô chưa thấy kết quả thực hiện của kế hoạch này. Việc cập nhật kết quả sẽ giúp em nhìn lại tiến độ và điều chỉnh cách học cho những lần tiếp theo.'),
 (5,'Kế hoạch này chưa có thông tin kết quả sau thời gian quy định. Em hãy lưu ý cập nhật sớm hơn ở những lần tự học tiếp theo nhé.'),
 (6,'Việc tự học sẽ hiệu quả hơn khi em vừa lập kế hoạch vừa nhìn lại kết quả. Lần tới em nhớ hoàn thành phần cập nhật sau giờ học nhé.'),
 (7,'Em chưa cập nhật kết quả cho kế hoạch này đúng thời gian. Hãy tạo thói quen ghi lại tiến độ ngay sau khi hoàn thành giờ tự học nhé.'),
 (8,'Thầy/cô chưa có đủ thông tin để ghi nhận kết quả của kế hoạch này. Em hãy chú ý hoàn thành phần cập nhật trong những lần tiếp theo nhé.'),
 (9,'Kế hoạch đã được đăng ký nhưng chưa có phần tổng kết kết quả. Lần tới em hãy dành một vài phút để hoàn thiện bước cuối của quá trình tự học nhé.'),
 (10,'Một kế hoạch tự học tốt cần có cả mục tiêu và kết quả. Em hãy cố gắng cập nhật đầy đủ hơn để theo dõi sự tiến bộ của chính mình nhé.')
on conflict (id) do update set body = excluded.body;

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

-- ---------- Phân quyền nhân sự lớp (giáo viên + trợ giảng) ----------
-- Một chỗ duy nhất quyết định "ai được làm gì với lớp nào".
-- Giáo viên phụ trách lớp: được tất cả. Trợ giảng: theo đúng ô đã tick.
create or replace function public.staff_perm(p_class uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.class_teachers
                 where class_id = p_class and teacher_id = auth.uid()) then true
    else coalesce((
      select case p_perm
        when 'view_plans'       then can_view_plans
        when 'view_help'        then can_view_help
        when 'chat'             then can_chat
        when 'view_reflections' then can_view_reflections
        when 'view_evidence'    then can_view_evidence
        when 'rate'             then can_rate
        when 'comment'          then can_comment
        when 'review_device'    then can_review_device
        when 'approve_plan'     then can_approve_plan
        else false
      end
      from public.class_assistants
      where class_id = p_class and student_id = auth.uid()
    ), false)
  end;
$$;

-- Người đang đăng nhập có quyền p_perm với học sinh này (qua lớp em đang học) không?
create or replace function public.staff_sees_student(p_student uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students s
    join public.enrollments e  on e.mshs = s.mshs and e.is_active
    join public.classes c      on c.id = e.class_id
    join public.school_years y on y.id = c.school_year_id and y.is_active
    where s.claimed_user_id = p_student and public.staff_perm(c.id, p_perm)
  );
$$;

-- Người đang đăng nhập có được nhìn thấy TÊN của học sinh này không?
-- Rộng hơn staff_sees_student(…, 'view_plans') một chút, và có lý do: trợ giảng
-- chỉ được bật quyền xem yêu cầu hỗ trợ hoặc nhắn tin vẫn phải đọc được tên bạn,
-- nếu không dashboard trợ giảng chỉ hiện một dãy dấu gạch.
create or replace function public.staff_sees_student_name(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.students s
    join public.enrollments e  on e.mshs = s.mshs and e.is_active
    join public.classes c      on c.id = e.class_id
    join public.school_years y on y.id = c.school_year_id and y.is_active
    where s.claimed_user_id = p_student
      and (
        public.staff_perm(c.id, 'view_plans')
        or public.staff_perm(c.id, 'view_help')
        or public.staff_perm(c.id, 'chat')
      )
  );
$$;

-- p_user có phải giáo viên / trợ giảng của LỚP MÌNH không?
-- Cần cho chat: nếu không, học sinh không đọc được tên người đang nhắn với mình.
create or replace function public.shares_class_staff(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c      on c.id = e.class_id
    join public.school_years y on y.id = c.school_year_id and y.is_active
    where e.mshs = public.my_mshs() and e.is_active
      and (
        exists (select 1 from public.class_teachers ct where ct.class_id = c.id and ct.teacher_id = p_user)
        or exists (select 1 from public.class_assistants ca where ca.class_id = c.id and ca.student_id = p_user)
      )
  );
$$;

-- Người đang đăng nhập có phải trợ giảng của lớp nào đó không (để hiện menu TA).
create or replace function public.is_assistant()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_assistants where student_id = auth.uid());
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
                      public.teaches_mshs(text), public.my_mshs(), public.student_active_class(uuid),
                      public.staff_perm(uuid, text), public.staff_sees_student(uuid, text),
                      public.shares_class_staff(uuid), public.is_assistant(),
                      public.staff_sees_student_name(uuid) from public;
grant execute on function public.is_teacher(), public.teaches_class(uuid), public.teaches_user(uuid),
                          public.teaches_mshs(text), public.my_mshs(), public.student_active_class(uuid),
                          public.staff_perm(uuid, text), public.staff_sees_student(uuid, text),
                          public.shares_class_staff(uuid), public.is_assistant(),
                          public.staff_sees_student_name(uuid) to authenticated;

-- Khi TẠO kế hoạch: lớp do server gán, và trạng thái duyệt thiết bị luôn bắt đầu
-- ở 'Chờ duyệt' — học sinh không thể tự khai là đã được duyệt.
create or replace function public.plans_set_class()
returns trigger language plpgsql security definer set search_path = public as $$
declare c uuid; s record;
begin
  if new.session_id is not null then
    -- Buổi tự học là nguồn sự thật: ngày/tiết/lớp/học sinh chép từ đó xuống,
    -- nên nhiều nhiệm vụ trong cùng buổi không thể lệch ngày hay lệch tiết.
    select * into s from public.self_study_sessions where id = new.session_id;
    if s is null then
      raise exception 'Buổi tự học không tồn tại';
    end if;
    new.student_id := s.student_id;
    new.class_id   := s.class_id;
    new.study_date := s.study_date;
    new.period     := s.period;
  else
    -- Không gửi session_id (giao diện bản cũ): tự tìm hoặc tạo buổi tương ứng.
    c := public.student_active_class(new.student_id);
    if c is null then
      raise exception 'Học sinh chưa được ghi danh vào lớp nào của năm học hiện hành';
    end if;
    insert into public.self_study_sessions (student_id, class_id, study_date, period)
    values (new.student_id, c, new.study_date, new.period)
    on conflict (student_id, study_date, period) do update set updated_at = now()
    returning id into new.session_id;
    new.class_id := c;
  end if;

  -- auth.uid() null nghĩa là service role (script quản trị / seed) — giữ nguyên giá trị.
  if auth.uid() is not null then
    new.device_status      := case when new.use_device then 'Chờ duyệt' else 'Không dùng' end;
    new.device_reviewed_by := null;
    new.device_reviewed_at := null;
    new.device_review_note := null;
    -- Chỉ kế hoạch có dùng thiết bị mới vào hàng chờ duyệt của giáo viên.
    new.review_status      := case when new.use_device then 'Chờ duyệt' else 'Không cần duyệt' end;
    new.review_by          := null;
    new.review_at          := null;
    new.review_note        := null;
    new.review_version     := 0;
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
  -- auth.uid() NULL = service role (migration, script quản trị, job nền).
  -- Không chặn gì cả, nếu không mọi lệnh sửa từ server sẽ bị hoàn nguyên âm thầm.
  if auth.uid() is null then
    return new;
  end if;

  if auth.uid() = old.student_id then
    -- Học sinh: không đụng vào kết quả duyệt thiết bị.
    new.device_status      := old.device_status;
    new.device_reviewed_by := old.device_reviewed_by;
    new.device_reviewed_at := old.device_reviewed_at;
    new.device_review_note := old.device_review_note;
    -- Kết luận duyệt là việc của giáo viên: mặc định giữ nguyên.
    -- ĐẶT TRƯỚC hai khối bên dưới, vì chúng mới là ngoại lệ được phép đổi.
    new.review_status  := old.review_status;
    new.review_by      := old.review_by;
    new.review_at      := old.review_at;
    new.review_note    := old.review_note;
    new.review_version := old.review_version;

    -- Ngoại lệ 1: bật/tắt thiết bị. Bật → phải chờ duyệt. Tắt → không cần duyệt.
    if new.use_device is distinct from old.use_device then
      new.device_status := case when new.use_device then 'Chờ duyệt' else 'Không dùng' end;
      new.device_reviewed_by := null;
      new.device_reviewed_at := null;
      new.device_review_note := null;
      new.review_status  := case when new.use_device then 'Chờ duyệt' else 'Không cần duyệt' end;
      new.review_by      := null;
      new.review_at      := null;
      new.review_note    := null;
      new.review_version := old.review_version + 1;

    -- Ngoại lệ 2: sửa nội dung kế hoạch đang bị "Cần điều chỉnh" → quay lại hàng chờ.
    elsif old.review_status = 'Cần điều chỉnh'
       and (new.task is distinct from old.task
            or new.goal is distinct from old.goal
            or new.subject is distinct from old.subject) then
      new.review_status  := case when new.use_device then 'Chờ duyệt' else 'Không cần duyệt' end;
      new.review_version := old.review_version + 1;
    end if;
  else
    -- Nhân sự lớp: CHỈ được duyệt thiết bị / duyệt kế hoạch, không sửa nội dung.
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
    if new.review_status is distinct from old.review_status then
      if public.staff_perm(old.class_id, 'approve_plan') then
        new.review_by      := auth.uid();
        new.review_at      := now();
        new.review_version := old.review_version + 1;
      else
        new.review_status  := old.review_status;
        new.review_by      := old.review_by;
        new.review_at      := old.review_at;
        new.review_note    := old.review_note;
        new.review_version := old.review_version;
      end if;
    end if;
    if new.device_status is distinct from old.device_status then
      if public.staff_perm(old.class_id, 'review_device') then
        new.device_reviewed_by := auth.uid();
        new.device_reviewed_at := now();
      else
        new.device_status      := old.device_status;
        new.device_reviewed_by := old.device_reviewed_by;
        new.device_reviewed_at := old.device_reviewed_at;
        new.device_review_note := old.device_review_note;
      end if;
    end if;

    -- Duyệt thiết bị và duyệt kế hoạch là MỘT quyết định. Đồng bộ hai chiều ngay
    -- trong trigger để thầy cô bấm một lần là xong, và để mọi đường vào (bảng,
    -- popup chi tiết, duyệt hàng loạt) đều cho ra cùng một kết quả.
    if new.device_status is distinct from old.device_status
       and new.device_status in ('Đã duyệt', 'Từ chối')
       and public.staff_perm(old.class_id, 'review_device') then
      new.review_status  := case when new.device_status = 'Đã duyệt' then 'Đã duyệt' else 'Cần điều chỉnh' end;
      new.review_by      := auth.uid();
      new.review_at      := now();
      new.review_version := old.review_version + 1;
      if new.device_status = 'Từ chối' then
        new.review_note := coalesce(nullif(trim(coalesce(new.device_review_note, '')), ''), new.review_note);
      end if;
    end if;

    -- Chiều ngược lại: duyệt kế hoạch có dùng thiết bị thì thiết bị cũng được duyệt.
    if new.review_status = 'Đã duyệt'
       and old.review_status is distinct from 'Đã duyệt'
       and old.use_device and old.device_status = 'Chờ duyệt'
       and public.staff_perm(old.class_id, 'review_device') then
      new.device_status      := 'Đã duyệt';
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
declare v_class uuid;
begin
  -- Xem chú thích ở plans_guard_columns: service role không bị chặn.
  if auth.uid() is null then
    return new;
  end if;

  select class_id into v_class from public.plans where id = new.plan_id;

  if auth.uid() = old.student_id then
    -- Học sinh: không tự chấm sao, không tự viết nhận xét, không tự đánh dấu đã xử lý.
    new.teacher_comment    := old.teacher_comment;
    new.teacher_comment_by := old.teacher_comment_by;
    new.teacher_comment_at := old.teacher_comment_at;
    new.help_resolved      := old.help_resolved;
    new.rating             := old.rating;
    new.rating_by          := old.rating_by;
    new.rating_at          := old.rating_at;
    -- Dấu vết hệ thống: học sinh không tự đặt được.
    new.auto_evaluated     := old.auto_evaluated;
    new.auto_evaluated_at  := old.auto_evaluated_at;
    new.late_result_at     := old.late_result_at;
    new.needs_recheck      := old.needs_recheck;
    -- Phản hồi khi bị đánh giá thấp: chỉ ghi được khi thực sự có sao 1–2.
    if new.student_ack_note is distinct from old.student_ack_note then
      if coalesce(old.rating, 5) > 2 then
        new.student_ack_note := old.student_ack_note;
        new.student_ack_at   := old.student_ack_at;
      else
        new.student_ack_at := case when nullif(trim(new.student_ack_note), '') is null then null else now() end;
      end if;
    end if;
  else
    -- Nhân sự lớp: KHÔNG đụng vào phần học sinh tự viết.
    new.student_id        := old.student_id;
    new.completion_status := old.completion_status;
    new.note              := old.note;
    new.need_help         := old.need_help;
    new.help_note         := old.help_note;
    new.completed_at      := old.completed_at;
    new.student_ack_note  := old.student_ack_note;
    new.student_ack_at    := old.student_ack_at;
    new.auto_evaluated    := old.auto_evaluated;
    new.auto_evaluated_at := old.auto_evaluated_at;
    new.late_result_at    := old.late_result_at;
    -- Giáo viên được tắt cờ "cần xem lại" sau khi đã chấm lại.

    -- Nhận xét: giáo viên luôn được; trợ giảng phải được bật quyền.
    if new.teacher_comment is distinct from old.teacher_comment then
      if public.staff_perm(v_class, 'comment') then
        new.teacher_comment_by := auth.uid();
        new.teacher_comment_at := now();
      else
        new.teacher_comment    := old.teacher_comment;
        new.teacher_comment_by := old.teacher_comment_by;
        new.teacher_comment_at := old.teacher_comment_at;
      end if;
    end if;

    -- Chấm sao: tương tự.
    if new.rating is distinct from old.rating then
      if public.staff_perm(v_class, 'rate') then
        new.rating_by := auth.uid();
        new.rating_at := now();
        -- Chấm lại từ thấp lên cao thì xóa phần phản hồi cũ cho sạch.
        if coalesce(new.rating, 5) > 2 then
          new.student_ack_note := null;
          new.student_ack_at   := null;
        end if;
      else
        new.rating    := old.rating;
        new.rating_by := old.rating_by;
        new.rating_at := old.rating_at;
      end if;
    end if;

    if new.help_resolved is distinct from old.help_resolved
       and not public.staff_perm(v_class, 'comment') then
      new.help_resolved := old.help_resolved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reflections_guard_columns on public.reflections;
create trigger trg_reflections_guard_columns before update on public.reflections
for each row execute function public.reflections_guard_columns();

-- ---------- Đồng hồ đếm hạn cập nhật kết quả ----------
-- Mốc bắt đầu đếm = MUỘN HƠN giữa (lúc đăng ký) và (lúc kết thúc buổi tự học).
-- Nhờ vậy em đăng ký trước 10 ngày cũng không bị đánh trễ trước cả ngày học.
create or replace function public.result_clock_start(p_study_date date, p_created_at timestamptz)
returns timestamptz language sql stable set search_path = public as $$
  select greatest(
    p_created_at,
    (p_study_date::text || ' ' || lpad(coalesce((select value_int from public.app_settings where key='period_end_hour'), 22)::text, 2, '0') || ':00:00')
      ::timestamp at time zone 'Asia/Ho_Chi_Minh'
  );
$$;

-- Trạng thái tiến độ, suy ra từ dữ liệu chứ không nhập tay.
--   Chưa tới buổi · Đang làm · Trễ hạn cập nhật · Đã hoàn thành · Hệ thống tự đánh giá
create or replace function public.progress_status(
  p_study_date date, p_created_at timestamptz,
  p_has_result boolean, p_auto boolean
) returns text language sql stable set search_path = public as $$
  select case
    when p_auto then 'Hệ thống tự đánh giá'
    when p_has_result then 'Đã hoàn thành'
    when now() < public.result_clock_start(p_study_date, p_created_at) then 'Chưa tới buổi'
    when now() < public.result_clock_start(p_study_date, p_created_at)
         + make_interval(hours => coalesce((select value_int from public.app_settings where key='overdue_hours'), 48))
      then 'Đang chờ cập nhật'
    else 'Trễ hạn cập nhật'
  end;
$$;

grant execute on function public.result_clock_start(date, timestamptz),
                          public.progress_status(date, timestamptz, boolean, boolean) to authenticated;

-- View gộp sẵn để giao diện và analytics dùng chung MỘT định nghĩa trạng thái.
-- cascade vì session_status dựng trên plan_status; nó được tạo lại ngay bên dưới.
drop view if exists public.plan_status cascade;
create view public.plan_status with (security_invoker = true) as
select
  p.id as plan_id,
  p.student_id,
  p.class_id,
  p.study_date,
  p.period,
  p.subject,
  p.created_at,
  p.review_status,
  p.review_note,
  public.result_clock_start(p.study_date, p.created_at) as clock_start,
  public.result_clock_start(p.study_date, p.created_at)
    + make_interval(hours => coalesce((select value_int from public.app_settings where key='overdue_hours'), 48)) as overdue_at,
  public.result_clock_start(p.study_date, p.created_at)
    + make_interval(hours => coalesce((select value_int from public.app_settings where key='auto_rating_hours'), 120)) as auto_evaluate_at,
  (r.plan_id is not null) as has_result,
  coalesce(r.auto_evaluated, false) as auto_evaluated,
  public.progress_status(p.study_date, p.created_at, r.plan_id is not null, coalesce(r.auto_evaluated, false)) as progress,
  r.rating,
  r.needs_recheck,
  -- Đăng ký trước bao lâu (giờ) — dùng cho thống kê thói quen lập kế hoạch.
  round(extract(epoch from (
    (p.study_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh' - p.created_at
  )) / 3600.0, 1) as lead_time_hours
from public.plans p
left join public.reflections r on r.plan_id = p.id;

grant select on public.plan_status to authenticated;

-- Trạng thái của cả BUỔI suy ra từ các nhiệm vụ trong buổi — không nhập tay,
-- nên không bao giờ mâu thuẫn với trạng thái từng nhiệm vụ.
drop view if exists public.session_status;
create view public.session_status with (security_invoker = true) as
select
  s.id as session_id,
  s.student_id,
  s.class_id,
  s.study_date,
  s.period,
  s.created_at,
  count(ps.plan_id)                                             as so_nhiem_vu,
  count(*) filter (where ps.has_result)                         as da_cap_nhat,
  count(*) filter (where ps.progress = 'Trễ hạn cập nhật')      as tre_han,
  count(*) filter (where ps.progress = 'Hệ thống tự đánh giá')  as tu_danh_gia,
  count(*) filter (where p.review_status = 'Chờ duyệt')         as cho_duyet,
  bool_or(p.use_device)                                         as co_thiet_bi,
  round(avg(ps.rating)::numeric, 1)                             as diem_tb,
  case
    when count(*) filter (where ps.progress in ('Trễ hạn cập nhật','Hệ thống tự đánh giá')) > 0
      then 'Cần chú ý'
    when count(ps.plan_id) > 0 and count(*) filter (where ps.has_result) = count(ps.plan_id)
      then 'Đã hoàn thành'
    when count(*) filter (where ps.progress = 'Chưa tới buổi') = count(ps.plan_id)
      then 'Sắp tới'
    else 'Đang thực hiện'
  end as trang_thai
from public.self_study_sessions s
left join public.plans p       on p.session_id = s.id
left join public.plan_status ps on ps.plan_id  = p.id
group by s.id, s.student_id, s.class_id, s.study_date, s.period, s.created_at;

grant select on public.session_status to authenticated;

-- Hồ sơ: người dùng CHỈ được đổi ảnh đại diện của chính mình. Họ tên, MSHS, vai
-- trò và cờ must_change_password phải khớp danh sách chính thức nên khóa lại.
create or replace function public.profiles_guard_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if auth.uid() = old.id then
    new.id                   := old.id;
    new.role                 := old.role;
    new.mshs                 := old.mshs;
    new.full_name            := old.full_name;
    new.must_change_password := old.must_change_password;
    new.created_at           := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_columns on public.profiles;
create trigger trg_profiles_guard_columns before update on public.profiles
for each row execute function public.profiles_guard_columns();

-- ---------- Thông báo tự sinh ----------
-- Sinh ở CSDL chứ không ở frontend: không thể bỏ qua, và không thể giả mạo.
create or replace function public.notify_on_reflection_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_plan record;
begin
  select p.study_date, p.period, p.subject into v_plan from public.plans p where p.id = new.plan_id;

  if new.rating is distinct from old.rating and new.rating is not null then
    insert into public.notifications (user_id, kind, title, body, plan_id)
    values (
      new.student_id, 'rating',
      'Tiết ' || v_plan.period || ' môn ' || v_plan.subject || ' được chấm ' || new.rating || '/5',
      case when new.rating <= 2
        then 'Kết quả chưa đạt yêu cầu. Em hãy mở lại tiết này, đọc nhận xét và viết một dòng cho biết sẽ điều chỉnh thế nào.'
        else 'Giáo viên đã chấm sao cho tiết tự học của em.' end,
      new.plan_id
    );
  end if;

  if new.teacher_comment is distinct from old.teacher_comment and nullif(trim(new.teacher_comment), '') is not null then
    insert into public.notifications (user_id, kind, title, body, plan_id)
    values (new.student_id, 'comment',
            'Nhận xét mới cho tiết ' || v_plan.period || ' môn ' || v_plan.subject,
            new.teacher_comment, new.plan_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_reflection_feedback on public.reflections;
create trigger trg_notify_reflection_feedback after update on public.reflections
for each row execute function public.notify_on_reflection_feedback();

create or replace function public.notify_on_device_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.device_status is distinct from old.device_status
     and new.device_status in ('Đã duyệt', 'Từ chối') then
    insert into public.notifications (user_id, kind, title, body, plan_id)
    values (new.student_id, 'device',
            'Đăng ký thiết bị tiết ' || new.period || ' ngày ' || to_char(new.study_date, 'DD/MM') || ': ' || new.device_status,
            new.device_review_note, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_device_review on public.plans;
create trigger trg_notify_device_review after update on public.plans
for each row execute function public.notify_on_device_review();

-- Báo cho học sinh khi kế hoạch được duyệt / bị yêu cầu điều chỉnh.
create or replace function public.notify_on_plan_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_status is distinct from old.review_status
     and new.review_status in ('Đã duyệt','Cần điều chỉnh') then
    insert into public.notifications (user_id, kind, title, body, plan_id, dedupe_key)
    values (
      new.student_id,
      case when new.review_status = 'Đã duyệt' then 'device' else 'system' end,
      case when new.review_status = 'Đã duyệt'
        then 'Kế hoạch đã được duyệt'
        else 'Kế hoạch cần điều chỉnh' end,
      'Nhiệm vụ ' || new.subject || ' ngày ' || to_char(new.study_date, 'DD/MM')
        || ' · Tiết ' || new.period
        || case when new.review_status = 'Đã duyệt' then ' của em đã được duyệt.'
                else '. ' || coalesce(new.review_note, 'Em xem lại và chỉnh sửa giúp thầy cô nhé.') end,
      new.id,
      'plan-review:' || new.id || ':' || new.review_version
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_plan_review on public.plans;
create trigger trg_notify_plan_review after update on public.plans
for each row execute function public.notify_on_plan_review();

-- Tin nhắn: báo cho tất cả người trong luồng trừ người gửi.
create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv record; v_sender text; r record;
begin
  select c.*, p.full_name as student_name into v_conv
  from public.conversations c join public.profiles p on p.id = c.student_id
  where c.id = new.conversation_id;

  select full_name into v_sender from public.profiles where id = new.sender_id;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;

  -- Học sinh chủ luồng
  if new.sender_id <> v_conv.student_id then
    insert into public.notifications (user_id, kind, title, body, conversation_id)
    values (v_conv.student_id, 'message', 'Tin nhắn mới từ ' || v_sender, left(new.body, 160), new.conversation_id);
  end if;

  -- Giáo viên phụ trách lớp
  for r in select teacher_id from public.class_teachers where class_id = v_conv.class_id loop
    if r.teacher_id <> new.sender_id then
      insert into public.notifications (user_id, kind, title, body, conversation_id)
      values (r.teacher_id, 'message', 'Tin nhắn mới — ' || v_conv.student_name, left(new.body, 160), new.conversation_id);
    end if;
  end loop;

  -- Trợ giảng được bật quyền chat
  for r in select student_id from public.class_assistants where class_id = v_conv.class_id and can_chat loop
    if r.student_id <> new.sender_id and r.student_id <> v_conv.student_id then
      insert into public.notifications (user_id, kind, title, body, conversation_id)
      values (r.student_id, 'message', 'Tin nhắn mới — ' || v_conv.student_name, left(new.body, 160), new.conversation_id);
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notify_message on public.messages;
create trigger trg_notify_message after insert on public.messages
for each row execute function public.notify_on_message();

-- ---------- Tự động xử lý hạn cập nhật kết quả ----------
-- Chạy định kỳ bằng pg_cron. PHẢI idempotent: chạy lại 100 lần vẫn ra cùng kết quả,
-- nhờ khóa dedupe_key trên notifications và điều kiện "chưa có phản tư".
create or replace function public.process_self_study_deadlines()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_overdue int := 0;
  v_auto    int := 0;
  r record;
  v_body text;
begin
  -- 1) Quá 48 giờ mà chưa cập nhật kết quả → nhắc học sinh (mỗi kế hoạch một lần).
  for r in
    select ps.plan_id, ps.student_id, ps.study_date, ps.period, ps.subject
    from public.plan_status ps
    where not ps.has_result
      and now() >= ps.overdue_at
      and now() <  ps.auto_evaluate_at
  loop
    insert into public.notifications (user_id, kind, title, body, plan_id, dedupe_key)
    values (
      r.student_id, 'overdue',
      'Đừng quên cập nhật kết quả',
      'Em chưa cập nhật kết quả cho nhiệm vụ ' || r.subject || ' ngày '
        || to_char(r.study_date, 'DD/MM') || ' · Tiết ' || r.period
        || '. Hãy dành một chút thời gian ghi lại những gì em đã hoàn thành nhé.',
      r.plan_id, 'task-overdue:' || r.plan_id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
    if found then v_overdue := v_overdue + 1; end if;
  end loop;

  -- 2) Quá 120 giờ mà vẫn chưa cập nhật → hệ thống tự đánh giá 1 sao kèm phản hồi.
  for r in
    select ps.plan_id, ps.student_id, ps.study_date, ps.period, ps.subject
    from public.plan_status ps
    where not ps.has_result
      and now() >= ps.auto_evaluate_at
  loop
    -- Chọn ngẫu nhiên MỘT LẦN rồi lưu vào CSDL, không random lại mỗi lần hiển thị.
    select body into v_body from public.auto_feedback_templates order by random() limit 1;

    insert into public.reflections (
      plan_id, student_id, completion_status, note,
      rating, rating_at, teacher_comment, teacher_comment_at,
      auto_evaluated, auto_evaluated_at
    ) values (
      r.plan_id, r.student_id, 'Chưa hoàn thành', null,
      1, now(), v_body, now(),
      true, now()
    )
    on conflict (plan_id) do nothing;

    if found then
      v_auto := v_auto + 1;
      insert into public.notifications (user_id, kind, title, body, plan_id, dedupe_key)
      values (
        r.student_id, 'auto_rating',
        'Nhiệm vụ ' || r.subject || ' ngày ' || to_char(r.study_date, 'DD/MM') || ' được đánh giá 1/5',
        v_body,
        r.plan_id, 'task-auto-rating:' || r.plan_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end loop;

  return json_build_object(
    'chay_luc', timezone('Asia/Ho_Chi_Minh', now())::text,
    'nhac_tre_han', v_overdue,
    'tu_danh_gia', v_auto
  );
end;
$$;

revoke all on function public.process_self_study_deadlines() from public, anon, authenticated;

-- Học sinh cập nhật bổ sung SAU khi đã bị tự đánh giá:
-- giữ nguyên lịch sử tự đánh giá, đánh dấu để giáo viên xem lại và chấm lại.
create or replace function public.mark_late_result()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.auto_evaluated
     and auth.uid() = old.student_id
     and (new.completion_status is distinct from old.completion_status
          or new.note is distinct from old.note) then
    new.late_result_at := now();
    new.needs_recheck  := true;
  end if;
  return new;
end;
$$;

-- Tên bắt đầu bằng "z" để chạy SAU trg_reflections_guard_columns (Postgres gọi
-- trigger cùng loại theo thứ tự tên). Guard xóa các cột học sinh không được đặt,
-- rồi hàm này mới đóng dấu hợp lệ.
drop trigger if exists trg_mark_late_result on public.reflections;
drop trigger if exists trg_z_mark_late_result on public.reflections;
create trigger trg_z_mark_late_result before update on public.reflections
for each row execute function public.mark_late_result();

-- ---------- Ai chưa đăng ký cho một ngày cụ thể ----------
-- Nếu lớp đã khai lịch tự học cố định: liệt kê theo TỪNG TIẾT của ngày đó.
-- Nếu chưa khai lịch: chỉ xét "em này có kế hoạch nào trong ngày không".
-- Chỉ tính học sinh đã tạo tài khoản — em chưa đăng ký tài khoản là việc khác.
create or replace function public.missing_registrations(p_class uuid, p_date date)
returns table (student_id uuid, mshs text, full_name text, period smallint)
language sql stable security definer set search_path = public as $$
  with allowed as (
    select 1 where public.staff_perm(p_class, 'view_plans')
  ),
  slots as (
    select cs.period
    from public.class_schedule cs
    where cs.class_id = p_class
      and cs.weekday = extract(isodow from p_date)::smallint
  ),
  -- Phân biệt "lớp chưa khai lịch bao giờ" với "thứ này lớp không có tiết tự học".
  -- Thứ không có tiết thì KHÔNG ai bị coi là thiếu.
  has_schedule as (
    select 1 from public.class_schedule where class_id = p_class limit 1
  ),
  roster as (
    select s.claimed_user_id as sid, s.mshs, s.full_name
    from public.enrollments e
    join public.students s on s.mshs = e.mshs
    where e.class_id = p_class and e.is_active and s.claimed_user_id is not null
  )
  -- Có khai lịch → thiếu theo từng tiết
  select r.sid, r.mshs, r.full_name, sl.period
  from roster r
  cross join slots sl
  where exists (select 1 from allowed)
    and not exists (
      select 1 from public.plans p
      where p.student_id = r.sid and p.study_date = p_date and p.period = sl.period
    )
  union all
  -- Lớp CHƯA khai lịch bao giờ → chỉ xét "có kế hoạch nào trong ngày không"
  select r.sid, r.mshs, r.full_name, null::smallint
  from roster r
  where exists (select 1 from allowed)
    and not exists (select 1 from has_schedule)
    and not exists (
      select 1 from public.plans p
      where p.student_id = r.sid and p.study_date = p_date
    )
  order by 3, 4;
$$;

revoke all on function public.missing_registrations(uuid, date) from public, anon;
grant execute on function public.missing_registrations(uuid, date) to authenticated;

-- ---------- Duyệt kế hoạch hàng loạt ----------
-- Một lệnh thay vì 30 request từ trình duyệt. Chạy dưới quyền người gọi (không
-- phải security definer) nên RLS và trigger tách cột vẫn được áp dụng nguyên vẹn:
-- chỉ những kế hoạch thuộc lớp mà người gọi có quyền 'approve_plan' mới đổi được.
create or replace function public.bulk_review_plans(
  p_plan_ids uuid[],
  p_status   text,
  p_note     text default null
) returns json language plpgsql set search_path = public as $$
declare v_done int; v_ids uuid[];
begin
  if p_status not in ('Đã duyệt','Cần điều chỉnh','Chờ duyệt') then
    raise exception 'Trạng thái duyệt không hợp lệ: %', p_status;
  end if;

  with updated as (
    update public.plans
       set review_status = p_status,
           review_note   = nullif(trim(coalesce(p_note, '')), '')
     where id = any(p_plan_ids)
       and review_status is distinct from p_status
       and public.staff_perm(class_id, 'approve_plan')
    returning id
  )
  select count(*), coalesce(array_agg(id), '{}') into v_done, v_ids from updated;

  return json_build_object(
    'yeu_cau', coalesce(array_length(p_plan_ids, 1), 0),
    'da_xu_ly', v_done,
    'bo_qua', coalesce(array_length(p_plan_ids, 1), 0) - v_done,
    'trang_thai', p_status
  );
end;
$$;

revoke all on function public.bulk_review_plans(uuid[], text, text) from public, anon;
grant execute on function public.bulk_review_plans(uuid[], text, text) to authenticated;

-- ---------- Phân tích số liệu ----------
-- Gộp Ở CSDL, không gộp ở trình duyệt. Ba lý do:
--   1. Một request thay vì kéo cả nghìn dòng về rồi tính bằng JavaScript.
--   2. Định nghĩa "hoàn thành", "trễ hạn", "đúng hạn" chỉ tồn tại MỘT chỗ, dùng
--      lại view plan_status — số của học sinh và số của giáo viên không thể lệch.
--   3. Quyền được kiểm ở server. Học sinh gọi thẳng RPC cũng không lấy được
--      số liệu của bạn khác.
--
-- Hàm dựng bên dưới là security definer nên plan_status (security_invoker) chạy
-- dưới quyền chủ hàm và bỏ qua RLS. An toàn vì hàm này KHÔNG được cấp quyền cho
-- ai cả — chỉ hai hàm bọc ngoài, mỗi hàm tự kiểm quyền trước khi gọi, mới được.
create or replace function public.analytics_build(
  p_class uuid, p_student uuid, p_from date, p_to date, p_roster boolean
) returns json language sql stable security definer set search_path = public as $$
with base as (
  select
    p.id, p.student_id, p.study_date, p.period, p.created_at, p.session_id,
    p.use_device, p.device_status, p.review_status, p.priority,
    -- "Khác" mà có ghi rõ thì tính theo tên em ghi, không dồn hết vào một rổ.
    case when p.subject = 'Khác' and coalesce(p.subject_other, '') <> ''
         then p.subject_other else p.subject end as mon,
    ps.progress, ps.lead_time_hours, ps.has_result, ps.auto_evaluated, ps.rating,
    r.completion_status, r.need_help, r.help_resolved,
    (p.study_date < public.vn_today())                                     as da_qua,
    (p.study_date - (p.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= 1) as dung_han
  from public.plans p
  join public.plan_status ps on ps.plan_id = p.id
  left join public.reflections r on r.plan_id = p.id
  where p.study_date between p_from and p_to
    and (p_class   is null or p.class_id   = p_class)
    and (p_student is null or p.student_id = p_student)
),
-- Nhiệm vụ CHƯA TỚI NGÀY không được tính vào tỷ lệ hoàn thành: em chưa có cơ hội làm.
qua as (select * from base where da_qua),
sess as (select session_id, count(*) as so_nv from base group by session_id)
select json_build_object(
  'pham_vi', json_build_object(
    'tu', p_from, 'den', p_to, 'hom_nay', public.vn_today(),
    'nguong_xep_hang', 5
  ),
  'kpi', (select json_build_object(
      'so_buoi',          count(distinct session_id),
      'so_nhiem_vu',      count(*),
      'so_hoc_sinh',      count(distinct student_id),
      'da_qua',           count(*) filter (where da_qua),
      'sap_toi',          count(*) filter (where not da_qua),
      -- "Tự cập nhật" loại bỏ các tiết do hệ thống chấm thay: có bản ghi kết quả
      -- không có nghĩa là em đã tự nhìn lại.
      'tu_cap_nhat',      count(*) filter (where da_qua and has_result and not auto_evaluated),
      'hoan_thanh',       count(*) filter (where da_qua and completion_status = 'Hoàn thành'),
      'mot_phan',         count(*) filter (where da_qua and completion_status = 'Một phần'),
      'chua_hoan_thanh',  count(*) filter (where da_qua and completion_status = 'Chưa hoàn thành'),
      'dung_han',         count(*) filter (where dung_han),
      'tre_han',          count(*) filter (where progress = 'Trễ hạn cập nhật'),
      'tu_dong',          count(*) filter (where auto_evaluated),
      'can_ho_tro',       count(*) filter (where need_help and not coalesce(help_resolved, false)),
      'cho_duyet',        count(*) filter (where review_status = 'Chờ duyệt'),
      'can_dieu_chinh',   count(*) filter (where review_status = 'Cần điều chỉnh'),
      'diem_tb',          round(avg(rating) filter (where rating is not null and not auto_evaluated)::numeric, 2),
      'diem_tb_gom_tu_dong', round(avg(rating) filter (where rating is not null)::numeric, 2),
      'so_luot_cham',     count(*) filter (where rating is not null and not auto_evaluated),
      'lead_time_tb',     round(avg(lead_time_hours) filter (where lead_time_hours is not null)::numeric, 1),
      'lead_time_giua',   round((percentile_cont(0.5) within group (order by lead_time_hours))::numeric, 1)
    ) from base),
  'theo_ngay', coalesce((select json_agg(x order by x.ngay) from (
      select study_date as ngay,
             count(*) as so_nhiem_vu,
             count(distinct session_id) as so_buoi,
             count(*) filter (where da_qua) as da_qua,
             count(*) filter (where da_qua and has_result and not auto_evaluated) as tu_cap_nhat,
             count(*) filter (where da_qua and completion_status = 'Hoàn thành') as hoan_thanh,
             round(avg(rating) filter (where rating is not null and not auto_evaluated)::numeric, 2) as diem_tb
      from base group by study_date) x), '[]'::json),
  'theo_mon', coalesce((select json_agg(x order by x.so_nhiem_vu desc, x.mon) from (
      select mon,
             count(*) as so_nhiem_vu,
             count(*) filter (where da_qua and completion_status = 'Hoàn thành') as hoan_thanh,
             count(*) filter (where da_qua) as da_qua,
             round(avg(rating) filter (where rating is not null and not auto_evaluated)::numeric, 2) as diem_tb
      from base group by mon) x), '[]'::json),
  'theo_tiet', coalesce((select json_agg(x order by x.tiet) from (
      select period as tiet,
             count(*) as so_nhiem_vu,
             count(*) filter (where da_qua) as da_qua,
             count(*) filter (where da_qua and has_result and not auto_evaluated) as tu_cap_nhat,
             round(avg(rating) filter (where rating is not null and not auto_evaluated)::numeric, 2) as diem_tb
      from base group by period) x), '[]'::json),
  'thiet_bi', (select json_build_object(
      'co',        count(*) filter (where use_device),
      'khong',     count(*) filter (where not use_device),
      'da_duyet',  count(*) filter (where use_device and device_status = 'Đã duyệt'),
      'cho_duyet', count(*) filter (where use_device and device_status = 'Chờ duyệt'),
      'tu_choi',   count(*) filter (where use_device and device_status = 'Từ chối'),
      -- Dùng thiết bị có làm kết quả tốt hơn không — câu hỏi đáng hỏi mỗi kỳ.
      'diem_tb_co',    round(avg(rating) filter (where use_device and rating is not null and not auto_evaluated)::numeric, 2),
      'diem_tb_khong', round(avg(rating) filter (where not use_device and rating is not null and not auto_evaluated)::numeric, 2)
    ) from base),
  -- Tách sao THẦY CÔ chấm khỏi sao HỆ THỐNG tự ghi: gộp chung thì trung bình lớp
  -- bị kéo xuống bởi những tiết chưa ai đọc, và biểu đồ nói sai về chất lượng học.
  'phan_bo_sao', coalesce((select json_agg(x order by x.sao) from (
      select g.sao,
             count(b.id) filter (where not b.auto_evaluated) as thu_cong,
             count(b.id) filter (where b.auto_evaluated)     as tu_dong
      from generate_series(1, 5) as g(sao)
      left join base b on b.rating = g.sao
      group by g.sao) x), '[]'::json),
  'nhiem_vu_moi_buoi', coalesce((select json_agg(x order by x.so_nhiem_vu) from (
      select so_nv as so_nhiem_vu, count(*) as so_buoi from sess group by so_nv) x), '[]'::json),
  'lead_time', coalesce((select json_agg(x order by x.thu_tu) from (
      select 1 as thu_tu, 'Đăng ký trong ngày' as nhom, count(*) as so_luong from base where lead_time_hours < 24
      union all select 2, '1–2 ngày trước',  count(*) from base where lead_time_hours >= 24  and lead_time_hours < 72
      union all select 3, '3–7 ngày trước',  count(*) from base where lead_time_hours >= 72  and lead_time_hours < 192
      union all select 4, 'Hơn 1 tuần',      count(*) from base where lead_time_hours >= 192) x), '[]'::json),
  'hoc_sinh', case when not p_roster then '[]'::json else coalesce((
      select json_agg(x order by x.ho_ten) from (
        select b.student_id, pr.mshs, pr.full_name as ho_ten, pr.avatar_path,
               count(*) as so_nhiem_vu,
               count(distinct b.session_id) as so_buoi,
               count(*) filter (where b.da_qua) as da_qua,
               count(*) filter (where b.da_qua and b.has_result and not b.auto_evaluated) as tu_cap_nhat,
               count(*) filter (where b.da_qua and b.completion_status = 'Hoàn thành') as hoan_thanh,
               count(*) filter (where b.dung_han) as dung_han,
               count(*) filter (where b.progress = 'Trễ hạn cập nhật') as tre_han,
               count(*) filter (where b.auto_evaluated) as tu_dong,
               count(*) filter (where b.rating is not null and b.rating <= 2 and not b.auto_evaluated) as sao_thap,
               round(avg(b.rating) filter (where b.rating is not null and not b.auto_evaluated)::numeric, 2) as diem_tb,
               round(avg(b.lead_time_hours)::numeric, 1) as lead_time_tb,
               -- Ít dữ liệu thì KHÔNG xếp hạng. Một em có đúng 1 nhiệm vụ 5 sao
               -- không phải là em học tốt nhất lớp.
               (count(*) >= 5) as du_mau
        from base b
        join public.profiles pr on pr.id = b.student_id
        group by b.student_id, pr.mshs, pr.full_name, pr.avatar_path) x), '[]'::json) end
);
$$;

revoke all on function public.analytics_build(uuid, uuid, date, date, boolean) from public, anon, authenticated;

-- Phân tích cả lớp — chỉ giáo viên / trợ giảng có quyền xem kế hoạch.
create or replace function public.class_analytics(p_class uuid, p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_perm(p_class, 'view_plans') then
    raise exception 'Không có quyền xem số liệu của lớp này' using errcode = '42501';
  end if;
  return public.analytics_build(p_class, null, p_from, p_to, true);
end;
$$;

-- Phân tích một học sinh — chính em đó, hoặc giáo viên/TA phụ trách em.
-- Học sinh gọi thẳng RPC với id của bạn khác sẽ bị từ chối ở đây, không phải
-- chỉ ở giao diện.
create or replace function public.student_analytics(p_student uuid, p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if p_student is distinct from auth.uid()
     and not public.staff_sees_student(p_student, 'view_plans') then
    raise exception 'Không có quyền xem số liệu của học sinh này' using errcode = '42501';
  end if;
  return public.analytics_build(null, p_student, p_from, p_to, false);
end;
$$;

revoke all on function public.class_analytics(uuid, date, date)   from public, anon;
revoke all on function public.student_analytics(uuid, date, date) from public, anon;
grant execute on function public.class_analytics(uuid, date, date)   to authenticated;
grant execute on function public.student_analytics(uuid, date, date) to authenticated;

-- ---------- Lịch chạy tự động ----------
-- pg_cron dùng giờ UTC. 12:00 UTC = 19:00 VN (sau giờ học), 01:00 UTC = 08:00 VN.
-- Chạy 2 lần/ngày là đủ; hàm idempotent nên chạy thừa cũng vô hại.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('self-study-deadlines')
      where exists (select 1 from cron.job where jobname = 'self-study-deadlines');
    perform cron.schedule(
      'self-study-deadlines',
      '0 1,12 * * *',
      $job$ select public.process_self_study_deadlines(); $job$
    );
  end if;
end $$;

-- ---------- RLS ----------
alter table public.school_years       enable row level security;
alter table public.classes            enable row level security;
alter table public.class_teachers     enable row level security;
alter table public.class_assistants   enable row level security;
alter table public.class_schedule     enable row level security;
alter table public.self_study_sessions enable row level security;
alter table public.students           enable row level security;
alter table public.enrollments        enable row level security;
alter table public.profiles           enable row level security;
alter table public.plans              enable row level security;
alter table public.reflections        enable row level security;
alter table public.evidence           enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.notifications      enable row level security;

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
           where schemaname='public'
             and tablename in ('school_years','classes','class_teachers','class_assistants',
                               'students','enrollments','profiles','plans','reflections','evidence',
                               'conversations','messages','conversation_reads','notifications',
                               'class_schedule','self_study_sessions')
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

-- Trợ giảng: giáo viên quản lý toàn bộ; TA chỉ đọc được dòng quyền của CHÍNH MÌNH
-- (để giao diện biết hiện những gì), không xem được quyền của TA khác.
create policy assistants_teacher_all on public.class_assistants
for all to authenticated
using (public.teaches_class(class_id))
with check (public.teaches_class(class_id));

create policy assistants_self_read on public.class_assistants
for select to authenticated using (student_id = auth.uid());

-- Lịch tự học cố định: giáo viên lớp quản lý; ai trong lớp cũng đọc được
-- (học sinh cần biết lớp mình có giờ tự học vào tiết nào).
create policy schedule_teacher_all on public.class_schedule
for all to authenticated
using (public.teaches_class(class_id))
with check (public.teaches_class(class_id));

create policy schedule_read on public.class_schedule
for select to authenticated
using (public.staff_perm(class_id, 'view_plans') or class_id = public.student_active_class(auth.uid()));

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

-- Hồ sơ: HS đọc của mình và đọc tên giáo viên / trợ giảng lớp mình (để hiện trong
-- chat và nhận xét); giáo viên và trợ giảng đọc HS lớp mình.
create policy profiles_read on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.staff_sees_student_name(id)
  or public.shares_class_staff(id)
);

-- Đổi ảnh đại diện của chính mình; trigger phía trên khóa mọi cột khác.
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

-- BUỔI TỰ HỌC
create policy sessions_student_select on public.self_study_sessions
for select to authenticated using (student_id = auth.uid());

create policy sessions_student_insert on public.self_study_sessions
for insert to authenticated
with check (
  student_id = auth.uid()
  and study_date >= public.vn_today()
  and class_id = public.student_active_class(auth.uid())
);

-- Xóa buổi khi buổi đó không còn nhiệm vụ nào (dọn rác), chỉ với buổi tương lai.
create policy sessions_student_delete on public.self_study_sessions
for delete to authenticated
using (student_id = auth.uid() and study_date > public.vn_today());

create policy sessions_staff_select on public.self_study_sessions
for select to authenticated using (public.staff_perm(class_id, 'view_plans'));

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

create policy plans_staff_select on public.plans
for select to authenticated using (public.staff_perm(class_id, 'view_plans'));

-- Nhân sự lớp được UPDATE để duyệt thiết bị; trigger phía trên khóa mọi cột khác lại
-- và tự kiểm quyền review_device.
create policy plans_staff_update on public.plans
for update to authenticated
using (public.staff_perm(class_id, 'review_device') or public.staff_perm(class_id, 'approve_plan'))
with check (public.staff_perm(class_id, 'review_device') or public.staff_perm(class_id, 'approve_plan'));

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

-- Đọc phản tư đầy đủ: giáo viên luôn; trợ giảng chỉ khi được bật view_reflections.
-- TA chỉ có view_help thì dùng view public.help_requests bên dưới (lọc sẵn cột).
create policy reflections_staff_select on public.reflections
for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and public.staff_perm(p.class_id, 'view_reflections')));

-- Ghi: mở cho ai có quyền nhận xét HOẶC chấm sao; trigger quyết định cột nào được đổi.
create policy reflections_staff_update on public.reflections
for update to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id
               and (public.staff_perm(p.class_id, 'comment') or public.staff_perm(p.class_id, 'rate'))))
with check (exists (select 1 from public.plans p where p.id = plan_id
               and (public.staff_perm(p.class_id, 'comment') or public.staff_perm(p.class_id, 'rate'))));

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

create policy evidence_staff_select on public.evidence
for select to authenticated
using (exists (select 1 from public.plans p where p.id = plan_id and public.staff_perm(p.class_id, 'view_evidence')));

-- ---------- CHAT ----------
-- Luồng của học sinh: chính em, giáo viên lớp, và trợ giảng được bật quyền chat.
create policy conversations_read on public.conversations
for select to authenticated
using (student_id = auth.uid() or public.staff_perm(class_id, 'chat'));

create policy conversations_insert on public.conversations
for insert to authenticated
with check (
  (student_id = auth.uid() and class_id = public.student_active_class(auth.uid()))
  or public.staff_perm(class_id, 'chat')
);

create policy messages_read on public.messages
for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id
               and (c.student_id = auth.uid() or public.staff_perm(c.class_id, 'chat'))));

-- Chỉ gửi được với danh nghĩa chính mình, và chỉ trong luồng mình có mặt.
create policy messages_insert on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (select 1 from public.conversations c where c.id = conversation_id
              and (c.student_id = auth.uid() or public.staff_perm(c.class_id, 'chat')))
);

create policy reads_own on public.conversation_reads
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------- THÔNG BÁO ----------
-- Chỉ đọc của mình; chỉ được đổi mốc đã đọc. Bản ghi do trigger sinh bằng service role.
create policy notifications_read on public.notifications
for select to authenticated using (user_id = auth.uid());

create policy notifications_mark_read on public.notifications
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- VIEW cho trợ giảng chỉ có quyền xem "cần hỗ trợ" ----------
-- RLS chặn được dòng nhưng không chặn được cột, nên phần TA được xem giới hạn
-- phải đi qua view: chỉ lộ nội dung yêu cầu hỗ trợ, KHÔNG lộ ghi chú phản tư
-- riêng tư, nhận xét của giáo viên hay điểm sao.
drop view if exists public.help_requests;
create view public.help_requests
with (security_invoker = false) as
select
  r.plan_id,
  r.student_id,
  r.help_note,
  r.help_resolved,
  r.completed_at,
  p.class_id,
  p.study_date,
  p.period,
  p.subject
from public.reflections r
join public.plans p on p.id = r.plan_id
where r.need_help
  and public.staff_perm(p.class_id, 'view_help');

grant select on public.help_requests to authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence','evidence',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Bucket ảnh đại diện. ĐỂ RIÊNG TƯ: đây là ảnh của trẻ vị thành niên, không nên
-- ai có link cũng xem được. Hiển thị bằng signed URL ngắn hạn.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatar_write_own on storage.objects;
drop policy if exists avatar_read on storage.objects;

-- Chỉ ghi được vào đúng thư mục mang id của chính mình.
create policy avatar_write_own on storage.objects
for all to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Đọc: của mình, của học sinh mình phụ trách, hoặc của giáo viên/trợ giảng lớp mình.
create policy avatar_read on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.staff_sees_student_name(((storage.foldername(name))[1])::uuid)
    or public.shares_class_staff(((storage.foldername(name))[1])::uuid)
  )
);

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
    or public.staff_sees_student(((storage.foldername(name))[1])::uuid, 'view_evidence')
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

-- ---------- Index ----------
-- Truy vấn hay dùng: theo lớp + ngày (dashboard giáo viên), theo học sinh + ngày
-- (trang của em), lọc theo môn / thiết bị, và đếm thông báo chưa đọc.
create index if not exists plans_class_date_idx    on public.plans (class_id, study_date desc);
create index if not exists plans_student_date_idx  on public.plans (student_id, study_date desc);
create index if not exists plans_subject_idx       on public.plans (subject);
create index if not exists plans_device_idx        on public.plans (device_status) where use_device;
create index if not exists reflections_student_idx on public.reflections (student_id);
create index if not exists reflections_rating_idx  on public.reflections (rating) where rating is not null;
create index if not exists evidence_plan_idx       on public.evidence (plan_id);
create index if not exists notif_unread_idx        on public.notifications (user_id) where read_at is null;
create index if not exists enrollments_class_idx   on public.enrollments (class_id) where is_active;

-- ---------- Quyền cấp bảng ----------
-- RLS là lớp chặn theo dòng. Grant là lớp thứ hai: thu hồi toàn bộ quyền mặc định
-- của Supabase rồi trả lại đúng những verb thực sự cần.
revoke all on public.school_years, public.classes, public.class_teachers, public.class_assistants,
              public.students, public.enrollments, public.profiles, public.plans, public.reflections,
              public.evidence, public.conversations, public.messages, public.conversation_reads,
              public.notifications, public.class_schedule, public.self_study_sessions
       from anon, authenticated;

grant select on public.school_years, public.classes, public.class_teachers, public.class_assistants,
                public.students, public.enrollments, public.profiles, public.plans, public.reflections,
                public.evidence, public.conversations, public.messages, public.conversation_reads,
                public.notifications, public.class_schedule, public.self_study_sessions
      to authenticated;

grant insert, update, delete on public.class_schedule to authenticated;   -- RLS: chỉ giáo viên lớp
grant insert, delete on public.self_study_sessions to authenticated;      -- RLS: chỉ buổi của mình
grant update (avatar_path) on public.profiles to authenticated;           -- chỉ đúng cột ảnh đại diện

-- profiles / students / enrollments / classes chỉ được ghi bởi Edge Function và script
-- quản trị (chạy bằng service role, bỏ qua cả hai lớp).
grant insert, update, delete on public.plans to authenticated;
grant insert, update on public.reflections to authenticated;
grant insert, delete on public.evidence to authenticated;
grant insert, update, delete on public.class_assistants to authenticated;   -- RLS: chỉ giáo viên lớp
grant insert on public.conversations to authenticated;
grant insert on public.messages to authenticated;                            -- không sửa/xóa tin đã gửi
grant insert, update on public.conversation_reads to authenticated;
grant update on public.notifications to authenticated;                       -- chỉ để đánh dấu đã đọc

-- Cấu hình hạn: ai đăng nhập cũng đọc được (giao diện cần hiện "còn N giờ"),
-- nhưng chỉ sửa được bằng service role.
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

-- Kho mẫu phản hồi tự động: không cần lộ ra client.
alter table public.auto_feedback_templates enable row level security;
revoke all on public.auto_feedback_templates from anon, authenticated;

-- ---------- Tách buổi tự học ra khỏi nhiệm vụ ----------
-- Mỗi dòng plans cũ = một buổi kèm đúng một nhiệm vụ. Dữ liệu production đã kiểm
-- tra: không có (học sinh, ngày, tiết) nào trùng, nên ánh xạ 1:1, không thể gộp sai.
insert into public.self_study_sessions (student_id, class_id, study_date, period, created_at)
select p.student_id, p.class_id, p.study_date, p.period, min(p.created_at)
from public.plans p
where p.session_id is null
group by p.student_id, p.class_id, p.study_date, p.period
on conflict (student_id, study_date, period) do nothing;

update public.plans p
   set session_id = s.id
  from public.self_study_sessions s
 where p.session_id is null
   and s.student_id = p.student_id
   and s.study_date = p.study_date
   and s.period     = p.period;

-- Gỡ ràng buộc chặn nhiều nhiệm vụ trong một buổi. Tính duy nhất chuyển lên
-- self_study_sessions, nơi nó thực sự thuộc về.
alter table public.plans drop constraint if exists plans_student_id_study_date_period_key;

do $$ begin
  alter table public.plans alter column session_id set not null;
exception when others then
  raise notice 'Còn nhiệm vụ chưa gắn buổi tự học — bỏ qua bước set not null';
end $$;

-- ---------- Chuyển dữ liệu cũ ----------
-- ĐẶT Ở CUỐI FILE là có chủ ý: các trigger bảo vệ cột phải được thay thế xong
-- trước, nếu không bản trigger cũ sẽ âm thầm hoàn nguyên những lệnh update này.

-- Kế hoạch nào giáo viên ĐÃ duyệt thiết bị thì coi như đã duyệt kế hoạch, giữ
-- đúng người và thời điểm — không bắt thầy cô duyệt lại việc đã làm.
update public.plans
   set review_status  = 'Đã duyệt',
       review_by      = device_reviewed_by,
       review_at      = device_reviewed_at,
       review_version = 1
 where device_status = 'Đã duyệt'
   and review_status = 'Chờ duyệt'
   and review_at is null;

-- Không dùng thiết bị điện tử thì không cần qua tay giáo viên.
update public.plans
   set review_status = 'Không cần duyệt'
 where not use_device
   and review_status = 'Chờ duyệt';

-- Hai trạng thái phải khớp nhau. Dọn nốt các kế hoạch cũ còn lệch: đã duyệt
-- thiết bị nhưng kế hoạch vẫn treo, hoặc đã duyệt kế hoạch nhưng thiết bị còn chờ.
update public.plans
   set review_status = 'Đã duyệt'
 where use_device
   and device_status = 'Đã duyệt'
   and review_status = 'Chờ duyệt';

update public.plans
   set device_status      = 'Đã duyệt',
       device_reviewed_by = coalesce(device_reviewed_by, review_by),
       device_reviewed_at = coalesce(device_reviewed_at, review_at)
 where use_device
   and device_status = 'Chờ duyệt'
   and review_status = 'Đã duyệt';

-- Danh sách lớp được nạp riêng bằng supabase/seed-roster.private.sql
