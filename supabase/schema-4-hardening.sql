-- ============================================================================
--  GIA CỐ BẢO MẬT VÀ CHỊU TẢI  —  chạy SAU schema-3-rls.sql
-- ============================================================================
--  File này KHÔNG thêm chức năng. Nó siết lại quyền đã bị cấp thừa và thêm
--  chỉ mục cho quy mô toàn trường. Chạy lại bao nhiêu lần cũng được.
-- ============================================================================


-- ============================================================================
--  17. THU HỒI QUYỀN CẤP THỪA CHO NGƯỜI CHƯA ĐĂNG NHẬP
-- ============================================================================
-- Supabase cấp sẵn TOÀN QUYỀN cho anon và authenticated trên mọi bảng mới tạo
-- trong schema public. Các bảng cũ đã được thu hồi thủ công, nhưng những bảng
-- thêm ở schema-2/3 thì chưa — kiểm tra thực tế cho thấy `anon` đang có
-- INSERT/UPDATE/DELETE/TRUNCATE trên audit_log, class_catalog,
-- student_import_batches, student_import_rows, class_access_requests.
--
-- RLS vẫn chặn được từng dòng, nên chưa có rò rỉ. Nhưng đó là dựa vào MỘT lớp
-- phòng thủ: chỉ cần một bảng sau này quên bật policy là thủng. Quyền cấp bảng
-- phải là lớp thứ hai, không phải chỗ trống.

do $$
declare r record;
begin
  -- Thu hồi sạch của anon trên MỌI bảng/view trong public.
  for r in select table_name from information_schema.tables
           where table_schema = 'public' and table_type in ('BASE TABLE','VIEW')
  loop
    execute format('revoke all on public.%I from anon', r.table_name);
  end loop;
end $$;

-- Ứng dụng bắt buộc đăng nhập mới xem được gì, nên anon KHÔNG cần đọc bảng nào.
-- Trang đăng ký học sinh đi qua Edge Function `register-student` chạy bằng
-- service role, không đụng tới quyền của anon.

-- Cấp lại đúng phần authenticated thực sự dùng trên các bảng mới.
grant select on public.class_catalog, public.audit_log,
                public.student_import_batches, public.student_import_rows,
                public.class_access_requests to authenticated;
grant insert, update on public.class_access_requests to authenticated;
grant insert, update, delete on public.class_catalog to authenticated;   -- RLS: chỉ admin

-- Các view: chỉ đọc.
grant select on public.plan_status, public.session_status, public.help_requests to authenticated;


-- ============================================================================
--  18. THU HỒI QUYỀN GỌI HÀM CỦA ANON
-- ============================================================================
-- 31 hàm security definer đang cho anon gọi. Phần lớn trả về false vì
-- auth.uid() là NULL, nhưng setting_text() thì lộ được cấu hình hệ thống, và
-- các hàm trigger thì không có lý do gì để lộ ra API cả.
--
-- Nguyên tắc: anon KHÔNG gọi được hàm nào trong public. Ai cần dùng thì đăng nhập.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from anon, public', r.sig);
  end loop;
end $$;

-- Cấp lại đúng những hàm mà giao diện thật sự gọi.
-- Hàm trigger (plans_guard_columns, notify_on_*, …) KHÔNG nằm trong danh sách:
-- chúng chạy dưới quyền chủ sở hữu khi trigger kích hoạt, không cần cấp cho ai.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        -- Hàm quyền, giao diện gọi gián tiếp qua policy
        'is_teacher','is_admin','is_active_teacher','teaches_class','teaches_mshs','teaches_user',
        'my_mshs','student_active_class','staff_perm','staff_sees_student','staff_sees_student_name',
        'shares_class_staff','is_assistant','can_register_on',
        -- Hàm giao diện gọi thẳng bằng .rpc()
        'my_classes','current_school_year','set_current_school_year','create_school_year',
        'set_teacher_status','claim_class','assign_class_teacher','unassign_class_teacher',
        'import_class_roster','preview_class_roster','class_roster','remove_from_class',
        'missing_registrations','bulk_review_plans',
        'class_analytics','student_analytics','school_analytics',
        'year_bounds','default_range','setting_bool','setting_text',
        'norm_mshs','norm_name','vn_today','result_clock_start'
      )
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- analytics_build / analytics_build_many KHÔNG được cấp cho ai: chúng không tự
-- kiểm quyền, chỉ được gọi từ trong ba hàm bọc ngoài đã kiểm quyền sẵn.


-- ============================================================================
--  19. CHỈ MỤC CHO QUY MÔ TOÀN TRƯỜNG
-- ============================================================================
-- Hiện tại 1 lớp / 123 nhiệm vụ nên truy vấn nào cũng nhanh. Ở quy mô 30 lớp
-- (~900 học sinh, vài chục nghìn nhiệm vụ mỗi năm) thì thiếu chỉ mục sẽ thành
-- quét toàn bảng trên mọi lần mở dashboard.

