import { Clock, LogOut, ShieldAlert, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Màn hình chặn giáo viên chưa được duyệt / bị từ chối / bị tạm khóa.
// Đây CHỈ là lớp giao diện cho dễ hiểu — hàng rào thật là RLS: các hàm
// teaches_class / teaches_mshs / teaches_user đều đòi approval_status='approved',
// nên gọi thẳng API cũng không đọc được dữ liệu lớp nào.
const VIEW = {
  pending: {
    icon: Clock,
    tone: '',
    title: 'Tài khoản đang chờ duyệt',
    body: 'Tài khoản của thầy/cô đã được tạo thành công và đang chờ quản trị viên xác nhận. '
        + 'Thầy/cô sẽ vào được hệ thống ngay sau khi tài khoản được duyệt.',
  },
  rejected: {
    icon: XCircle,
    tone: 'danger',
    title: 'Tài khoản chưa được duyệt',
    body: 'Quản trị viên chưa chấp nhận yêu cầu mở tài khoản này.',
  },
  suspended: {
    icon: ShieldAlert,
    tone: 'danger',
    title: 'Tài khoản đang tạm khóa',
    body: 'Tài khoản của thầy/cô tạm thời bị khóa nên chưa truy cập được dữ liệu lớp. '
        + 'Dữ liệu cũ vẫn được giữ nguyên.',
  },
}

export default function TeacherGate({ status, reason }) {
  const { profile, signOut } = useAuth()
  const v = VIEW[status] ?? VIEW.pending
  const Icon = v.icon

  return <div className="page narrow-page">
    <section className={`card gate-card ${v.tone}`}>
      <Icon size={40} />
      <h1>{v.title}</h1>
      <p>{v.body}</p>
      {reason && <div className="notice warning"><span><strong>Ghi chú của quản trị viên:</strong> {reason}</span></div>}
      <p className="muted-text small">Tài khoản: <strong>{profile?.email || profile?.full_name}</strong></p>
      <div className="form-actions">
        <button className="button ghost" onClick={signOut}><LogOut size={17} /> Đăng xuất</button>
      </div>
    </section>
  </div>
}
