// Quản trị viên tạo / gán / đặt lại mật khẩu tài khoản giáo viên.
//
// Vì sao cần Edge Function chứ không phải RPC: tạo tài khoản trong auth.users
// đòi service role, mà service role thì TUYỆT ĐỐI không được xuống trình duyệt.
//
// Nguyên tắc quan trọng nhất ở đây: TÀI KHOẢN GIÁO VIÊN LÀ DUY NHẤT THEO EMAIL.
// Sang năm mới hoặc nhận thêm lớp thì CHỈ thêm phân công, không tạo lại tài khoản
// — nếu tạo lại, thầy cô sẽ mất mật khẩu đang dùng và mất lịch sử đã xử lý.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.2'
import { corsHeaders, json } from '../_shared/common.ts'

// Mật khẩu tạm dễ đọc khi đọc qua điện thoại: không có ký tự dễ nhìn nhầm
// (0/O, 1/l/I), nhưng vẫn đủ hoa + thường + số và dài 12 ký tự.
function tempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghijkmnpqrstuvwxyz'
  const digit = '23456789'
  const all = upper + lower + digit
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length]
  const chars = [pick(upper), pick(lower), pick(digit), pick(digit)]
  while (chars.length < 12) chars.push(pick(all))
  // Xáo trộn để ba ký tự bắt buộc không luôn nằm ở đầu.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data: userData, error: userError } = await admin.auth.getUser(token)
    if (userError || !userData.user) return json({ ok: false, error: 'Phiên đăng nhập không hợp lệ.' }, 401)

    // Quyền lấy từ CSDL, không từ email trong token.
    const { data: caller } = await admin.from('profiles').select('role').eq('id', userData.user.id).maybeSingle()
    if (caller?.role !== 'admin') return json({ ok: false, error: 'Chỉ quản trị viên mới thực hiện được.' }, 403)
    const actor = userData.user.id

    const body = await req.json()
    const action = String(body.action ?? 'create')

    // ---------- Gán lớp: dùng chung cho cả tạo mới lẫn gán thêm ----------
    const assignClass = async (teacherId: string, catalogId: string, yearId?: string) => {
      let year = yearId
      if (!year) {
        const { data: y } = await admin.from('school_years').select('id').eq('is_active', true).maybeSingle()
        year = y?.id
      }
      if (!year) return { error: 'Chưa có năm học hiện tại.' }

      const { data: cat } = await admin.from('class_catalog')
        .select('id, class_code').eq('id', catalogId).eq('is_active', true).maybeSingle()
      if (!cat) return { error: 'Lớp không có trong danh mục.' }

      // Cặp lớp × năm có thể chưa tồn tại (lớp lần đầu dùng trong năm này).
      let { data: cls } = await admin.from('classes')
        .select('id').eq('school_year_id', year).eq('catalog_id', cat.id).maybeSingle()
      if (!cls) {
        const { data: byName } = await admin.from('classes')
          .select('id').eq('school_year_id', year).eq('name', cat.class_code).maybeSingle()
        cls = byName
      }
      if (!cls) {
        const { data: created, error: e } = await admin.from('classes')
          .insert({ school_year_id: year, name: cat.class_code, catalog_id: cat.id, created_by: actor })
          .select('id').maybeSingle()
        if (e) return { error: 'Không tạo được lớp: ' + e.message }
        cls = created
      }

      // Lớp đã có chủ nhiệm khác thì KHÔNG im lặng ghi đè.
      // Không dùng embed profiles!inner ở đây: class_teachers có HAI khóa ngoại
      // trỏ sang profiles (teacher_id và assigned_by) nên PostgREST không biết
      // chọn đường nào, truy vấn hỏng, và lỗi rơi xuống thành tên ràng buộc SQL.
      const { data: holder } = await admin.from('class_teachers')
        .select('teacher_id')
        .eq('class_id', cls!.id).eq('role', 'primary').eq('status', 'active').maybeSingle()
      if (holder && holder.teacher_id !== teacherId) {
        const { data: who } = await admin.from('profiles')
          .select('full_name').eq('id', holder.teacher_id).maybeSingle()
        return { error: `Lớp ${cat.class_code} đã có giáo viên phụ trách: ${who?.full_name ?? 'giáo viên khác'}. `
                      + 'Hãy gỡ phân công cũ trước khi gán người mới.' }
      }

      const { error: e2 } = await admin.from('class_teachers').upsert({
        class_id: cls!.id, teacher_id: teacherId,
        role: 'primary', status: 'active', assigned_by: actor, ended_at: null,
      }, { onConflict: 'class_id,teacher_id' })
      if (e2) return { error: 'Không gán được lớp: ' + e2.message }

      await admin.from('audit_log').insert({
        actor_id: actor, action: 'class.assigned', entity: 'classes', entity_id: cls!.id,
        metadata: { teacher: teacherId, lop: cat.class_code },
      })
      return { classId: cls!.id, classCode: cat.class_code }
    }

    // ---------- Tra cứu / tạo tài khoản theo email ----------
    // Tách riêng để cả tạo lẻ lẫn import hàng loạt dùng chung đúng một quy tắc:
    // EMAIL ĐÃ CÓ THÌ DÙNG LẠI, không bao giờ tạo tài khoản thứ hai.
    const upsertTeacher = async (email: string, fullName: string) => {
      let userId: string | null = null
      let created = false
      let password: string | null = null

      let existingRole: string | null = null
      const { data: byProfile } = await admin.from('profiles')
        .select('id, role').eq('email', email).maybeSingle()
      if (byProfile) {
        if (byProfile.role === 'student') return { error: 'Email này đang là tài khoản học sinh.' }
        userId = byProfile.id
        existingRole = byProfile.role
      } else {
        // profiles.email có thể chưa điền với tài khoản cũ — tra thêm ở auth.
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const found = list?.users?.find((u: any) => (u.email ?? '').toLowerCase() === email)
        if (found) userId = found.id
      }

      if (!userId) {
        password = tempPassword()
        const { data: newUser, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        if (error) return { error: 'Không tạo được tài khoản: ' + error.message }
        userId = newUser.user!.id
        created = true
      }

      const patch: Record<string, unknown> = {
        id: userId, full_name: fullName, email,
        approval_status: 'approved', approved_by: actor, approved_at: new Date().toISOString(),
      }
      // KHÔNG hạ quyền quản trị viên. Danh sách giáo viên đầu năm thường có cả
      // dòng của chính admin (vì admin cũng chủ nhiệm một lớp) — ghi đè role ở
      // đây một lần là cả hệ thống không còn admin nào và không ai vào lại được.
      if (existingRole !== 'admin') patch.role = 'teacher'
      // Chỉ bắt đổi mật khẩu với tài khoản MỚI. Tài khoản cũ giữ nguyên mật khẩu
      // thầy/cô đang dùng — đây chính là ca "giáo viên cũ, năm mới".
      if (created) patch.must_change_password = true
      const { error: pe } = await admin.from('profiles').upsert(patch, { onConflict: 'id' })
      if (pe) return { error: 'Không lưu được hồ sơ: ' + pe.message }

      return { userId, created, password }
    }

    // ---------- Import danh sách giáo viên từ Excel ----------
    if (action === 'bulk') {
      const rows = Array.isArray(body.rows) ? body.rows : []
      if (!rows.length) return json({ ok: false, error: 'Danh sách rỗng.' }, 400)
      if (rows.length > 200) return json({ ok: false, error: 'Tối đa 200 dòng mỗi lần import.' }, 400)

      const { data: y } = await admin.from('school_years').select('id, name').eq('is_active', true).maybeSingle()
      if (!y) return json({ ok: false, error: 'Chưa có năm học hiện tại.' }, 400)

      const { data: cats } = await admin.from('class_catalog').select('id, class_code').eq('is_active', true)
      const byCode = Object.fromEntries((cats ?? []).map((c: any) => [c.class_code.toUpperCase(), c.id]))

      const results: any[] = []
      const seen = new Set<string>()
      let nNew = 0, nReuse = 0, nErr = 0

      for (const raw of rows) {
        const email = String(raw.email ?? '').trim().toLowerCase()
        const fullName = String(raw.fullName ?? '').trim().replace(/\s+/g, ' ')
        const code = String(raw.classCode ?? '').trim().toUpperCase()
        const line: any = { email, fullName, classCode: code }

        if (!email && !fullName && !code) continue          // dòng trống của file mẫu
        if (!email || !fullName) {
          line.outcome = 'error'; line.note = 'Thiếu email hoặc họ tên'
        } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          line.outcome = 'error'; line.note = 'Email không hợp lệ'
        } else if (seen.has(email)) {
          line.outcome = 'error'; line.note = 'Email trùng trong file'
        } else if (code && !byCode[code]) {
          line.outcome = 'error'; line.note = `Lớp ${code} không có trong danh mục`
        } else {
          seen.add(email)
          const t = await upsertTeacher(email, fullName)
          if (t.error) { line.outcome = 'error'; line.note = t.error }
          else {
            line.outcome = t.created ? 'created' : 'reused'
            line.matKhauTam = t.password
            if (code) {
              const a = await assignClass(t.userId!, byCode[code], y.id)
              if (a.error) { line.outcome = 'partial'; line.note = a.error }
              else line.lop = a.classCode
            }
          }
        }
        if (line.outcome === 'error') nErr++
        else if (line.outcome === 'created') nNew++
        else nReuse++
        results.push(line)
      }

      await admin.from('audit_log').insert({
        actor_id: actor, action: 'teacher.bulk_import', entity: 'profiles', entity_id: null,
        metadata: { tong: results.length, tao_moi: nNew, dung_lai: nReuse, loi: nErr, nam: y.name },
      })

      return json({ ok: true, tong: results.length, taoMoi: nNew, dungLai: nReuse, loi: nErr, dong: results })
    }

    // ---------- Gán lớp cho giáo viên đã có ----------
    if (action === 'assign') {
      const { teacherId, catalogId, yearId } = body
      if (!teacherId || !catalogId) return json({ ok: false, error: 'Thiếu giáo viên hoặc lớp.' }, 400)
      const { data: t } = await admin.from('profiles')
        .select('role, approval_status, full_name').eq('id', teacherId).maybeSingle()
      if (!t || (t.role !== 'teacher' && t.role !== 'admin')) {
        return json({ ok: false, error: 'Tài khoản này không phải giáo viên.' }, 400)
      }
      const r = await assignClass(teacherId, catalogId, yearId)
      if (r.error) return json({ ok: false, error: r.error }, 409)
      return json({ ok: true, daTaoTaiKhoan: false, lop: r.classCode, hoTen: t.full_name })
    }

    // ---------- Cấp lại mật khẩu cho NHIỀU giáo viên ----------
    // Mật khẩu tạm chỉ hiện một lần lúc tạo. Nếu quản trị viên lỡ đóng cửa sổ
    // trước khi chép, không có cách nào xem lại (server chỉ lưu bản băm) —
    // đường ra duy nhất là cấp lại. Đây chính là đường đó.
    if (action === 'bulk-reset') {
      const ids: string[] = Array.isArray(body.teacherIds) ? body.teacherIds : []
      if (!ids.length) return json({ ok: false, error: 'Chưa chọn giáo viên nào.' }, 400)
      if (ids.length > 100) return json({ ok: false, error: 'Tối đa 100 tài khoản mỗi lần.' }, 400)

      const { data: list } = await admin.from('profiles')
        .select('id, full_name, email, role').in('id', ids)
      const rows: any[] = []
      for (const t of list ?? []) {
        // Không đụng vào tài khoản quản trị viên qua đường hàng loạt.
        if (t.role !== 'teacher') { rows.push({ ...t, loi: 'Không phải tài khoản giáo viên' }); continue }
        const pw = tempPassword()
        const { error } = await admin.auth.admin.updateUserById(t.id, { password: pw })
        if (error) { rows.push({ ...t, loi: error.message }); continue }
        await admin.from('profiles').update({ must_change_password: true }).eq('id', t.id)
        rows.push({ id: t.id, full_name: t.full_name, email: t.email, matKhauTam: pw })
      }
      await admin.from('audit_log').insert({
        actor_id: actor, action: 'teacher.bulk_password_reset', entity: 'profiles', entity_id: null,
        metadata: { so_tai_khoan: rows.filter((r) => r.matKhauTam).length },
      })
      return json({ ok: true, dong: rows })
    }

    // ---------- Đặt lại mật khẩu giáo viên ----------
    if (action === 'reset') {
      const { teacherId } = body
      if (!teacherId) return json({ ok: false, error: 'Thiếu giáo viên.' }, 400)
      const { data: t } = await admin.from('profiles').select('role, full_name').eq('id', teacherId).maybeSingle()
      if (t?.role !== 'teacher') return json({ ok: false, error: 'Chỉ đặt lại được cho tài khoản giáo viên.' }, 400)
      const pw = tempPassword()
      const { error } = await admin.auth.admin.updateUserById(teacherId, { password: pw })
      if (error) throw error
      await admin.from('profiles').update({ must_change_password: true }).eq('id', teacherId)
      await admin.from('audit_log').insert({
        actor_id: actor, action: 'teacher.password_reset', entity: 'profiles', entity_id: teacherId, metadata: {},
      })
      return json({ ok: true, matKhauTam: pw, hoTen: t.full_name })
    }

    // ---------- Tạo tài khoản (hoặc dùng lại nếu email đã tồn tại) ----------
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.fullName ?? '').trim().replace(/\s+/g, ' ')
    const { catalogId, yearId } = body
    if (!email || !fullName) return json({ ok: false, error: 'Thiếu email hoặc họ tên.' }, 400)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, error: 'Email không hợp lệ.' }, 400)

    // Đuôi email trường: chỉ chặn khi quản trị viên bật cài đặt này.
    const { data: settings } = await admin.from('app_settings')
      .select('key, value_text, value_bool').in('key', ['allowed_teacher_domain', 'enforce_teacher_domain'])
    const map = Object.fromEntries((settings ?? []).map((s: any) => [s.key, s]))
    if (map.enforce_teacher_domain?.value_bool) {
      const domain = (map.allowed_teacher_domain?.value_text ?? '').trim().toLowerCase()
      if (domain && !email.endsWith('@' + domain)) {
        return json({ ok: false, error: `Email giáo viên phải thuộc @${domain}.` }, 400)
      }
    }

    // Dùng chung đúng một quy tắc với import hàng loạt: email đã có thì DÙNG LẠI.
    const t = await upsertTeacher(email, fullName)
    if (t.error) return json({ ok: false, error: t.error }, 409)
    const { userId, created, password } = t

    let classCode: string | null = null
    if (catalogId) {
      const r = await assignClass(userId!, catalogId, yearId)
      // Tài khoản đã tạo xong rồi — báo lỗi phần gán lớp nhưng vẫn trả mật khẩu,
      // nếu không thầy cô sẽ có tài khoản mà không ai biết mật khẩu là gì.
      if (r.error) {
        return json({ ok: true, daTaoTaiKhoan: created, matKhauTam: password,
                      hoTen: fullName, canhBao: r.error })
      }
      classCode = r.classCode ?? null
    }

    await admin.from('audit_log').insert({
      actor_id: actor, action: created ? 'teacher.created' : 'teacher.updated',
      entity: 'profiles', entity_id: userId, metadata: { email, lop: classCode },
    })

    return json({ ok: true, daTaoTaiKhoan: created, matKhauTam: password, hoTen: fullName, lop: classCode })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message ?? e) }, 500)
  }
})
