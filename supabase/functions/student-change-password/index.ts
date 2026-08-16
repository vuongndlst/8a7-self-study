// Đổi mật khẩu học sinh — kiểm luật ở PHÍA SERVER.
// Frontend cũng kiểm, nhưng đây mới là chỗ không thể bỏ qua bằng DevTools.
// Hàm này cũng là nơi duy nhất hạ được cờ must_change_password.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders, json, studentEmail, validStudentPassword, PASSWORD_RULE_MESSAGE,
} from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405)

  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ ok: false, error: 'Chưa đăng nhập.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Key công khai để thử đăng nhập kiểm mật khẩu cũ. Tên biến khác nhau tùy
    // thế hệ API key của project, nên thử lần lượt.
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
      ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
      ?? serviceKey
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401)

    // Dùng được cho MỌI vai trò. Giáo viên do quản trị viên tạo cũng phải đổi mật
    // khẩu tạm ở lần đăng nhập đầu, và trước đây bị chặn ngay tại đây nên kẹt hẳn
    // ở màn hình đổi mật khẩu, không vào được hệ thống.
    const { data: profile } = await admin.from('profiles')
      .select('id, role, mshs').eq('id', userData.user.id).maybeSingle()
    if (!profile) return json({ ok: false, error: 'Không tìm thấy hồ sơ.' }, 403)
    if (profile.role === 'student' && !profile.mshs) {
      return json({ ok: false, error: 'Tài khoản học sinh thiếu MSHS.' }, 403)
    }

    // Email đăng nhập: học sinh là MSHS@domain, nhân sự là email thật.
    const loginEmail = profile.role === 'student'
      ? studentEmail(profile.mshs!)
      : (userData.user.email ?? '')
    if (!loginEmail) return json({ ok: false, error: 'Tài khoản chưa có email đăng nhập.' }, 400)

    const { currentPassword, newPassword } = await req.json()
    const current = String(currentPassword || '')
    const next = String(newPassword || '')

    if (!current) return json({ ok: false, error: 'Hãy nhập mật khẩu hiện tại.' }, 400)
    if (!validStudentPassword(next, profile.mshs ?? '')) {
      return json({ ok: false, error: PASSWORD_RULE_MESSAGE }, 400)
    }
    if (next === current) {
      return json({ ok: false, error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' }, 400)
    }

    // Xác minh mật khẩu hiện tại bằng một client rời, không đụng tới phiên đang dùng.
    const verifier = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: loginEmail,
      password: current,
    })
    if (signInError) return json({ ok: false, error: 'Mật khẩu hiện tại chưa đúng.' }, 400)
    await verifier.auth.signOut()

    const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password: next })
    if (updateError) throw updateError

    const { error: flagError } = await admin.from('profiles')
      .update({ must_change_password: false }).eq('id', profile.id)
    if (flagError) throw flagError

    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Không thể đổi mật khẩu. Hãy thử lại.' }, 500)
  }
})
