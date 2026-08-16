-- ============================================================================
--  QUYỀN VÀ NGHIỆP VỤ TOÀN TRƯỜNG  —  chạy SAU schema-2-school.sql
-- ============================================================================


-- ============================================================================
--  10. SIẾT LẠI CÁC HÀM QUYỀN ĐÃ CÓ
-- ============================================================================
-- Toàn bộ policy của giáo viên đi qua bốn hàm này. Thêm điều kiện "đã được
-- duyệt" và "phân công còn hiệu lực" tại đây là chặn được một lượt cho cả hệ
-- thống — không phải sửa hàng chục policy và bỏ sót một cái.
--
-- is_admin() đứng đầu mỗi hàm: quản trị viên nhìn được toàn trường mà không cần
-- policy riêng cho từng bảng.

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (role = 'admin' or (role = 'teacher' and approval_status = 'approved'))
  );
$$;

create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.class_teachers ct
    join public.profiles p on p.id = ct.teacher_id
    where ct.class_id = p_class
      and ct.teacher_id = auth.uid()
      and ct.status = 'active'
      and p.role = 'teacher' and p.approval_status = 'approved'
  );
$$;

create or replace function public.teaches_mshs(p_mshs text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.enrollments e
    join public.classes c         on c.id = e.class_id
    join public.school_years y    on y.id = c.school_year_id and y.is_active
    join public.class_teachers ct on ct.class_id = c.id and ct.status = 'active'
    join public.profiles p        on p.id = ct.teacher_id
    where e.mshs = p_mshs and e.is_active and ct.teacher_id = auth.uid()
      and p.role = 'teacher' and p.approval_status = 'approved'
  );
$$;

create or replace function public.teaches_user(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1
    from public.students s
    join public.enrollments e     on e.mshs = s.mshs and e.is_active
    join public.classes c         on c.id = e.class_id
    join public.school_years y    on y.id = c.school_year_id and y.is_active
    join public.class_teachers ct on ct.class_id = c.id and ct.status = 'active'
    join public.profiles p        on p.id = ct.teacher_id
    where s.claimed_user_id = p_student and ct.teacher_id = auth.uid()
      and p.role = 'teacher' and p.approval_status = 'approved'
  );
$$;

