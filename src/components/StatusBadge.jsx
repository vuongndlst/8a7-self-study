export default function StatusBadge({ value, label }) {
  const map = {
    'Đúng hạn': 'success', 'Trễ': 'warning',
    'Hoàn thành': 'success', 'Một phần': 'warning', 'Chưa hoàn thành': 'danger',
    'Cao': 'danger', 'Trung bình': 'warning', 'Thấp': 'muted',
    'Chờ duyệt': 'warning', 'Đã duyệt': 'success', 'Từ chối': 'danger', 'Không dùng': 'muted',
  }
  return <span className={`badge ${map[value] || 'muted'}`}>{label || value || '—'}</span>
}
