import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarClock, ChevronDown, ExternalLink, Link2, Presentation, Save, Search, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayISO } from '../utils/date'
import RatingStars from './RatingStars'

const dm = (iso) => (iso ? iso.split('-').reverse().slice(0, 2).join('/') : '—')
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')

// Số ngày từ hôm nay tới mốc — âm nghĩa là đã qua.
const daysTo = (iso) => Math.round((new Date(iso + 'T00:00:00Z') - new Date(todayISO() + 'T00:00:00Z')) / 86400000)

const TONE = {
  'Trễ hạn nộp': 'danger', 'Chưa chia sẻ': 'danger',
  'Chờ đến lượt': 'muted', 'Chưa xếp lịch': 'muted',
  'Đã nộp bài': 'success', 'Đã chia sẻ': 'success', 'Đã đánh giá': 'success',
}
const KIND_LABEL = { share: 'Có chia sẻ', reserve: 'Dự phòng', off: 'Nghỉ' }

export function StateBadge({ state }) {
  return <span className={`badge ${TONE[state] ?? 'muted'}`}>{state}</span>
}

// Giai đoạn của một lượt chia sẻ, quyết định MÀU của thẻ. Sáu giai đoạn thay vì
// chỉ "bình thường / cảnh báo": em nhìn màu là biết mình đang ở đâu mà không cần
// đọc chữ, và màu chuyển dần theo mức cấp bách chứ không nhảy thẳng từ xám sang đỏ.
const phaseOf = (r) => {
  if (r.teacher_rating != null) return 'done'        // đã được chấm
  if (r.shared_on) return 'shared'                   // đã đứng lớp chia sẻ
  if (r.tre_han) return 'late'                       // quá hạn, chưa có link
  if (r.link_url) return 'submitted'                 // đã nộp, chờ tới buổi
  const d = r.due_date ? daysTo(r.due_date) : 99
  if (d <= 3) return 'soon'                          // sắp tới hạn
  return 'waiting'
}
const PHASE_HINT = {
  waiting:   'Em còn thời gian chuẩn bị.',
  soon:      'Sắp tới hạn nộp rồi — em tranh thủ hoàn thiện nhé.',
  late:      'Đã quá hạn nộp. Em bổ sung ngay giúp thầy cô nhé.',
  submitted: 'Em đã nộp bài. Chuẩn bị cho buổi chia sẻ nhé!',
  shared:    'Em đã chia sẻ xong, đang chờ thầy cô nhận xét.',
  done:      'Thầy cô đã nhận xét bài của em.',
}

// Nút mở bài trình chiếu — cố tình TO và nổi bật. Đây là thứ người xem vào đây
// để bấm; để nó thành một link chữ nhỏ như các link phụ khác là chôn mất nó.
export function CanvaButton({ url, label = 'Xem bài trình chiếu' }) {
  if (!url) return null
  return <a className="canva-button" href={url} target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}>
    <Presentation size={22} />
    <span><strong>{label}</strong><small>Mở trong tab mới</small></span>
    <ExternalLink size={18} />
  </a>
}