-- staff_perm trước đây tự truy vấn class_teachers nên không thấy được cột
-- status mới và không có đường cho admin. Cho nó gọi teaches_class để chỉ còn
-- MỘT định nghĩa "ai là nhân sự của lớp này".
create or replace function public.staff_perm(p_class uuid, p_perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.teaches_class(p_class) then true
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

-- Các lớp mà người đang đăng nhập được phép làm việc, trong NĂM HIỆN TẠI.
-- Đổi danh sách cột trả về thì phải drop trước; create or replace không làm được.
drop function if exists public.my_classes();
create or replace function public.my_classes()
returns table (class_id uuid, class_name text, grade_level smallint, year_name text,
               so_hoc_sinh bigint, la_lop_cua_toi boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, cc.grade_level, y.name,
         (select count(*) from public.enrollments e where e.class_id = c.id and e.is_active),
         exists (select 1 from public.class_teachers ct
                 where ct.class_id = c.id and ct.teacher_id = auth.uid() and ct.status = 'active')
  from public.classes c
  join public.school_years y on y.id = c.school_year_id and y.is_active
  left join public.class_catalog cc on cc.id = c.catalog_id
  where public.teaches_class(c.id)
  -- Lớp mình thực sự được phân công đứng trước. Quản trị viên thấy được mọi lớp,
  -- nhưng lớp chủ nhiệm của chính họ vẫn phải là lớp mở ra mặc định.
  order by exists (select 1 from public.class_teachers ct
                   where ct.class_id = c.id and ct.teacher_id = auth.uid() and ct.status = 'active') desc,
           c.name;
$$;

revoke all on function public.my_classes() from public, anon;
grant execute on function public.my_classes() to authenticated;


-- ============================================================================
--  11. ĐĂNG KÝ VÀ DUYỆT GIÁO VIÊN
-- ============================================================================
-- Hồ sơ giáo viên do Edge Function tạo (service role). Hàm này chỉ để admin
-- đổi trạng thái — KHÔNG có đường nào từ giao diện nâng role lên admin.
create or replace function public.set_teacher_status(p_teacher uuid, p_status text, p_reason text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_role text; v_name text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới đổi được trạng thái giáo viên';
  end if;
  if p_status not in ('pending','approved','rejected','suspended') then
    raise exception 'Trạng thái không hợp lệ: %', p_status;
  end if;

  select role, full_name into v_role, v_name from public.profiles where id = p_teacher;
  if v_role is null then raise exception 'Không tìm thấy tài khoản'; end if;
  -- Không cho hàm này đụng vào tài khoản admin hay học sinh.
  if v_role <> 'teacher' then
    raise exception 'Chỉ áp dụng cho tài khoản giáo viên';
  end if;

  update public.profiles
     set approval_status  = p_status,
         approved_by      = case when p_status = 'approved' then auth.uid() else approved_by end,
         approved_at      = case when p_status = 'approved' then now() else approved_at end,
         rejected_reason  = case when p_status in ('rejected','suspended') then p_reason else null end
   where id = p_teacher;

  -- Bị từ chối / tạm khóa thì phân công lớp cũng ngừng hiệu lực ngay.
  if p_status in ('rejected','suspended') then
    update public.class_teachers set status = 'inactive', ended_at = now()
     where teacher_id = p_teacher and status = 'active';
  end if;

  insert into public.notifications (user_id, kind, title, body, dedupe_key)
  values (p_teacher, 'system',
          case p_status
            when 'approved'  then 'Tài khoản đã được duyệt'
            when 'rejected'  then 'Tài khoản chưa được duyệt'
            when 'suspended' then 'Tài khoản đang tạm khóa'
            else 'Tài khoản đang chờ duyệt' end,
          case p_status
            when 'approved'  then 'Tài khoản của thầy/cô đã được duyệt. Hãy thiết lập lớp học để bắt đầu.'
            when 'rejected'  then coalesce(p_reason, 'Vui lòng liên hệ quản trị viên để biết thêm chi tiết.')
            when 'suspended' then coalesce(p_reason, 'Tài khoản tạm thời bị khóa. Vui lòng liên hệ quản trị viên.')
            else 'Tài khoản đang chờ quản trị viên xác nhận.' end,
          'teacher-status:' || p_teacher || ':' || p_status || ':' || extract(epoch from now())::bigint)
  on conflict do nothing;   -- dedupe_key dùng index PHẦN, không suy luận được đích

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'teacher.' || p_status, 'profiles', p_teacher,
          json_build_object('ten', v_name, 'ly_do', p_reason));

  return json_build_object('teacher', p_teacher, 'trang_thai', p_status);
end;
$$;

revoke all on function public.set_teacher_status(uuid, text, text) from public, anon;
grant execute on function public.set_teacher_status(uuid, text, text) to authenticated;


-- Tạo năm học mới. Không tự đoán ngày từ tên năm: trường có thể bắt đầu sớm
-- hoặc muộn, đoán sai sẽ làm lệch phạm vi của mọi biểu đồ.
create or replace function public.create_school_year(
  p_name text, p_start date, p_end date, p_make_current boolean default false
) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới tạo được năm học';
  end if;
  v_name := nullif(trim(p_name), '');
  if v_name is null then raise exception 'Tên năm học không được để trống'; end if;
  if p_start is null or p_end is null then raise exception 'Thiếu ngày bắt đầu hoặc kết thúc'; end if;
  if p_end <= p_start then raise exception 'Ngày kết thúc phải sau ngày bắt đầu'; end if;
  if exists (select 1 from public.school_years where lower(name) = lower(v_name)) then
    raise exception 'Năm học "%" đã tồn tại', v_name;
  end if;

  insert into public.school_years (name, start_date, end_date, is_active, created_by)
  values (v_name, p_start, p_end, false, auth.uid())
  returning id into v_id;

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'academic_year.created', 'school_years', v_id,
          json_build_object('ten', v_name, 'tu', p_start, 'den', p_end));

  -- Đặt làm năm hiện tại là một quyết định riêng, đi qua hàm chuyển năm để
  -- ràng buộc "chỉ một năm hiện tại" và nhật ký đều được giữ đúng.
  if p_make_current then perform public.set_current_school_year(v_id); end if;

  return json_build_object('id', v_id, 'ten', v_name);
end;
$$;

revoke all on function public.create_school_year(text, date, date, boolean) from public, anon;
grant execute on function public.create_school_year(text, date, date, boolean) to authenticated;

-- ============================================================================
--  12. NHẬN LỚP
-- ============================================================================
-- Được duyệt tài khoản KHÔNG đồng nghĩa được truy cập mọi lớp. Hàm này là con
-- đường DUY NHẤT để giáo viên tự gắn mình vào một lớp, và nó chỉ mở khi lớp đó
-- chưa có ai phụ trách trong năm hiện tại.
create or replace function public.claim_class(p_catalog uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_year uuid; v_code text; v_class uuid; v_holder uuid; v_holder_name text;
begin
  -- Quản trị viên ở trường này cũng chủ nhiệm một lớp, nên cũng nhận lớp được.
  if not (public.is_active_teacher() or public.is_admin()) then
    raise exception 'Tài khoản chưa được duyệt';
  end if;

  select id into v_year from public.school_years where is_active;
  if v_year is null then raise exception 'Chưa có năm học hiện tại'; end if;

  select class_code into v_code from public.class_catalog where id = p_catalog and is_active;
  if v_code is null then raise exception 'Lớp không có trong danh mục hoặc đã ngừng sử dụng'; end if;

  -- Cặp lớp × năm có thể chưa tồn tại (lớp lần đầu được dùng trong năm này).
  select id into v_class from public.classes where school_year_id = v_year and catalog_id = p_catalog;
  if v_class is null then
    select id into v_class from public.classes where school_year_id = v_year and name = v_code;
  end if;
  if v_class is null then
    insert into public.classes (school_year_id, name, catalog_id, created_by)
    values (v_year, v_code, p_catalog, auth.uid())
    returning id into v_class;
  end if;

  select ct.teacher_id, p.full_name into v_holder, v_holder_name
  from public.class_teachers ct join public.profiles p on p.id = ct.teacher_id
  where ct.class_id = v_class and ct.role = 'primary' and ct.status = 'active';

  if v_holder is not null and v_holder <> auth.uid() then
    -- Không tiết lộ email, chỉ đủ để giáo viên biết cần liên hệ ai.
    raise exception 'CLASS_TAKEN:%', v_holder_name;
  end if;

  insert into public.class_teachers (class_id, teacher_id, role, status, assigned_by)
  values (v_class, auth.uid(), 'primary', 'active', auth.uid())
  on conflict (class_id, teacher_id) do update
     set status = 'active', role = 'primary', ended_at = null;

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'class.claimed', 'classes', v_class, json_build_object('lop', v_code));

  return json_build_object('class_id', v_class, 'lop', v_code);
end;
$$;

-- Admin chuyển lớp sang giáo viên khác. Dữ liệu học sinh/nhiệm vụ KHÔNG đổi chủ
-- — chúng thuộc về học sinh và cặp lớp×năm, giáo viên chỉ có quyền truy cập.
create or replace function public.assign_class_teacher(p_class uuid, p_teacher uuid, p_role text default 'primary')
returns json language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên mới phân công lớp'; end if;
  if p_role not in ('primary','co') then raise exception 'Vai trò không hợp lệ'; end if;
  if not exists (select 1 from public.profiles where id = p_teacher and role = 'teacher' and approval_status = 'approved') then
    raise exception 'Chỉ gán được giáo viên đã được duyệt';
  end if;

  if p_role = 'primary' then
    select teacher_id into v_old from public.class_teachers
     where class_id = p_class and role = 'primary' and status = 'active';
    if v_old is not null and v_old <> p_teacher then
      update public.class_teachers set status = 'inactive', ended_at = now()
       where class_id = p_class and teacher_id = v_old;
      insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
      values (auth.uid(), 'class.unassigned', 'classes', p_class, json_build_object('teacher', v_old));
    end if;
  end if;

  insert into public.class_teachers (class_id, teacher_id, role, status, assigned_by)
  values (p_class, p_teacher, p_role, 'active', auth.uid())
  on conflict (class_id, teacher_id) do update
     set role = excluded.role, status = 'active', ended_at = null, assigned_by = auth.uid();

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'class.assigned', 'classes', p_class, json_build_object('teacher', p_teacher, 'vai_tro', p_role));

  return json_build_object('class_id', p_class, 'teacher_id', p_teacher, 'vai_tro', p_role);
