import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, UserRoundCheck, X } from 'lucide-react'
import { supabase, studentEmail, STUDENT_EMAIL_DOMAIN } from '../lib/supabase'
import { passwordChecks, validateStudentPassword } from '../utils/password'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ fullName: '', mshs: '', password: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })
  const checks = useMemo(() => passwordChecks(form.password, form.mshs), [form.password, form.mshs])
  const passwordReady = checks.every((item) => item.ok)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const cleanName = form.fullName.trim().replace(/\s+/g, ' ')
    const cleanMshs = form.mshs.trim()
    if (!cleanName || !/^\d{7}$/.test(cleanMshs)) return setError('Vui lòng nhập đúng họ tên và MSHS gồm 7 chữ số.')
    const passwordResult = validateStudentPassword(form.password, cleanMshs)
    if (!passwordResult.ok) return setError('Mật khẩu chưa đáp ứng đầy đủ các yêu cầu bên dưới.')
    if (form.password !== form.confirm) return setError('Hai lần nhập mật khẩu chưa khớp.')

    setBusy(true)
    const { data, error: fnError } = await supabase.functions.invoke('register-student', {
      body: { fullName: cleanName, mshs: cleanMshs, password: form.password },
    })
    if (fnError || !data?.ok) {
      setBusy(false)
      return setError(data?.error || fnError?.message || 'Không thể tạo tài khoản.')
    }

    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: studentEmail(cleanMshs),
      password: form.password,
    })
    setBusy(false)
    if (loginError) return setError('Tài khoản đã được tạo. Hãy chuyển sang trang đăng nhập và thử lại.')
    navigate('/student')
  }

  return <div className="page auth-page auth-wide">
    <section className="auth-visual">
      <span className="pill-label"><ShieldCheck size={15}/> Đăng ký an toàn</span>
      <h1>Một tài khoản riêng cho kế hoạch tự học của em.</h1>
      <p>Hệ thống chỉ cho phép tạo tài khoản khi <strong>Họ tên + MSHS</strong> khớp đúng danh sách lớp của năm học hiện hành.</p>
      <div className="auth-visual-steps">
        <div><span>01</span><p><strong>Xác minh</strong><small>Nhập đúng họ tên và MSHS.</small></p></div>
        <div><span>02</span><p><strong>Tạo mật khẩu</strong><small>Chỉ em biết và sử dụng.</small></p></div>
        <div><span>03</span><p><strong>Bắt đầu</strong><small>Đăng ký kế hoạch theo ngày và tiết.</small></p></div>
      </div>
      <div className="security-note"><LockKeyhole size={20}/><span>Mật khẩu được Supabase Auth băm và lưu an toàn; website không lưu mật khẩu dạng đọc được.</span></div>
    </section>

    <form className="card auth-card elevated" onSubmit={submit}>
      <div className="auth-title-row"><div className="icon-circle"><UserRoundCheck/></div><div><span className="eyebrow">LẦN ĐẦU SỬ DỤNG</span><h2>Tạo tài khoản học sinh</h2></div></div>
      <p className="muted-text">Mỗi MSHS chỉ đăng ký được một tài khoản. Hãy kiểm tra kỹ trước khi gửi.</p>

      <label>Họ và tên *</label>
      <input name="fullName" value={form.fullName} onChange={update} placeholder="Nhập đầy đủ họ và tên có dấu" autoComplete="name" required/>

      <label>MSHS *</label>
      <input name="mshs" value={form.mshs} onChange={update} inputMode="numeric" pattern="[0-9]*" maxLength={7} placeholder="Ví dụ: 2406002" autoComplete="username" required/>
      <div className="notice compact"><LockKeyhole size={17}/><span>Không sử dụng MSHS của bạn khác. Thông tin sẽ được đối chiếu với danh sách lớp.</span></div>
      {/^\d{7}$/.test(form.mshs.trim()) && <small className="muted-text">Tài khoản sẽ gắn với email trường: <strong>{form.mshs.trim()}@{STUDENT_EMAIL_DOMAIN}</strong></small>}

      <label>Mật khẩu riêng *</label>
      <div className="password-field">
        <input name="password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={update} placeholder="Tạo mật khẩu của riêng em" autoComplete="new-password" required/>
        <button type="button" className="password-toggle" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
      </div>
      <div className={`password-rules ${form.password ? 'visible' : ''}`}>
        {checks.map((item) => <div key={item.key} className={item.ok ? 'rule-ok' : 'rule-pending'}>{item.ok ? <Check size={15}/> : <X size={15}/>}<span>{item.label}</span></div>)}
      </div>

      <label>Nhập lại mật khẩu *</label>
      <input name="confirm" type="password" value={form.confirm} onChange={update} placeholder="Nhập lại mật khẩu" autoComplete="new-password" required/>
      {form.confirm && <small className={form.password === form.confirm ? 'text-success' : 'text-warning'}>{form.password === form.confirm ? '✓ Hai mật khẩu đã khớp.' : 'Hai mật khẩu chưa khớp.'}</small>}

      {error && <div className="form-error">{error}</div>}
      <button className="button primary full large" disabled={busy || !passwordReady}><KeyRound size={18}/>{busy ? 'Đang tạo tài khoản…' : 'Tạo tài khoản của em'}</button>
      <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link> · <Link to="/guide">Xem hướng dẫn</Link></p>
    </form>
  </div>
}