// ---------------------------------------------------------------------------
//  THẺ CỦA HỌC SINH — luôn hiện cho tới khi em chia sẻ xong
// ---------------------------------------------------------------------------
export function MyBookShare() {
  const { context } = useAuth()
  const [row, setRow] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loaded, setLoaded] = useState(false)
  // Mặc định GẬP LẠI. Thẻ mở sẵn chiếm gần trọn màn hình đầu tiên của trang kế
  // hoạch, mà phần lớn thời gian em chẳng có gì để sửa.
  const [open, setOpen] = useState(false)

  const load = async () => {
    const { data } = await supabase.rpc('my_book_share')
    const r = (data ?? [])[0] ?? null
    setRow(r)
    setForm(r ? {
      book_title: r.book_title ?? '', author: r.author ?? '',
      summary: r.summary ?? '', lesson: r.lesson ?? '', link_url: r.link_url ?? '',
    } : null)
    setLoaded(true)
  }
  useEffect(() => { if (context.bookShare) load(); else setLoaded(true) }, [context.bookShare, context.classId])

  // Lớp không bật tính năng, hoặc em đã chia sẻ xong rồi → không hiện gì cả.
  if (!context.bookShare || !loaded || !row) return null

  const save = async () => {
    setBusy(true); setMsg('')
    if (form.link_url.trim()) {
      try { new URL(form.link_url.trim()) } catch { setBusy(false); return setMsg('Link chưa hợp lệ. Em dán đầy đủ cả https:// nhé.') }
    }
    const { error } = await supabase.from('book_shares').update({
      book_title: form.book_title.trim() || null,
      author: form.author.trim() || null,
      summary: form.summary.trim() || null,
      lesson: form.lesson.trim() || null,
      link_url: form.link_url.trim() || null,
    }).eq('id', row.share_id)
    setBusy(false)
    if (error) return setMsg('Chưa lưu được: ' + error.message)
    setMsg('✓ Đã lưu bài chia sẻ của em.')
    load()
  }

  const conLai = row.due_date ? daysTo(row.due_date) : null
  const hanText = conLai == null ? ''
    : conLai > 1 ? `còn ${conLai} ngày` : conLai === 1 ? 'còn 1 ngày' : conLai === 0 ? 'hôm nay là hạn' : `trễ ${-conLai} ngày`
  const phase = phaseOf(row)
  // Chưa nhập gì thì nhắc rõ là bấm vào để nhập — thẻ gập lại mà không nói gì
  // thì em dễ tưởng chỉ là một dòng thông báo.
  const goiY = row.book_title ? row.book_title : 'Bấm để nhập bài chia sẻ của em'

  return <section className={`card book-card phase-${phase} ${open ? 'open' : ''}`}>
    <button type="button" className="book-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="book-sum-icon"><BookOpen size={20} /></span>
      <span className="book-sum-main">
        <span className="eyebrow">LƯỢT CHIA SẺ SÁCH CỦA EM · TUẦN {row.week_no}</span>
        <strong>{goiY}</strong>
        <small>
          Báo cáo {dmy(row.report_date)} · hạn nộp {dmy(row.due_date)}
          {hanText && <> — <b>{hanText}</b></>}
        </small>
      </span>
      <span className="book-sum-right">
        <StateBadge state={row.state} />
        <ChevronDown size={20} className={`chev ${open ? 'up' : ''}`} />
      </span>
    </button>

    {open && <div className="book-body">
      <p className="phase-hint">{PHASE_HINT[phase]} Link trình chiếu nhớ bật quyền
        <strong> ai có liên kết cũng xem được</strong>.</p>

      {row.teacher_comment && <div className="detail-box">
        <strong>Nhận xét của giáo viên</strong>
        {row.teacher_rating != null && <p><RatingStars value={row.teacher_rating} readOnly /></p>}
        <p>{row.teacher_comment}</p>
      </div>}
      {row.monitor_note && <div className="detail-box">
        <strong>Nhận xét của cán sự thư viện</strong><p>{row.monitor_note}</p>
      </div>}

      <div className="form-grid two">
        <div><label>Tên sách</label>
          <input value={form.book_title} onChange={(e) => setForm({ ...form, book_title: e.target.value })}
                 placeholder="Ví dụ: Dế Mèn phiêu lưu ký" /></div>
        <div><label>Tác giả</label>
          <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })}
                 placeholder="Ví dụ: Tô Hoài" /></div>
      </div>
      <label>Tóm tắt nội dung</label>
      <textarea rows={4} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Cuốn sách kể về điều gì? Em tóm tắt ngắn gọn cho các bạn dễ hình dung." />
      <label>Bài học rút ra</label>
      <textarea rows={3} value={form.lesson} onChange={(e) => setForm({ ...form, lesson: e.target.value })}
                placeholder="Em học được gì từ cuốn sách này?" />
      <label>Link bài trình chiếu (Canva, Slides…)</label>
      <input value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })}
             placeholder="https://www.canva.com/design/..." />

      {row.link_url && <CanvaButton url={row.link_url} label="Mở bài trình chiếu em đã nộp" />}
      {msg && <div className={msg.startsWith('✓') ? 'notice compact' : 'form-error'}>{msg}</div>}
      <div className="form-actions">
        <button className="button primary large" disabled={busy} onClick={save}>
          <Save size={17} /> {busy ? 'Đang lưu…' : 'Lưu bài chia sẻ'}</button>
      </div>
    </div>}
  </section>
}