end;
$$;

create or replace function public.unassign_class_teacher(p_class uuid, p_teacher uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Chỉ quản trị viên mới gỡ phân công'; end if;
  update public.class_teachers set status = 'inactive', ended_at = now()
   where class_id = p_class and teacher_id = p_teacher;
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'class.unassigned', 'classes', p_class, json_build_object('teacher', p_teacher));
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.claim_class(uuid), public.assign_class_teacher(uuid, uuid, text),
                      public.unassign_class_teacher(uuid, uuid) from public, anon;
grant execute on function public.claim_class(uuid) to authenticated;
grant execute on function public.assign_class_teacher(uuid, uuid, text) to authenticated;
grant execute on function public.unassign_class_teacher(uuid, uuid) to authenticated;


-- ============================================================================
--  13. IMPORT DANH SÁCH HỌC SINH
-- ============================================================================
-- Chuẩn hóa MSHS: Excel hay trả số nên "0001234" dễ thành 1234. Ở đây chỉ giữ
-- chữ số và cắt khoảng trắng; việc giữ số 0 đầu là trách nhiệm của parser.
create or replace function public.norm_mshs(p text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '');
$$;

-- Tên chỉ chuẩn hóa NHẸ: cắt đầu đuôi và gộp khoảng trắng lặp. Không bỏ dấu,
-- không đổi hoa thường — tên chính thức phải giữ nguyên như trong sổ.
create or replace function public.norm_name(p text)
returns text language sql immutable as $$
  select nullif(trim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), '');
$$;

