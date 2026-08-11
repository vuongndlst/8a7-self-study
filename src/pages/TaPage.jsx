import { useEffect, useMemo, useState } from 'react'
import { LifeBuoy, MessageSquare, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import ChatPanel, { getOrCreateConversation } from '../components/ChatPanel'
import RatingStars from '../components/RatingStars'
import StatusBadge from '../components/StatusBadge'

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
  const [range, setRange] = useState('tomorrow')
  const [search, setSearch] = useState('')
  const [chatWith, setChatWith] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const jobs = []
    if (assistant?.can_view_plans) {
      jobs.push(supabase.from('plans').select('*').order('study_date', { ascending: false }).order('period'))
    } else jobs.push(Promise.resolve({ data: [] }))
    if (assistant?.can_view_help) {
      jobs.push(supabase.from('help_requests').select('*').eq('help_resolved', false).order('study_date', { ascending: false }))
    } else jobs.push(Promise.resolve({ data: [] }))
    jobs.push(supabase.from('profiles').select('id,full_name,mshs').eq('role', 'student'))

    const [{ data: p }, { data: h }, { data: pr }] = await Promise.all(jobs)
    setPlans(p ?? [])
    setHelp(h ?? [])
    setPeople(Object.fromEntries((pr ?? []).map((x) => [x.id, x])))

    // Chỉ đọc phản tư khi được bật quyền — nếu không, RLS trả rỗng.
    if (assistant?.can_view_reflections && (p ?? []).length) {
      const { data: r } = await supabase.from('reflections').select('*').in('plan_id', p.map((x) => x.id))
      setReflections(Object.fromEntries((r ?? []).map((x) => [x.plan_id, x])))
    } else setReflections({})
    setLoading(false)
  }

  useEffect(() => { if (assistant) load() }, [assistant?.class_id])

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

  const openChat = async (studentId) => {
    const id = await getOrCreateConversation(context.classId, studentId)
    setChatWith({ id, name: people[studentId]?.full_name ?? '' })
  }

  if (!assistant) {
    return <div className="page"><div className="card empty-state">Em chưa được cử làm trợ giảng.</div></div>
  }

  const granted = Object.keys(PERM_LABEL).filter((k) => assistant[k])

  return <div className="page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow"><LifeBuoy size={13} /> TRỢ GIẢNG</span>
        <h1>Hỗ trợ lớp {context.className}</h1>
        <p>Chào {profile?.full_name} — em đang giúp giáo viên theo dõi giờ tự học của lớp.</p>
      </div>
      <div className="button-row"><button className="button ghost" onClick={load}><RefreshCw size={17} /> Làm mới</button></div>
    </section>

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
            <h3>{people[h.student_id]?.full_name ?? '—'}</h3>
            <p>{h.subject} — {h.help_note}</p>
            {assistant.can_chat && <div className="plan-footer">
              <button className="button ghost" onClick={() => openChat(h.student_id)}><MessageSquare size={15} /> Nhắn cho bạn</button>
            </div>}
          </article>)}</div>}
    </section>}

    {assistant.can_view_plans && <section className="section-block">
      <div className="section-title">
        <div><h2>Kế hoạch của lớp</h2><p>Xem bạn nào đã đăng ký, bạn nào chưa.</p></div>
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
        {loading ? <div className="empty-state">Đang tải…</div> : <div className="table-wrap"><table>
          <thead><tr><th>Bạn</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Đăng ký</th>
            {assistant.can_view_reflections && <th>Kết quả</th>}
            {assistant.can_chat && <th>Nhắn tin</th>}</tr></thead>
          <tbody>{rows.map((p) => {
            const s = people[p.student_id] ?? {}
            const r = reflections[p.id]
            return <tr key={p.id}>
              <td><strong>{s.full_name}</strong><small>{s.mshs}</small></td>
              <td>{formatDate(p.study_date)}<small>Tiết {p.period}</small></td>
              <td><strong>{p.subject}</strong><small title={p.task}>{p.task}</small></td>
              <td><StatusBadge value={registrationStatus(p.study_date, p.created_at)} /></td>
              {assistant.can_view_reflections && <td>{r
                ? <>{<StatusBadge value={r.completion_status} />}{r.rating != null && <RatingStars value={r.rating} readOnly size={14} />}</>
                : <span className="muted-text">Chưa cập nhật</span>}</td>}
              {assistant.can_chat && <td><button className="icon-button" title="Nhắn tin" onClick={() => openChat(p.student_id)}><MessageSquare size={16} /></button></td>}
            </tr>
          })}</tbody>
        </table>{rows.length === 0 && <div className="empty-state">Không có kế hoạch nào trong khoảng này.</div>}</div>}
      </div>
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
