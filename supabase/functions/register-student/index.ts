import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, studentEmail, validStudentPassword, PASSWORD_RULE_MESSAGE,
  normalizeName, sendEmail, emailLayout,
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

    // Thông báo — không chặn luồng đăng ký nếu gửi mail lỗi.
    const className = (row as any).classes?.name ?? ''
    const appUrl = Deno.env.get('APP_URL') ?? ''
    await sendEmail(email, 'Tài khoản Self-Study của em đã sẵn sàng', emailLayout(
      `Chào ${student.full_name}`,
      `<p style="margin:0 0 10px">Tài khoản giờ tự học của em đã được tạo cho lớp <strong>${className}</strong>.</p>
       <p style="margin:0 0 10px">Đăng nhập bằng <strong>MSHS ${cleanMshs}</strong> và mật khẩu em vừa đặt.</p>
       ${appUrl ? `<p style="margin:16px 0"><a href="${appUrl}" style="background:#12372A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Mở trang tự học</a></p>` : ''}
       <p style="margin:10px 0 0;font-size:13px;color:#6b7c74">Nếu em không thực hiện việc này, hãy báo ngay cho giáo viên chủ nhiệm.</p>`,
    ))

    // Báo cho giáo viên phụ trách lớp.
    const { data: teachers } = await admin
      .from('class_teachers')
      .select('profiles!inner(id)')
      .eq('class_id', row.class_id)
    const teacherIds = (teachers ?? []).map((t: any) => t.profiles.id)
    if (teacherIds.length) {
      const emails: string[] = []
      for (const id of teacherIds) {
        const { data: u } = await admin.auth.admin.getUserById(id)
        if (u?.user?.email) emails.push(u.user.email)
      }
      if (emails.length) {
        await sendEmail(emails, `[${className}] ${student.full_name} vừa tạo tài khoản`, emailLayout(
          'Có học sinh vừa đăng ký',
          `<p style="margin:0 0 6px"><strong>${student.full_name}</strong> — MSHS ${cleanMshs}</p>
           <p style="margin:0;color:#6b7c74">Lớp ${className} · ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>`,
        ))
      }
    }

    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Đã có lỗi khi tạo tài khoản. Hãy thử lại hoặc báo giáo viên.' }, 500)
  }
})