-- Import roster trong MỘT transaction. Backend kiểm lại toàn bộ, không tin
-- kết quả validate của trình duyệt.
--
-- p_rows: [{"stt":1,"mshs":"2406002","full_name":"Nguyễn Văn A"}, ...]
create or replace function public.import_class_roster(
  p_class uuid,
  p_rows jsonb,
  p_client_token text,
  p_filename text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_year uuid; v_current uuid; v_batch uuid; r jsonb;
  v_mshs text; v_name text; v_row int;
  v_db_name text; v_other_class text; v_enrolled boolean;
  n_ins int := 0; n_link int := 0; n_have int := 0; n_skip int := 0; n_total int := 0;
  v_outcome text; v_note text;
begin
  -- 1. Quyền: lấy từ auth.uid(), KHÔNG nhận teacher_id từ client.
  if not public.teaches_class(p_class) then
    raise exception 'Thầy/cô không có quyền quản lý lớp này';
  end if;

  select school_year_id into v_year from public.classes where id = p_class;
  select id into v_current from public.school_years where is_active;
  if v_year is null then raise exception 'Lớp không tồn tại'; end if;
  -- Không cho ghi vào năm đã lưu trữ.
  if v_year <> v_current then
    raise exception 'Chỉ import được vào lớp của năm học hiện tại';
  end if;

  -- 2. Chống bấm hai lần: cùng token thì trả lại kết quả cũ, không import lại.
  select id into v_batch from public.student_import_batches where client_token = p_client_token;
  if v_batch is not null then
    return (select json_build_object('lap_lai', true, 'batch_id', b.id,
              'them_moi', b.inserted_students, 'gan_vao_lop', b.linked_students,
              'da_co_san', b.existing_enrollments, 'bo_qua', b.skipped_rows, 'tong', b.total_rows)
            from public.student_import_batches b where b.id = v_batch);
  end if;

  insert into public.student_import_batches (client_token, teacher_id, class_id, school_year_id, filename)
  values (p_client_token, auth.uid(), p_class, v_year, p_filename)
  returning id into v_batch;

  -- 3. Duyệt từng dòng.
  for r in select * from jsonb_array_elements(p_rows) loop
    v_row  := nullif(r->>'stt','')::int;
    v_mshs := public.norm_mshs(r->>'mshs');
    v_name := public.norm_name(r->>'full_name');

    -- Dòng trống hoàn toàn: bỏ qua lặng lẽ, để file mẫu 50 dòng vẫn dùng được.
    if v_mshs is null and v_name is null then
      continue;
    end if;
    n_total := n_total + 1;
    v_outcome := null; v_note := null;

    if v_mshs is null then
      v_outcome := 'error'; v_note := 'Thiếu MSHS';
    elsif v_mshs !~ '^[0-9]{4,12}$' then
      v_outcome := 'error'; v_note := 'MSHS không hợp lệ';
    elsif v_name is null or char_length(v_name) < 3 then
      v_outcome := 'error'; v_note := 'Thiếu họ tên hoặc họ tên quá ngắn';
    else
      select full_name into v_db_name from public.students where mshs = v_mshs;

      if v_db_name is null then
        -- Học sinh mới với toàn hệ thống.
        insert into public.students (mshs, full_name) values (v_mshs, v_name);
        insert into public.enrollments (mshs, class_id, is_active) values (v_mshs, p_class, true);
        v_outcome := 'inserted'; n_ins := n_ins + 1;

      elsif public.norm_name(v_db_name) is distinct from v_name then
        -- Không ghi đè tên chính thức. Giáo viên báo admin xử lý.
        v_outcome := 'name_mismatch';
        v_note := 'Hệ thống: ' || v_db_name;

      else
        select true into v_enrolled from public.enrollments
         where mshs = v_mshs and class_id = p_class and is_active;

        if coalesce(v_enrolled, false) then
          v_outcome := 'already'; n_have := n_have + 1;
        else
          -- Đang học lớp khác trong CÙNG năm → xung đột, không tự chuyển lớp.
          select c.name into v_other_class
            from public.enrollments e join public.classes c on c.id = e.class_id
           where e.mshs = v_mshs and e.is_active and e.school_year_id = v_year and e.class_id <> p_class
           limit 1;

          if v_other_class is not null then
            v_outcome := 'conflict';
            v_note := 'Đang thuộc lớp ' || v_other_class;
          else
            -- Đã có trên hệ thống (ví dụ năm ngoái học lớp 6) → CHỈ thêm ghi
            -- danh mới. Không tạo học sinh mới, nên tài khoản, ảnh đại diện và
            -- lịch sử năm cũ giữ nguyên.
            insert into public.enrollments (mshs, class_id, is_active) values (v_mshs, p_class, true);
            v_outcome := 'linked'; n_link := n_link + 1;
          end if;
        end if;
      end if;
    end if;

    if v_outcome in ('error','name_mismatch','conflict') then
      n_skip := n_skip + 1;
    end if;

    insert into public.student_import_rows (batch_id, row_no, mshs, full_name, outcome, note)
    values (v_batch, v_row, v_mshs, v_name, v_outcome, v_note);
  end loop;

  update public.student_import_batches
     set total_rows = n_total, inserted_students = n_ins, linked_students = n_link,
         existing_enrollments = n_have, skipped_rows = n_skip
   where id = v_batch;

  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'roster.imported', 'classes', p_class,
          json_build_object('batch', v_batch, 'tong', n_total, 'them_moi', n_ins,
                            'gan_vao_lop', n_link, 'da_co_san', n_have, 'bo_qua', n_skip));

  return json_build_object('lap_lai', false, 'batch_id', v_batch, 'tong', n_total,
    'them_moi', n_ins, 'gan_vao_lop', n_link, 'da_co_san', n_have, 'bo_qua', n_skip);
