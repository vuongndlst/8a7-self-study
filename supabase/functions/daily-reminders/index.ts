// Nhắc quá hạn — chạy mỗi ngày bằng cron (.github/workflows/daily-reminders.yml).
// Bảo vệ bằng secret CRON_SECRET, không dùng phiên đăng nhập.
//
// Hai việc nhắc:
//   1. Học sinh chưa đăng ký kế hoạch nào cho NGÀY MAI.
//   2. Tiết tự học đã qua mà chưa cập nhật kết quả (phản tư).
// Kèm một email tổng hợp gửi giáo viên phụ trách từng lớp.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, sendEmail, emailLayout } from '../_shared/common.ts'

const vnDate = (offsetDays = 0) => {
  const now = new Date(Date.now() + offsetDays * 86400000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}
const dmy = (iso: string) => iso.split('-').reverse().join('/')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const expected = Deno.env.get('CRON_SECRET')
  const given = req.headers.get('x-cron-secret')
  if (!expected || given !== expected) return json({ ok: false, error: 'Không có quyền.' }, 401)

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
    const today = vnDate(0)
    const tomorrow = vnDate(1)
    const appUrl = Deno.env.get('APP_URL') ?? ''

    const { data: year } = await admin.from('school_years').select('id, name').eq('is_active', true).maybeSingle()
    if (!year) return json({ ok: true, note: 'Chưa có năm học nào đang hoạt động.' })

    const { data: classes } = await admin.from('classes').select('id, name').eq('school_year_id', year.id)
    const report: unknown[] = []

    for (const cls of classes ?? []) {
      // Học sinh của lớp đã có tài khoản
      const { data: enrolled } = await admin
        .from('enrollments')
        .select('mshs, students!inner(mshs, full_name, claimed_user_id)')
        .eq('class_id', cls.id).eq('is_active', true)

      const students = (enrolled ?? [])
        .map((e: any) => e.students)
        .filter((s: any) => s.claimed_user_id)

      if (students.length === 0) { report.push({ lop: cls.name, boQua: 'chưa có tài khoản nào' }); continue }
      const ids = students.map((s: any) => s.claimed_user_id)

      // 1. Chưa có kế hoạch cho ngày mai
      const { data: tomorrowPlans } = await admin
        .from('plans').select('student_id').eq('class_id', cls.id).eq('study_date', tomorrow)
      const planned = new Set((tomorrowPlans ?? []).map((p: any) => p.student_id))
      const missingPlan = students.filter((s: any) => !planned.has(s.claimed_user_id))

      // 2. Tiết đã qua mà chưa có phản tư
      const { data: pastPlans } = await admin
        .from('plans').select('id, student_id, study_date, period, subject')
        .eq('class_id', cls.id).lt('study_date', today)
        .order('study_date', { ascending: false }).limit(500)
      const pastIds = (pastPlans ?? []).map((p: any) => p.id)
      const { data: refs } = pastIds.length
        ? await admin.from('reflections').select('plan_id').in('plan_id', pastIds)
        : { data: [] as any[] }
      const done = new Set((refs ?? []).map((r: any) => r.plan_id))
      const missingReflection = (pastPlans ?? []).filter((p: any) => !done.has(p.id))

      // Email cho từng học sinh
      const perStudent = new Map<string, { name: string; email?: string; noPlan: boolean; pending: any[] }>()
      for (const s of students as any[]) {
        perStudent.set(s.claimed_user_id, { name: s.full_name, noPlan: false, pending: [] })
      }
      for (const s of missingPlan as any[]) perStudent.get(s.claimed_user_id)!.noPlan = true
      for (const p of missingReflection) perStudent.get(p.student_id)?.pending.push(p)

      let sent = 0
      for (const [uid, info] of perStudent) {
        if (!info.noPlan && info.pending.length === 0) continue
        const { data: u } = await admin.auth.admin.getUserById(uid)
        const to = u?.user?.email
        if (!to) continue
        const parts: string[] = []
        if (info.noPlan) {
          parts.push(`<p style="margin:0 0 10px">Em <strong>chưa đăng ký kế hoạch tự học cho ngày ${dmy(tomorrow)}</strong>. Đăng ký trước ít nhất 1 ngày mới được tính là đúng hạn.</p>`)
        }
        if (info.pending.length) {
          const li = info.pending.slice(0, 8)
            .map((p: any) => `<li>${dmy(p.study_date)} · Tiết ${p.period} · ${p.subject}</li>`).join('')
          parts.push(`<p style="margin:0 0 6px">Em còn <strong>${info.pending.length} tiết chưa cập nhật kết quả</strong>:</p>
                      <ul style="margin:0 0 10px;padding-left:20px;color:#3d4f47">${li}</ul>`)
        }
        if (appUrl) parts.push(`<p style="margin:16px 0"><a href="${appUrl}" style="background:#12372A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Mở trang tự học</a></p>`)
        if (!dryRun) await sendEmail(to, `Nhắc giờ tự học — ${cls.name}`, emailLayout(`Chào ${info.name}`, parts.join('')))
        sent++
      }

      // Email tổng hợp cho giáo viên
      const { data: cts } = await admin.from('class_teachers').select('teacher_id').eq('class_id', cls.id)
      const teacherEmails: string[] = []
      for (const ct of cts ?? []) {
        const { data: u } = await admin.auth.admin.getUserById((ct as any).teacher_id)
        if (u?.user?.email) teacherEmails.push(u.user.email)
      }
      if (teacherEmails.length && (missingPlan.length || missingReflection.length)) {
        const nameOf = (uid: string) => perStudent.get(uid)?.name ?? uid
        const pendingByStudent = [...perStudent.entries()]
          .filter(([, v]) => v.pending.length)
          .map(([, v]) => `<li>${v.name} — ${v.pending.length} tiết</li>`).join('')
        const body = `
          <p style="margin:0 0 6px"><strong>Chưa đăng ký kế hoạch cho ${dmy(tomorrow)}</strong> (${missingPlan.length}/${students.length}):</p>
          <p style="margin:0 0 14px;color:#3d4f47">${missingPlan.length ? (missingPlan as any[]).map(s => s.full_name).join(' · ') : '— không có —'}</p>
          <p style="margin:0 0 6px"><strong>Chưa cập nhật kết quả</strong> (${missingReflection.length} tiết):</p>
          <ul style="margin:0;padding-left:20px;color:#3d4f47">${pendingByStudent || '<li>— không có —</li>'}</ul>`
        if (!dryRun) await sendEmail(teacherEmails, `[${cls.name}] Tổng hợp nhắc giờ tự học ${dmy(today)}`, emailLayout('Tổng hợp cuối ngày', body))
      }

      report.push({
        lop: cls.name,
        hocSinhCoTaiKhoan: students.length,
        chuaLapKeHoachNgayMai: missingPlan.length,
        tietChuaCapNhatKetQua: missingReflection.length,
        emailHocSinh: sent,
        emailGiaoVien: teacherEmails.length,
      })
    }

    return json({ ok: true, dryRun, ngay: today, nam: year.name, chiTiet: report })
  } catch (error) {
    console.error(error)
    return json({ ok: false, error: String(error) }, 500)
  }
})