// ---------------------------------------------------------------------------
//  DẢI "SẮP CHIA SẺ" — dùng chung cho giáo viên và cán sự thư viện
// ---------------------------------------------------------------------------
export function BookShareUpcoming({ classId, weeks = 4, title = 'Sắp chia sẻ sách' }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!classId) return
    supabase.rpc('upcoming_book_shares', { p_class: classId, p_weeks: weeks })
      .then(({ data }) => setRows(data ?? []))
  }, [classId, weeks])

  if (!rows.length) return null
  return <section className="card sched-card">
    <div className="section-title"><div>
      <h2><CalendarClock size={19} /> {title}</h2>
      <p>Ai chia sẻ tuần này và các tuần kế tiếp, kèm tình trạng nộp bài.</p>
    </div></div>
    <div className="table-wrap"><table className="book-table">
      <thead><tr><th>Tuần</th><th>Ngày báo cáo</th><th>Học sinh</th><th>Sách</th><th>Link</th><th>Tình trạng</th></tr></thead>
      <tbody>{rows.map((r, i) => {
        const d = r.report_date ? daysTo(r.report_date) : null
        return <tr key={r.week_id} className={r.tre_han ? 'row-late' : ''}>
          <td><strong>Tuần {r.week_no}</strong>{i === 0 && <small>tuần gần nhất</small>}</td>
          <td>{dmy(r.report_date)}<small>{d > 0 ? `còn ${d} ngày` : d === 0 ? 'hôm nay' : `đã qua ${-d} ngày`}</small></td>
          <td><strong>{r.full_name ?? '— chưa xếp —'}</strong><small>{r.mshs}</small></td>
          <td>{r.book_title || <em className="muted-text">chưa cập nhật</em>}</td>
          <td>{r.link_url
            ? <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="mini-link"><Link2 size={13} /> mở</a>
            : <span className="muted-text">—</span>}</td>
          <td><StateBadge state={r.state} /></td>
        </tr>
      })}</tbody>
    </table></div>
  </section>
}

