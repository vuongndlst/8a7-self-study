export default function StatusBadge({ value, label }) {
  const map = {
    'Đúng hạn': 'success', 'Trễ': 'warning',
    'Hoàn thành': 'success', 'Một phần': 'warning', 'Chưa hoàn thành': 'danger',
    'Cao': 'danger', 'Trung bình': 'warning', 'Thấp': 'muted',
    'Chờ duyệt': 'warning', 'Đã duyệt': 'success', 'Từ chối': 'danger', 'Không dùng': 'muted',
    // Tiến độ cập nhật kết quả — suy ra từ dữ liệu, không nhập tay.
    'Chưa tới buổi': 'muted', 'Đang chờ cập nhật': 'warning',
    'Trễ hạn cập nhật': 'danger', 'Đã hoàn thành': 'success', 'Hệ thống tự đánh giá': 'danger',
    'Cần xem lại': 'warning',
    // Không dùng thiết bị điện tử thì không phải qua tay giáo viên.
    'Không cần duyệt': 'muted', 'Cần điều chỉnh': 'warning',
  }
  return <span className={`badge ${map[value] || 'muted'}`}>{label || value || '—'}</span>
}
