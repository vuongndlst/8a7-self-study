// Bộ hồi quy KHÔNG chứa số cứng: mọi mốc đều chụp ngay đầu lần chạy.
// Học sinh vẫn đang dùng hệ thống thật, nên số liệu thay đổi từng ngày —
// test cắm số cứng sẽ báo động giả và mất luôn tác dụng.
import { q } from './db.mjs'

const ADMIN = 'e408c401-f86c-41b0-b49f-0c33f118e896'
const STU = 'ac295c23-67fa-4cea-aa85-aa1e61221828'
const auth = (u) => `set local role authenticated;\nselect set_config('request.jwt.claims','{"sub":"${u}","role":"authenticated"}',true);`
let pass = 0, fail = 0
const check = (l, ok, x = '') => { if (ok) { pass++; console.log('  PASS  ' + l) } else { fail++; console.log('  FAIL  ' + l + '   ' + x) } }
const one = async (s) => { try { return (await q(s))?.[0] } catch (e) { return { ERR: e.message.slice(0, 220) } } }

const snap = () => one(`select
  (select count(*) from public.students) hs, (select count(*) from public.enrollments) gd,
  (select count(*) from public.plans) nv, (select count(*) from public.self_study_sessions) buoi,
  (select count(*) from public.reflections) pt, (select count(*) from public.evidence) mc,
  (select count(*) from public.profiles) ho_so, (select count(*) from public.classes) lop,
  (select count(*) from public.school_years) nam`)

const before = await snap()
console.log('Moc dau lan chay:', JSON.stringify(before), '\n')

console.log('=== CAU TRUC ===')
const st = await one(`select
  (select count(*) from public.class_catalog) danh_muc,
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('class_catalog','audit_log','student_import_batches','student_import_rows','class_access_requests')) bang_moi,
  (select count(*) from pg_proc where proname in
     ('is_admin','is_active_teacher','current_school_year','set_current_school_year','set_teacher_status',
      'claim_class','assign_class_teacher','unassign_class_teacher','import_class_roster','remove_from_class',
      'my_classes','norm_mshs','norm_name','setting_bool','setting_text','create_school_year',
      'preview_class_roster','class_roster','school_analytics','year_bounds','default_range')) ham,
  (select count(*) from pg_indexes where indexname in
     ('one_primary_teacher_per_class','one_active_class_per_year','one_active_school_year')) rang_buoc`)
check('Danh muc 30 lop', Number(st.danh_muc) === 30, JSON.stringify(st))
check('5 bang moi', Number(st.bang_moi) === 5, JSON.stringify(st))
check('21 ham nghiep vu', Number(st.ham) === 21, 'ham=' + st.ham)
check('3 rang buoc chong sai du lieu', Number(st.rang_buoc) === 3, 'idx=' + st.rang_buoc)

const gap = await one(`select
  (select count(*) from public.enrollments where school_year_id is null) gd_thieu_nam,
  (select count(*) from public.classes where catalog_id is null) lop_thieu_danh_muc,
  (select count(*) from public.plans where session_id is null) nv_thieu_buoi,
  (select count(*) from public.profiles where approval_status is null) ho_so_thieu_trang_thai,
  (select count(*) from public.school_years where is_active) nam_hien_tai,
  (select count(*) from public.profiles where role='admin') admin`)
check('Khong con du lieu ho: ghi danh/lop/nhiem vu/ho so deu day du',
  Number(gap.gd_thieu_nam) === 0 && Number(gap.lop_thieu_danh_muc) === 0
  && Number(gap.nv_thieu_buoi) === 0 && Number(gap.ho_so_thieu_trang_thai) === 0, JSON.stringify(gap))
check('Dung 1 nam hien tai va 1 admin', Number(gap.nam_hien_tai) === 1 && Number(gap.admin) === 1, JSON.stringify(gap))

console.log('\n=== ADMIN VUA LA QUAN TRI VUA LA GIAO VIEN ===')
const cls = await one(`select id from public.classes limit 1`)
const p = await one(`${auth(ADMIN)}
  select public.is_admin() a, public.is_teacher() t, public.teaches_class('${cls.id}') d,
         public.staff_perm('${cls.id}','approve_plan') duyet, public.staff_perm('${cls.id}','rate') cham,
         (select count(*) from public.my_classes()) lop`)
check('Du ca hai quyen', p.a && p.t && p.d && p.duyet && p.cham && Number(p.lop) >= 1, JSON.stringify(p))
const rd = await one(`${auth(ADMIN)}\nselect count(*) n from public.plans`)
check('Admin doc duoc du lieu lop (khop moc dau)', Number(rd.n) === Number(before.nv), `${rd.n} vs ${before.nv}`)

console.log('\n=== HOC SINH BI CHAN DUNG CHO ===')
const s1 = await one(`${auth(STU)}\nselect public.is_admin() a, public.is_teacher() t, (select count(*) from public.my_classes()) lop`)
check('Khong phai admin, khong phai nhan su, khong co lop nao', !s1.a && !s1.t && Number(s1.lop) === 0, JSON.stringify(s1))
const s2 = await one(`${auth(STU)}\nupdate public.profiles set role='admin' where id='${STU}' returning id`)
check('Khong tu nang quyen duoc (chan o tang GRANT truoc ca RLS)',
  !!s2?.ERR && /permission denied/i.test(s2.ERR), JSON.stringify(s2))
const s3 = await one(`select role from public.profiles where id='${STU}'`)
check('Role hoc sinh van la student', s3?.role === 'student')
const s4 = await one(`${auth(STU)}\nselect count(*) n from public.audit_log`)
check('Khong doc duoc nhat ky quan tri', Number(s4.n) === 0)
const s5 = await one(`${auth(STU)}\nselect public.school_analytics('2026-08-01','2027-05-31',null,null) k`)
check('Khong xem duoc so lieu toan truong', !!s5?.ERR && /quản trị viên/.test(s5.ERR))
const s6 = await one(`${auth(STU)}\nselect public.create_school_year('zz','2030-01-01','2031-01-01',false) k`)
check('Khong tao duoc nam hoc', !!s6?.ERR && /quản trị viên/.test(s6.ERR))

console.log('\n=== SO LIEU KHOA TRONG NAM HOC ===')
const yb = await one(`select * from public.year_bounds(null)`)
const sa = await one(`${auth(STU)}\nselect public.student_analytics('${STU}','2000-01-01','2099-12-31') k`)
check('Xin khoang 2000-2099 van bi kep ve dung nam hoc',
  sa?.k?.pham_vi?.tu === yb.tu && sa?.k?.pham_vi?.den === yb.den,
  JSON.stringify(sa?.k?.pham_vi) + ' vs ' + JSON.stringify(yb))
const sc = await one(`${auth(ADMIN)}\nselect public.school_analytics('2000-01-01','2099-12-31',null,null) k`)
check('Toan truong cung bi kep', sc?.k?.pham_vi?.tu === yb.tu && sc?.k?.pham_vi?.den === yb.den, JSON.stringify(sc?.k?.pham_vi))
check('So lieu toan truong khop moc dau',
  Number(sc?.k?.kpi?.so_hoc_sinh) === Number(before.hs) && Number(sc?.k?.kpi?.so_lop) === Number(before.lop),
  JSON.stringify(sc?.k?.kpi))

console.log('\n=== KHONG CO TAC DUNG PHU ===')
const after = await snap()
check('Toan bo bo test la chi-doc, du lieu khong doi',
  JSON.stringify(after) === JSON.stringify(before), JSON.stringify(after))

console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`)
process.exit(fail ? 1 : 0)
