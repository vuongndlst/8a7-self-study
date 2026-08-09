import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeName = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

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
    const { fullName, mshs, password } = await req.json()
    const cleanName = String(fullName || '').normalize('NFC').trim().replace(/\s+/g, ' ')
    const cleanMshs = String(mshs || '').trim()
    const cleanPassword = String(password || '')

    if (!cleanName || !/^\d{7}$/.test(cleanMshs)) {
      return json({ ok: false, error: 'Họ tên hoặc MSHS chưa hợp lệ.' }, 400)
    }
    if (!validStudentPassword(cleanPassword, cleanMshs)) {
      return json({ ok: false, error: 'Mật khẩu cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số; không có khoảng trắng và không chứa MSHS.' }, 400)
    }

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Fetch by MSHS only, then compare normalized name server-side.
    const { data: roster, error: rosterError } = await admin
      .from('student_roster')
      .select('mshs, full_name, claimed_user_id, is_active')
      .eq('mshs', cleanMshs)
      .eq('is_active', true)
      .maybeSingle()

    if (rosterError) throw rosterError
    if (!roster || normalizeName(roster.full_name) !== normalizeName(cleanName)) {
      return json({ ok: false, error: 'Họ tên và MSHS chưa khớp danh sách lớp.' }, 400)
    }
    if (roster.claimed_user_id) {
      return json({ ok: false, error: 'MSHS này đã được đăng ký. Hãy đăng nhập hoặc liên hệ giáo viên nếu quên mật khẩu.' }, 409)
    }

    const internalEmail = `${cleanMshs}@student.8a7.example.com`
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password: cleanPassword,
      email_confirm: true,
      user_metadata: { role: 'student', full_name: roster.full_name, mshs: cleanMshs },
    })

    if (createError || !created.user) {
      console.error('createUser:', createError)
      return json({ ok: false, error: 'Không thể tạo tài khoản. Nếu MSHS đã từng đăng ký, hãy liên hệ giáo viên.' }, 409)
    }

    const userId = created.user.id
    const { error: profileError } = await admin.from('profiles').insert({
      id: userId,
      role: 'student',
      mshs: cleanMshs,
      full_name: roster.full_name,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(userId)
      throw profileError
    }

    // Atomic-ish claim: only succeeds if another request has not claimed this MSHS first.
    const { data: claimed, error: claimError } = await admin
      .from('student_roster')
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

    return json({ ok: true })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: 'Đã có lỗi khi tạo tài khoản. Hãy thử lại hoặc báo giáo viên.' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
