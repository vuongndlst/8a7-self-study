-- ============================================================================
--  CHẤM SAO HÀNG LOẠT  —  chạy SAU schema-5-books.sql
-- ============================================================================
--  Một lớp 32 em, mỗi tuần vài tiết tự học. Mở từng popup để chấm là hàng trăm
--  cú bấm mỗi tuần. Phần lớn các tiết đều "đạt" — thứ đáng để thầy cô dừng lại
--  đọc kỹ chỉ là số ít. Nên cần chấm nhanh cả nhóm rồi mới soi từng ca đặc biệt.
--
--  Chạy lại bao nhiêu lần cũng được.
-- ============================================================================


-- ============================================================================
--  32. XOÁ CỜ "BỔ SUNG MUỘN" KHI THẦY CÔ ĐÃ CHẤM LẠI
-- ============================================================================
-- mark_late_result bật needs_recheck khi em nộp kết quả SAU lúc đã bị chấm.
-- Nhưng không chỗ nào tắt nó cả — nên ô "Bổ sung muộn" ở hộp việc cần xử lý
-- đứng yên vĩnh viễn dù thầy cô đã chấm lại. Chấm lại CHÍNH LÀ hành động giải
-- quyết, nên nó phải tự tắt cờ.
--
-- Đặt ở trigger riêng thay vì sửa reflections_guard_columns: hàm đó dài và nằm
-- ở schema.sql, chép lại nguyên si chỉ để thêm hai dòng là mời gọi lệch bản.
-- Tên bắt đầu bằng trg_zz để chạy SAU cùng — Postgres gọi trigger theo thứ tự
-- bảng chữ cái, nên tới lượt nó thì guard đã quyết xong.
create or replace function public.clear_recheck_on_rerate()
returns trigger language plpgsql as $$
begin
  -- rating_at chỉ đổi khi guard đã xác nhận người chấm CÓ quyền chấm.
  -- Bám vào nó thì không cần kiểm quyền lần nữa, và không thể lệch với guard.
  if new.rating is distinct from old.rating
     and new.rating_at is distinct from old.rating_at then
    new.needs_recheck := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_zz_clear_recheck on public.reflections;
create trigger trg_zz_clear_recheck before update on public.reflections
for each row execute function public.clear_recheck_on_rerate();

revoke all on function public.clear_recheck_on_rerate() from anon, public, authenticated;


-- ============================================================================
--  33. CHẤM SAO HÀNG LOẠT
-- ============================================================================
-- Cùng khuôn với bulk_review_plans: KHÔNG security definer, nên RLS và trigger
-- guard vẫn chạy đầy đủ. Hàm này chỉ gom nhiều lần UPDATE thành một lượt gọi,
-- nó không hề nới quyền cho ai.
--
-- Quy tắc an toàn quan trọng nhất: MẶC ĐỊNH KHÔNG ĐÈ LÊN SAO THẦY CÔ ĐÃ CHẤM.
-- Thầy cô chọn 25 dòng mà 3 dòng trong đó đã được chấm 5 sao từ trước, rồi bấm
-- "chấm 4 sao" — hạ điểm 3 em đó xuống là chuyện không ai ngờ tới. Nên mặc định
-- chỉ chấm những tiết CHƯA có sao, hoặc mới bị hệ thống tự chấm 1 sao khi quá
-- hạn (đây chính là nhóm cần chấm lại nhiều nhất).
create or replace function public.bulk_rate_reflections(
  p_plan_ids uuid[],
  p_rating   smallint,
  p_comment  text default null,
  p_overwrite boolean default false      -- true = chấm đè lên cả sao đã có
) returns json language plpgsql set search_path = public as $$
declare
  v_done int; v_co_ket_qua int; v_da_cham int;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Số sao phải từ 1 đến 5.';
  end if;

  -- Chỉ chấm được tiết ĐÃ CÓ kết quả. Tiết em chưa cập nhật thì không có gì để
  -- chấm, và tạo phản tư rỗng thay em là làm sai dữ liệu.
  select count(*) into v_co_ket_qua
    from public.reflections r where r.plan_id = any(p_plan_ids);

  select count(*) into v_da_cham
    from public.reflections r
   where r.plan_id = any(p_plan_ids)
     and r.rating is not null and not r.auto_evaluated;

  with updated as (
    update public.reflections r
       set rating = p_rating,
           teacher_comment = coalesce(nullif(trim(coalesce(p_comment, '')), ''), r.teacher_comment)
     where r.plan_id = any(p_plan_ids)
       and (p_overwrite or r.rating is null or r.auto_evaluated)
       and r.rating is distinct from p_rating
    returning r.plan_id
  )
  select count(*) into v_done from updated;

  return json_build_object(
    'yeu_cau',      coalesce(array_length(p_plan_ids, 1), 0),
    'da_cham',      v_done,
    'chua_co_ket_qua', coalesce(array_length(p_plan_ids, 1), 0) - v_co_ket_qua,
    'bo_qua_da_cham',  case when p_overwrite then 0 else v_da_cham end,
    'so_sao',       p_rating
  );
