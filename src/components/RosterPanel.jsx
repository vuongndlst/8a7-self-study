import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, History, Search, UserMinus, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../utils/date'
import Avatar from './Avatar'
import StudentImport from './StudentImport'

const PAGE = 25

// Danh sách học sinh của lớp đang xem + nhập danh sách từ Excel.
export default function RosterPanel({ classId, className, yearName }) {
  const [roster, setRoster] = useState([])
  const [batches, setBatches] = useState([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [importing, setImporting] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  const load = async () => {
    if (!classId) return
    setLoading(true)
    const [{ data: r }, { data: b }] = await Promise.all([
      supabase.rpc('class_roster', { p_class: classId }),
      supabase.from('student_import_batches')
        .select('*').eq('class_id', classId).order('created_at', { ascending: false }).limit(10),
    ])
    setRoster(r ?? []); setBatches(b ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [classId])
  useEffect(() => { setPage(1) }, [search])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((r) => `${r.full_name} ${r.mshs}`.toLowerCase().includes(q))
  }, [roster, search])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE))
  const pageRows = rows.slice((page - 1) * PAGE, page * PAGE)
  const claimed = roster.filter((r) => r.user_id).length

  const remove = async (r) => {
    const { error } = await supabase.rpc('remove_from_class', { p_class: classId, p_mshs: r.mshs })
    setRemoving(null)
    if (error) return setMsg('Không chuyển được: ' + error.message)
    setMsg(`✓ Đã chuyển ${r.full_name} khỏi lớp. Tài khoản và lịch sử của em vẫn được giữ.`)
    load()
  }

  const exportCsv = () => {
    const lines = [['MSHS', 'Họ và tên', 'Tình trạng tài khoản', 'Số nhiệm vụ', 'Hoạt động gần nhất'].join(',')]
    rows.forEach((r) => lines.push([
      r.mshs, r.full_name,
      r.user_id ? (r.must_change_password ? 'Chờ đổi mật khẩu' : 'Đã kích hoạt') : 'Chưa đăng ký',
      r.so_nhiem_vu, r.hoat_dong_gan_nhat ?? '',
    ].map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',')))
    // ﻿ để Excel nhận ra UTF-8, nếu không tên tiếng Việt sẽ thành ký tự lạ.
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `danh-sach-${className}-${yearName}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!classId) return <section className="card empty-state">
    <p>Thầy/cô chưa được phân công lớp nào trong năm học này.</p>
  </section>

  return <>
    <section className="card">
      <div className="section-title">
        <div>
          <h2><Users size={19} /> Danh sách lớp {className}</h2>
          <p>{roster.length} học sinh · {claimed} đã tạo tài khoản · Năm học {yearName}</p>
        </div>
        <div className="button-row">
          <button className="button ghost" onClick={exportCsv} disabled={!rows.length}>
            <Download size={17} /> Xuất CSV</button>
          <button className="button primary" onClick={() => setImporting(true)}>
            <FileSpreadsheet size={17} /> Import danh sách</button>
        </div>
      </div>

      {msg && <div className={msg.startsWith('✓') ? 'notice' : 'form-error'}>{msg}</div>}

      {roster.length === 0 && !loading
        ? <div className="empty-state">
            <p>Lớp chưa có học sinh nào. Hãy tải file mẫu và import danh sách để bắt đầu.</p>
            <button className="button primary" onClick={() => setImporting(true)}>
              <FileSpreadsheet size={17} /> Import danh sách học sinh</button>
          </div>
        : <>
            <div className="filters">
              <div className="search-box"><Search size={17} />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên hoặc MSHS…" /></div>
            </div>

            {loading ? <div className="empty-state">Đang tải…</div>
              : <div className="table-wrap"><table>
                  <thead><tr><th>Học sinh</th><th>MSHS</th><th>Tài khoản</th><th>Nhiệm vụ</th>
                    <th>Hoạt động gần nhất</th><th></th></tr></thead>
                  <tbody>{pageRows.map((r) => <tr key={r.mshs}>
                    <td><span className="cell-with-avatar">
                      <Avatar name={r.full_name} path={r.avatar_path} size={30} />
                      <span><strong>{r.full_name}</strong></span></span></td>
                    <td><code>{r.mshs}</code></td>
                    <td>{r.user_id
                      ? (r.must_change_password
                        ? <span className="chip off">Chờ đổi mật khẩu</span>
                        : <span className="chip on">Đã kích hoạt</span>)
                      : <span className="chip off">Chưa đăng ký</span>}</td>
                    <td>{Number(r.so_nhiem_vu) || '—'}</td>
                    <td><small>{r.hoat_dong_gan_nhat ? formatDate(r.hoat_dong_gan_nhat) : '—'}</small></td>
                    <td><button className="icon-button danger" title="Chuyển khỏi lớp"
                                onClick={() => setRemoving(r)}><UserMinus size={16} /></button></td>
                  </tr>)}</tbody>
                </table>{rows.length === 0 && <div className="empty-state">Không tìm thấy học sinh nào.</div>}</div>}

            {rows.length > PAGE && <div className="pager">
              <button className="button ghost" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>← Trước</button>
              <span>Trang <strong>{page}</strong> / {totalPages} · {rows.length} học sinh</span>
              <button className="button ghost" disabled={page === totalPages} onClick={() => setPage((n) => n + 1)}>Sau →</button>
            </div>}
          </>}
    </section>

    {batches.length > 0 && <section className="card">
      <div className="section-title"><div>
        <h2><History size={19} /> Lịch sử import</h2>
        <p>Dùng để đối chiếu khi nhập nhầm file.</p>
      </div></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Thời điểm</th><th>File</th><th>Tổng</th><th>Mới</th><th>Thêm vào lớp</th><th>Bỏ qua</th></tr></thead>
        <tbody>{batches.map((b) => <tr key={b.id}>
          <td><small>{new Date(b.created_at).toLocaleString('vi-VN')}</small></td>
          <td><small>{b.filename ?? '—'}</small></td>
          <td>{b.total_rows}</td><td>{b.inserted_students}</td>
          <td>{b.linked_students}</td>
          <td>{b.skipped_rows > 0 ? <strong className="help-flag">{b.skipped_rows}</strong> : '—'}</td>
        </tr>)}</tbody>
      </table></div>
    </section>}

    {importing && <StudentImport classId={classId} className={className} yearName={yearName}
      onClose={() => setImporting(false)} onDone={load} />}

    {removing && <div className="modal-backdrop" onMouseDown={() => setRemoving(null)}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">XÁC NHẬN</span>
          <h2>Chuyển {removing.full_name} khỏi lớp {className}?</h2></div>
          <button className="icon-button" onClick={() => setRemoving(null)}>✕</button></div>
        <p className="muted-text">
          Em sẽ không còn trong danh sách lớp này. <strong>Tài khoản, ảnh đại diện và toàn bộ lịch sử
          tự học của em vẫn được giữ nguyên</strong> — đây không phải là xóa học sinh khỏi hệ thống.
        </p>
        <div className="form-actions">
          <button className="button ghost" onClick={() => setRemoving(null)}>Hủy</button>
          <button className="button danger" onClick={() => remove(removing)}>Chuyển khỏi lớp</button>
        </div>
      </div>
    </div>}
  </>
}
