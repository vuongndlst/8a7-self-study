-- v10.1 — Giờ bắt đầu/kết thúc thật của từng tiết.
-- Học sinh được cập nhật từ khi tiết bắt đầu; popup và hạn 48 giờ chỉ tính từ
-- khi tiết (hoặc tiết cuối của nhiệm vụ kéo dài 2 tiết) kết thúc.

create or replace function public.study_period_start(p_study_date date, p_period smallint)
returns timestamptz language sql immutable strict set search_path = public as $fn$
  select (p_study_date + case p_period
    when 1 then time '07:40' when 2 then time '08:25' when 3 then time '09:20'
    when 4 then time '10:05' when 5 then time '10:50' when 6 then time '13:15'
    when 7 then time '14:00' when 8 then time '14:55' when 9 then time '15:40'
  end) at time zone 'Asia/Ho_Chi_Minh';
$fn$;

create or replace function public.study_period_end(p_study_date date, p_period smallint, p_span smallint default 1)
returns timestamptz language sql immutable strict set search_path = public as $fn$
  select (p_study_date + case least(9, p_period + greatest(p_span, 1) - 1)
    when 1 then time '08:20' when 2 then time '09:05' when 3 then time '10:00'
    when 4 then time '10:45' when 5 then time '11:30' when 6 then time '13:55'
    when 7 then time '14:40' when 8 then time '15:35' when 9 then time '16:20'
  end) at time zone 'Asia/Ho_Chi_Minh';
$fn$;

create or replace function public.result_available_at(p_study_date date, p_period smallint, p_created_at timestamptz)
returns timestamptz language sql immutable strict set search_path = public as $fn$
  select greatest(p_created_at, public.study_period_start(p_study_date, p_period));
$fn$;

create or replace function public.result_clock_start(
  p_study_date date, p_period smallint, p_span smallint, p_created_at timestamptz
) returns timestamptz language sql immutable strict set search_path = public as $fn$
  select greatest(p_created_at, public.study_period_end(p_study_date, p_period, p_span));
$fn$;

create or replace function public.progress_status(
  p_study_date date, p_period smallint, p_span smallint, p_created_at timestamptz,
  p_has_result boolean, p_auto boolean
) returns text language sql stable set search_path = public as $fn$
  select case
    when p_auto then 'Hệ thống tự đánh giá'
    when p_has_result then 'Đã hoàn thành'
    when now() < public.result_available_at(p_study_date, p_period, p_created_at) then 'Chưa tới buổi'
    when now() < public.result_clock_start(p_study_date, p_period, p_span, p_created_at) then 'Đang thực hiện'
    when now() < public.result_clock_start(p_study_date, p_period, p_span, p_created_at)
         + make_interval(hours => coalesce((select value_int from public.app_settings where key = 'overdue_hours'), 48))
      then 'Đang chờ cập nhật'
    else 'Trễ hạn cập nhật'
  end;
$fn$;

revoke all on function public.study_period_start(date, smallint),
                       public.study_period_end(date, smallint, smallint),
                       public.result_available_at(date, smallint, timestamptz),
                       public.result_clock_start(date, smallint, smallint, timestamptz),
                       public.progress_status(date, smallint, smallint, timestamptz, boolean, boolean)
  from anon, public;
grant execute on function public.study_period_start(date, smallint),
                          public.study_period_end(date, smallint, smallint),
                          public.result_available_at(date, smallint, timestamptz),
                          public.result_clock_start(date, smallint, smallint, timestamptz),
                          public.progress_status(date, smallint, smallint, timestamptz, boolean, boolean)
  to authenticated;

create or replace view public.plan_status with (security_invoker = true) as
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
  public.result_clock_start(p.study_date, p.period, p.span, p.created_at) as clock_start,
  public.result_clock_start(p.study_date, p.period, p.span, p.created_at)
    + make_interval(hours => coalesce((select value_int from public.app_settings where key = 'overdue_hours'), 48)) as overdue_at,
  public.result_clock_start(p.study_date, p.period, p.span, p.created_at)
    + make_interval(hours => coalesce((select value_int from public.app_settings where key = 'auto_rating_hours'), 120)) as auto_evaluate_at,
  (r.plan_id is not null) as has_result,
  coalesce(r.auto_evaluated, false) as auto_evaluated,
  public.progress_status(p.study_date, p.period, p.span, p.created_at, r.plan_id is not null, coalesce(r.auto_evaluated, false)) as progress,
  r.rating,
  r.needs_recheck,
  round(extract(epoch from (
    (p.study_date::text || ' 00:00:00')::timestamp at time zone 'Asia/Ho_Chi_Minh' - p.created_at
  )) / 3600.0, 1) as lead_time_hours,
  public.result_available_at(p.study_date, p.period, p.created_at) as available_at
from public.plans p
left join public.reflections r on r.plan_id = p.id;

grant select on public.plan_status to authenticated;

-- Chặn gửi trước giờ bắt đầu ở CSDL, không chỉ ẩn nút trên giao diện.
drop policy if exists reflections_student_insert on public.reflections;
create policy reflections_student_insert on public.reflections
for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.plans p
    where p.id = plan_id and p.student_id = auth.uid()
      and now() >= public.study_period_start(p.study_date, p.period)
  )
);

drop policy if exists reflections_student_update on public.reflections;
create policy reflections_student_update on public.reflections
for update to authenticated
using (student_id = auth.uid() and exists (
  select 1 from public.plans p where p.id = plan_id and p.student_id = auth.uid()
))
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.plans p
    where p.id = plan_id and p.student_id = auth.uid()
      and now() >= public.study_period_start(p.study_date, p.period)
  )
);

update public.app_settings
set note = 'Thiết lập cũ, chỉ giữ để tương thích; mốc cập nhật hiện dùng giờ bắt đầu/kết thúc thật của từng tiết',
    updated_at = now()
where key = 'period_end_hour';
