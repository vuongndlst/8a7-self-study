-- ============================================================================
--  LỚP NỀN TẢNG TOÀN TRƯỜNG  —  chạy SAU schema.sql
-- ============================================================================
--  File này biến hệ thống từ "website của lớp 8A7" thành nền tảng nhiều lớp,
--  nhiều giáo viên, nhiều năm học. Idempotent: chạy lại bao nhiêu lần cũng được.
--
--  NGUYÊN TẮC: TÁI SỬ DỤNG, KHÔNG TẠO BẢN SAO.
--  Schema cũ đã có sẵn phần lớn cấu trúc mà phase này cần. Ánh xạ:
--
--    Tên trong yêu cầu          Bảng đã có
--    ------------------------   ------------------------------------------
--    academic_years             school_years  (is_active = "năm hiện tại")
--    class_academic_years       classes       (đã là cặp lớp × năm học)
--    teacher_class_assignments  class_teachers
--    students (global)          students      (khóa chính = MSHS, đã global)
--    student_enrollments        enrollments
--    system_settings            app_settings
--
--  Tạo bảng mới trùng chức năng sẽ làm hỏng toàn bộ dữ liệu 8A7 đang chạy,
--  nên chỉ BỔ SUNG cột/bảng cho những gì thực sự còn thiếu:
--    class_catalog, student_import_batches, student_import_rows,
--    class_access_requests, audit_log.
-- ============================================================================


-- ============================================================================
--  1. VAI TRÒ VÀ TRẠNG THÁI DUYỆT
-- ============================================================================
-- Thêm 'admin'. Trợ giảng KHÔNG phải một role riêng: em ấy vẫn là học sinh, chỉ
-- có thêm dòng trong class_assistants. Biến TA thành role sẽ làm mất dữ liệu tự
-- học của chính em ấy.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student','teacher','admin'));

-- Ràng buộc cũ liệt kê tay hai role nên vừa thêm 'admin' là nó chặn ngay.
-- Viết lại theo đúng ý định: CHỈ học sinh mới bắt buộc có MSHS.
do $$ begin
  alter table public.profiles drop constraint if exists student_requires_mshs;
  alter table public.profiles add constraint student_requires_mshs
    check (role <> 'student' or mshs is not null);
end $$;

-- Trạng thái duyệt TÁCH KHỎI role. Dùng role để biểu diễn trạng thái duyệt sẽ
-- khiến mọi policy phải biết "teacher_pending" là gì.
-- Mặc định 'approved' để không khóa nhầm 32 tài khoản đang chạy; luồng đăng ký
-- mới đặt 'pending' một cách tường minh.
alter table public.profiles add column if not exists approval_status text not null default 'approved';
do $$ begin
  alter table public.profiles drop constraint if exists profiles_approval_check;
  alter table public.profiles add constraint profiles_approval_check
    check (approval_status in ('pending','approved','rejected','suspended'));
end $$;

alter table public.profiles add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists rejected_reason text;
-- Bản sao email CHỈ để admin hiển thị danh sách giáo viên. Nguồn thật vẫn là
-- auth.users; bảng đó không cho client đọc nên không join sang được.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists last_active_at timestamptz;

create index if not exists profiles_approval_idx on public.profiles (role, approval_status);

-- ---------- Hàm nhận dạng vai trò ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Giáo viên ĐANG hoạt động: đúng role VÀ đã được duyệt.
-- Mọi policy của giáo viên đi qua hàm này, nên chặn một chỗ là chặn toàn hệ thống.
create or replace function public.is_active_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher' and approval_status = 'approved'
  );
$$;

revoke all on function public.is_admin(), public.is_active_teacher() from public, anon;
grant execute on function public.is_admin(), public.is_active_teacher() to authenticated;


-- ============================================================================
--  2. NĂM HỌC
-- ============================================================================
alter table public.school_years add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- Năm học hiện tại. MỘT nguồn sự thật duy nhất — không rải .eq('is_active',true)
-- khắp nơi rồi hy vọng chúng khớp nhau.
create or replace function public.current_school_year()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.school_years where is_active limit 1;
$$;

