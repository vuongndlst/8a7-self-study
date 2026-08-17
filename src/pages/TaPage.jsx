import { useEffect, useMemo, useState } from 'react'
import { LifeBuoy, MessageSquare, RefreshCw, Search, ShieldCheck, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { selectIn, daysAgoISO } from '../lib/query'
import { useAuth } from '../context/AuthContext'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import ChatPanel, { getOrCreateConversation } from '../components/ChatPanel'
import RatingStars from '../components/RatingStars'
import StatusBadge from '../components/StatusBadge'
import Avatar from '../components/Avatar'

const PAGE_SIZE = 25

const shiftISO = (n) => {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const PERM_LABEL = {
  can_view_plans: 'Xem kế hoạch lớp',
  can_view_help: 'Xem yêu cầu hỗ trợ',
  can_chat: 'Nhắn tin với bạn',
  can_view_reflections: 'Xem phản tư đầy đủ',
  can_view_evidence: 'Xem minh chứng',
  can_rate: 'Chấm sao',
  can_comment: 'Viết nhận xét',
  can_review_device: 'Duyệt thiết bị',
  can_approve_plan: 'Duyệt kế hoạch',
}

export default function TaPage() {
  const { profile, assistant, context } = useAuth()
  const [plans, setPlans] = useState([])
  const [people, setPeople] = useState({})
  const [help, setHelp] = useState([])
  const [reflections, setReflections] = useState({})
  const [missing, setMissing] = useState([])
  const [missingDate, setMissingDate] = useState(shiftISO(1))
  const [range, setRange] = useState('tomorrow')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [chatWith, setChatWith] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    // Mỗi truy vấn chỉ chạy khi quyền tương ứng được bật. Không phải để "giấu"
    // — RLS đằng nào cũng chặn — mà để khỏi gọi thừa và khỏi hiểu nhầm ô trống
    // là "lớp không có dữ liệu" trong khi thật ra là "em chưa được cấp quyền".
    // Chỉ nạp lớp em đang trợ giảng, trong 60 ngày gần nhất. Trợ giảng không có
    // việc gì phải kéo về dữ liệu của những lớp khác hay của các năm trước.
    const since = daysAgoISO(60)
    const [{ data: p }, { data: h }, { data: enr }] = await Promise.all([
      assistant?.can_view_plans
        ? supabase.from('plans').select('*').eq('class_id', assistant.class_id).gte('study_date', since)
            .order('study_date', { ascending: false }).order('period')
        : Promise.resolve({ data: [] }),
      assistant?.can_view_help
        ? supabase.from('help_requests').select('*').eq('help_resolved', false).order('study_date', { ascending: false })
        : Promise.resolve({ data: [] }),
      supabase.from('enrollments').select('students!inner(claimed_user_id)')
        .eq('class_id', assistant.class_id).eq('is_active', true),
    ])
    setPlans(p ?? [])
    setHelp(h ?? [])

    const uids = (enr ?? []).map((e) => e.students?.claimed_user_id).filter(Boolean)
    const [pr, r] = await Promise.all([
      selectIn('profiles', 'id,full_name,mshs,avatar_path', 'id', uids),
      assistant?.can_view_reflections && (p ?? []).length
        ? selectIn('reflections', '*', 'plan_id', p.map((x) => x.id))
        : Promise.resolve([]),
    ])
    setPeople(Object.fromEntries(pr.map((x) => [x.id, x])))
    setReflections(Object.fromEntries(r.map((x) => [x.plan_id, x])))
    setLoading(false)
  }

  const checkMissing = async (d) => {
    if (!assistant?.can_view_plans || !context.classId) return
    const { data } = await supabase.rpc('missing_registrations', { p_class: context.classId, p_date: d })
    setMissing(data ?? [])
  }

  useEffect(() => { if (assistant) { load(); checkMissing(missingDate) } }, [assistant?.class_id])
  useEffect(() => { setPage(1) }, [range, search])

  const rows = useMemo(() => {
    const today = todayISO(); const tmr = shiftISO(1)
    return plans.filter((p) => {
      if (range === 'today' && p.study_date !== today) return false
      if (range === 'tomorrow' && p.study_date !== tmr) return false
      if (range === 'past' && p.study_date >= today) return false
      const q = search.trim().toLowerCase()
      const s = people[p.student_id]
      if (q && !`${s?.full_name ?? ''} ${s?.mshs ?? ''} ${p.subject} ${p.task}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [plans, range, search, people])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageRows = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])

  // Thống kê tính trên ĐÚNG khoảng đang xem, để con số khớp với bảng bên dưới.
  const stats = useMemo(() => {
    const studentsInView = new Set(rows.map((p) => p.student_id))
    const past = rows.filter((p) => p.study_date < todayISO())
    return {
      tasks: rows.length,
      students: studentsInView.size,
      device: rows.filter((p) => p.use_device).length,
      devicePending: rows.filter((p) => p.use_device && p.device_status === 'Chờ duyệt').length,
      late: rows.filter((p) => registrationStatus(p.study_date, p.created_at) !== 'Đúng hạn').length,
      noResult: past.filter((p) => !reflections[p.id]).length,
      pastCount: past.length,
    }
  }, [rows, reflections])

  const missingList = useMemo(() => {
    const by = missing.reduce((acc, r) => {
      (acc[r.student_id] ||= { name: r.full_name, mshs: r.mshs, periods: [] })
      if (r.period != null) acc[r.student_id].periods.push(r.period)
      return acc
    }, {})
    return Object.values(by).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [missing])

  const openChat = async (studentId) => {
    const id = await getOrCreateConversation(context.classId, studentId)
    setChatWith({ id, name: people[studentId]?.full_name ?? '' })
  }

  if (!assistant) {
    return <div className="page"><div className="card empty-state">Em chưa được cử làm trợ giảng.</div></div>
  }

  const granted = Object.keys(PERM_LABEL).filter((k) => assistant[k])
  const rangeLabel = { today: 'hôm nay', tomorrow: 'ngày mai', past: 'các ngày đã qua', all: 'tất cả các ngày' }[range]

  return <div className="page">
    <section className="dashboard-heading">
      <div className="heading-with-avatar">
        <Avatar name={profile?.full_name} path={profile?.avatar_path} size={56} />
        <div>
          <span className="eyebrow"><LifeBuoy size={13} /> TRỢ GIẢNG</span>
          <h1>Hỗ trợ lớp {context.className}</h1>
          <p>Chào {profile?.full_name} — em đang giúp giáo viên theo dõi giờ tự học của lớp.
             Đây là trang của cả lớp; kế hoạch riêng của em vẫn ở mục <strong>Kế hoạch của em</strong>.</p>
        </div>
      </div>
      <div className="button-row"><button className="button ghost" onClick={() => { load(); checkMissing(missingDate) }}><RefreshCw size={17} /> Làm mới</button></div>
    </section>

    {assistant.can_view_plans && <section className="stats-grid">
      <Stat label={`Nhiệm vụ ${rangeLabel}`} value={stats.tasks} />
      <Stat label="Số bạn có kế hoạch" value={stats.students} />
      <Stat label="Đăng ký trễ" value={stats.late} alert={stats.late > 0} />
      <Stat label="Có dùng thiết bị" value={stats.device} />
      <Stat label="Thiết bị chờ duyệt" value={stats.devicePending} alert={stats.devicePending > 0} />
      <Stat label="Đã qua, chưa có kết quả" value={stats.pastCount ? stats.noResult : '—'} alert={stats.noResult > 0} />
    </section>}

    <section className="card perm-card">
      <span className="eyebrow"><ShieldCheck size={13} /> QUYỀN GIÁO VIÊN ĐÃ CẤP CHO EM</span>
      <div className="perm-chips">
        {granted.map((k) => <span key={k} className="chip on">{PERM_LABEL[k]}</span>)}
        {Object.keys(PERM_LABEL).filter((k) => !assistant[k]).map((k) => <span key={k} className="chip off">{PERM_LABEL[k]}</span>)}
      </div>
      <p className="muted-text small">Phần mờ là quyền chưa được bật. Nếu em cần thêm, hãy trao đổi với giáo viên.</p>
    </section>

    {assistant.can_view_help && <section className="section-block">
      <div className="section-title"><div><h2>Bạn cần hỗ trợ</h2><p>Những tiết mà bạn đã bật “em cần giáo viên hỗ trợ” và chưa được xử lý.</p></div></div>
      {help.length === 0
        ? <div className="empty-state"><p>Hiện không có bạn nào cần hỗ trợ.</p></div>
        : <div className="plan-grid">{help.map((h) => <article key={h.plan_id} className="card plan-card alarm-amber">
            <div className="plan-card-top">
              <span className="date-chip">{formatDate(h.study_date)} · Tiết {h.period}</span>
              <StatusBadge value="Chờ duyệt" label="Cần hỗ trợ" />
            </div>
            <h3><span className="cell-with-avatar">
              <Avatar name={people[h.student_id]?.full_name} path={people[h.student_id]?.avatar_path} size={28} />
              <span>{people[h.student_id]?.full_name ?? '—'}</span>
            </span></h3>
            <p>{h.subject} — {h.help_note}</p>
            {assistant.can_chat && <div className="plan-footer">
              <button className="button ghost" onClick={() => openChat(h.student_id)}><MessageSquare size={15} /> Nhắn cho bạn</button>
            </div>}
          </article>)}</div>}
    </section>}

    {assistant.can_view_plans && <section className="section-block">
      <div className="section-title"><div>
        <h2><UserX size={19} /> Bạn chưa đăng ký</h2>
        <p>Chọn ngày để nhắc những bạn chưa có kế hoạch tự học.</p>
      </div></div>
      <div className="card sched-card">
        <div className="check-row">
          <input type="date" value={missingDate} onChange={(e) => { setMissingDate(e.target.value); checkMissing(e.target.value) }} />
          <button className="button ghost" onClick={() => { setMissingDate(todayISO()); checkMissing(todayISO()) }}>Hôm nay</button>
          <button className="button ghost" onClick={() => { setMissingDate(shiftISO(1)); checkMissing(shiftISO(1)) }}>Ngày mai</button>
        </div>
        {missingList.length === 0
          ? <div className="empty-state"><p>✓ Tất cả các bạn đã có kế hoạch cho ngày này.</p></div>
          : <>
              <div className="notice warning"><UserX size={17} /><span><strong>{missingList.length} bạn</strong> chưa đăng ký cho ngày {missingDate.split('-').reverse().join('/')}.</span></div>
              <div className="missing-grid">{missingList.map((s) => <div key={s.mshs} className="missing-chip">
                <strong>{s.name}</strong><small>{s.mshs}{s.periods.length ? ` · thiếu tiết ${s.periods.sort((a, b) => a - b).join(', ')}` : ''}</small>
              </div>)}</div>
            </>}
      </div>
    </section>}

    {assistant.can_view_plans ? <section className="section-block">
      <div className="section-title">
        <div><h2>Kế hoạch của lớp</h2><p>Mỗi dòng là một nhiệm vụ. Một bạn có thể đăng ký nhiều nhiệm vụ trong cùng một tiết.</p></div>
      </div>
      <div className="card filters">
        <div className="search-box"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm tên, MSHS, môn…" /></div>
        <select value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="tomorrow">Ngày mai</option>
          <option value="today">Hôm nay</option>
          <option value="past">Đã qua</option>
          <option value="all">Tất cả</option>
        </select>
      </div>
      <div className="card table-card">
        {loading ? <div className="empty-state">Đang tải…</div> : <><div className="table-wrap"><table>
          <thead><tr><th>Bạn</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Đăng ký</th><th>Thiết bị</th>
            {assistant.can_view_reflections && <th>Kết quả</th>}
            {assistant.can_chat && <th>Nhắn tin</th>}</tr></thead>
          <tbody>{pageRows.map((p) => {
            const s = people[p.student_id] ?? {}
            const r = reflections[p.id]
            return <tr key={p.id}>
              <td><span className="cell-with-avatar"><Avatar name={s.full_name} path={s.avatar_path} size={30} />
                <span><strong>{s.full_name ?? '—'}</strong><small>{s.mshs ?? ''}</small></span></span></td>
              <td>{formatDate(p.study_date)}<small>Tiết {p.period}{p.span===2?`–${p.period+1}`:''}</small></td>
              <td><strong>{p.subject === 'Khác' && p.subject_other ? p.subject_other : p.subject}</strong><small title={p.task}>{p.task}</small></td>
              <td><StatusBadge value={registrationStatus(p.study_date, p.created_at)} /></td>
              <td>{p.use_device ? <span title={p.device_purpose}>💻 <StatusBadge value={p.device_status} /></span> : '—'}</td>
              {assistant.can_view_reflections && <td>{r
                ? <>{<StatusBadge value={r.completion_status} />}{r.rating != null && <RatingStars value={r.rating} readOnly size={14} />}</>
                : p.study_date < todayISO()
                  ? <span className="help-flag">Chưa cập nhật</span>
                  : <span className="muted-text">Chưa tới buổi</span>}</td>}
              {assistant.can_chat && <td><button className="icon-button" title="Nhắn tin" onClick={() => openChat(p.student_id)}><MessageSquare size={16} /></button></td>}
            </tr>
          })}</tbody>
        </table>{rows.length === 0 && <div className="empty-state">Không có kế hoạch nào trong khoảng này.</div>}</div>
        {rows.length > PAGE_SIZE && <div className="pager">
          <button className="button ghost" disabled={page === 1} onClick={() => setPage((n) => n - 1)}>← Trước</button>
          <span>Trang <strong>{page}</strong> / {totalPages} · {rows.length} nhiệm vụ</span>
          <button className="button ghost" disabled={page === totalPages} onClick={() => setPage((n) => n + 1)}>Sau →</button>
        </div>}</>}
      </div>
    </section>
    : <section className="card empty-state">
        <p>Giáo viên chưa bật quyền <strong>Xem kế hoạch lớp</strong> cho em, nên phần này đang trống.</p>
      </section>}

    {chatWith && <div className="modal-backdrop" onMouseDown={() => setChatWith(null)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">TIN NHẮN</span><h2>{chatWith.name}</h2></div>
          <button className="icon-button" onClick={() => setChatWith(null)}>✕</button></div>
        <div className="notice compact"><ShieldCheck size={16} /><span>Giáo viên cũng đọc được luồng này.</span></div>
        <ChatPanel conversationId={chatWith.id} studentName={chatWith.name} />
      </div>
    </div>}
  </div>
}

function Stat({ label, value, alert }) {
  return <div className={`stat-card ${alert ? 'alert' : ''}`}><span>{label}</span><strong>{value}</strong></div>
}