end;
$$;

revoke all on function public.import_class_roster(uuid, jsonb, text, text) from public, anon;
grant execute on function public.import_class_roster(uuid, jsonb, text, text) to authenticated;
revoke all on function public.norm_mshs(text), public.norm_name(text) from public, anon;
grant execute on function public.norm_mshs(text), public.norm_name(text) to authenticated;

-- ============================================================================
--  15b. KHÔNG BAO GIỜ ĐƯỢC PHÉP CÒN 0 QUẢN TRỊ VIÊN
-- ============================================================================
-- Đã xảy ra thật: danh sách giáo viên đầu năm có cả dòng của chính quản trị viên
-- (vì admin cũng chủ nhiệm một lớp). Import ghi đè role='teacher' lên hồ sơ đó,
-- hệ thống mất sạch admin và không ai vào lại được trang quản trị.
--
-- Edge Function đã được vá, nhưng đó là lớp bảo vệ ở ứng dụng. Đây là lớp ở
-- database: dù lệnh đến từ đâu — kể cả service role — cũng không hạ được người
-- admin CUỐI CÙNG.
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Không thể hạ quyền quản trị viên cuối cùng. Hãy chỉ định người khác làm quản trị viên trước.';
    end if;
  end if;
  -- Khóa/từ chối tài khoản admin cuối cùng cũng nguy hiểm y hệt.
  if old.role = 'admin' and new.role = 'admin'
     and new.approval_status is distinct from 'approved'
     and (select count(*) from public.profiles
          where role = 'admin' and approval_status = 'approved') <= 1 then
    raise exception 'Không thể khóa quản trị viên cuối cùng.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_last_admin on public.profiles;
create trigger trg_protect_last_admin before update on public.profiles
for each row execute function public.protect_last_admin();

-- ============================================================================
--  16. SỐ LIỆU THEO NĂM HỌC
-- ============================================================================
-- analytics_build() cũ chỉ lọc theo lớp và khoảng ngày. Với một lớp một năm thì
-- đủ, nhưng khi học sinh lên lớp, số liệu CÁ NHÂN của em sẽ gộp cả năm cũ lẫn
-- năm mới vào một rổ. Thêm ràng buộc năm học để mỗi năm là một phạm vi riêng.
create or replace function public.year_bounds(p_year uuid)
returns table (tu date, den date)
language sql stable security definer set search_path = public as $$
  select start_date, end_date from public.school_years
  where id = coalesce(p_year, (select id from public.school_years where is_active));
$$;

-- Phạm vi mặc định của mọi biểu đồ: TRỌN NĂM HỌC hiện tại, cắt ở hôm nay.
-- Không dùng "30 ngày gần nhất" vì đầu năm học sẽ ra biểu đồ trống trơn.
create or replace function public.default_range()
returns table (tu date, den date)
language sql stable security definer set search_path = public as $$
  select y.start_date, least(y.end_date, public.vn_today())
  from public.school_years y where y.is_active;
$$;

revoke all on function public.year_bounds(uuid), public.default_range() from public, anon;
grant execute on function public.year_bounds(uuid), public.default_range() to authenticated;

-- Số liệu cá nhân của học sinh, GIỚI HẠN trong một năm học.
-- Ghi đè bản cũ: bản cũ không biết đến năm học nên trộn dữ liệu khi em lên lớp.
create or replace function public.student_analytics(p_student uuid, p_from date, p_to date)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_from date; v_to date;
begin
  if p_student is distinct from auth.uid()
     and not public.staff_sees_student(p_student, 'view_plans') then
    raise exception 'Không có quyền xem số liệu của học sinh này' using errcode = '42501';
  end if;
  -- Kẹp khoảng ngày vào trong năm học hiện tại: dù giao diện gửi khoảng nào,
  -- số liệu cũng không thể tràn sang năm khác.
  select greatest(p_from, b.tu), least(p_to, b.den) into v_from, v_to
  from public.year_bounds(null) b;
  return public.analytics_build(null, p_student, v_from, v_to, false);
end;
$$;

