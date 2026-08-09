import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, validStudentPassword, PASSWORD_RULE_MESSAGE } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ ok: false, error: 'Chưa đăng nhập.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401)

    const { data: teacher } = await admin.from('profiles')
      .select('role, full_name').eq('id', userData.user.id).eq('role', 'teacher').maybeSingle()
    if (!teacher) return json({ ok: false, error: 'Không có quyền giáo viên.' }, 403)

    const { studentId, newPassword } = await req.json()
    if (!studentId) return json({ ok: false, error: 'Thiếu học sinh cần đặt lại mật khẩu.' }, 400)

    const { data: student } = await admin.from('profiles')
      .select('id, role, mshs, full_name').eq('id', studentId).eq('role', 'student').maybeSingle()
    if (!student?.mshs) return json({ ok: false, error: 'Không tìm thấy học sinh.' }, 404)

    // Giáo viên chỉ được đặt lại mật khẩu cho học sinh LỚP MÌNH PHỤ TRÁCH.
    const { data: allowed } = await admin
      .from('enrollments')
      .select('class_id, students!inner(claimed_user_id), classes!inner(school_years!inner(is_active))')
      .eq('students.claimed_user_id', studentId)
      .eq('is_active', true)
    const classIds = (allowed ?? [])
      .filter((r: any) => r.classes?.school_years?.is_active)
      .map((r: any) => r.class_id)
    if (classIds.length === 0) return json({ ok: false, error: 'Học sinh không thuộc lớp đang hoạt động.' }, 403)

    const { data: link } = await admin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', userData.user.id)
      .in('class_id', classIds)
      .maybeSingle()
    if (!link) return json({ ok: false, error: 'Học sinh này không thuộc lớp bạn phụ trách.' }, 403)

    const cleanPassword = String(newPassword || '')
    if (!validStudentPassword(cleanPassword, student.mshs)) {
      return json({ ok: false, error: PASSWORD_RULE_MESSAGE }, 400)
    }

    const { error } = await admin.auth.admin.updateUserById(studentId, { password: cleanPassword })
    if (error) throw error

    // Bắt học sinh tự đặt mật khẩu riêng ngay lần đăng nhập kế tiếp.
    const { error: flagError } = await admin.from('profiles')
      .update({ must_change_password: true }).eq('id', studentId)
    if (flagError) throw flagError

    // Mật khẩu tạm được giáo viên đưa trực tiếp cho học sinh — hệ thống không gửi email.
    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Không thể đặt lại mật khẩu.' }, 500)
  }
})