-- Chuyển năm học hiện tại. Ràng buộc "chỉ một năm is_active" do index
-- one_active_school_year giữ, nên phải TẮT hết trước rồi mới BẬT — trong cùng
-- một transaction, nếu không lệnh sẽ vỡ giữa chừng.
create or replace function public.set_current_school_year(p_year uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_old uuid; v_old_name text; v_new_name text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới đổi được năm học hiện tại';
  end if;
  select id, name into v_old, v_old_name from public.school_years where is_active;
  select name into v_new_name from public.school_years where id = p_year;
  if v_new_name is null then
    raise exception 'Năm học không tồn tại';
  end if;

  update public.school_years set is_active = false where is_active;
  update public.school_years set is_active = true  where id = p_year;

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'academic_year.switched', 'school_years', p_year,
          json_build_object('tu', v_old_name, 'sang', v_new_name));

  return json_build_object('nam_cu', v_old_name, 'nam_moi', v_new_name);
end;
$$;

revoke all on function public.current_school_year(), public.set_current_school_year(uuid) from public, anon;
grant execute on function public.current_school_year() to authenticated;
grant execute on function public.set_current_school_year(uuid) to authenticated;


-- ============================================================================
--  3. DANH MỤC LỚP
-- ============================================================================
-- Tách tên lớp ra khỏi cặp lớp×năm. Giáo viên chọn từ danh mục này chứ không gõ
-- tay, nếu không sẽ có cả "8A7", "8a7" và "8 A7" cùng tồn tại.
create table if not exists public.class_catalog (
  id uuid primary key default gen_random_uuid(),
  grade_level smallint not null check (grade_level between 1 and 12),
  class_code text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Khối 6, 7, 8 — mỗi khối A1..A10.
insert into public.class_catalog (grade_level, class_code, display_name)
select g, g || 'A' || n, g || 'A' || n
from generate_series(6, 8) g, generate_series(1, 10) n
on conflict (class_code) do nothing;

-- classes = cặp LỚP × NĂM HỌC. Nối nó về danh mục.
alter table public.classes add column if not exists catalog_id uuid references public.class_catalog(id) on delete restrict;
alter table public.classes add column if not exists created_by uuid references public.profiles(id) on delete set null;

update public.classes c
   set catalog_id = cc.id
  from public.class_catalog cc
 where cc.class_code = c.name and c.catalog_id is null;

create index if not exists classes_year_idx on public.classes (school_year_id);


-- ============================================================================
--  4. PHÂN CÔNG GIÁO VIÊN ↔ LỚP
-- ============================================================================
alter table public.class_teachers add column if not exists role text not null default 'primary';
alter table public.class_teachers add column if not exists status text not null default 'active';
alter table public.class_teachers add column if not exists assigned_by uuid references public.profiles(id) on delete set null;
alter table public.class_teachers add column if not exists assigned_at timestamptz not null default now();
alter table public.class_teachers add column if not exists ended_at timestamptz;

do $$ begin
  alter table public.class_teachers drop constraint if exists class_teachers_role_check;
  alter table public.class_teachers add constraint class_teachers_role_check check (role in ('primary','co'));
  alter table public.class_teachers drop constraint if exists class_teachers_status_check;
  alter table public.class_teachers add constraint class_teachers_status_check check (status in ('active','inactive'));
end $$;

-- Rủi ro lớn nhất khi rollout toàn trường không phải lỗi Excel mà là HAI GIÁO
-- VIÊN CÙNG NHẬN MỘT LỚP. Chặn ở database, không chỉ ở giao diện.
create unique index if not exists one_primary_teacher_per_class
  on public.class_teachers (class_id) where role = 'primary' and status = 'active';

create index if not exists class_teachers_teacher_idx on public.class_teachers (teacher_id) where status = 'active';


-- ============================================================================
--  5. GHI DANH THEO NĂM HỌC
-- ============================================================================
-- Ghi danh vốn chỉ trỏ tới class_id, mà năm học nằm sau một lần join. Không thể
-- đặt unique index "một lớp mỗi năm" trên một giá trị phải join mới có, nên
-- phi chuẩn hóa school_year_id vào đây và để trigger giữ đồng bộ.
alter table public.enrollments add column if not exists school_year_id uuid references public.school_years(id) on delete cascade;

update public.enrollments e
   set school_year_id = c.school_year_id
  from public.classes c
 where c.id = e.class_id and e.school_year_id is null;

do $$ begin
  alter table public.enrollments alter column school_year_id set not null;
exception when others then
  raise notice 'Còn ghi danh chưa gắn năm học — bỏ qua bước set not null';
end $$;

create or replace function public.enrollments_set_year()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select school_year_id into new.school_year_id from public.classes where id = new.class_id;
  if new.school_year_id is null then
    raise exception 'Lớp không tồn tại';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrollments_set_year on public.enrollments;
create trigger trg_enrollments_set_year before insert or update of class_id on public.enrollments
for each row execute function public.enrollments_set_year();

-- Một học sinh chỉ thuộc ĐÚNG MỘT lớp đang hoạt động trong một năm học.
-- Đây là ràng buộc chặn "import nhầm em của lớp khác" ở tầng sâu nhất.
create unique index if not exists one_active_class_per_year
  on public.enrollments (mshs, school_year_id) where is_active;

create index if not exists enrollments_year_idx on public.enrollments (school_year_id) where is_active;

-- MSHS: giữ dạng TEXT, nới độ dài để dùng được cho các khối khác nhau, nhưng
-- vẫn chỉ nhận chữ số để không lẫn khoảng trắng hay ký tự lạ từ Excel.
do $$ begin
  alter table public.students drop constraint if exists students_mshs_check;
  alter table public.students add constraint students_mshs_check check (mshs ~ '^[0-9]{4,12}$');
end $$;


-- ============================================================================
--  6. CÀI ĐẶT HỆ THỐNG
-- ============================================================================
-- app_settings vốn chỉ chứa số. Thêm hai kiểu còn thiếu thay vì dựng bảng mới.
alter table public.app_settings add column if not exists value_text text;
alter table public.app_settings add column if not exists value_bool boolean;

insert into public.app_settings (key, value_text, note) values
  ('allowed_teacher_domain', 'lsts.edu.vn', 'Đuôi email trường. Chỉ có tác dụng khi enforce_teacher_domain bật.')
on conflict (key) do nothing;

insert into public.app_settings (key, value_bool, note) values
  ('enforce_teacher_domain', true,  'Bật: giáo viên chỉ đăng ký được bằng email trường.'),
  ('teacher_registration_enabled', true, 'Tắt để đóng hẳn form đăng ký giáo viên.')
on conflict (key) do nothing;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value_bool from public.app_settings where key = p_key), p_default);
$$;

