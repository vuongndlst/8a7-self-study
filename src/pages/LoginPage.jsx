import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, KeyRound, ShieldCheck } from 'lucide-react'
import { supabase, studentEmail, STUDENT_EMAIL_DOMAIN } from '../lib/supabase'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('student')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [student, setStudent] = useState({ mshs: '', password: '' })
  // Không điền sẵn email giáo viên: trang đăng nhập là trang công khai, và trình
  // duyệt của thầy cô sẽ tự nhớ sau lần đăng nhập đầu tiên.
  const [teacher, setTeacher] = useState({ email: '', password: '' })

  const loginStudent = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    if (!/^\d{7}$/.test(student.mshs.trim())) { setBusy(false); return setError('MSHS cần gồm đúng 7 chữ số.') }
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: studentEmail(student.mshs), password: student.password,
    })
    setBusy(false)
    if (err) return setError('MSHS hoặc mật khẩu chưa đúng.')
    const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    navigate(p?.role === 'teacher' ? '/teacher' : '/student')
  }

  const loginTeacher = async (e) => {
    e.preventDefault(); setBusy(true); setError(''); setNotice('')
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: teacher.email.trim(), password: teacher.password,
    })
    setBusy(false)
    if (err) return setError('Email hoặc mật khẩu giáo viên chưa đúng.')
    const { data: p } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    if (p?.role !== 'teacher') { await supabase.auth.signOut(); return setError('Tài khoản này không có quyền giáo viên.') }
    navigate('/teacher')
  }

  return <div className="page auth-page auth-wide login-layout">
    <section className="auth-visual login-visual">
      <span className="pill-label">SELF-STUDY</span>
      <h1>Plan · Do · Reflect</h1>
      <p>Mỗi tiết tự học bắt đầu bằng một kế hoạch rõ ràng và kết thúc bằng một lần nhìn lại ngắn gọn.</p>
      <div className="login-preview card">
        <div className="preview-date"><span>Thứ Tư</span><strong>12</strong><small>THÁNG 8</small></div>
        <div>
          <span className="eyebrow">KẾ HOẠCH SẮP TỚI</span><h3>Toán · Tiết 4</h3>
          <p>Hoàn thành bài 5–10 và kiểm tra lại đáp án.</p>
          <div className="progress-track"><span style={{ width: '72%' }} /></div>
          <small>Đã lập kế hoạch trước 2 ngày</small>
        </div>
      </div>
    </section>

    <div className="card auth-card elevated">
      <div className="segmented">
        <button type="button" className={mode === 'student' ? 'active' : ''} onClick={() => { setMode('student'); setError(''); setNotice('') }}><GraduationCap size={17} /> Học sinh</button>
        <button type="button" className={mode === 'teacher' ? 'active' : ''} onClick={() => { setMode('teacher'); setError(''); setNotice('') }}><ShieldCheck size={17} /> Giáo viên</button>
      </div>
      <h2>Đăng nhập</h2>
      <p className="muted-text">Chọn đúng loại tài khoản để tiếp tục.</p>

      {/* key={mode} buộc React dựng lại form khi đổi tab. Nếu không, trình duyệt
          giữ nguyên ô đã autofill và điền email/mật khẩu giáo viên vào ô MSHS. */}
      {mode === 'student' ? <form key="student" onSubmit={loginStudent}>
        <label htmlFor="login-mshs">MSHS</label>
        {/* Không đặt autoComplete="username": trình duyệt sẽ coi đây là ô đăng nhập
            chung và đổ email giáo viên đã lưu vào. Chỉ nhận chữ số. */}
        <input id="login-mshs" name="mshs" inputMode="numeric" pattern="[0-9]*" maxLength={7}
               value={student.mshs}
               onChange={(e) => setStudent({ ...student, mshs: e.target.value.replace(/\D/g, '').slice(0, 7) })}
               placeholder="2406002" autoComplete="off" autoCorrect="off" spellCheck={false} required />
        <small className="muted-text">Tài khoản gắn với email trường: <strong>{student.mshs || 'MSHS'}@{STUDENT_EMAIL_DOMAIN}</strong></small>
        <label htmlFor="login-student-pw">Mật khẩu</label>
        <input id="login-student-pw" name="student-password" type="password" value={student.password}
               onChange={(e) => setStudent({ ...student, password: e.target.value })}
               autoComplete="off" required />
        {error && <div className="form-error">{error}</div>}
        {notice && <div className="notice"><span>{notice}</span></div>}
        <button className="button primary full large" disabled={busy}><KeyRound size={18} />{busy ? 'Đang đăng nhập…' : 'Đăng nhập học sinh'}</button>
        <p className="auth-switch">
          Chưa có tài khoản? <Link to="/register">Đăng ký lần đầu</Link><br />
          <span>Quên mật khẩu? Báo giáo viên chủ nhiệm để nhận mật khẩu tạm, rồi em tự đặt lại.</span>
        </p>
      </form> : <form key="teacher" onSubmit={loginTeacher}>
        <label htmlFor="login-teacher-email">Email giáo viên</label>
        <input id="login-teacher-email" name="teacher-email" type="email" value={teacher.email}
               onChange={(e) => setTeacher({ ...teacher, email: e.target.value })}
               autoComplete="email" required />
        <label htmlFor="login-teacher-pw">Mật khẩu</label>
        <input id="login-teacher-pw" name="teacher-password" type="password" value={teacher.password}
               onChange={(e) => setTeacher({ ...teacher, password: e.target.value })}
               autoComplete="current-password" required />
        {error && <div className="form-error">{error}</div>}
        <button className="button primary full large" disabled={busy}><ShieldCheck size={18} />{busy ? 'Đang đăng nhập…' : 'Vào Teacher Dashboard'}</button>
      </form>}
    </div>
  </div>
}
