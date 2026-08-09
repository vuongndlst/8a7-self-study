// Tạo / cập nhật một lớp chủ nhiệm cho một năm học.
//
//   npm run setup-class -- admin/8a7-2026-2027.json      tạo hoặc cập nhật lớp
//   npm run setup-class -- --list                        xem tất cả năm / lớp / GV
//
// Script làm đủ 4 việc: năm học → lớp → tài khoản giáo viên → danh sách học sinh.
// Sang năm sau chỉ cần một file JSON mới. Thêm giáo viên khác cũng chỉ là một file JSON.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function loadEnv(p, { required = false } = {}) {
  if (!fs.existsSync(p)) {
    if (required) throw new Error(`Không tìm thấy ${p}. Hãy copy .env.admin.example thành ${p}.`)
    return
  }
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
}
loadEnv('.env')
loadEnv('.env.admin', { required: true })

const real = (name) => {
  const v = (process.env[name] || '').trim()
  return v && !/^(PASTE_|SET_A_|YOUR_)/i.test(v) ? v : ''
}
const SUPABASE_URL = real('SUPABASE_URL') || real('VITE_SUPABASE_URL')
const SERVICE_KEY = real('SUPABASE_SERVICE_ROLE_KEY') || real('SUPABASE_SECRET_KEY')
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Thiếu SUPABASE_URL hoặc key server-side trong .env.admin')

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const args = process.argv.slice(2)

// ---------- Chế độ xem ----------
if (args.includes('--list') || args.length === 0) {
  const { data: years } = await admin.from('school_years').select('id,name,is_active,start_date,end_date').order('name')
  if (!years?.length) { console.log('Chưa có năm học nào. Chạy: npm run setup-class -- admin/<file>.json'); process.exit(0) }
  for (const y of years) {
    console.log(`\n${y.is_active ? '▶' : ' '} ${y.name}  (${y.start_date} → ${y.end_date})${y.is_active ? '  [đang hoạt động]' : ''}`)
    const { data: classes } = await admin.from('classes').select('id,name').eq('school_year_id', y.id).order('name')
    for (const c of classes ?? []) {
      const { count: total } = await admin.from('enrollments').select('*', { count: 'exact', head: true }).eq('class_id', c.id).eq('is_active', true)
      const { data: cts } = await admin.from('class_teachers').select('teacher_id, profiles!inner(full_name)').eq('class_id', c.id)
      const { data: enr } = await admin.from('enrollments').select('students!inner(claimed_user_id)').eq('class_id', c.id).eq('is_active', true)
      const claimed = (enr ?? []).filter((e) => e.students?.claimed_user_id).length
      const gv = (cts ?? []).map((x) => x.profiles.full_name).join(', ') || '(chưa gán giáo viên)'
      console.log(`    ${c.name.padEnd(16)} ${claimed}/${total} HS đã tạo tài khoản   GV: ${gv}`)
    }
  }
  console.log()
  process.exit(0)
}

// ---------- Chế độ tạo / cập nhật ----------
const configPath = args.find((a) => !a.startsWith('--'))
if (!configPath || !fs.existsSync(configPath)) {
  console.error(`Không tìm thấy file cấu hình: ${configPath ?? '(thiếu tham số)'}`)
  console.error('Ví dụ: npm run setup-class -- admin/8a7-2026-2027.json')
  process.exit(1)
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
for (const k of ['schoolYear', 'class', 'teacher']) {
  if (!cfg[k]) throw new Error(`File cấu hình thiếu trường "${k}"`)
}

// Danh sách HS: nội tuyến trong JSON, hoặc trỏ tới file CSV "mshs,full_name".
let roster = cfg.students ?? []
if (cfg.studentsCsv) {
  const csvPath = path.resolve(path.dirname(configPath), cfg.studentsCsv)
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '')
  roster = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      return { mshs: cols[0], full_name: cols[1] }
    })
    .filter((s) => /^\d{7}$/.test(s.mshs))   // bỏ dòng tiêu đề
}
const bad = roster.filter((s) => !/^\d{7}$/.test(s.mshs) || !s.full_name)
if (bad.length) throw new Error(`Dòng học sinh không hợp lệ: ${JSON.stringify(bad.slice(0, 3))}`)

console.log(`Năm học : ${cfg.schoolYear.name}`)
console.log(`Lớp     : ${cfg.class.name}`)
console.log(`Giáo viên: ${cfg.teacher.email}`)
console.log(`Học sinh : ${roster.length}\n`)

