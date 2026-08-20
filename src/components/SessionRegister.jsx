import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, ClipboardList, Laptop, Layers, Lock, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { isLateRegistration, todayISO } from '../utils/date'
import { isoWeekday } from './ClassSchedule'

const SUBJECTS = ['Toán', 'Ngữ văn', 'Tiếng Anh', 'Khoa học tự nhiên', 'Lịch sử & Địa lý',
  'GDCD', 'Tin học', 'Công nghệ', 'Nghệ thuật', 'Giáo dục thể chất', 'Khác']
const ACTIVITIES = ['Bài tập cá nhân', 'Ôn tập', 'Công việc nhóm', 'Đọc sách', 'Chuẩn bị nội dung chia sẻ', 'Khác']
const PRIORITIES = ['Cao', 'Trung bình', 'Thấp']
const WEEKDAY_LABEL = ['', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

const emptyTask = () => ({
  key: crypto.randomUUID(),
  subject: 'Toán', subject_other: '', activity_type: 'Bài tập cá nhân',
  task: '', goal: '', priority: 'Trung bình',
  use_device: false, device_purpose: '',
  span: 1,                        // 1 tiết, hoặc 2 khi tiết sau cũng là giờ tự học
})

// Ngày mai theo giờ Việt Nam — mốc sớm nhất khi lớp đã khóa đăng ký trễ.
const tomorrowISO = () => {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${WEEKDAY_LABEL[isoWeekday(iso)]}, ${d}/${m}/${y}`
}

// Đăng ký MỘT buổi tự học với MỘT HOẶC NHIỀU nhiệm vụ.
export default function SessionRegister({ onDone, onCancel }) {
  const { profile, context } = useAuth()
  const [date, setDate] = useState('')
  const [period, setPeriod] = useState(null)
  const [tasks, setTasks] = useState([emptyTask()])
  const [schedule, setSchedule] = useState([])
  const [existing, setExisting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [allowLate, setAllowLate] = useState(true)

  useEffect(() => {
    if (!context.classId) return
    supabase.from('class_schedule').select('weekday,period').eq('class_id', context.classId)
      .then(({ data }) => setSchedule(data ?? []))
    supabase.from('classes').select('allow_late_registration').eq('id', context.classId).maybeSingle()
      .then(({ data }) => setAllowLate(data?.allow_late_registration ?? true))
  }, [context.classId])

  // Lớp đã khóa đăng ký trễ thì hôm nay không chọn được nữa: mốc chốt là
  // 24:00 của ngày hôm trước, tức 0:00 của ngày tự học.
  const minDate = allowLate ? todayISO() : tomorrowISO()
  useEffect(() => { if (date && date < minDate) setDate('') }, [minDate])

  // Tiết được phép của ngày đang chọn. Lớp chưa khai lịch thì mở cả 9 tiết.
  const allowedPeriods = useMemo(() => {
    if (!date || schedule.length === 0) return [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const wd = isoWeekday(date)
    return schedule.filter((s) => s.weekday === wd).map((s) => s.period).sort((a, b) => a - b)
  }, [date, schedule])

  const hasSchedule = schedule.length > 0

  // Buổi này em đã đăng ký chưa? Nếu rồi thì thêm nhiệm vụ vào buổi đang có.
  useEffect(() => {
    setExisting(null)
    if (!date || !period || !profile?.id) return
    // Phải lọc theo chính em: trợ giảng đọc được buổi của cả lớp, không lọc
    // thì nhiệm vụ mới có thể bị gắn nhầm vào buổi của bạn khác.
    supabase.from('self_study_sessions').select('id')
      .eq('student_id', profile.id).eq('study_date', date).eq('period', period)
      .maybeSingle().then(({ data }) => setExisting(data ?? null))
  }, [date, period, profile?.id])

  useEffect(() => { if (period && !allowedPeriods.includes(period)) setPeriod(null) }, [allowedPeriods])

  // Tiết liền sau cũng là giờ tự học → mới cho phép một nhiệm vụ kéo dài 2 tiết.
  const canSpan = period != null && period < 9 && allowedPeriods.includes(period + 1)
  useEffect(() => { if (!canSpan) setTasks((prev) => prev.map((t) => (t.span === 2 ? { ...t, span: 1 } : t))) }, [canSpan])

  // Dùng chung phép tính với registrationStatus() để cảnh báo trước khi gửi
  // luôn khớp với nhãn trong thống kê.
  const isLate = isLateRegistration(date)

  const setTask = (key, patch) => setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)))
  const addTask = () => setTasks((prev) => [...prev, emptyTask()])
  const removeTask = (key) => setTasks((prev) => prev.filter((t) => t.key !== key))

  // Hai nhiệm vụ cùng môn và nội dung gần giống nhau — nhắc nhẹ, không chặn.
  const duplicateHint = useMemo(() => {
    const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ')
    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        if (tasks[i].subject === tasks[j].subject && norm(tasks[i].task) && norm(tasks[i].task) === norm(tasks[j].task)) return true
      }
    }
    return false
  }, [tasks])

  const validate = () => {
    if (!date) return 'Hãy chọn ngày tự học.'
    if (!period) return 'Hãy chọn tiết tự học.'
    for (const [i, t] of tasks.entries()) {
      const n = i + 1
      if (t.subject === 'Khác' && !t.subject_other.trim()) return `Nhiệm vụ ${n}: hãy ghi rõ môn/hoạt động.`
      if (t.task.trim().length < 2) return `Nhiệm vụ ${n}: hãy ghi nhiệm vụ cụ thể.`
      if (t.goal.trim().length < 2) return `Nhiệm vụ ${n}: hãy ghi mục tiêu.`
      if (t.use_device && !t.device_purpose.trim()) return `Nhiệm vụ ${n}: hãy ghi rõ mục đích dùng thiết bị.`
    }
    return ''
  }

  const submit = async () => {
    const err = validate()
    if (err) { setError(err); setConfirming(false); return }
    setBusy(true); setError('')

    let sessionId = existing?.id
    if (!sessionId) {
      const { data, error: e } = await supabase.from('self_study_sessions')
        .insert({ student_id: profile.id, class_id: context.classId, study_date: date, period })
        .select('id').maybeSingle()
      if (e) {
        // Có thể vừa được tạo ở tab khác — đọc lại.
        const { data: again } = await supabase.from('self_study_sessions')
          .select('id').eq('student_id', profile.id).eq('study_date', date).eq('period', period).maybeSingle()
        sessionId = again?.id
        if (!sessionId) { setBusy(false); setConfirming(false); return setError('Không tạo được buổi tự học. ' + (e.message || '')) }
      } else sessionId = data.id
    }

    const rows = tasks.map((t) => ({
      session_id: sessionId,
      student_id: profile.id,
      study_date: date, period,
      activity_type: t.activity_type,
      subject: t.subject,
      subject_other: t.subject === 'Khác' ? t.subject_other.trim() : null,
      task: t.task.trim(), goal: t.goal.trim(), priority: t.priority,
      span: canSpan ? t.span : 1,
      use_device: t.use_device,
      device_purpose: t.use_device ? t.device_purpose.trim() : null,
      device_status: t.use_device ? 'Chờ duyệt' : 'Không dùng',
    }))
    const { error: e2 } = await supabase.from('plans').insert(rows)
    setBusy(false); setConfirming(false)
    if (e2) return setError('Không lưu được nhiệm vụ. ' + (e2.message || ''))
    onDone()
  }

  return <div className="card register-card">
    <div className="section-title"><div>
      <h2><CalendarDays size={20} /> Đăng ký buổi tự học</h2>
      <p>Chọn ngày và tiết, rồi ghi những nhiệm vụ em dự định làm trong buổi đó.</p>
    </div></div>

    {/* Bước 1 — ngày */}
    <div className="reg-step">
      <span className="reg-num">1</span>
      <div>
        <label>Ngày tự học</label>
        <input type="date" value={date} min={minDate} onChange={(e) => setDate(e.target.value)} />
        {date && <p className="muted-text small">{fmtDate(date)}</p>}
        {!allowLate && <div className="notice compact"><Lock size={16} /><span>
          Lớp mình chốt đăng ký vào <strong>24:00 của ngày hôm trước</strong>. Hôm nay đã hết hạn,
          nên em chỉ có thể chọn từ <strong>ngày mai</strong> trở đi.
        </span></div>}
        {allowLate && isLate && <div className="notice warning compact"><AlertTriangle size={16} /><span>
          Em đang đăng ký sau <strong>24:00 của ngày hôm trước</strong>. Hệ thống vẫn nhận kế hoạch
          này nhưng sẽ đánh dấu <strong>Trễ</strong>. Lần sau em nhớ đăng ký sớm hơn nhé.
        </span></div>}
      </div>
    </div>

    {/* Bước 2 — tiết */}
    <div className="reg-step">
      <span className="reg-num">2</span>
      <div>
        <label>Tiết tự học</label>
        {!date ? <p className="muted-text small">Chọn ngày trước đã.</p>
          : allowedPeriods.length === 0
            ? <div className="notice warning compact"><AlertTriangle size={16} /><span>
                {WEEKDAY_LABEL[isoWeekday(date)]} lớp mình không có giờ tự học. Em chọn ngày khác nhé.
              </span></div>
            : <>
                <div className="period-grid">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                    const ok = allowedPeriods.includes(n)
                    return <button key={n} type="button" disabled={!ok}
                      className={`period-cell ${period === n ? 'on' : ''} ${ok ? '' : 'off'}`}
                      onClick={() => setPeriod(n)} aria-pressed={period === n}>{n}</button>
                  })}
                </div>
                {hasSchedule && <p className="muted-text small">Chỉ hiện những tiết lớp mình được phân giờ tự học.</p>}
                {canSpan && <div className="notice compact"><Layers size={16} /><span>
                  Tiết {period} và tiết {period + 1} là <strong>hai tiết liền nhau</strong>. Nếu có nhiệm vụ lớn,
                  em tick ô <em>“Làm suốt 2 tiết”</em> ở khối nhiệm vụ bên dưới.
                </span></div>}
                {existing && <div className="notice compact"><ClipboardList size={16} /><span>
                  Em đã có buổi tự học ngày này tiết {period}. Nhiệm vụ mới sẽ được <strong>thêm vào buổi đó</strong>.
                </span></div>}
              </>}
      </div>
    </div>

    {/* Bước 3 — nhiệm vụ */}
    <div className="reg-step">
      <span className="reg-num">3</span>
      <div className="reg-tasks">
        <label>Em dự định làm gì?</label>
        <p className="muted-text small">Chỉ đăng ký những nhiệm vụ em thực sự dự định làm trong buổi này.</p>

        {tasks.map((t, i) => <div key={t.key} className="task-block">
          <div className="task-block-head">
            <strong>Nhiệm vụ {i + 1}{t.span === 2 ? ` · tiết ${period}–${period + 1}` : ''}</strong>
            {tasks.length > 1 && <button type="button" className="icon-button danger" title="Bỏ nhiệm vụ này"
              onClick={() => removeTask(t.key)}><Trash2 size={15} /></button>}
          </div>

          {canSpan && <div className="toggle-row compact span-row">
            <label className="switch"><input type="checkbox" checked={t.span === 2}
              onChange={(e) => setTask(t.key, { span: e.target.checked ? 2 : 1 })} /><span /></label>
            <div><strong><Layers size={15} /> Làm suốt 2 tiết (tiết {period} và {period + 1})</strong>
              <small>Dùng cho nhiệm vụ lớn không làm xong trong một tiết. Em chỉ ghi và cập nhật kết quả một lần.</small></div>
          </div>}

          <div className="form-grid two">
            <div>
              <label>Môn / hoạt động *</label>
              <select value={t.subject} onChange={(e) => setTask(t.key, { subject: e.target.value })}>
                {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
              </select>
              {t.subject === 'Khác' && <input maxLength={100} value={t.subject_other} placeholder="Ghi rõ môn / hoạt động"
                onChange={(e) => setTask(t.key, { subject_other: e.target.value })} />}
            </div>
            <div>
              <label>Loại hoạt động</label>
              <select value={t.activity_type} onChange={(e) => setTask(t.key, { activity_type: e.target.value })}>
                {ACTIVITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <label>Nhiệm vụ cụ thể *</label>
          <textarea rows="2" maxLength={1000} value={t.task} placeholder="Ví dụ: Hoàn thành bài 5–10 trang 24."
            onChange={(e) => setTask(t.key, { task: e.target.value })} />

          <label>Mục tiêu cuối tiết *</label>
          <textarea rows="2" maxLength={1000} value={t.goal} placeholder="Ví dụ: Làm đủ 6 bài và tự kiểm tra lại đáp án."
            onChange={(e) => setTask(t.key, { goal: e.target.value })} />

          <div className="form-grid two">
            <div>
              <label>Mức ưu tiên</label>
              <select value={t.priority} onChange={(e) => setTask(t.key, { priority: e.target.value })}>
                {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="toggle-row compact">
              <label className="switch"><input type="checkbox" checked={t.use_device}
                onChange={(e) => setTask(t.key, { use_device: e.target.checked })} /><span /></label>
              <div><strong><Laptop size={15} /> Dùng thiết bị điện tử</strong>
                <small>Phải chờ giáo viên duyệt.</small></div>
            </div>
          </div>
          {t.use_device && <input maxLength={500} value={t.device_purpose} placeholder="Mục đích sử dụng thiết bị *"
            onChange={(e) => setTask(t.key, { device_purpose: e.target.value })} />}
        </div>)}

        <button type="button" className="button ghost full" onClick={addTask}><Plus size={17} /> Thêm nhiệm vụ</button>

        {tasks.length >= 5 && <div className="notice warning compact"><AlertTriangle size={16} /><span>
          Em đang đăng ký khá nhiều nhiệm vụ trong một buổi. Hãy kiểm tra lại xem thời gian của tiết tự học có đủ không nhé.
        </span></div>}
        {duplicateHint && <div className="notice compact"><AlertTriangle size={16} /><span>
          Có hai nhiệm vụ trông khá giống nhau. Em có muốn gộp lại không?
        </span></div>}
      </div>
    </div>

    {error && <div className="form-error">{error}</div>}

    <div className="form-actions spread">
      <button type="button" className="button ghost" onClick={onCancel}>Hủy</button>
      <button type="button" className="button primary" disabled={busy}
        onClick={() => { const e = validate(); if (e) setError(e); else { setError(''); setConfirming(true) } }}>
        Xem lại và đăng ký
      </button>
    </div>

    {/* Bản tóm tắt trước khi gửi */}
    {confirming && <div className="modal-backdrop" onMouseDown={() => setConfirming(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">XEM LẠI TRƯỚC KHI ĐĂNG KÝ</span>
          <h2>Kế hoạch của em</h2></div>
          <button className="icon-button" onClick={() => setConfirming(false)}>✕</button></div>

        <div className="detail-box">
          <strong>Ngày</strong><p>{fmtDate(date)}</p>
          <strong>Tiết</strong><p>Tiết {period}</p>
          <strong>{tasks.length} nhiệm vụ</strong>
          <ol className="summary-tasks">{tasks.map((t) => <li key={t.key}>
            <strong>{t.subject === 'Khác' ? t.subject_other : t.subject}</strong> — {t.task}
            {canSpan && t.span === 2 && <em> · ⏱ suốt tiết {period}–{period + 1}</em>}
            {t.use_device && <em> · 💻 {t.device_purpose}</em>}
          </li>)}</ol>
        </div>

        {tasks.some((t) => t.use_device) && <div className="notice compact"><Laptop size={16} /><span>
          Nhiệm vụ có dùng thiết bị sẽ ở trạng thái <strong>chờ giáo viên duyệt</strong>.
        </span></div>}

        <div className="form-actions">
          <button className="button ghost" onClick={() => setConfirming(false)}>Điều chỉnh</button>
          <button className="button primary" onClick={submit} disabled={busy}>
            <Check size={17} />{busy ? 'Đang lưu…' : 'Đăng ký kế hoạch'}
          </button>
        </div>
      </div>
    </div>}
  </div>
}
