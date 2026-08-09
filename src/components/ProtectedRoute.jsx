import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordGate from './PasswordGate'

export default function ProtectedRoute({ role, children }) {
  const { loading, profile, recovery } = useAuth()
  if (loading) return <div className="page"><div className="card">Đang kiểm tra phiên đăng nhập…</div></div>
  if (!profile) return <Navigate to="/login" replace />
  // Chặn trước mọi trang: mật khẩu do giáo viên cấp phải được đổi ngay.
  if (recovery) return <PasswordGate mode="recovery" />
  if (profile.must_change_password) return <PasswordGate mode="forced" />
  if (role && profile.role !== role) return <Navigate to={profile.role === 'teacher' ? '/teacher' : '/student'} replace />
  return children
}