-- Số liệu toàn trường cho quản trị viên. Lọc được theo khối hoặc theo một lớp.
create or replace function public.school_analytics(
  p_from date, p_to date, p_grade smallint default null, p_class uuid default null
) returns json language plpgsql stable security definer set search_path = public as $$
declare v_year uuid; v_from date; v_to date; v_classes uuid[];
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị viên mới xem được số liệu toàn trường' using errcode = '42501';
  end if;
  select id into v_year from public.school_years where is_active;
  select greatest(p_from, b.tu), least(p_to, b.den) into v_from, v_to from public.year_bounds(v_year) b;

  if p_class is not null then
    v_classes := array[p_class];
  else
    select coalesce(array_agg(c.id), '{}') into v_classes
    from public.classes c
    left join public.class_catalog cc on cc.id = c.catalog_id
    where c.school_year_id = v_year
      and (p_grade is null or cc.grade_level = p_grade);
  end if;

  return public.analytics_build_many(v_classes, v_from, v_to);
end;
$$;

-- analytics_build nhận MỘT lớp; toàn trường cần nhiều lớp nên gói lại ở đây.
create or replace function public.analytics_build_many(p_classes uuid[], p_from date, p_to date)
returns json language sql stable security definer set search_path = public as $$
with base as (
  select p.id, p.student_id, p.class_id, p.session_id, p.study_date,
         ps.has_result, ps.progress, ps.rating, ps.auto_evaluated,
         r.completion_status,
         (p.study_date < public.vn_today()) as da_qua,
         (p.study_date - (p.created_at at time zone 'Asia/Ho_Chi_Minh')::date >= 1) as dung_han,
         p.use_device
  from public.plans p
  join public.plan_status ps on ps.plan_id = p.id
  left join public.reflections r on r.plan_id = p.id
  where p.class_id = any(p_classes) and p.study_date between p_from and p_to
),
qua as (select * from base where da_qua)
select json_build_object(
  'pham_vi', json_build_object('tu', p_from, 'den', p_to, 'so_lop', coalesce(array_length(p_classes,1),0)),
  'kpi', (select json_build_object(
      'so_lop',        coalesce(array_length(p_classes,1),0),
      'so_hoc_sinh',   (select count(distinct e.mshs) from public.enrollments e
                        where e.class_id = any(p_classes) and e.is_active),
      'so_buoi',       (select count(distinct session_id) from base),
      'so_nhiem_vu',   (select count(*) from base),
      'ty_le_hoan_thanh', (select case when count(*) = 0 then null
                            else round(100.0 * count(*) filter (where completion_status = 'Hoàn thành') / count(*)) end from qua),
      'ty_le_tre_han',    (select case when count(*) = 0 then null
                            else round(100.0 * count(*) filter (where not has_result) / count(*)) end from qua),
      'ty_le_dung_han',   (select case when count(*) = 0 then null
                            else round(100.0 * count(*) filter (where dung_han) / count(*)) end from base),
      'dung_thiet_bi',    (select count(*) filter (where use_device) from base),
      'diem_tb',          (select round(avg(rating)::numeric, 2) from base where rating is not null)
    )),
  'theo_lop', (select coalesce(json_agg(x order by x->>'lop'), '[]'::json) from (
      select json_build_object(
        'class_id', c.id, 'lop', c.name, 'khoi', cc.grade_level,
        'so_hoc_sinh', (select count(*) from public.enrollments e where e.class_id = c.id and e.is_active),
        'giao_vien', (select p.full_name from public.class_teachers ct
                      join public.profiles p on p.id = ct.teacher_id
                      where ct.class_id = c.id and ct.role = 'primary' and ct.status = 'active'),
        'so_nhiem_vu', (select count(*) from base b where b.class_id = c.id),
        'ty_le_hoan_thanh', (select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where completion_status = 'Hoàn thành') / count(*)) end
              from qua b where b.class_id = c.id),
        'ty_le_tre_han', (select case when count(*) = 0 then null
              else round(100.0 * count(*) filter (where not has_result) / count(*)) end
              from qua b where b.class_id = c.id),
        'hoat_dong_gan_nhat', (select max(b.study_date) from base b where b.class_id = c.id)
      ) as x
      from public.classes c
      left join public.class_catalog cc on cc.id = c.catalog_id
      where c.id = any(p_classes)
    ) t)
);
$$;

revoke all on function public.school_analytics(date, date, smallint, uuid),
                      public.analytics_build_many(uuid[], date, date) from public, anon;
grant execute on function public.school_analytics(date, date, smallint, uuid) to authenticated;

