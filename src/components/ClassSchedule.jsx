import { useEffect, useState } from 'react'
import { CalendarClock, Clock, Lock, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayISO } from '../utils/date'
import { ExemptionPanel } from './Attendance'

const WEEKDAYS = [
  [1, 'Thứ Hai'], [2, 'Thứ Ba'], [3, 'Thứ Tư'], [4, 'Thứ Năm'],
  [5, 'Thứ Sáu'], [6, 'Thứ Bảy'], [7, 'Chủ nhật'],
]
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

// Thứ trong tuần theo chuẩn ISO (1 = Thứ Hai) cho một ngày yyyy-mm-dd.
export const isoWeekday = (iso) => {
  const d = new Date(iso + 'T00:00:00Z').getUTCDay()   // 0 = CN
  return d === 0 ? 7 : d
}

const key = (w, p) => `${w}-${p}`

// Tab "Lịch tự học": khai báo các tiết lớp được phân giờ tự học hằng tuần.
export function ClassScheduleSettings({ classId, className }) {
  const [slots, setSlots] = useState(new Set())
  const [saving, setSaving] = useState('')
  const [msg, setMsg] = useState('')
  const [allowLate, setAllowLate] = useState(true)
  const [savingLate, setSavingLate] = useState(false)

  const loadSlots = async () => {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('class_schedule').select('weekday,period').eq('class_id', classId),
      supabase.from('classes').select('allow_late_registration').eq('id', classId).maybeSingle(),
    ])
    setSlots(new Set((data ?? []).map((r) => key(r.weekday, r.period))))
    setAllowLate(c?.allow_late_registration ?? true)
  }
  useEffect(() => { if (classId) loadSlots() }, [classId])

  const toggleLate = async (next) => {
    setSavingLate(true); setMsg('')
    const { error } = await supabase.from('classes').update({ allow_late_registration: next }).eq('id', classId)
    setSavingLate(false)
    if (error) return setMsg('Không lưu được cài đặt: ' + error.message)
    setAllowLate(next)
    setMsg(next
      ? '✓ Đã cho phép đăng ký trễ. Học sinh vẫn có thể đăng ký trong ngày tự học.'
      : '✓ Đã khóa đăng ký trễ. Học sinh cần đăng ký trước khi hết ngày hôm trước.')
  }

  const toggle = async (w, p) => {
    const k = key(w, p)
    setSaving(k); setMsg('')
    if (slots.has(k)) {
      const { error } = await supabase.from('class_schedule').delete().eq('class_id', classId).eq('weekday', w).eq('period', p)
      if (error) setMsg('Không bỏ được tiết này: ' + error.message)
      else setSlots((prev) => { const n = new Set(prev); n.delete(k); return n })
    } else {
      const { error } = await supabase.from('class_schedule').insert({ class_id: classId, weekday: w, period: p })
      if (error) setMsg('Không thêm được tiết này: ' + error.message)
      else setSlots((prev) => new Set(prev).add(k))
    }
    setSaving('')
  }

  const total = slots.size
  const byDay = WEEKDAYS.map(([w, label]) => [label, PERIODS.filter((p) => slots.has(key(w, p)))])
    .filter(([, ps]) => ps.length)
  // Cặp tiết liền nhau — chỗ duy nhất học sinh đăng ký được nhiệm vụ kéo dài 2 tiết.
  const pairs = byDay.flatMap(([label, ps]) =>
    ps.filter((p) => ps.includes(p + 1)).map((p) => `${label} tiết ${p}–${p + 1}`))

  return <>
  <section className="card sched-card">
    <div className="section-title"><div>
      <h2><Clock size={19} /> Hạn đăng ký của lớp {className}</h2>
      <p>Mốc chốt là <strong>24:00 của ngày hôm trước</strong> (0:00 của ngày tự học).
         Cài đặt dưới đây quyết định học sinh còn được đăng ký sau mốc đó hay không.</p>
    </div></div>

    <div className="toggle-row">
      <label className="switch">
        <input type="checkbox" checked={allowLate} disabled={savingLate}
               onChange={(e) => toggleLate(e.target.checked)} /><span />
      </label>
      <div>
        <strong>Cho phép đăng ký trễ</strong>
        <small>{allowLate
          ? 'Đang bật — học sinh vẫn đăng ký được trong ngày tự học, nhưng kế hoạch sẽ được đánh dấu “Trễ”.'
          : 'Đang tắt — sau 24:00 của ngày hôm trước, học sinh chỉ đăng ký được cho ngày mai trở đi.'}</small>
      </div>
    </div>

    <div className={`notice compact ${allowLate ? '' : 'warning'}`}>
      {allowLate ? <Clock size={16} /> : <Lock size={16} />}<span>
        {allowLate
          ? 'Thầy cô có thể giữ cài đặt này trong vài tuần đầu để các em quen nếp, rồi tắt khi cần.'
          : 'Cài đặt đã được áp dụng cho cả giao diện và dữ liệu đăng ký.'}
      </span></div>

    {msg && <div className={msg.startsWith('✓') ? 'notice compact' : 'form-error'}>{msg}</div>}
  </section>

  <section className="card sched-card">
    <div className="section-title"><div>
      <h2><CalendarClock size={19} /> Lịch tự học cố định của lớp {className}</h2>
      <p>Tick những tiết lớp được phân giờ tự học hằng tuần. Học sinh chỉ đăng ký được đúng các tiết này,
         và tab <strong>HS chưa đăng ký</strong> cũng dựa vào đây để biết em nào thiếu tiết nào.</p>
    </div></div>

    <div className="table-wrap"><table className="sched-table">
      <thead><tr><th>Thứ</th>{PERIODS.map((p) => <th key={p}>Tiết {p}</th>)}</tr></thead>
      <tbody>{WEEKDAYS.map(([w, label]) => <tr key={w}>
        <td><strong>{label}</strong></td>
        {PERIODS.map((p) => <td key={p} className="pick">
          <input type="checkbox" checked={slots.has(key(w, p))} disabled={saving === key(w, p)}
                 onChange={() => toggle(w, p)} aria-label={`${label} tiết ${p}`} />
        </td>)}
      </tr>)}</tbody>
    </table></div>

    {total === 0
      ? <div className="notice warning compact"><CalendarClock size={16} /><span>
          Lớp chưa khai lịch. Khi chưa khai, học sinh được chọn cả 9 tiết và phần kiểm tra chỉ xét
          “em này có kế hoạch nào trong ngày không”, thay vì xét theo từng tiết.
        </span></div>
      : <>
          <p className="muted-text small">Đã khai <strong>{total} tiết</strong>/tuần: {byDay.map(([d, ps]) => `${d} (tiết ${ps.join(', ')})`).join(' · ')}</p>
          {pairs.length > 0 && <p className="muted-text small">
            Có <strong>{pairs.length} cặp tiết liền nhau</strong> ({pairs.join(' · ')}) — ở những cặp này học sinh
            được đăng ký <strong>một nhiệm vụ cho cả hai tiết</strong>.
          </p>}
        </>}
  </section>
  </>
}

