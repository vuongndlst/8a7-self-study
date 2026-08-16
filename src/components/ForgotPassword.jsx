import { useState } from 'react'
import { Mail, X } from 'lucide-react'
import { supabase, studentEmail, STUDENT_EMAIL_DOMAIN } from '../lib/supabase'

// Gửi link đặt lại mật khẩu về email trường.
// Chỉ hoạt động khi Supabase đã cấu hình SMTP (xem README mục 2b) — chưa cấu
// hình thì Supabase vẫn nhận lệnh nhưng thư không bao giờ tới.
export default function ForgotPassword({ mode, onClose }) {
  const student = mode === 'student'
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const email = student ? studentEmail(value.trim()) : value.trim().toLowerCase()
    if (student && !/^\d{7}$/.test(value.trim())) return setErr('MSHS cần gồm đúng 7 chữ số.')
    if (!student && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr('Email chưa hợp lệ.')

    setBusy(true)
    // redirectTo phải trỏ đúng site đang chạy, kể cả khi deploy dưới thư mục con.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    })
    setBusy(false)
    // Luôn báo THÀNH CÔNG dù email có tồn tại hay không: nếu phân biệt, trang
    // này thành công cụ dò xem tài khoản nào có thật.
    if (error && !/rate|limit/i.test(error.message)) return setErr('Chưa gửi được. Hãy thử lại sau ít phút.')
    if (error) return setErr('Đã gửi quá nhiều lần. Hãy đợi vài phút rồi thử lại.')
    setDone(true)
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div>
        <span className="eyebrow">QUÊN MẬT KHẨU</span>
        <h2>{done ? 'Đã gửi email' : 'Đặt lại mật khẩu'}</h2>
      </div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>

      {done ? <>
        <div className="notice"><Mail size={18} /><span>
          Nếu {student ? 'MSHS' : 'email'} này có tài khoản, một email đặt lại mật khẩu vừa được gửi tới{' '}
          <strong>{student ? `${value.trim()}@${STUDENT_EMAIL_DOMAIN}` : value.trim()}</strong>.
        </span></div>
        <p className="muted-text small">
          Link có hạn khoảng một giờ. Nhớ kiểm tra cả thư mục <strong>Spam</strong>.
          {student && ' Nếu em không nhận được, hãy báo giáo viên chủ nhiệm để nhận mật khẩu tạm.'}
        </p>
        <div className="form-actions"><button className="button primary" onClick={onClose}>Đóng</button></div>
      </> : <form onSubmit={submit}>
        <p className="muted-text">
          {student
            ? 'Nhập MSHS của em. Link đặt lại sẽ được gửi về email trường của em.'
            : 'Nhập email trường của thầy/cô. Link đặt lại sẽ được gửi về hộp thư đó.'}
        </p>
        <label>{student ? 'MSHS' : 'Email giáo viên'}</label>
        {student
          ? <input inputMode="numeric" maxLength={7} value={value} autoComplete="off"
                   onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 7))} placeholder="2406002" />
          : <input type="email" value={value} onChange={(e) => setValue(e.target.value)}
                   placeholder={`ten@${STUDENT_EMAIL_DOMAIN}`} autoComplete="email" />}
        {student && <small className="muted-text">Email nhận thư: <strong>{value || 'MSHS'}@{STUDENT_EMAIL_DOMAIN}</strong></small>}
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button type="button" className="button ghost" onClick={onClose}>Hủy</button>
          <button className="button primary" disabled={busy}><Mail size={17} />{busy ? 'Đang gửi…' : 'Gửi link đặt lại'}</button>
        </div>
      </form>}
    </div>
  </div>
}