create or replace function public.setting_text(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim((select value_text from public.app_settings where key = p_key)), ''), p_default);
$$;

revoke all on function public.setting_bool(text, boolean), public.setting_text(text, text) from public, anon;
grant execute on function public.setting_bool(text, boolean), public.setting_text(text, text) to authenticated, anon;


-- ============================================================================
--  7. NHẬT KÝ QUẢN TRỊ
-- ============================================================================
create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_time_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);


-- ============================================================================
--  8. IMPORT DANH SÁCH HỌC SINH
-- ============================================================================
create table if not exists public.student_import_batches (
  id uuid primary key default gen_random_uuid(),
  -- Khóa chống trùng do client sinh: bấm hai lần thì lần sau không import lại.
  client_token text not null unique,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  filename text,
  total_rows int not null default 0,
  inserted_students int not null default 0,
  linked_students int not null default 0,
  existing_enrollments int not null default 0,
  skipped_rows int not null default 0,
  status text not null default 'completed' check (status in ('completed','failed')),
  created_at timestamptz not null default now()
);
create index if not exists import_batches_class_idx on public.student_import_batches (class_id, created_at desc);

create table if not exists public.student_import_rows (
  id bigserial primary key,
  batch_id uuid not null references public.student_import_batches(id) on delete cascade,
  row_no int,
  mshs text,
  full_name text,
  outcome text not null,
  note text
);
create index if not exists import_rows_batch_idx on public.student_import_rows (batch_id);


-- ============================================================================
--  9. YÊU CẦU TRUY CẬP LỚP
-- ============================================================================
-- Được duyệt tài khoản KHÔNG đồng nghĩa được truy cập mọi lớp. Lớp đã có giáo
-- viên thì người khác phải xin, admin xử lý.
create table if not exists public.class_access_requests (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists one_pending_request_per_teacher_class
  on public.class_access_requests (teacher_id, class_id) where status = 'pending';
