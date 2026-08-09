-- Mẫu công khai của seed-roster.private.sql (file thật đã gitignore vì chứa tên học sinh).
-- Copy file này thành seed-roster.private.sql, sửa 5 hằng số và danh sách lớp.
--
-- Sang năm học mới KHÔNG cần xóa gì: chỉ sửa v_year_name / v_class_name / danh sách,
-- rồi chạy lại. Học sinh giữ nguyên tài khoản và toàn bộ lịch sử các năm trước.

do $$
declare
  v_year_name  text := '2026-2027';
  v_year_start date := '2026-08-01';
  v_year_end   date := '2027-05-31';
  v_class_name text := '8A7';
  v_teacher_email text := 'giaovien@lsts.edu.vn';

  v_year_id  uuid;
  v_class_id uuid;
  v_teacher  uuid;
begin
  update public.school_years set is_active = false where name <> v_year_name;

  insert into public.school_years (name, start_date, end_date, is_active)
  values (v_year_name, v_year_start, v_year_end, true)
  on conflict (name) do update
    set start_date = excluded.start_date, end_date = excluded.end_date, is_active = true
  returning id into v_year_id;

  insert into public.classes (school_year_id, name)
  values (v_year_id, v_class_name)
  on conflict (school_year_id, name) do update set name = excluded.name
  returning id into v_class_id;

  select p.id into v_teacher
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(v_teacher_email) and p.role = 'teacher';

  if v_teacher is null then
    raise notice 'Chưa có tài khoản giáo viên %. Chạy "npm run create-teacher" trước.', v_teacher_email;
  else
    insert into public.class_teachers (class_id, teacher_id)
    values (v_class_id, v_teacher) on conflict do nothing;
  end if;

  with roster(mshs, full_name) as (
    values
      ('2406002','Nguyễn Văn A'),
      ('2406008','Trần Thị B')
      -- … thêm học sinh của lớp ở đây
  ),
  upsert_students as (
    insert into public.students (mshs, full_name)
    select mshs, full_name from roster
    on conflict (mshs) do update set full_name = excluded.full_name
    returning mshs
  )
  insert into public.enrollments (mshs, class_id, is_active)
  select mshs, v_class_id, true from upsert_students
  on conflict (mshs, class_id) do update set is_active = true;
end $$;
