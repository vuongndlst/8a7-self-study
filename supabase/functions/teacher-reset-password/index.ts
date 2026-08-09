import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function validStudentPassword(password: string, mshs: string) {
  return password.length >= 10
    && password.length <= 64
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && !/\s/.test(password)
    && !password.includes(mshs)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ ok: false, error: 'Chưa đăng nhập.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401)

    const { data: teacher } = await admin.from('profiles').select('role').eq('id', userData.user.id).eq('role', 'teacher').maybeSingle()
    if (!teacher) return json({ ok: false, error: 'Không có quyền giáo viên.' }, 403)

    const { studentId, newPassword } = await req.json()
    if (!studentId) return json({ ok: false, error: 'Thiếu học sinh cần đặt lại mật khẩu.' }, 400)

    const { data: student } = await admin.from('profiles').select('id, role, mshs').eq('id', studentId).eq('role', 'student').maybeSingle()
    if (!student?.mshs) return json({ ok: false, error: 'Không tìm thấy học sinh.' }, 404)

    const cleanPassword = String(newPassword || '')
    if (!validStudentPassword(cleanPassword, student.mshs)) {
      return json({ ok: false, error: 'Mật khẩu cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số; không có khoảng trắng và không chứa MSHS.' }, 400)
    }

    const { error } = await admin.auth.admin.updateUserById(studentId, { password: cleanPassword })
    if (error) throw error
    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Không thể đặt lại mật khẩu.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
