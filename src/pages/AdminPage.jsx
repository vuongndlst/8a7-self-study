import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, CalendarRange, Check, ClipboardCopy, FileSpreadsheet, GraduationCap, KeyRound,
  LayoutGrid, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, UserCheck, UserPlus, UserX, X,
} from 'lucide-react'
import { supabase, callFunction } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, todayISO } from '../utils/date'
import Avatar from '../components/Avatar'
import TeacherImport from '../components/TeacherImport'
import SchoolAnalytics from '../components/SchoolAnalytics'

const STATUS = {
  pending:   { label: 'Chờ duyệt',   tone: 'warn' },
  approved:  { label: 'Đang hoạt động', tone: 'ok' },
  rejected:  { label: 'Đã từ chối',  tone: 'off' },
  suspended: { label: 'Tạm khóa',    tone: 'err' },
}

// "6A10" phải đứng sau "6A2", không phải sau "6A1". So sánh số ở đuôi thay vì
// so chuỗi — nếu không danh sách lớp sẽ ra 6A1, 6A10, 6A2…
const byClassCode = (a, b) => {
  const pa = a.match(/^(\d+)A(\d+)$/), pb = b.match(/^(\d+)A(\d+)$/)
  if (pa && pb) return (+pa[1] - +pb[1]) || (+pa[2] - +pb[2])
  return a.localeCompare(b, 'vi')
}

