import { useState } from 'react'
import { AlertTriangle, Download, KeyRound, X } from 'lucide-react'
import { callFunction } from '../lib/supabase'

// Cấp lại mật khẩu tạm cho nhiều giáo viên cùng lúc, rồi cho tải về CSV.
// Lý do tồn tại: mật khẩu tạm chỉ hiện MỘT lần lúc tạo và server chỉ lưu bản
// băm. Lỡ đóng cửa sổ trước khi chép thì không có đường nào xem lại — cấp lại
// là lối thoát duy nhất.
export default function BulkPasswordModal({ teachers, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [rows, setRows] = useState(null)

  const run = async () => {
    setBusy(true); setErr('')
    const { ok, data } = await callFunction('admin-manage-teacher', {
      action: 'bulk-reset', teacherIds: teachers.map((t) => t.id),
    })
    setBusy(false)
    if (!ok) return setErr(data?.error || 'Không cấp lại được.')
    setRows(data.dong ?? [])
    onDone?.()
  }

  const download = () => {
    const lines = [['Họ và tên', 'Email', 'Mật khẩu tạm'].join(',')]
    rows.filter((r) => r.matKhauTam).forEach((r) =>
      lines.push([r.full_name, r.email, r.matKhauTam]
        .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')))
    // BOM để Excel đọc đúng tiếng Việt.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `mat-khau-tam-giao-vien-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const ok = rows?.filter((r) => r.matKhauTam) ?? []
  const bad = rows?.filter((r) => r.loi) ?? []

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal wide" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div>
        <span className="eyebrow">CẤP LẠI MẬT KHẨU</span>
        <h2>{rows ? `Đã cấp lại cho ${ok.length} giáo viên` : `${teachers.length} giáo viên`}</h2>
      </div><button className="icon-button" onClick={onClose}><X size={18} /></button></div>

      {!rows ? <>
        <div className="notice warning"><AlertTriangle size={17} /><span>
          Mật khẩu hiện tại của <strong>{teachers.length}</strong> thầy/cô sẽ <strong>ngừng hoạt động ngay</strong>.
          Chỉ dùng khi thầy/cô chưa đăng nhập lần nào, hoặc khi đã mất mật khẩu tạm.
        </span></div>
        <div className="table-wrap import-table"><table>
          <thead><tr><th>Họ và tên</th><th>Email</th><th>Tình trạng</th></tr></thead>
          <tbody>{teachers.map((t) => <tr key={t.id}>
            <td>{t.full_name}</td><td><small>{t.email}</small></td>
            <td><small>{t.must_change_password ? 'Chưa đăng nhập lần nào' : 'Đã dùng mật khẩu riêng'}</small></td>
          </tr>)}</tbody>
        </table></div>
        {err && <div className="form-error">{err}</div>}
        <div className="form-actions">
          <button className="button ghost" onClick={onClose}>Hủy</button>
          <button className="button danger" onClick={run} disabled={busy}>
            <KeyRound size={16} /> {busy ? 'Đang cấp lại…' : `Cấp lại ${teachers.length} mật khẩu`}
          </button>
        </div>
      </> : <>
        <div className="notice warning"><AlertTriangle size={17} /><span>
          Danh sách này <strong>chỉ hiện một lần</strong>. Hãy tải về ngay — đóng cửa sổ là không xem lại được.
        </span></div>
        <button className="button primary full" onClick={download}>
          <Download size={17} /> Tải về CSV ({ok.length} mật khẩu)
        </button>
        <div className="table-wrap import-table"><table>
          <thead><tr><th>Họ và tên</th><th>Email</th><th>Mật khẩu tạm</th></tr></thead>
          <tbody>{ok.map((r) => <tr key={r.id}>
            <td>{r.full_name}</td><td><small>{r.email}</small></td>
            <td><code className="pw-cell">{r.matKhauTam}</code></td>
          </tr>)}</tbody>
        </table></div>
        {bad.length > 0 && <div className="table-wrap import-table"><table>
          <thead><tr><th>Email</th><th>Vấn đề</th></tr></thead>
          <tbody>{bad.map((r, i) => <tr key={i} className="row-err">
            <td><small>{r.email}</small></td><td><small>{r.loi}</small></td></tr>)}</tbody>
        </table></div>}
        <div className="form-actions">
          <button className="button primary" onClick={onClose}>Đã lưu, đóng lại</button>
        </div>
      </>}
    </div>
  </div>
}