// 1. Năm học
if (cfg.schoolYear.isActive !== false) {
  await admin.from('school_years').update({ is_active: false }).neq('name', cfg.schoolYear.name)
}
const { data: year, error: yearErr } = await admin.from('school_years').upsert({
  name: cfg.schoolYear.name,
  start_date: cfg.schoolYear.startDate,
  end_date: cfg.schoolYear.endDate,
  is_active: cfg.schoolYear.isActive !== false,
}, { onConflict: 'name' }).select().maybeSingle()
if (yearErr) throw yearErr
console.log(`[OK] Năm học ${year.name}${year.is_active ? ' (đang hoạt động)' : ''}`)

// 2. Lớp
const { data: klass, error: classErr } = await admin.from('classes').upsert(
  { school_year_id: year.id, name: cfg.class.name }, { onConflict: 'school_year_id,name' },
).select().maybeSingle()
if (classErr) throw classErr
console.log(`[OK] Lớp ${klass.name}`)

// 3. Giáo viên — tạo tài khoản nếu chưa có, KHÔNG đổi mật khẩu người đã có.
const teacherEmail = String(cfg.teacher.email).trim().toLowerCase()
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listErr) throw listErr
let teacherUser = list.users.find((u) => (u.email || '').toLowerCase() === teacherEmail)
let tempPassword = null
if (!teacherUser) {
  // Mật khẩu tạm ngẫu nhiên, in ra đúng một lần rồi thôi.
  tempPassword = `Gv${crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, '')}2026`
  const { data, error } = await admin.auth.admin.createUser({
    email: teacherEmail, password: tempPassword, email_confirm: true,
    user_metadata: { role: 'teacher', full_name: cfg.teacher.fullName },
  })
  if (error) throw error
  teacherUser = data.user
  console.log(`[OK] Tạo tài khoản giáo viên ${teacherEmail}`)
} else {
  console.log(`[OK] Giáo viên ${teacherEmail} đã có tài khoản — giữ nguyên mật khẩu`)
}
const { error: profErr } = await admin.from('profiles').upsert({
  id: teacherUser.id, role: 'teacher', mshs: null, full_name: cfg.teacher.fullName,
})
if (profErr) throw profErr
const { error: ctErr } = await admin.from('class_teachers').upsert({ class_id: klass.id, teacher_id: teacherUser.id })
if (ctErr) throw ctErr
console.log(`[OK] Gán ${cfg.teacher.fullName} phụ trách lớp ${klass.name}`)

// 4. Học sinh + ghi danh
if (roster.length) {
  const { error: stuErr } = await admin.from('students').upsert(
    roster.map((s) => ({ mshs: s.mshs, full_name: s.full_name })), { onConflict: 'mshs' },
  )
  if (stuErr) throw stuErr
  const { error: enrErr } = await admin.from('enrollments').upsert(
    roster.map((s) => ({ mshs: s.mshs, class_id: klass.id, is_active: true })), { onConflict: 'mshs,class_id' },
  )
  if (enrErr) throw enrErr

  // Học sinh đã rời lớp: tắt ghi danh, KHÔNG xóa dữ liệu cũ.
  const keep = new Set(roster.map((s) => s.mshs))
  const { data: current } = await admin.from('enrollments').select('mshs').eq('class_id', klass.id).eq('is_active', true)
  const drop = (current ?? []).map((e) => e.mshs).filter((m) => !keep.has(m))
  if (drop.length) {
    await admin.from('enrollments').update({ is_active: false }).eq('class_id', klass.id).in('mshs', drop)
    console.log(`[OK] Ngưng ghi danh ${drop.length} HS không còn trong danh sách: ${drop.join(', ')}`)
  }
  console.log(`[OK] ${roster.length} học sinh đã ghi danh vào ${klass.name}`)
}

const { count: claimed } = await admin.from('students').select('*', { count: 'exact', head: true }).not('claimed_user_id', 'is', null)
console.log(`\nXong. Toàn hệ thống hiện có ${claimed} học sinh đã tạo tài khoản.`)
if (tempPassword) {
  console.log('\n─────────────────────────────────────────────')
  console.log(`MẬT KHẨU TẠM CHO ${teacherEmail}:`)
  console.log(`   ${tempPassword}`)
  console.log('Đưa trực tiếp cho giáo viên và yêu cầu đổi ngay sau lần đăng nhập đầu.')
  console.log('Mật khẩu này KHÔNG được lưu ở đâu cả — chỉ hiện một lần này.')
  console.log('─────────────────────────────────────────────')
}
