import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, Download, GraduationCap, Rocket, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const TEMPLATE = `${import.meta.env.BASE_URL}templates/Mau_import_danh_sach_hoc_sinh.xlsx`

// Giáo viên vừa được duyệt nhưng chưa có lớp: KHÔNG hiện dashboard đầy biểu đồ
// rỗng, mà chỉ ra đúng ba việc cần làm.
export default function TeacherOnboarding({ onDone }) {
  const { profile, refreshProfile } = useAuth()
  const [catalog, setCatalog] = useState([])
  const [taken, setTaken] = useState(new Set())
  const [grade, setGrade] = useState('')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(null)
  // Thầy/cô chưa có lớp thì context chưa có tên năm — tự đọc ở đây.
  const [yearName, setYearName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    // Danh mục lớp ai cũng đọc được (chỉ là tên lớp). Lớp nào đã có người thì
    // biết qua classes của năm hiện tại — hiển thị mờ để thầy cô khỏi bấm nhầm.
    Promise.all([
      supabase.from('class_catalog').select('id,class_code,grade_level').eq('is_active', true),
      supabase.from('classes').select('name,school_year_id,school_years!inner(is_active)').eq('school_years.is_active', true),
      supabase.from('school_years').select('name').eq('is_active', true).maybeSingle(),
    ]).then(([{ data: cat }, { data: used }, { data: y }]) => {
      setCatalog(cat ?? [])
      setTaken(new Set((used ?? []).map((c) => c.name)))
      setYearName(y?.name ?? '')
    })
  }, [])

  const claim = async () => {
    if (!picked) return
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('claim_class', { p_catalog: picked.id })
    setBusy(false)
    if (error) {
      // Hàm CSDL báo về dạng CLASS_TAKEN:<tên giáo viên> để giao diện nói cho dễ hiểu.
      const m = /CLASS_TAKEN:(.*)$/.exec(error.message)
      return setErr(m
        ? `Lớp ${picked.class_code} đã có giáo viên quản lý trên hệ thống (${m[1].trim()}). `
          + 'Hãy liên hệ quản trị viên nếu thầy/cô mới nhận lớp này.'
        : error.message)
    }
    await refreshProfile()
    onDone?.()
  }

  const grades = [...new Set(catalog.map((c) => c.grade_level))].sort()
  const shown = catalog
    .filter((c) => (!grade || c.grade_level === Number(grade))
                && (!search.trim() || c.class_code.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => (a.grade_level - b.grade_level) || (+a.class_code.split('A')[1] - +b.class_code.split('A')[1]))

  return <div className="page narrow-page">
    <section className="card onboard-card">
      <div className="onboard-head">
        <Rocket size={34} />
        <div>
          <span className="eyebrow">BẮT ĐẦU SỬ DỤNG SELF-STUDY</span>
          <h1>Chào thầy/cô {profile?.full_name}</h1>
          <p>Tài khoản đã sẵn sàng. Còn ba bước nữa là lớp có thể bắt đầu đăng ký giờ tự học.</p>
        </div>
      </div>

      <ol className="onboard-steps">
        <li className="done"><CheckCircle2 size={18} /><span>Tài khoản đã được duyệt</span></li>
        <li className={picked ? 'active' : 'active'}><Circle size={18} /><span>Chọn lớp chủ nhiệm</span></li>
        <li><Circle size={18} /><span>Import danh sách học sinh</span></li>
      </ol>
    </section>

    <section className="card">
      <div className="section-title"><div>
        <h2><GraduationCap size={19} /> Chọn lớp chủ nhiệm — năm học {yearName}</h2>
        <p>Chọn đúng lớp thầy/cô đang chủ nhiệm. Lớp đã có người quản lý sẽ bị làm mờ.</p>
      </div></div>

      <div className="filters">
        <div className="search-box"><Search size={17} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Gõ tên lớp, ví dụ 7A3…" /></div>
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="">Tất cả khối</option>
          {grades.map((g) => <option key={g} value={g}>Khối {g}</option>)}
        </select>
      </div>

      <div className="class-grid pick">
        {shown.map((c) => {
          const off = taken.has(c.class_code)
          return <button key={c.id} type="button" disabled={off}
            className={`class-chip ${picked?.id === c.id ? 'picked' : ''} ${off ? 'off' : ''}`}
            onClick={() => setPicked(c)}>
            <strong>{c.class_code}</strong>
            <small>{off ? 'Đã có giáo viên' : 'Còn trống'}</small>
          </button>
        })}
      </div>
      {shown.length === 0 && <div className="empty-state">Không tìm thấy lớp nào.</div>}

      {err && <div className="form-error">{err}</div>}

      <div className="form-actions">
        <button className="button primary large" onClick={claim} disabled={!picked || busy}>
          {busy ? 'Đang thiết lập…' : picked ? `Nhận lớp ${picked.class_code}` : 'Chọn một lớp để tiếp tục'}
        </button>
      </div>
    </section>

    <section className="card">
      <div className="section-title"><div>
        <h2><Download size={19} /> Chuẩn bị danh sách học sinh</h2>
        <p>Tải sẵn file mẫu để điền trong lúc chờ. Sau khi nhận lớp, thầy/cô import ngay ở tab <strong>Học sinh</strong>.</p>
      </div></div>
      <a className="button ghost full" href={TEMPLATE} download><Download size={17} /> Tải file mẫu Excel</a>
      <p className="muted-text small">File gồm 3 cột: <strong>STT</strong> · <strong>MSHS</strong> ·
        {' '}<strong>Họ và tên học sinh</strong>. Giữ nguyên tên các cột ở dòng đầu.</p>
    </section>
  </div>
}