-- Xem trước kết quả import mà KHÔNG ghi gì.
-- Dùng chung đúng bộ luật với import_class_roster: nếu bản xem trước tự đoán
-- theo cách khác, giáo viên sẽ thấy một đằng và hệ thống làm một nẻo.
-- Cần security definer vì giáo viên không được đọc bảng students toàn trường —
-- ở đây chỉ trả về KẾT LUẬN cho đúng những MSHS thầy cô đã có trong file.
drop function if exists public.preview_class_roster(uuid, jsonb);
create or replace function public.preview_class_roster(p_class uuid, p_rows jsonb)
returns table (row_no int, mshs text, full_name text, outcome text, note text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_year uuid; v_current uuid; r jsonb;
  v_mshs text; v_name text; v_db_name text; v_other text; v_here boolean;
  seen text[] := '{}';
begin
  if not public.teaches_class(p_class) then
    raise exception 'Thầy/cô không có quyền quản lý lớp này';
  end if;
  select school_year_id into v_year from public.classes where id = p_class;
  select id into v_current from public.school_years where is_active;
  if v_year is distinct from v_current then
    raise exception 'Chỉ import được vào lớp của năm học hiện tại';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    row_no    := nullif(r->>'stt','')::int;
    mshs      := public.norm_mshs(r->>'mshs');
    full_name := public.norm_name(r->>'full_name');
    outcome   := null; note := null;

    if mshs is null and full_name is null then
      continue;                                  -- dòng trống của file mẫu
    elsif mshs is null then
      outcome := 'error'; note := 'Thiếu MSHS';
    elsif mshs !~ '^[0-9]{4,12}$' then
      outcome := 'error'; note := 'MSHS không hợp lệ';
    elsif full_name is null or char_length(full_name) < 3 then
      outcome := 'error'; note := 'Thiếu họ tên hoặc họ tên quá ngắn';
    elsif mshs = any(seen) then
      outcome := 'error'; note := 'MSHS trùng trong file';
    else
      seen := seen || mshs;
      select s.full_name into v_db_name from public.students s where s.mshs = preview_class_roster.mshs;

      if v_db_name is null then
        outcome := 'inserted'; note := 'Học sinh mới';
      elsif public.norm_name(v_db_name) is distinct from full_name then
        outcome := 'name_mismatch'; note := 'Trong hệ thống: ' || v_db_name;
      else
        select true into v_here from public.enrollments e
         where e.mshs = preview_class_roster.mshs and e.class_id = p_class and e.is_active;
        if coalesce(v_here, false) then
          outcome := 'already'; note := 'Đã có trong lớp';
        else
          select c.name into v_other
            from public.enrollments e join public.classes c on c.id = e.class_id
           where e.mshs = preview_class_roster.mshs and e.is_active
             and e.school_year_id = v_year and e.class_id <> p_class
           limit 1;
          if v_other is not null then
            outcome := 'conflict'; note := 'Đang thuộc lớp ' || v_other;
          else
            outcome := 'linked'; note := 'Đã có trên hệ thống — thêm vào lớp';
          end if;
        end if;
      end if;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.preview_class_roster(uuid, jsonb) from public, anon;
grant execute on function public.preview_class_roster(uuid, jsonb) to authenticated;

-- Danh sách lớp cho trang roster: gộp sẵn tình trạng tài khoản và hoạt động.
drop function if exists public.class_roster(uuid);
create or replace function public.class_roster(p_class uuid)
returns table (mshs text, full_name text, user_id uuid, avatar_path text,
               must_change_password boolean, so_nhiem_vu bigint, hoat_dong_gan_nhat date)
language sql stable security definer set search_path = public as $$
  select s.mshs, s.full_name, s.claimed_user_id, p.avatar_path, p.must_change_password,
         (select count(*) from public.plans pl where pl.student_id = s.claimed_user_id and pl.class_id = p_class),
         (select max(pl.study_date) from public.plans pl where pl.student_id = s.claimed_user_id and pl.class_id = p_class)
  from public.enrollments e
  join public.students s on s.mshs = e.mshs
  left join public.profiles p on p.id = s.claimed_user_id
  where e.class_id = p_class and e.is_active and public.teaches_class(p_class)
  order by s.full_name;
$$;

revoke all on function public.class_roster(uuid) from public, anon;
grant execute on function public.class_roster(uuid) to authenticated;

-- Chuyển học sinh khỏi lớp. KHÔNG xóa học sinh khỏi hệ thống, chỉ ngừng ghi
-- danh — lịch sử nhiệm vụ và tài khoản của em giữ nguyên.
create or replace function public.remove_from_class(p_class uuid, p_mshs text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.teaches_class(p_class) then
    raise exception 'Thầy/cô không có quyền quản lý lớp này';
  end if;
  update public.enrollments set is_active = false where class_id = p_class and mshs = p_mshs;
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), 'roster.removed', 'classes', p_class, json_build_object('mshs', p_mshs));
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.remove_from_class(uuid, text) from public, anon;
grant execute on function public.remove_from_class(uuid, text) to authenticated;


-- ============================================================================
--  14. RLS CHO BẢNG MỚI
-- ============================================================================
alter table public.class_catalog            enable row level security;
alter table public.audit_log                enable row level security;
alter table public.student_import_batches   enable row level security;
alter table public.student_import_rows      enable row level security;
alter table public.class_access_requests    enable row level security;