export default function AdminPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('overview')
  const [teachers, setTeachers] = useState([])
  const [years, setYears] = useState([])
  const [classes, setClasses] = useState([])
  const [catalog, setCatalog] = useState([])
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [teacherForm, setTeacherForm] = useState(null)
  const [credential, setCredential] = useState(null)
  const [importing, setImporting] = useState(false)
  const [newYear, setNewYear] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    const [{ data: t }, { data: y }, { data: cat }, { data: cls }, { data: asg }] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,email,role,approval_status,created_at,avatar_path,must_change_password')
        .in('role', ['teacher', 'admin']).order('full_name'),
      supabase.from('school_years').select('*').order('start_date', { ascending: false }),
      supabase.from('class_catalog').select('*').eq('is_active', true),
      supabase.from('classes').select('id,name,school_year_id,catalog_id'),
      supabase.from('class_teachers').select('class_id,teacher_id,role,status').eq('status', 'active'),
    ])
    setTeachers(t ?? []); setYears(y ?? []); setCatalog(cat ?? []); setClasses(cls ?? [])
    setAssignments(asg ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const currentYear = years.find((y) => y.is_active)
  const yearClasses = useMemo(
    () => classes.filter((c) => c.school_year_id === currentYear?.id), [classes, currentYear])
  const classById = useMemo(() => Object.fromEntries(yearClasses.map((c) => [c.id, c.name])), [yearClasses])

  // Ai đang phụ trách lớp nào, và lớp nào đã có người.
  const classOfTeacher = useMemo(() => {
    const m = {}
    for (const a of assignments) if (classById[a.class_id]) (m[a.teacher_id] ||= []).push(classById[a.class_id])
    for (const k in m) m[k].sort(byClassCode)
    return m
  }, [assignments, classById])

  const teacherOfClass = useMemo(() => {
    const byId = Object.fromEntries(teachers.map((t) => [t.id, t.full_name]))
    const m = {}
    for (const a of assignments) if (classById[a.class_id] && a.role === 'primary') m[classById[a.class_id]] = byId[a.teacher_id]
    return m
  }, [assignments, classById, teachers])

  const takenCodes = useMemo(() => new Set(Object.keys(teacherOfClass)), [teacherOfClass])
  const sortedCatalog = useMemo(() => [...catalog].sort((a, b) => byClassCode(a.class_code, b.class_code)), [catalog])
  const pending = teachers.filter((t) => t.approval_status === 'pending')
  const active = teachers.filter((t) => t.approval_status === 'approved')
  const suspended = teachers.filter((t) => t.approval_status === 'suspended')

  const shownTeachers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teachers.filter((t) => {
      if (filter !== 'all' && t.approval_status !== filter) return false
      if (q && !`${t.full_name} ${t.email ?? ''} ${(classOfTeacher[t.id] ?? []).join(' ')}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [teachers, filter, search, classOfTeacher])

  const run = async (fn, okMsg) => {
    setMsg('')
    const { error } = await fn()
    setConfirm(null)
    if (error) return setMsg('Không thực hiện được: ' + error.message)
    setMsg('✓ ' + okMsg)
    load()
  }

  return <div className="page admin-page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow"><ShieldCheck size={13} /> QUẢN TRỊ HỆ THỐNG</span>
        <h1>Toàn trường</h1>
        <p>{profile?.full_name} · Năm học hiện tại <strong>{currentYear?.name ?? '—'}</strong></p>
      </div>
      <div className="button-row">
        <button className="button ghost" onClick={load}><RefreshCw size={17} /> Làm mới</button>
      </div>
    </section>

    {msg && <div className={msg.startsWith('✓') ? 'notice' : 'form-error'}>{msg}</div>}

    <section className="stats-grid">
      <Stat label="Chờ duyệt" value={pending.length} alert={pending.length > 0} onClick={() => { setTab('teachers'); setFilter('pending') }} />
      <Stat label="Giáo viên hoạt động" value={active.length} onClick={() => { setTab('teachers'); setFilter('approved') }} />
      <Stat label="Tạm khóa" value={suspended.length} alert={suspended.length > 0} onClick={() => { setTab('teachers'); setFilter('suspended') }} />
      <Stat label="Lớp đã thiết lập" value={`${takenCodes.size}/${catalog.length}`} onClick={() => setTab('classes')} />
    </section>

    <div className="segmented view-switch">
      <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Tổng quan</button>
      <button type="button" className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>
        Giáo viên{pending.length ? ` (${pending.length})` : ''}</button>
      <button type="button" className={tab === 'classes' ? 'active' : ''} onClick={() => setTab('classes')}>Lớp học</button>
      <button type="button" className={tab === 'years' ? 'active' : ''} onClick={() => setTab('years')}>Năm học</button>
      <button type="button" className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Thống kê</button>
    </div>

    {loading ? <div className="card empty-state">Đang tải…</div> : <>

      {tab === 'overview' && <>
        <section className="card">
          <div className="section-title"><div>
            <h2><LayoutGrid size={19} /> Việc cần xử lý</h2>
            <p>Những gì đang chặn việc triển khai toàn trường.</p>
          </div></div>
          <div className="todo-grid">
            <TodoRow n={pending.length} label="Giáo viên đang chờ duyệt"
                     cta="Xem danh sách" onClick={() => { setTab('teachers'); setFilter('pending') }} />
            <TodoRow n={catalog.length - takenCodes.size} label="Lớp chưa có giáo viên phụ trách"
                     cta="Xem độ phủ" onClick={() => setTab('classes')} />
            <TodoRow n={suspended.length} label="Tài khoản đang tạm khóa"
                     cta="Xem" onClick={() => { setTab('teachers'); setFilter('suspended') }} />
          </div>
        </section>

        <section className="card">
          <div className="section-title"><div>
            <h2><GraduationCap size={19} /> Tiến độ thiết lập — {currentYear?.name}</h2>
            <p>{takenCodes.size} / {catalog.length} lớp đã có giáo viên phụ trách.</p>
          </div></div>
          <div className="coverage-bar">
            <span style={{ width: `${catalog.length ? Math.round(takenCodes.size / catalog.length * 100) : 0}%` }} />
          </div>
          <div className="grade-summary">
            {[6, 7, 8].map((g) => {
              const list = sortedCatalog.filter((c) => c.grade_level === g)
              const done = list.filter((c) => takenCodes.has(c.class_code)).length
              return <div key={g} className="grade-stat">
                <span>Khối {g}</span><strong>{done}/{list.length}</strong>
              </div>
            })}
          </div>
        </section>
      </>}

      {tab === 'teachers' && <section className="card table-card">
        <div className="section-title">
          <div>
            <h2><UserCheck size={19} /> Giáo viên</h2>
            <p>Tạo tài khoản kèm lớp trong một bước. Giáo viên đã có tài khoản thì chỉ cần gán thêm lớp — không tạo lại.</p>
          </div>
          <div className="button-row">
            <button className="button ghost" onClick={() => setImporting(true)}><FileSpreadsheet size={17} /> Import từ Excel</button>
            <button className="button primary" onClick={() => setTeacherForm({ mode: 'create' })}><UserPlus size={17} /> Thêm giáo viên</button>
          </div>
        </div>

        <div className="filters">
          <div className="search-box"><Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, email, lớp…" /></div>
          <div className="quick-views">
            {[['all', 'Tất cả', teachers.length], ['pending', 'Chờ duyệt', pending.length],
              ['approved', 'Hoạt động', active.length], ['suspended', 'Tạm khóa', suspended.length]]
              .map(([k, label, n]) => <button key={k} className={`chip-btn ${filter === k ? 'on' : ''}`}
                onClick={() => setFilter(k)}>{label} <b>{n}</b></button>)}
          </div>
        </div>

        {shownTeachers.length === 0 ? <div className="empty-state">Không có giáo viên nào phù hợp.</div>
          : <div className="table-wrap"><table>
              <thead><tr><th>Giáo viên</th><th>Email</th><th>Lớp phụ trách</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>{shownTeachers.map((t) => {
                const st = STATUS[t.approval_status] ?? { label: t.approval_status, tone: 'off' }
                const isAdmin = t.role === 'admin'
                return <tr key={t.id} className={t.approval_status === 'suspended' ? 'row-dim' : ''}>
                  <td><span className="cell-with-avatar"><Avatar name={t.full_name} path={t.avatar_path} size={32} />
                    <span><strong>{t.full_name}</strong>
                      <small>{isAdmin ? 'Quản trị viên · ' : ''}{formatDate(t.created_at)}
                        {t.must_change_password ? ' · chờ đổi mật khẩu' : ''}</small></span></span></td>
                  <td><small>{t.email ?? '—'}</small></td>
                  <td>{classOfTeacher[t.id]?.length
                    ? classOfTeacher[t.id].map((c) => <span key={c} className="span-chip">{c}</span>)
                    : <span className="muted-text small">Chưa có lớp</span>}</td>
                  <td><span className={`state-pill ${st.tone}`}>{st.label}</span></td>
                  <td><span className="row-actions">
                    <button className="button ghost small" onClick={() => setTeacherForm({ mode: 'assign', teacher: t })}>
                      <GraduationCap size={15} /> Gán lớp</button>
                    {/* Không cho khóa tài khoản quản trị viên: khóa xong sẽ không
                        còn ai mở lại được. */}
                    {!isAdmin && t.approval_status === 'approved' &&
                      <button className="button ghost danger small" onClick={() => setConfirm({ t, status: 'suspended' })}>
                        <UserX size={15} /> Tạm khóa</button>}
                    {!isAdmin && t.approval_status === 'pending' && <>
                      <button className="button primary small" onClick={() => setConfirm({ t, status: 'approved' })}><Check size={15} /> Duyệt</button>
                      <button className="button ghost danger small" onClick={() => setConfirm({ t, status: 'rejected' })}><X size={15} /> Từ chối</button>
                    </>}
                    {!isAdmin && (t.approval_status === 'suspended' || t.approval_status === 'rejected') &&
                      <button className="button primary small" onClick={() => setConfirm({ t, status: 'approved' })}>
                        <RotateCcw size={15} /> Khôi phục</button>}
                    <button className="icon-button" title="Cấp lại mật khẩu"
                            onClick={() => setConfirm({ t, reset: true })}><KeyRound size={16} /></button>
                  </span></td>
                </tr>
              })}</tbody>
            </table></div>}
      </section>}

      {tab === 'classes' && <section className="card">
        <div className="section-title"><div>
          <h2><GraduationCap size={19} /> Độ phủ lớp — {currentYear?.name}</h2>
          <p>{takenCodes.size} / {catalog.length} lớp đã có giáo viên. Bấm vào lớp trống để gán giáo viên.</p>
        </div></div>
        {[6, 7, 8].map((g) => {
          const list = sortedCatalog.filter((c) => c.grade_level === g)
          if (!list.length) return null
          const done = list.filter((c) => takenCodes.has(c.class_code)).length
          return <div key={g} className="grade-block">
            <h3>Khối {g} <small className="muted-text">— {done}/{list.length} lớp</small></h3>
            <div className="class-grid">{list.map((c) => {
              const who = teacherOfClass[c.class_code]
              return <button key={c.id} type="button" className={`class-chip ${who ? 'ok' : ''}`}
                onClick={() => setTeacherForm({ mode: 'pick-teacher', catalog: c })}>
                <strong>{c.class_code}</strong>
                <small>{who ?? 'Chưa thiết lập'}</small>
              </button>
            })}</div>
          </div>
        })}
      </section>}

      {tab === 'years' && <section className="card table-card">
        <div className="section-title">
          <div>
            <h2><CalendarRange size={19} /> Năm học</h2>
            <p>Chỉ một năm được đặt làm năm hiện tại. Dữ liệu năm cũ vẫn được lưu trữ đầy đủ, không bị xóa.</p>
          </div>
          <button className="button primary" onClick={() => setNewYear(true)}><Plus size={17} /> Tạo năm học</button>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Năm học</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>{years.map((y) => <tr key={y.id}>
            <td><strong>{y.name}</strong></td>
            <td><small>{formatDate(y.start_date)}</small></td>
            <td><small>{formatDate(y.end_date)}</small></td>
            <td>{y.is_active ? <span className="state-pill ok">● Hiện tại</span>
              : y.start_date > todayISO() ? <span className="state-pill warn">Sắp tới</span>
              : <span className="state-pill off">Đã lưu trữ</span>}</td>
            <td>{!y.is_active && <button className="button ghost small" onClick={() => setConfirm({ year: y })}>
              Đặt làm năm hiện tại</button>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {tab === 'stats' && <SchoolAnalytics
        yearName={currentYear?.name} yearStart={currentYear?.start_date} yearEnd={currentYear?.end_date}
        classes={yearClasses.slice().sort((a, b) => byClassCode(a.name, b.name))} />}
    </>}

    {importing && <TeacherImport catalog={sortedCatalog} takenCodes={takenCodes} yearName={currentYear?.name}
      onClose={() => setImporting(false)} onDone={load} />}

    {newYear && <YearModal onClose={() => setNewYear(false)}
      onDone={(name) => { setNewYear(false); setMsg(`✓ Đã tạo năm học ${name}.`); load() }} />}

    {teacherForm && <TeacherFormModal
      mode={teacherForm.mode} teacher={teacherForm.teacher} lockCatalog={teacherForm.catalog}
      teachers={active} catalog={sortedCatalog} takenCodes={takenCodes} yearName={currentYear?.name}
      onClose={() => setTeacherForm(null)}
      onDone={(res) => {
        setTeacherForm(null)
        if (res.matKhauTam) setCredential(res)
        else setMsg('✓ ' + (res.lop ? `Đã gán lớp ${res.lop} cho ${res.hoTen}.` : `Đã cập nhật ${res.hoTen}.`))
        if (res.canhBao) setMsg('⚠ ' + res.canhBao)
        load()
      }} />}

    {credential && <CredentialModal data={credential} onClose={() => { setCredential(null); load() }} />}

    {confirm?.reset && <ConfirmModal
      title="Cấp lại mật khẩu?"
      body={<p><strong>{confirm.t.full_name}</strong><br /><small className="muted-text">{confirm.t.email}</small><br />
        <span className="muted-text small">Mật khẩu cũ sẽ ngừng hoạt động ngay. Thầy/cô phải đặt mật khẩu mới ở lần đăng nhập kế tiếp.</span></p>}
      cta="Cấp lại mật khẩu" onClose={() => setConfirm(null)}
      onOk={async () => {
        setConfirm(null)
        const { ok, data } = await callFunction('admin-manage-teacher', { action: 'reset', teacherId: confirm.t.id })
        if (!ok) return setMsg('Không cấp lại được: ' + (data?.error ?? ''))
        setCredential(data)
      }} />}

    {confirm?.t && !confirm.reset && <ConfirmModal
      title={{ approved: 'Kích hoạt tài khoản này?', rejected: 'Từ chối tài khoản này?', suspended: 'Tạm khóa tài khoản này?' }[confirm.status]}
      body={<>
        <p><strong>{confirm.t.full_name}</strong><br /><small className="muted-text">{confirm.t.email}</small></p>
        {confirm.status !== 'approved' && <p className="muted-text small">
          Thầy/cô sẽ mất quyền truy cập dữ liệu lớp <strong>ngay lập tức</strong>, và phân công lớp cũng ngừng hiệu lực.
          Dữ liệu đã xử lý trước đó vẫn được giữ nguyên.
        </p>}
      </>}
      cta={{ approved: 'Kích hoạt', rejected: 'Từ chối', suspended: 'Tạm khóa' }[confirm.status]}
      danger={confirm.status !== 'approved'} askReason={confirm.status !== 'approved'}
      onClose={() => setConfirm(null)}
      onOk={(reason) => run(() => supabase.rpc('set_teacher_status',
        { p_teacher: confirm.t.id, p_status: confirm.status, p_reason: reason }),
        `${STATUS[confirm.status].label}: ${confirm.t.full_name}`)} />}

    {confirm?.year && <ConfirmModal
      title="Chuyển năm học hiện tại?"
      body={<>
        <p>Từ <strong>{currentYear?.name}</strong> sang <strong>{confirm.year.name}</strong>.</p>
        <p className="muted-text small">
          Sau khi chuyển, dashboard và hoạt động mới của giáo viên/học sinh sẽ dùng năm học {confirm.year.name}.
          Dữ liệu năm cũ vẫn được lưu trữ đầy đủ, không bị xóa.
        </p>
      </>}
      cta="Chuyển năm học" danger onClose={() => setConfirm(null)}
      onOk={() => run(() => supabase.rpc('set_current_school_year', { p_year: confirm.year.id }),
        `Năm học hiện tại là ${confirm.year.name}`)} />}
  </div>
}

function Stat({ label, value, alert, onClick }) {
  const C = onClick ? 'button' : 'div'
  return <C className={`stat-card ${alert ? 'alert' : ''} ${onClick ? 'clickable' : ''}`} onClick={onClick}>
    <span>{label}</span><strong>{value}</strong>
  </C>
}

function TodoRow({ n, label, cta, onClick }) {
  return <div className={`todo-row ${n > 0 ? 'on' : ''}`}>
    <strong>{n}</strong>
    <span>{label}</span>
    {n > 0 && <button className="link-button" onClick={onClick}>{cta} →</button>}
  </div>
}

function YearModal({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [makeCurrent, setMakeCurrent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async () => {
    setErr('')
    if (!name.trim()) return setErr('Hãy nhập tên năm học.')
    if (!start || !end) return setErr('Hãy chọn ngày bắt đầu và kết thúc.')
    if (end <= start) return setErr('Ngày kết thúc phải sau ngày bắt đầu.')
    setBusy(true)
    const { error } = await supabase.rpc('create_school_year',
      { p_name: name.trim(), p_start: start, p_end: end, p_make_current: makeCurrent })
    setBusy(false)
    if (error) return setErr(error.message)
    onDone(name.trim())
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">NĂM HỌC MỚI</span><h2>Tạo năm học</h2></div>
        <button className="icon-button" onClick={onClose}>✕</button></div>
      <label>Tên năm học *</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="2027-2028" />
      <div className="form-grid two">
        <div><label>Ngày bắt đầu *</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div><label>Ngày kết thúc *</label><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <small className="muted-text">Ngày bắt đầu/kết thúc quyết định phạm vi của mọi biểu đồ trong năm đó,
        nên hệ thống không tự đoán từ tên năm.</small>
      <div className="toggle-row">
        <label className="switch"><input type="checkbox" checked={makeCurrent}
          onChange={(e) => setMakeCurrent(e.target.checked)} /><span /></label>
        <div><strong>Đặt làm năm học hiện tại ngay</strong>
          <small>Chỉ bật khi đã sẵn sàng chuyển. Có thể đặt sau ở bảng năm học.</small></div>
      </div>
      {err && <div className="form-error">{err}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Hủy</button>
        <button className="button primary" onClick={save} disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo năm học'}</button>
      </div>
    </div>
  </div>
}

// Ba việc chung một hộp thoại vì với người dùng chúng là cùng một thao tác:
// "cho thầy/cô này phụ trách lớp kia".
//   create       — tài khoản mới, chọn lớp luôn
//   assign       — giáo viên đã có, chọn lớp
//   pick-teacher — bấm từ ô lớp trống, chọn giáo viên
function TeacherFormModal({ mode, teacher, lockCatalog, teachers, catalog, takenCodes, yearName, onClose, onDone }) {
  const create = mode === 'create'
  const pickTeacher = mode === 'pick-teacher'
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [catalogId, setCatalogId] = useState(lockCatalog?.id ?? '')
  const [teacherId, setTeacherId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const chosen = catalog.find((c) => c.id === catalogId)
  const grades = [...new Set(catalog.map((c) => c.grade_level))].sort()

  const submit = async () => {
    setErr('')
    if (create && (!email.trim() || !fullName.trim())) return setErr('Hãy nhập email và họ tên.')
    if (pickTeacher && !teacherId) return setErr('Hãy chọn giáo viên.')
    if (!create && !catalogId) return setErr('Hãy chọn lớp cần gán.')
    setBusy(true)
    const { ok, data } = await callFunction('admin-manage-teacher', create
      ? { action: 'create', email: email.trim(), fullName: fullName.trim(), catalogId: catalogId || null }
      : { action: 'assign', teacherId: pickTeacher ? teacherId : teacher.id, catalogId })
    setBusy(false)
    if (!ok) return setErr(data?.error || 'Không thực hiện được.')
    onDone(data)
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div>
        <span className="eyebrow">{create ? 'THÊM GIÁO VIÊN' : pickTeacher ? 'PHÂN CÔNG LỚP' : 'GÁN LỚP'}</span>
        <h2>{create ? 'Tài khoản giáo viên mới' : pickTeacher ? `Lớp ${lockCatalog.class_code}` : teacher.full_name}</h2>
      </div><button className="icon-button" onClick={onClose}>✕</button></div>

      {create && <>
        <label>Email giáo viên *</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
               placeholder="ten.giaovien@lsts.edu.vn" autoComplete="off" />
        <small className="muted-text">Nếu email này đã có tài khoản, hệ thống <strong>dùng lại</strong> tài khoản đó
          và chỉ gán thêm lớp — mật khẩu hiện tại của thầy/cô không bị đổi.</small>
        <label>Họ và tên *</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
      </>}

      {pickTeacher && <>
        <label>Giáo viên phụ trách *</label>
        <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          <option value="">— Chọn giáo viên —</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name} · {t.email}</option>)}
        </select>
        {teachers.length === 0 && <small className="muted-text">Chưa có giáo viên nào đang hoạt động.</small>}
      </>}

      <label>Năm học</label>
      <input value={yearName ?? '—'} readOnly disabled />
      <small className="muted-text">Luôn là năm học hiện tại — không cần chọn, tránh gán nhầm năm.</small>

      {!pickTeacher && <>
        <label>Lớp phụ trách {create ? '(tùy chọn)' : '*'}</label>
        <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
          <option value="">— Chưa gán lớp —</option>
          {grades.map((g) => <optgroup key={g} label={`Khối ${g}`}>
            {catalog.filter((c) => c.grade_level === g).map((c) => <option key={c.id} value={c.id}
              disabled={takenCodes.has(c.class_code)}>
              {c.class_code}{takenCodes.has(c.class_code) ? ' — đã có giáo viên' : ''}
            </option>)}
          </optgroup>)}
        </select>
        {chosen && <p className="muted-text small">Sẽ phụ trách <strong>{chosen.class_code}</strong> · Năm học {yearName}</p>}
      </>}

      {err && <div className="form-error">{err}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Hủy</button>
        <button className="button primary" onClick={submit} disabled={busy}>
          {busy ? 'Đang xử lý…' : create ? 'Tạo tài khoản' : 'Gán lớp'}
        </button>
      </div>
    </div>
  </div>
}

// Mật khẩu tạm hiện đúng MỘT lần. Server chỉ lưu bản băm nên không xem lại được.
function CredentialModal({ data, onClose }) {
  const [copied, setCopied] = useState(false)
  const text = `Tài khoản: ${data.hoTen}\nMật khẩu tạm: ${data.matKhauTam}`
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">MẬT KHẨU TẠM</span>
        <h2>{data.hoTen}</h2></div><button className="icon-button" onClick={onClose}>✕</button></div>
      {data.lop && <p>Phụ trách lớp <strong>{data.lop}</strong>.</p>}
      {data.canhBao && <div className="notice warning"><span>{data.canhBao}</span></div>}
      <div className="detail-box"><strong>Mật khẩu tạm</strong><p className="temp-password">{data.matKhauTam}</p></div>
      <div className="notice warning"><span>
        Mật khẩu này <strong>chỉ hiện một lần</strong>. Hãy chép và gửi cho thầy/cô ngay.
        Lần đăng nhập đầu tiên, hệ thống sẽ bắt thầy/cô tự đặt mật khẩu riêng.
      </span></div>
      <div className="form-actions">
        <button className="button ghost" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true) } catch { setCopied(false) }
        }}><ClipboardCopy size={16} /> {copied ? 'Đã chép' : 'Chép thông tin'}</button>
        <button className="button primary" onClick={onClose}>Đã lưu, đóng lại</button>
      </div>
    </div>
  </div>
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
