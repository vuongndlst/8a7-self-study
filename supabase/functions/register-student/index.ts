import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, studentEmail, validStudentPassword, PASSWORD_RULE_MESSAGE, normalizeName,
} from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const { fullName, mshs, password } = await req.json()
    const cleanName = String(fullName || '').normalize('NFC').trim().replace(/\s+/g, ' ')
    const cleanMshs = String(mshs || '').trim()
    const cleanPassword = String(password || '')

    if (!cleanName || !/^\d{7}$/.test(cleanMshs)) {
      return json({ ok: false, error: 'Họ tên hoặc MSHS chưa hợp lệ.' }, 400)
    }
    if (!validStudentPassword(cleanPassword, cleanMshs)) {
      return json({ ok: false, error: PASSWORD_RULE_MESSAGE }, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Học sinh phải đang được ghi danh vào một lớp của NĂM HỌC ĐANG HOẠT ĐỘNG.
    const { data: rows, error: rosterError } = await admin
      .from('enrollments')
      .select('mshs, class_id, students!inner(mshs, full_name, claimed_user_id), classes!inner(id, name, school_years!inner(name, is_active))')
      .eq('mshs', cleanMshs)
      .eq('is_active', true)

    if (rosterError) throw rosterError

    const row = (rows ?? []).find((r: any) => r.classes?.school_years?.is_active)
    const student = row?.students as { full_name: string; claimed_user_id: string | null } | undefined

    if (!row || !student || normalizeName(student.full_name) !== normalizeName(cleanName)) {
      return json({ ok: false, error: 'Họ tên và MSHS chưa khớp danh sách lớp.' }, 400)
    }
    if (student.claimed_user_id) {
      return json({ ok: false, error: 'MSHS này đã được đăng ký. Hãy đăng nhập hoặc liên hệ giáo viên nếu quên mật khẩu.' }, 409)
    }

    const email = studentEmail(cleanMshs)
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: { role: 'student', full_name: student.full_name, mshs: cleanMshs },
    })

    if (createError || !created.user) {
      console.error('createUser:', createError)
      return json({ ok: false, error: 'Không thể tạo tài khoản. Nếu MSHS đã từng đăng ký, hãy liên hệ giáo viên.' }, 409)
    }

    const userId = created.user.id
    const { error: profileError } = await admin.from('profiles').insert({
      id: userId, role: 'student', mshs: cleanMshs, full_name: student.full_name, must_change_password: false,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      throw profileError
    }

    // Chỉ thành công nếu chưa có phiên nào claim MSHS này trước đó.
    const { data: claimed, error: claimError } = await admin
      .from('students')
      .update({ claimed_user_id: userId })
      .eq('mshs', cleanMshs)
      .is('claimed_user_id', null)
      .select('mshs')
      .maybeSingle()

    if (claimError || !claimed) {
      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)
      return json({ ok: false, error: 'MSHS vừa được đăng ký ở một phiên khác. Hãy thử đăng nhập.' }, 409)
    }

    // Giáo viên thấy học sinh mới đăng ký ngay trên dashboard (thẻ "Tài khoản học sinh").
    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Đã có lỗi khi tạo tài khoản. Hãy thử lại hoặc báo giáo viên.' }, 500)
  }
})