-- Danh mục lớp: ai đăng nhập cũng đọc được (chỉ là tên lớp), admin mới sửa.
drop policy if exists catalog_read on public.class_catalog;
create policy catalog_read on public.class_catalog for select to authenticated using (true);
drop policy if exists catalog_admin on public.class_catalog;
create policy catalog_admin on public.class_catalog for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_admin_read on public.audit_log;
create policy audit_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- Lịch sử import: giáo viên xem của lớp mình, admin xem tất cả.
drop policy if exists batches_read on public.student_import_batches;
create policy batches_read on public.student_import_batches for select to authenticated
  using (public.teaches_class(class_id));

drop policy if exists batch_rows_read on public.student_import_rows;
create policy batch_rows_read on public.student_import_rows for select to authenticated
  using (exists (select 1 from public.student_import_batches b
                 where b.id = batch_id and public.teaches_class(b.class_id)));

-- Yêu cầu xin lớp: giáo viên thấy yêu cầu của chính mình, admin thấy tất cả.
drop policy if exists requests_own on public.class_access_requests;
create policy requests_own on public.class_access_requests for select to authenticated
  using (teacher_id = auth.uid() or public.is_admin());
drop policy if exists requests_insert on public.class_access_requests;
create policy requests_insert on public.class_access_requests for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_active_teacher());
drop policy if exists requests_admin on public.class_access_requests;
create policy requests_admin on public.class_access_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admin đọc mọi hồ sơ để duyệt giáo viên; các nhánh cũ giữ nguyên.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or public.staff_sees_student_name(id)
  or public.shares_class_staff(id)
);

-- Admin quản lý năm học và danh mục lớp.
drop policy if exists years_admin on public.school_years;
create policy years_admin on public.school_years for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admin quản lý cặp lớp × năm. Giáo viên KHÔNG tự insert được — phải đi qua
-- claim_class() để không nhận trùng lớp của người khác.
drop policy if exists classes_admin on public.classes;
create policy classes_admin on public.classes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists class_teachers_admin on public.class_teachers;
create policy class_teachers_admin on public.class_teachers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Giáo viên đọc được phân công của chính mình (đã có policy cũ), thêm nhánh
-- để nhìn thấy đồng nghiệp cùng lớp khi cần.
drop policy if exists class_teachers_read on public.class_teachers;
create policy class_teachers_read on public.class_teachers
for select to authenticated
using (teacher_id = auth.uid() or public.is_admin() or public.teaches_class(class_id));

-- students / enrollments: admin toàn quyền đọc để tra cứu toàn trường.
drop policy if exists students_admin_read on public.students;
create policy students_admin_read on public.students for select to authenticated
  using (public.is_admin());
drop policy if exists enrollments_admin_read on public.enrollments;
create policy enrollments_admin_read on public.enrollments for select to authenticated
  using (public.is_admin());

grant select on public.class_catalog, public.audit_log, public.student_import_batches,
                public.student_import_rows, public.class_access_requests to authenticated;
grant insert on public.class_access_requests to authenticated;
grant update on public.class_access_requests to authenticated;
grant insert, update, delete on public.class_catalog to authenticated;   -- RLS: admin
grant insert, update, delete on public.school_years to authenticated;    -- RLS: admin
grant insert, update, delete on public.classes to authenticated;         -- RLS: admin
grant insert, update, delete on public.class_teachers to authenticated;  -- RLS: admin


-- ============================================================================
--  15. CHUYỂN DỮ LIỆU HIỆN CÓ  (đặt CUỐI CÙNG, sau khi mọi trigger đã thay xong)
-- ============================================================================

-- 15.1 Bootstrap quản trị viên. Email chỉ dùng để TÌM đúng tài khoản một lần;
-- sau bước này quyền nằm ở profiles.role, không ở email.
update public.profiles p
   set role = 'admin', approval_status = 'approved', approved_at = coalesce(approved_at, now())
  from auth.users u
 where u.id = p.id and lower(u.email) = 'ict.vuongnd@lsts.edu.vn';

-- 15.2 Chép email vào profiles để admin hiển thị được danh sách giáo viên.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id and p.email is distinct from u.email;

-- 15.3 Mọi tài khoản đang chạy coi như đã duyệt — không khóa nhầm ai.
update public.profiles set approval_status = 'approved' where approval_status is null;

-- 15.4 Phân công lớp cũ: đánh dấu là chủ nhiệm chính, còn hiệu lực.
update public.class_teachers set role = 'primary', status = 'active' where status is null or role is null;

-- 15.5 Nối lớp đang chạy về danh mục (8A7 → catalog 8A7).
update public.classes c
   set catalog_id = cc.id
  from public.class_catalog cc
 where cc.class_code = c.name and c.catalog_id is null;

-- 15.6 Ghi danh cũ chưa có năm học thì lấy từ lớp.
update public.enrollments e
   set school_year_id = c.school_year_id
  from public.classes c
 where c.id = e.class_id and e.school_year_id is null;