// ---------------------------------------------------------------------------
//  KẾT QUẢ CHIA SẺ — cả lớp cùng xem
// ---------------------------------------------------------------------------
// Cố ý ĐƠN GIẢN: chỉ tên bạn, tên sách, nội dung, bài học và link. Học sinh vào
// đây để đọc xem bạn mình đã giới thiệu sách gì, không phải để theo dõi tiến độ
// — phần lịch và trạng thái là việc của giáo viên, nằm ở bảng quản lý bên dưới.
export function BookShareResults({ classId, canMonitor = false }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [q, setQ] = useState('')

  const load = async () => {
    const { data } = await supabase.rpc('class_book_shares', { p_class: classId })
    setRows(data ?? [])
  }
  useEffect(() => { if (classId) load() }, [classId])

  // Chỉ hiện những lượt ĐÃ CÓ NỘI DUNG. Tuần chưa tới lượt, tuần nghỉ, tuần dự
  // phòng đều không phải "kết quả chia sẻ" nên không xuất hiện ở đây.
  const done = useMemo(() => {
    const k = q.trim().toLowerCase()
    return rows
      .filter((r) => r.book_title)
      .filter((r) => !k || `${r.full_name ?? ''} ${r.book_title} ${r.author ?? ''}`.toLowerCase().includes(k))
      .sort((a, b) => (b.report_date ?? '').localeCompare(a.report_date ?? ''))
  }, [rows, q])

  return <section className="section-block">
    <div className="section-title"><div>
      <h2><BookOpen size={19} /> Kết quả chia sẻ sách</h2>
      <p>Những cuốn sách các bạn trong lớp đã giới thiệu. Bấm một dòng để đọc đầy đủ.</p>
    </div></div>

    {rows.filter((r) => r.book_title).length > 6 && <div className="card filters">
      <div className="search-box"><Search size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên bạn, tên sách hoặc tác giả…" /></div>
    </div>}

    {done.length === 0
      ? <div className="empty-state"><p>Chưa có bạn nào chia sẻ sách. Quay lại sau nhé!</p></div>
      : <div className="card table-card"><div className="table-wrap"><table className="book-table results">
          <thead><tr><th>Họ tên</th><th>Tên sách</th><th>Nội dung</th><th>Bài học rút ra</th><th>Link</th></tr></thead>
          <tbody>{done.map((r) => <tr key={r.week_id} className="clickable-row" onClick={() => setOpen(r)}>
            <td><strong>{r.full_name}</strong><small>{dmy(r.report_date)}</small></td>
            <td><strong>{r.book_title}</strong>{r.author && <small>{r.author}</small>}</td>
            <td className="cell-wrap">{r.summary || <em className="muted-text">—</em>}</td>
            <td className="cell-wrap">{r.lesson || <em className="muted-text">—</em>}</td>
            <td>{r.link_url
              ? <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="row-link"
                   onClick={(e) => e.stopPropagation()}><Presentation size={16} /> Xem bài</a>
              : <span className="muted-text">—</span>}</td>
          </tr>)}</tbody>
        </table></div></div>}

    {open && <BookDetailModal row={open} canMonitor={canMonitor}
      onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
  </section>
}

function BookDetailModal({ row, canMonitor, onClose, onSaved }) {
  const [note, setNote] = useState(row.monitor_note ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    setBusy(true); setMsg('')
    const { error } = await supabase.from('book_shares').update({ monitor_note: note.trim() || null }).eq('id', row.share_id)
    setBusy(false)
    if (error) return setMsg('Chưa lưu được: ' + error.message)
    onSaved()
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal book-modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">TUẦN {row.week_no} · CHIA SẺ NGÀY {dmy(row.report_date)}</span>
          <h2>{row.book_title}</h2>
          <p className="book-byline">
            {row.author && <span><b>{row.author}</b></span>}
            <span>{row.full_name} giới thiệu</span>
            {row.teacher_rating != null && <RatingStars value={row.teacher_rating} readOnly size={16} />}
          </p>
        </div>
        <button className="icon-button" onClick={onClose}>✕</button>
      </div>

      <CanvaButton url={row.link_url} />

      {row.summary && <section className="book-section">
        <h3>Tóm tắt nội dung</h3><p>{row.summary}</p></section>}
      {row.lesson && <section className="book-section accent">
        <h3>Bài học rút ra</h3><p>{row.lesson}</p></section>}

      {row.teacher_comment && <section className="book-section note">
        <h3>Nhận xét của giáo viên</h3><p>{row.teacher_comment}</p></section>}

      {canMonitor
        ? <section className="book-section">
            <h3>Nhận xét của cán sự thư viện</h3>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Bạn trình bày rõ ràng, phần bài học liên hệ tốt…" />
            {msg && <div className="form-error">{msg}</div>}
            <div className="form-actions">
              <button className="button primary" disabled={busy} onClick={save}>
                <Save size={16} /> {busy ? 'Đang lưu…' : 'Lưu nhận xét'}</button>
            </div>
          </section>
        : row.monitor_note && <section className="book-section note">
            <h3>Nhận xét của cán sự thư viện</h3><p>{row.monitor_note}</p></section>}
    </div>
  </div>
}

// ---------------------------------------------------------------------------
//  TAB CỦA GIÁO VIÊN — xếp lịch, đổi người, chấm điểm
// ---------------------------------------------------------------------------
export function BookSharePanel({ classId, className, roster }) {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [rate, setRate] = useState(null)

  const load = async () => {
    const { data } = await supabase.rpc('class_book_shares', { p_class: classId })
    setRows(data ?? [])
  }
  useEffect(() => { if (classId) load() }, [classId])

  const setWeek = async (r, patch) => {
    setBusy(r.week_id); setMsg('')
    const { error } = await supabase.rpc('set_book_share_week', {
      p_week: r.week_id,
      p_kind: patch.kind ?? r.kind,
      p_report_date: patch.report_date ?? r.report_date,
      p_reason: patch.skip_reason !== undefined ? patch.skip_reason : r.skip_reason,
    })
    setBusy('')
    if (error) return setMsg('Không lưu được: ' + error.message)
    load()
  }

  const assign = async (r, mshs) => {
    setBusy(r.week_id); setMsg('')
    const { error } = await supabase.rpc('assign_book_share', { p_week: r.week_id, p_mshs: mshs || null })
    setBusy('')
    if (error) return setMsg('Không xếp được: ' + error.message)
    load()
  }

  const daXep = new Set(rows.filter((r) => r.mshs).map((r) => r.mshs))
  const chuaXep = (roster ?? []).filter((s) => !daXep.has(s.mshs))

  return <>
    <BookShareUpcoming classId={classId} weeks={4} />

    <section className="section-block">
      <div className="section-title"><div>
        <h2><CalendarClock size={19} /> Lịch chia sẻ sách lớp {className}</h2>
        <p>Đổi loại tuần, dời ngày báo cáo, hoặc xếp lại học sinh. <strong>Hạn nộp luôn tự tính
           bằng ngày báo cáo trừ 3 ngày</strong> — không nhập tay được nên không thể lệch.</p>
      </div><a className="button ghost" href={`${import.meta.env.BASE_URL}templates/Mau_lich_chia_se_sach.xlsx`} download>
        <Upload size={16} /> Tải file mẫu</a></div>

      {chuaXep.length > 0 && <div className="notice warning compact"><Users size={16} /><span>
        Còn <strong>{chuaXep.length} em chưa được xếp lượt</strong>: {chuaXep.map((s) => s.full_name).join(' · ')}
      </span></div>}
      {msg && <div className="form-error">{msg}</div>}

      <div className="card table-card"><div className="table-wrap"><table className="book-table">
        <thead><tr><th>Tuần</th><th>Loại tuần</th><th>Ngày báo cáo</th><th>Hạn nộp</th>
          <th>Học sinh</th><th>Sách</th><th>Tình trạng</th><th>Chấm</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.week_id} className={`${busy === r.week_id ? 'busy' : ''} ${r.tre_han ? 'row-late' : ''}`}>
          <td><strong>Tuần {r.week_no}</strong><small>{dm(r.starts_on)}–{dm(r.ends_on)}</small></td>
          <td><select value={r.kind} onChange={(e) => setWeek(r, { kind: e.target.value })}>
            <option value="share">Có chia sẻ</option>
            <option value="reserve">Dự phòng</option>
            <option value="off">Nghỉ</option></select>
            {r.skip_reason && <small>{r.skip_reason}</small>}</td>
          <td>{r.kind === 'off' ? <span className="muted-text">—</span>
            : <input type="date" value={r.report_date ?? ''} onChange={(e) => setWeek(r, { report_date: e.target.value })} />}</td>
          <td>{r.due_date ? <strong>{dmy(r.due_date)}</strong> : '—'}</td>
          <td><select value={r.mshs ?? ''} onChange={(e) => assign(r, e.target.value)} disabled={r.kind === 'off'}>
            <option value="">— chưa xếp —</option>
            {(roster ?? []).map((s) => <option key={s.mshs} value={s.mshs}>{s.full_name}</option>)}</select></td>
          <td>{r.book_title || <em className="muted-text">—</em>}
            {r.link_url && <a href={r.link_url} target="_blank" rel="noopener noreferrer" className="mini-link"><Link2 size={13} /> link</a>}</td>
          <td>{r.kind === 'share' ? <StateBadge state={r.state} /> : <span className="badge muted">{KIND_LABEL[r.kind]}</span>}</td>
          <td>{r.share_id && <button className="button ghost" onClick={() => setRate(r)}>
            {r.teacher_rating != null ? <RatingStars value={r.teacher_rating} readOnly size={15} /> : 'Chấm'}</button>}</td>
        </tr>)}</tbody>
      </table></div></div>
    </section>

    {rate && <RateModal row={rate} onClose={() => setRate(null)} onSaved={() => { setRate(null); load() }} />}
  </>
}

