import { GraduationCap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Chỉ hiện khi thầy/cô thực sự phụ trách nhiều hơn một lớp. Một lớp thì không
// bắt chọn lại mỗi lần vào — hệ thống tự mở đúng lớp đó.
//
// Danh sách lấy từ my_classes() nên chỉ chứa lớp được phép; lựa chọn lưu ở
// localStorage chỉ để tiện, quyền vẫn do RLS quyết định ở mọi truy vấn.
export default function ClassSwitcher() {
  const { classes, context, selectClass } = useAuth()
  if (!classes || classes.length <= 1) return null

  return <label className="class-switcher" title="Lớp đang xem">
    <GraduationCap size={17} />
    <select value={context.classId ?? ''} onChange={(e) => selectClass(e.target.value)}>
      {classes.map((c) => <option key={c.class_id} value={c.class_id}>
        {c.class_name} · {c.so_hoc_sinh} HS{c.la_lop_cua_toi ? '' : ' (quản trị)'}
      </option>)}
    </select>
  </label>
}