// Tab "HS chưa đăng ký": ai chưa có kế hoạch cho ngày được chọn.
export function MissingRegistrations({ classId, roster }) {
  const [date, setDate] = useState(todayISO())
  const [missing, setMissing] = useState([])
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const [hasSchedule, setHasSchedule] = useState(true)

  const check = async (d = date) => {
    setChecking(true); setMsg('')
    const { data, error } = await supabase.rpc('missing_registrations', { p_class: classId, p_date: d })
    setChecking(false)
    if (error) { setMsg('Không kiểm tra được: ' + error.message); return }
    setMissing(data ?? [])
  }

  useEffect(() => {
    if (!classId) return
    check(todayISO())
    supabase.from('class_schedule').select('period').eq('class_id', classId)
      .then(({ data }) => setHasSchedule((data ?? []).length > 0))
  }, [classId])

  const dayName = WEEKDAYS.find(([n]) => n === isoWeekday(date))?.[1] ?? ''
  // Gộp theo học sinh để không lặp tên khi lớp có nhiều tiết trong ngày.
  const byStudent = missing.reduce((acc, r) => {
    (acc[r.student_id] ||= { name: r.full_name, mshs: r.mshs, periods: [] })
    if (r.period != null) acc[r.student_id].periods.push(r.period)
    return acc
  }, {})
  const list = Object.values(byStudent).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  const copyNames = async () => {
    try { await navigator.clipboard.writeText(list.map((s) => s.name).join(', ')); setMsg('✓ Đã chép danh sách tên.') }
    catch { setMsg('Trình duyệt không cho chép tự động.') }
  }

  return <section className="card sched-card">
    <div className="section-title"><div>
      <h2><UserX size={19} /> Học sinh chưa đăng ký</h2>
      <p>Chọn ngày để xem những em chưa có kế hoạch tự học.</p>
    </div></div>

    <div className="check-row">
      <input type="date" value={date} onChange={(e) => { setDate(e.target.value); check(e.target.value) }} />
      <button className="button ghost" onClick={() => { setDate(todayISO()); check(todayISO()) }}>Hôm nay</button>
      <button className="button ghost" onClick={() => {
        const d = new Date(todayISO() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)
        const iso = d.toISOString().slice(0, 10); setDate(iso); check(iso)
      }}>Ngày mai</button>
      <span className="muted-text">{dayName}</span>
      {list.length > 0 && <button className="button ghost" onClick={copyNames}>Chép danh sách</button>}
    </div>

    {!hasSchedule && <p className="muted-text small">
      Lớp chưa khai lịch tự học cố định — đang xét theo “có kế hoạch nào trong ngày không”.
      Sang tab <strong>Lịch tự học</strong> để khai cho chính xác theo từng tiết.
    </p>}
    {msg && <div className={msg.startsWith('✓') ? 'notice compact' : 'form-error'}>{msg}</div>}

    {/* Nút miễn đặt NGAY TRONG tab này, cùng chỗ với danh sách em đang bị gắn
        cờ thiếu — thấy vấn đề ở đâu thì xử lý luôn ở đó. */}
    <ExemptionPanel classId={classId} roster={roster} date={date} onChanged={() => check(date)} />

    {checking ? <div className="empty-state">Đang kiểm tra…</div>
      : list.length === 0
        ? <div className="empty-state"><p>✓ Tất cả học sinh đã có kế hoạch cho ngày này.</p></div>
        : <>
            <div className="notice warning"><UserX size={17} /><span>
              <strong>{list.length} học sinh</strong> chưa đăng ký kế hoạch cho {dayName}, ngày {date.split('-').reverse().join('/')}.
            </span></div>
            <div className="missing-grid">{list.map((s) => <div key={s.mshs} className="missing-chip">
              <strong>{s.name}</strong><small>{s.mshs}{s.periods.length ? ` · thiếu tiết ${s.periods.sort((a, b) => a - b).join(', ')}` : ''}</small>
            </div>)}</div>
          </>}
  </section>
}
