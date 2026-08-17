import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CalendarClock, ExternalLink, Link2, Save, Upload, Users } from 'lucide-react'
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

  return <section className={`card book-card ${row.tre_han ? 'late' : ''}`}>
    <div className="book-head">
      <div>
        <span className="eyebrow"><BookOpen size={13} /> LƯỢT CHIA SẺ SÁCH CỦA EM</span>
        <h2>Tuần {row.week_no} · báo cáo {dmy(row.report_date)}</h2>
        <p className="muted-text">
          Hạn nộp nội dung và link: <strong>{dmy(row.due_date)}</strong>
          {hanText && <> — <strong className={conLai < 0 ? 'alarm-red' : ''}>{hanText}</strong></>}
          . Link trình chiếu nhớ bật quyền <strong>ai có liên kết cũng xem được</strong>.
        </p>
      </div>
      <StateBadge state={row.state} />
    </div>

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

    {msg && <div className={msg.startsWith('✓') ? 'notice compact' : 'form-error'}>{msg}</div>}
    <div className="form-actions">
      {row.link_url && <a className="button ghost" href={row.link_url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} /> Mở link đã nộp</a>}
      <button className="button primary large" disabled={busy} onClick={save}>
        <Save size={17} /> {busy ? 'Đang lưu…' : 'Lưu bài chia sẻ'}</button>
    </div>
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
//  BẢNG CẢ LỚP — ai trong lớp cũng xem được, bất cứ lúc nào
// ---------------------------------------------------------------------------
export function BookShareBoard({ classId, className, canMonitor = false, onChanged }) {
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [filter, setFilter] = useState('share')

  const load = async () => {
    const { data } = await supabase.rpc('class_book_shares', { p_class: classId })
    setRows(data ?? [])
  }
  useEffect(() => { if (classId) load() }, [classId])

  const shown = useMemo(() => rows.filter((r) => {
    if (filter === 'share') return r.kind === 'share'
    if (filter === 'done') return !!r.shared_on
    if (filter === 'reserve') return r.kind === 'reserve'
    return true
  }), [rows, filter])

  const daChiaSe = rows.filter((r) => r.shared_on).length
  const tongLuot = rows.filter((r) => r.kind === 'share').length

  return <section className="section-block">
    <div className="section-title"><div>
      <h2><BookOpen size={19} /> Chia sẻ sách — lớp {className}</h2>
      <p>Đã chia sẻ <strong>{daChiaSe}</strong> / {tongLuot} lượt. Bấm một dòng để xem nội dung bạn đã giới thiệu.</p>
    </div></div>

    <div className="quick-views">
      {[['share', 'Có chia sẻ'], ['done', 'Đã chia sẻ xong'], ['reserve', 'Tuần dự phòng'], ['all', 'Tất cả tuần']]
        .map(([v, label]) => <button key={v} type="button"
          className={`chip-btn ${filter === v ? 'on' : ''}`} onClick={() => setFilter(v)}>{label}</button>)}
    </div>

    <div className="card table-card"><div className="table-wrap"><table className="book-table">
      <thead><tr><th>Tuần</th><th>Báo cáo</th><th>Học sinh</th><th>Sách</th><th>Tác giả</th><th>Sao</th><th>Tình trạng</th></tr></thead>
      <tbody>{shown.map((r) => <tr key={r.week_id}
          className={`${r.book_title ? 'clickable-row' : ''} ${r.tre_han ? 'row-late' : ''}`}
          onClick={() => r.book_title && setOpen(r)}>
        <td><strong>Tuần {r.week_no}</strong><small>{dm(r.starts_on)}–{dm(r.ends_on)}</small></td>
        <td>{dmy(r.report_date)}</td>
        <td>{r.full_name ?? <em className="muted-text">{KIND_LABEL[r.kind]}{r.skip_reason ? ` · ${r.skip_reason}` : ''}</em>}</td>
        <td>{r.book_title || <em className="muted-text">—</em>}</td>
        <td>{r.author || '—'}</td>
        <td>{r.teacher_rating != null ? <RatingStars value={r.teacher_rating} readOnly size={15} /> : '—'}</td>
        <td>{r.kind === 'share' ? <StateBadge state={r.state} /> : <span className="badge muted">{KIND_LABEL[r.kind]}</span>}</td>
      </tr>)}</tbody>
    </table></div></div>

    {open && <BookDetailModal row={open} canMonitor={canMonitor}
      onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); onChanged?.() }} />}
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
    <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow">TUẦN {row.week_no} · {dmy(row.report_date)}</span>
          <h2>{row.book_title}</h2>
          <p className="muted-text">{row.author ? `${row.author} · ` : ''}{row.full_name} giới thiệu</p></div>
        <button className="icon-button" onClick={onClose}>✕</button>
      </div>
      {row.summary && <div className="detail-box"><strong>Tóm tắt nội dung</strong><p>{row.summary}</p></div>}
      {row.lesson && <div className="detail-box"><strong>Bài học rút ra</strong><p>{row.lesson}</p></div>}
      {row.link_url && <p><a className="button ghost" href={row.link_url} target="_blank" rel="noopener noreferrer">
        <ExternalLink size={16} /> Mở bài trình chiếu</a></p>}
      {row.teacher_comment && <div className="detail-box">
        <strong>Nhận xét của giáo viên</strong>
        {row.teacher_rating != null && <p><RatingStars value={row.teacher_rating} readOnly /></p>}
        <p>{row.teacher_comment}</p></div>}

      {canMonitor
        ? <>
            <label>Nhận xét của cán sự thư viện</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Bạn trình bày rõ ràng, phần bài học liên hệ tốt…" />
            {msg && <div className="form-error">{msg}</div>}
            <div className="form-actions">
              <button className="button primary" disabled={busy} onClick={save}>
                <Save size={16} /> {busy ? 'Đang lưu…' : 'Lưu nhận xét'}</button>
            </div>
          </>
        : row.monitor_note && <div className="detail-box">
            <strong>Nhận xét của cán sự thư viện</strong><p>{row.monitor_note}</p></div>}
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

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow">TUẦN {row.week_no}</span><h2>{row.full_name}</h2>
          <p className="muted-text">{row.book_title || 'Chưa cập nhật tên sách'}</p></div>
        <button className="icon-button" onClick={onClose}>✕</button>
      </div>
      <label>Ngày chia sẻ thực tế</label>
      <input type="date" value={sharedOn} onChange={(e) => setSharedOn(e.target.value)} />
      <label>Đánh giá</label>
      <RatingStars value={rating} onChange={setRating} />
      <label>Nhận xét</label>
      <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Em trình bày tự tin, phần liên hệ bản thân rất tốt…" />
      {msg && <div className="form-error">{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Huỷ</button>
        <button className="button primary" disabled={busy} onClick={save}>
          {busy ? 'Đang lưu…' : 'Lưu đánh giá'}</button>
      </div>
    </div>
  </div>
}