end;
$$;

revoke all on function public.bulk_rate_reflections(uuid[], smallint, text, boolean)
  from anon, public;
grant execute on function public.bulk_rate_reflections(uuid[], smallint, text, boolean)
  to authenticated;


-- ============================================================================
--  34. HAI LỖI PHÁT HIỆN KHI KIỂM CHỨNG
-- ============================================================================

-- 34a. Thầy cô chấm lại thì tiết đó KHÔNG CÒN là "hệ thống tự đánh giá" nữa.
--
-- Trước đây cờ auto_evaluated bật lên rồi ở nguyên đó vĩnh viễn. Hậu quả: chấm
-- lại xong, ô "Hệ thống tự chấm" ở hộp việc cần xử lý vẫn đếm tiết đó, và ô
-- "Đã chấm sao" vẫn không đếm — vì cả hai đều lọc theo cờ này. Thầy cô làm xong
-- việc mà bảng điều khiển vẫn báo còn việc.
--
-- Gộp chung một trigger với việc xoá cờ "bổ sung muộn": cả hai đều là "thầy cô
-- vừa chấm lại nên trạng thái tự động cũ hết hiệu lực".
create or replace function public.clear_recheck_on_rerate()
returns trigger language plpgsql as $$
begin
  -- rating_at chỉ đổi khi guard đã xác nhận người chấm CÓ quyền chấm.
  -- Bám vào nó thì không cần kiểm quyền lần nữa, và không thể lệch với guard.
  if new.rating is distinct from old.rating
     and new.rating_at is distinct from old.rating_at then
    new.needs_recheck  := false;
    new.auto_evaluated := false;   -- giữ auto_evaluated_at làm dấu vết lịch sử
  end if;
  return new;
end;
$$;

-- 34b. Đếm đúng số tiết THỰC SỰ được chấm, không phải số dòng chạm tới.
--
-- Trigger guard hoàn nguyên cột rating khi người gọi không có quyền chấm, nhưng
-- câu UPDATE vẫn coi như đã đụng vào dòng đó, nên RETURNING vẫn trả về. Bản đầu
-- đếm theo đó nên báo "đã chấm 1" cho cả tài khoản HỌC SINH gọi thẳng API —
-- dữ liệu không hề đổi (đã kiểm), nhưng con số báo về thì sai.
--
-- RETURNING trả giá trị SAU khi BEFORE trigger chạy, nên chỉ cần lọc theo đúng
-- số sao mong muốn là đếm được phần có hiệu lực thật.
create or replace function public.bulk_rate_reflections(
  p_plan_ids uuid[],
  p_rating   smallint,
  p_comment  text default null,
  p_overwrite boolean default false
) returns json language plpgsql set search_path = public as $$
declare
  v_done int; v_cham_hut int; v_co_ket_qua int; v_da_cham int;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Số sao phải từ 1 đến 5.';
  end if;

  select count(*) into v_co_ket_qua
    from public.reflections r where r.plan_id = any(p_plan_ids);

  select count(*) into v_da_cham
    from public.reflections r
   where r.plan_id = any(p_plan_ids)
     and r.rating is not null and not r.auto_evaluated;

  with updated as (
    update public.reflections r
       set rating = p_rating,
           teacher_comment = coalesce(nullif(trim(coalesce(p_comment, '')), ''), r.teacher_comment)
     where r.plan_id = any(p_plan_ids)
       and (p_overwrite or r.rating is null or r.auto_evaluated)
       and r.rating is distinct from p_rating
    returning r.plan_id, r.rating
  )
  select count(*) filter (where rating = p_rating),
         count(*) filter (where rating is distinct from p_rating)
    into v_done, v_cham_hut
    from updated;

  if v_cham_hut > 0 then
    raise exception 'Bạn không có quyền chấm sao ở lớp này.';
  end if;

  return json_build_object(
    'yeu_cau',         coalesce(array_length(p_plan_ids, 1), 0),
    'da_cham',         v_done,
    'chua_co_ket_qua', coalesce(array_length(p_plan_ids, 1), 0) - v_co_ket_qua,
    'bo_qua_da_cham',  case when p_overwrite then 0 else v_da_cham end,
    'so_sao',          p_rating
  );
end;
$$;

revoke all on function public.bulk_rate_reflections(uuid[], smallint, text, boolean)
  from anon, public;
grant execute on function public.bulk_rate_reflections(uuid[], smallint, text, boolean)
  to authenticated;
