import { useState } from 'react'
import { KeyRound, ShieldAlert } from 'lucide-react'
import { supabase, callFunction } from '../lib/supabase'
import { passwordChecks, validateStudentPassword } from '../utils/password'
import { useAuth } from '../context/AuthContext'

// Màn chặn buộc đặt mật khẩu mới. Hai tình huống:
//   forced   — giáo viên vừa đặt lại mật khẩu, học sinh phải tự đổi ngay.
//   recovery — học sinh bấm link "quên mật khẩu" trong email.
export default function PasswordGate({ mode }) {
  const { profile, refreshProfile, clearRecovery, signOut } = useAuth()
  const mshs = profile?.mshs ?? ''
  // Giáo viên do quản trị viên tạo cũng qua màn này, nên lời văn phải đổi theo.
  const staff = profile?.role === 'teacher' || profile?.role === 'admin'
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const checks = passwordChecks(pw, mshs)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!validateStudentPassword(pw, mshs).ok) return setError('Mật khẩu mới chưa đáp ứng đầy đủ yêu cầu bên dưới.')
    if (pw !== confirm) return setError('Hai lần nhập mật khẩu chưa khớp.')

    setBusy(true)
    if (mode === 'recovery') {
      const { error: err } = await supabase.auth.updateUser({ password: pw })
      setBusy(false)
      if (err) return setError('Không thể đặt mật khẩu mới. Link có thể đã hết hạn — hãy yêu cầu lại.')
      clearRecovery()
      await refreshProfile()
      return
    }

    if (!current) { setBusy(false); return setError(staff ? 'Hãy nhập mật khẩu tạm quản trị viên đã cấp.' : 'Hãy nhập mật khẩu tạm mà giáo viên đã cấp.') }
    const { ok, data } = await callFunction('student-change-password', { currentPassword: current, newPassword: pw })
    setBusy(false)
    if (!ok) return setError(data?.error || 'Không thể đổi mật khẩu. Hãy thử lại.')
    await refreshProfile()
  }

  return <div className="page auth-page">
    <form className="card auth-card elevated" onSubmit={submit}>
      <div className="auth-title-row">
        <div className="icon-circle"><ShieldAlert /></div>
        <div>
          <span className="eyebrow">BẮT BUỘC</span>
          <h2>{mode === 'recovery' ? 'Đặt mật khẩu mới' : staff ? 'Đặt mật khẩu riêng của thầy/cô' : 'Đặt mật khẩu riêng của em'}</h2>
        </div>
      </div>
      <p className="muted-text">
        {mode === 'recovery'
          ? 'Em đang mở link khôi phục từ email. Hãy đặt mật khẩu mới để tiếp tục.'
          : 'Giáo viên vừa đặt lại mật khẩu cho em. Trước khi vào trang kế hoạch, em cần tự đặt một mật khẩu riêng mà chỉ em biết.'}
      </p>

      {mode !== 'recovery' && <>
        <label>{staff ? 'Mật khẩu tạm quản trị viên cấp *' : 'Mật khẩu tạm giáo viên cấp *'}</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </>}

      <label>Mật khẩu mới *</label>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required />
      <div className={`password-rules ${pw ? 'visible' : ''}`}>
        {checks.map((i) => <div key={i.key} className={i.ok ? 'rule-ok' : 'rule-pending'}>{i.ok ? '✓' : '○'} <span>{i.label}</span></div>)}
      </div>

      <label>Nhập lại mật khẩu mới *</label>
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />

      {error && <div className="form-error">{error}</div>}
      <button className="button primary full large" disabled={busy}>
        <KeyRound size={18} />{busy ? 'Đang lưu…' : 'Đặt mật khẩu và tiếp tục'}
      </button>
      <p className="auth-switch"><button type="button" className="link-button" onClick={signOut}>Đăng xuất</button></p>
    </form>
  </div>
}
