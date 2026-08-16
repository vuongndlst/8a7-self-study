import { useEffect, useMemo, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, todayISO } from '../utils/date'

// Số liệu toàn trường cho quản trị viên.
// Mặc định là TRỌN NĂM HỌC hiện tại chứ không phải "30 ngày gần nhất": gộp cả
// đời rồi gọi là "toàn trường hiện tại" sẽ sai, mà lấy 30 ngày thì đầu năm học
// biểu đồ trống trơn.
export default function SchoolAnalytics({ yearName, yearStart, yearEnd, classes }) {
  const [grade, setGrade] = useState('')
  const [classId, setClassId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!yearStart) return
    setFrom(yearStart)
    setTo(yearEnd < todayISO() ? yearEnd : todayISO())
  }, [yearStart, yearEnd])

  useEffect(() => {
    if (!from || !to) return
    let alive = true
    setLoading(true); setErr('')
    supabase.rpc('school_analytics', {
      p_from: from, p_to: to,
      p_grade: grade ? Number(grade) : null,
      p_class: classId || null,
    }).then(({ data: d, error }) => {
      if (!alive) return
      setLoading(false)
      if (error) setErr(error.message)
      else setData(d)
    })
    return () => { alive = false }
  }, [from, to, grade, classId])

  const k = data?.kpi ?? {}
  const rows = data?.theo_lop ?? []
  const grades = useMemo(() => [...new Set(classes.map((c) => c.name.match(/^(\d+)/)?.[1]))].filter(Boolean).sort(), [classes])

  const pct = (v) => (v == null ? '—' : `${v}%`)

  return <>
    <section className="card">
      <div className="section-title"><div>
        <h2><BarChart3 size={19} /> Thống kê toàn trường — {yearName}</h2>
        <p>Chỉ tính dữ liệu trong năm học hiện tại. Nhiệm vụ chưa tới ngày không được tính vào tỷ lệ hoàn thành.</p>
      </div></div>

      <div className="filters">
        <select value={grade} onChange={(e) => { setGrade(e.target.value); setClassId('') }}>
          <option value="">Toàn trường</option>
          {grades.map((g) => <option key={g} value={g}>Khối {g}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Tất cả lớp</option>
          {classes.filter((c) => !grade || c.name.startsWith(grade)).map((c) =>
            <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={from} min={yearStart} max={yearEnd} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} min={yearStart} max={yearEnd} onChange={(e) => setTo(e.target.value)} />
        <button className="button ghost" onClick={() => { setFrom(yearStart); setTo(yearEnd < todayISO() ? yearEnd : todayISO()) }}>
          Cả năm học
        </button>
      </div>
      <p className="muted-text small">
        Khoảng ngày bị kẹp trong năm học {yearName} ({formatDate(yearStart)} – {formatDate(yearEnd)}),
        nên số liệu không thể lẫn sang năm khác.
      </p>

      {err && <div className="form-error">{err}</div>}
    </section>

    {loading ? <section className="card empty-state">Đang tính…</section> : <>
      <section className="stats-grid">
        <Stat label="Lớp trong phạm vi" value={k.so_lop ?? 0} />
        <Stat label="Học sinh" value={k.so_hoc_sinh ?? 0} />
        <Stat label="Buổi tự học" value={k.so_buoi ?? 0} />
        <Stat label="Nhiệm vụ" value={k.so_nhiem_vu ?? 0} />
        <Stat label="Hoàn thành" value={pct(k.ty_le_hoan_thanh)} />
        <Stat label="Trễ hạn cập nhật" value={pct(k.ty_le_tre_han)} alert={(k.ty_le_tre_han ?? 0) > 20} />
      </section>

      <section className="stats-grid secondary-grid">
        <Stat label="Đăng ký đúng hạn" value={pct(k.ty_le_dung_han)} />
        <Stat label="Có dùng thiết bị" value={k.dung_thiet_bi ?? 0} />
        <Stat label="Điểm trung bình" value={k.diem_tb != null ? `${k.diem_tb}/5` : '—'} />
      </section>

      <section className="card table-card">
        <div className="section-title"><div>
          <h2>Mức độ sử dụng theo lớp</h2>
          <p>Dùng để biết lớp nào cần hỗ trợ triển khai — không phải bảng xếp hạng lớp.</p>
        </div></div>
        {rows.length === 0 ? <div className="empty-state">Chưa có dữ liệu trong phạm vi này.</div>
          : <div className="table-wrap"><table>
              <thead><tr><th>Lớp</th><th>Giáo viên</th><th>HS</th><th>Nhiệm vụ</th>
                <th>Hoàn thành</th><th>Trễ hạn</th><th>Hoạt động gần nhất</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.class_id}>
                <td><strong>{r.lop}</strong></td>
                <td><small>{r.giao_vien ?? '— chưa có —'}</small></td>
                <td>{r.so_hoc_sinh}</td>
                <td>{r.so_nhiem_vu}</td>
                <td>{pct(r.ty_le_hoan_thanh)}</td>
                <td className={r.ty_le_tre_han > 20 ? 'help-flag' : ''}>{pct(r.ty_le_tre_han)}</td>
                <td><small>{r.hoat_dong_gan_nhat ? formatDate(r.hoat_dong_gan_nhat) : '— chưa dùng —'}</small></td>
              </tr>)}</tbody>
            </table></div>}
      </section>
    </>}
  </>
}

function Stat({ label, value, alert }) {
  return <div className={`stat-card ${alert ? 'alert' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}