-- Dashboard giáo viên lọc theo lớp + khoảng ngày, rồi join sang reflections.
create index if not exists plans_class_year_idx on public.plans (class_id, study_date desc, student_id);

-- Trang "Kế hoạch của em": lọc theo chính em, sắp theo ngày giảm dần.
create index if not exists plans_student_session_idx on public.plans (student_id, session_id);

-- Phản tư tra theo học sinh khi dựng số liệu cá nhân.
create index if not exists reflections_plan_rating_idx on public.reflections (plan_id) include (rating, completion_status);

-- Minh chứng: giao diện luôn hỏi theo danh sách plan_id.
create index if not exists evidence_plan_kind_idx on public.evidence (plan_id, kind);

-- Ghi danh: hai chiều tra đều hay dùng — theo lớp (danh sách lớp) và theo em
-- (em này đang học lớp nào).
create index if not exists enrollments_mshs_active_idx on public.enrollments (mshs) where is_active;

-- Chuông thông báo: đếm chưa đọc mỗi lần tải trang.
create index if not exists notif_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- Danh mục lớp: giao diện luôn lọc is_active rồi sắp theo mã lớp.
create index if not exists class_catalog_active_idx on public.class_catalog (grade_level, class_code) where is_active;

-- Nhật ký quản trị: chỉ xem theo thời gian gần nhất.
create index if not exists audit_recent_idx on public.audit_log (created_at desc);


-- ============================================================================
--  20. GIỚI HẠN CHỐNG LẠM DỤNG
-- ============================================================================
-- statement_timeout do Supabase đặt sẵn (authenticated 8s, anon 3s) — đủ để một
-- truy vấn hỏng không giữ kết nối mãi. Ở đây thêm giới hạn nghiệp vụ.

-- Một học sinh không thể tạo hàng nghìn nhiệm vụ để làm phình bảng.
create or replace function public.limit_tasks_per_session()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;      -- service role: bỏ qua
  select count(*) into n from public.plans where session_id = new.session_id;
  if n >= 20 then
    raise exception 'Mỗi buổi tự học chỉ đăng ký được tối đa 20 nhiệm vụ.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_tasks_per_session on public.plans;
create trigger trg_limit_tasks_per_session before insert on public.plans
for each row execute function public.limit_tasks_per_session();

-- Tin nhắn: chặn spam trong luồng chat.
create or replace function public.limit_messages_per_minute()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return new; end if;
  select count(*) into n from public.messages
   where sender_id = auth.uid() and created_at > now() - interval '1 minute';
  if n >= 20 then
    raise exception 'Gửi tin quá nhanh. Vui lòng đợi một chút rồi thử lại.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_messages on public.messages;
create trigger trg_limit_messages before insert on public.messages
for each row execute function public.limit_messages_per_minute();

revoke all on function public.limit_tasks_per_session(), public.limit_messages_per_minute()
  from anon, public;


-- ============================================================================
--  21. DỌN DẸP ĐỊNH KỲ
-- ============================================================================
-- Thông báo cũ chiếm chỗ mà không ai đọc lại. Giữ 120 ngày là đủ cho một học kỳ.
create or replace function public.prune_old_data()
returns json language plpgsql security definer set search_path = public as $$
declare n_notif int; n_rows int;
begin
  delete from public.notifications
   where created_at < now() - interval '120 days' and read_at is not null;
  get diagnostics n_notif = row_count;

  -- Chi tiết từng dòng import chỉ hữu ích lúc vừa import xong; bản tóm tắt ở
  -- student_import_batches thì giữ lại vĩnh viễn để còn đối chiếu.
  delete from public.student_import_rows
   where batch_id in (select id from public.student_import_batches
                      where created_at < now() - interval '90 days');
  get diagnostics n_rows = row_count;

  return json_build_object('thong_bao_da_xoa', n_notif, 'dong_import_da_xoa', n_rows);
end;
$$;

revoke all on function public.prune_old_data() from anon, public, authenticated;

-- Chạy lúc 2 giờ sáng Chủ nhật (19:00 UTC thứ Bảy).
do $$ begin
  perform cron.unschedule('prune-old-data');
exception when others then null;
end $$;

do $$ begin
  perform cron.schedule('prune-old-data', '0 19 * * 6', 'select public.prune_old_data()');
exception when others then
  raise notice 'Chưa bật pg_cron — bỏ qua lịch dọn dẹp';
end $$;


-- ============================================================================
--  22. CẬP NHẬT THỐNG KÊ CHO TRÌNH TỐI ƯU
-- ============================================================================
analyze public.plans;
analyze public.enrollments;
analyze public.self_study_sessions;
analyze public.reflections;
analyze public.profiles;
