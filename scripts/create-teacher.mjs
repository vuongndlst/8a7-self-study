import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

function loadEnv(path, { required = false } = {}) {
  if (!fs.existsSync(path)) {
    if (required) throw new Error(`Không tìm thấy ${path}. Hãy copy .env.admin.example thành ${path}.`)
    return
  }
  const text = fs.readFileSync(path, 'utf8')
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 0) continue
    process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
}

// .env có thể chứa URL và secret key kiểu mới; .env.admin ghi đè lên nó.
loadEnv('.env')
loadEnv('.env.admin', { required: true })

// Dòng còn nguyên giá trị mẫu trong .env.admin.example phải bị coi như chưa điền.
const real = (name) => {
  const v = (process.env[name] || '').trim()
  return v && !/^(PASTE_|SET_A_|YOUR_)/i.test(v) ? v : ''
}

const SUPABASE_URL = real('SUPABASE_URL')
const TEACHER_EMAIL = real('TEACHER_EMAIL')
const TEACHER_PASSWORD = real('TEACHER_PASSWORD')
const TEACHER_NAME = real('TEACHER_NAME')
// Supabase có 2 thế hệ key server-side: service_role (legacy) và sb_secret_ (mới).
const SUPABASE_SERVICE_ROLE_KEY = real('SUPABASE_SERVICE_ROLE_KEY') || real('SUPABASE_SECRET_KEY')
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TEACHER_EMAIL || !TEACHER_PASSWORD || !TEACHER_NAME) {
  throw new Error('Thiếu biến môi trường: cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (hoặc SUPABASE_SECRET_KEY), TEACHER_EMAIL, TEACHER_PASSWORD, TEACHER_NAME.')
}
if (TEACHER_PASSWORD.length < 12 || !/[A-Z]/.test(TEACHER_PASSWORD) || !/[a-z]/.test(TEACHER_PASSWORD) || !/\d/.test(TEACHER_PASSWORD)) {
  throw new Error('TEACHER_PASSWORD nên có ít nhất 12 ký tự, gồm chữ hoa, chữ thường và số.')
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const normalizedEmail = TEACHER_EMAIL.trim().toLowerCase()
const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (listError) throw listError

let user = usersData.users.find((u) => (u.email || '').toLowerCase() === normalizedEmail)

if (user) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password: TEACHER_PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'teacher', full_name: TEACHER_NAME },
  })
  if (error) throw error
  user = data.user
  console.log(`Đã cập nhật tài khoản teacher: ${normalizedEmail}`)
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: TEACHER_PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'teacher', full_name: TEACHER_NAME },
  })
  if (error) throw error
  user = data.user
  console.log(`Đã tạo tài khoản teacher: ${normalizedEmail}`)
}

const { error: profileError } = await admin.from('profiles').upsert({
  id: user.id,
  role: 'teacher',
  mshs: null,
  full_name: TEACHER_NAME,
})
if (profileError) throw profileError

console.log('Đã gán role teacher trong public.profiles.')
console.log('Không commit file .env.admin lên GitHub.')