function RateModal({ row, onClose, onSaved }) {
  const [rating, setRating] = useState(row.teacher_rating ?? 0)
  const [comment, setComment] = useState(row.teacher_comment ?? '')
  const [sharedOn, setSharedOn] = useState(row.shared_on ?? row.report_date ?? todayISO())
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    if (!rating) return setMsg('Chọn số sao trước khi lưu.')
    setBusy(true); setMsg('')
    const { error } = await supabase.from('book_shares').update({
      teacher_rating: rating, teacher_comment: comment.trim() || null, shared_on: sharedOn,
    }).eq('id', row.share_id)
    setBusy(false)
    if (error) return setMsg('Chưa lưu được: ' + error.message)
    onSaved()
  }

  const trong = !row.book_title && !row.summary && !row.lesson && !row.link_url

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal book-modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">TUẦN {row.week_no} · BÁO CÁO {dmy(row.report_date)}</span>
          <h2>{row.full_name}</h2>
          <p className="book-byline">
            {row.book_title ? <span><b>{row.book_title}</b></span> : <span className="muted-text">Chưa cập nhật tên sách</span>}
            {row.author && <span>{row.author}</span>}
          </p>
        </div>
        <button className="icon-button" onClick={onClose}>✕</button>
      </div>

      {/* Bài em nộp hiện ngay đây để thầy cô vừa đọc vừa chấm, không phải mở
          hai chỗ rồi nhớ chéo qua lại. */}
      {trong
        ? <div className="notice warning compact"><Users size={16} /><span>
            Em chưa nộp nội dung nào. Thầy cô vẫn chấm được nếu em đã trình bày trên lớp.
          </span></div>
        : <>
            <CanvaButton url={row.link_url} />
            {row.summary && <section className="book-section">
              <h3>Tóm tắt nội dung</h3><p>{row.summary}</p></section>}
            {row.lesson && <section className="book-section accent">
              <h3>Bài học rút ra</h3><p>{row.lesson}</p></section>}
          </>}

      {row.monitor_note && <section className="book-section note">
        <h3>Nhận xét của cán sự thư viện</h3><p>{row.monitor_note}</p></section>}

      <section className="book-section">
        <h3>Đánh giá của thầy cô</h3>
        <label>Ngày chia sẻ thực tế</label>
        <input type="date" value={sharedOn} onChange={(e) => setSharedOn(e.target.value)} />
        <label>Số sao</label>
        <RatingStars value={rating} onChange={setRating} size={26} />
        <label>Nhận xét</label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="Em trình bày tự tin, phần liên hệ bản thân rất tốt…" />
      </section>

      {msg && <div className="form-error">{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Huỷ</button>
        <button className="button primary large" disabled={busy} onClick={save}>
          <Save size={17} /> {busy ? 'Đang lưu…' : 'Lưu đánh giá'}</button>
      </div>
    </div>
  </div>
}
