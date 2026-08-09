-- Mẫu seed roster. KHÔNG để dữ liệu thật trong repo public.
insert into public.student_roster (mshs, full_name) values
('MSHS_001','HỌ TÊN HỌC SINH 1'),
('MSHS_002','HỌ TÊN HỌC SINH 2')
on conflict (mshs) do update set full_name=excluded.full_name, is_active=true;
