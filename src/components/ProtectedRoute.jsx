import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordGate from './PasswordGate'
import TeacherGate from './TeacherGate'
import { homeForRole } from '../utils/roles'


export default function ProtectedRoute({ role, children }) {
  const { loading, profile, recovery } = useAuth()
  if (loading) return <div className="page"><div className="card">Đang kiểm tra phiên đăng nhập…</div></div>
  if (!profile) return <Navigate to="/login" replace />
  // Chặn trước mọi trang: mật khẩu do giáo viên cấp phải được đổi ngay.
  if (recovery) return <PasswordGate mode="recovery" />
  if (profile.must_change_password) return <PasswordGate mode="forced" />

  // Giáo viên chưa được duyệt / bị tạm khóa không vào được bất kỳ trang dữ liệu
  // nào. Chặn ở đây là để giao diện đỡ báo lỗi khó hiểu; hàng rào thật nằm ở RLS.
  if (profile.role === 'teacher' && profile.approval_status !== 'approved') {
    return <TeacherGate status={profile.approval_status} reason={profile.rejected_reason} />
  }

  // Quản trị viên đi được cả trang giáo viên: ở trường này admin cũng chủ nhiệm
  // một lớp, và teaches_class() phía CSDL đã cho phép sẵn.
  const ok = !role || profile.role === role || (role === 'teacher' && profile.role === 'admin')
  if (!ok) return <Navigate to={homeForRole(profile.role)} replace />
  return children
}
