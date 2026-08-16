import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Check, GraduationCap, LayoutGrid, RefreshCw, ShieldCheck, UserCheck, UserX, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../utils/date'
import Avatar from '../components/Avatar'

const STATUS_LABEL = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt',
  rejected: 'Đã từ chối', suspended: 'Tạm khóa',
}

export default function AdminPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('overview')
  const [teachers, setTeachers] = useState([])
  const [years, setYears] = useState([])
  const [classes, setClasses] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState(null)

  const load = async () => {
    setLoading(true)
    const [{ data: t }, { data: y }, { data: cat }, { data: cls }] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,email,approval_status,created_at,approved_at,avatar_path')
        .eq('role', 'teacher').order('created_at', { ascending: false }),
      supabase.from('school_years').select('*').order('start_date', { ascending: false }),
      supabase.from('class_catalog').select('*').eq('is_active', true).order('class_code'),
      supabase.from('classes').select('id,name,school_year_id,catalog_id'),
    ])
    setTeachers(t ?? []); setYears(y ?? []); setCatalog(cat ?? []); setClasses(cls ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const currentYear = years.find((y) => y.is_active)
  // Lớp đã được dùng trong NĂM HIỆN TẠI — phần còn lại của danh mục là chưa thiết lập.
  const usedCodes = useMemo(
    () => new Set(classes.filter((c) => c.school_year_id === currentYear?.id).map((c) => c.name)),
    [classes, currentYear])
  const pending = teachers.filter((t) => t.approval_status === 'pending')

  const act = async (fn, okMsg) => {
    setMsg('')
    const { error } = await fn()
    if (error) return setMsg('Không thực hiện được: ' + error.message)
    setMsg('✓ ' + okMsg)
    setConfirm(null)
    load()
  }

  const setStatus = (t, status, reason = null) => act(
    () => supabase.rpc('set_teacher_status', { p_teacher: t.id, p_status: status, p_reason: reason }),
    `${STATUS_LABEL[status]}: ${t.full_name}`)

  const switchYear = (y) => act(
    () => supabase.rpc('set_current_school_year', { p_year: y.id }),
    `Năm học hiện tại là ${y.name}`)

  return <div className="page admin-page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow"><ShieldCheck size={13} /> QUẢN TRỊ HỆ THỐNG</span>
        <h1>Toàn trường</h1>
        <p>Xin chào {profile?.full_name} · Năm học hiện tại: <strong>{currentYear?.name ?? '—'}</strong></p>
      </div>
      <div className="button-row">
        <button className="button ghost" onClick={load}><RefreshCw size={17} /> Làm mới</button>
      </div>
    </section>

    {msg && <div className={msg.startsWith('✓') ? 'notice' : 'form-error'}>{msg}</div>}

    <section className="stats-grid">
      <Stat label="Giáo viên chờ duyệt" value={pending.length} alert={pending.length > 0}
            onClick={() => setTab('teachers')} />
      <Stat label="Giáo viên đã duyệt" value={teachers.filter((t) => t.approval_status === 'approved').length} />
      <Stat label="Lớp đã thiết lập" value={`${usedCodes.size} / ${catalog.length}`}
            onClick={() => setTab('classes')} />
      <Stat label="Năm học" value={years.length} onClick={() => setTab('years')} />
    </section>

    <div className="segmented view-switch">
      <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan</button>
      <button type="button" className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>
        Giáo viên{pending.length > 0 ? ` (${pending.length})` : ''}</button>
      <button type="button" className={tab === 'classes' ? 'active' : ''} onClick={() => setTab('classes')}>Lớp học</button>
      <button type="button" className={tab === 'years' ? 'active' : ''} onClick={() => setTab('years')}>Năm học</button>
    </div>

    {loading ? <div className="card empty-state">Đang tải…</div> : <>

      {tab === 'overview' && <section className="card">
        <div className="section-title"><div>
          <h2><LayoutGrid size={19} /> Việc cần xử lý</h2>
          <p>Những gì đang chặn việc triển khai toàn trường.</p>
        </div></div>
        <div className="insight-list">
          <div className="insight-row"><span>Giáo viên đang chờ duyệt</span>
            <strong className={pending.length ? 'help-flag' : ''}>{pending.length}</strong></div>
          <div className="insight-row"><span>Lớp chưa có giáo viên trong năm hiện tại</span>
            <strong className={catalog.length - usedCodes.size ? 'help-flag' : ''}>{catalog.length - usedCodes.size}</strong></div>
          <div className="insight-row"><span>Lớp đã thiết lập</span><strong>{usedCodes.size}</strong></div>
        </div>
      </section>}

      {tab === 'teachers' && <section className="card table-card">
        <div className="section-title"><div>
          <h2><UserCheck size={19} /> Giáo viên</h2>
          <p>Duyệt tài khoản trước khi thầy/cô truy cập được dữ liệu lớp.</p>
        </div></div>
        {teachers.length === 0 ? <div className="empty-state">Chưa có giáo viên nào đăng ký.</div>
          : <div className="table-wrap"><table>
              <thead><tr><th>Giáo viên</th><th>Email</th><th>Ngày đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{teachers.map((t) => <tr key={t.id}>
                <td><span className="cell-with-avatar"><Avatar name={t.full_name} path={t.avatar_path} size={30} />
                  <span><strong>{t.full_name}</strong></span></span></td>
                <td><small>{t.email ?? '—'}</small></td>
                <td><small>{formatDate(t.created_at)}</small></td>
                <td><span className={`chip ${t.approval_status === 'approved' ? 'on' : 'off'}`}>{STATUS_LABEL[t.approval_status]}</span></td>
                <td><span className="row-actions">
                  {t.approval_status !== 'approved' &&
                    <button className="button primary small" onClick={() => setConfirm({ t, status: 'approved' })}><Check size={15} /> Duyệt</button>}
                  {t.approval_status === 'pending' &&
                    <button className="button ghost danger small" onClick={() => setConfirm({ t, status: 'rejected' })}><X size={15} /> Từ chối</button>}
                  {t.approval_status === 'approved' &&
                    <button className="button ghost danger small" onClick={() => setConfirm({ t, status: 'suspended' })}><UserX size={15} /> Tạm khóa</button>}
                </span></td>
              </tr>)}</tbody>
            </table></div>}
      </section>}

      {tab === 'classes' && <section className="card">
        <div className="section-title"><div>
          <h2><GraduationCap size={19} /> Mức độ phủ lớp — {currentYear?.name}</h2>
          <p>{usedCodes.size} / {catalog.length} lớp đã được thiết lập trong năm học hiện tại.</p>
        </div></div>
        {[6, 7, 8].map((g) => {
          const list = catalog.filter((c) => c.grade_level === g)
          if (!list.length) return null
          return <div key={g} className="grade-block">
            <h3>Khối {g}</h3>
            <div className="missing-grid">{list.map((c) => <div key={c.id}
              className={`missing-chip ${usedCodes.has(c.class_code) ? 'ok' : ''}`}>
              <strong>{c.class_code}</strong>
              <small>{usedCodes.has(c.class_code) ? '✓ Đã thiết lập' : 'Chưa thiết lập'}</small>
            </div>)}</div>
          </div>
        })}
      </section>}

      {tab === 'years' && <section className="card">
        <div className="section-title"><div>
          <h2><CalendarRange size={19} /> Năm học</h2>
          <p>Chỉ một năm được đặt làm năm hiện tại. Dữ liệu năm cũ vẫn được lưu trữ đầy đủ.</p>
        </div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Năm học</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>{years.map((y) => <tr key={y.id}>
            <td><strong>{y.name}</strong></td>
            <td><small>{formatDate(y.start_date)}</small></td>
            <td><small>{formatDate(y.end_date)}</small></td>
            <td>{y.is_active ? <span className="chip on">● Hiện tại</span>
              : new Date(y.start_date) > new Date() ? <span className="chip off">Sắp tới</span>
              : <span className="chip off">Đã lưu trữ</span>}</td>
            <td>{!y.is_active && <button className="button ghost small"
              onClick={() => setConfirm({ year: y })}>Đặt làm năm hiện tại</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
    </>}

    {confirm?.t && <ConfirmModal
      title={confirm.status === 'approved' ? 'Duyệt tài khoản giáo viên?'
        : confirm.status === 'rejected' ? 'Từ chối tài khoản này?' : 'Tạm khóa tài khoản này?'}
      body={<>
        <p><strong>{confirm.t.full_name}</strong><br /><small className="muted-text">{confirm.t.email}</small></p>
        {confirm.status !== 'approved' && <p className="muted-text small">
          Thầy/cô này sẽ mất quyền truy cập dữ liệu lớp ngay lập tức. Dữ liệu đã xử lý trước đó vẫn được giữ nguyên.
        </p>}
      </>}
      cta={confirm.status === 'approved' ? 'Duyệt' : confirm.status === 'rejected' ? 'Từ chối' : 'Tạm khóa'}
      danger={confirm.status !== 'approved'}
      onClose={() => setConfirm(null)}
      onOk={(reason) => setStatus(confirm.t, confirm.status, reason)}
      askReason={confirm.status !== 'approved'} />}

    {confirm?.year && <ConfirmModal
      title="Chuyển năm học hiện tại?"
      body={<>
        <p>Từ <strong>{currentYear?.name}</strong> sang <strong>{confirm.year.name}</strong>.</p>
        <p className="muted-text small">
          Sau khi chuyển, dashboard và hoạt động mới của giáo viên/học sinh sẽ dùng năm học {confirm.year.name}.
          Dữ liệu năm cũ vẫn được lưu trữ đầy đủ, không bị xóa.
        </p>
      </>}
      cta="Chuyển năm học" danger
      onClose={() => setConfirm(null)} onOk={() => switchYear(confirm.year)} />}
  </div>
}

function Stat({ label, value, alert, onClick }) {
  const C = onClick ? 'button' : 'div'
  return <C className={`stat-card ${alert ? 'alert' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
    <span>{label}</span><strong>{value}</strong>
  </C>
}

function ConfirmModal({ title, body, cta, danger, askReason, onClose, onOk }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">XÁC NHẬN</span><h2>{title}</h2></div>
        <button className="icon-button" onClick={onClose}>✕</button></div>
      {body}
      {askReason && <>
        <label>Ghi chú gửi cho giáo viên (tùy chọn)</label>
        <input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do…" />
      </>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Hủy</button>
        <button className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy}
          onClick={() => { setBusy(true); onOk(reason.trim() || null) }}>{busy ? 'Đang xử lý…' : cta}</button>
      </div>
    </div>
  </div>
}
