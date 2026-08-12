import { useEffect, useState } from 'react'
import { CalendarClock, UserX } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { todayISO } from '../utils/date'

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

// Lịch tự học cố định của lớp + danh sách em chưa đăng ký cho một ngày.
export default function ClassSchedule({ classId, className }) {
  const [slots, setSlots] = useState(new Set())
  const [saving, setSaving] = useState('')
  const [date, setDate] = useState(todayISO())
  const [missing, setMissing] = useState([])
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')

  const key = (w, p) => `${w}-${p}`

  const loadSlots = async () => {
    const { data } = await supabase.from('class_schedule').select('weekday,period').eq('class_id', classId)
    setSlots(new Set((data ?? []).map((r) => key(r.weekday, r.period))))
  }

  const check = async (d = date) => {
    setChecking(true); setMsg('')
    const { data, error } = await supabase.rpc('missing_registrations', { p_class: classId, p_date: d })
    setChecking(false)
    if (error) { setMsg('Không kiểm tra được: ' + error.message); return }
    setMissing(data ?? [])
  }

  useEffect(() => { if (classId) { loadSlots(); check(todayISO()) } }, [classId])

  const toggle = async (w, p) => {
    const k = key(w, p)
    setSaving(k)
    if (slots.has(k)) {
      await supabase.from('class_schedule').delete().eq('class_id', classId).eq('weekday', w).eq('period', p)
      setSlots((prev) => { const n = new Set(prev); n.delete(k); return n })
    } else {
      await supabase.from('class_schedule').insert({ class_id: classId, weekday: w, period: p })
      setSlots((prev) => new Set(prev).add(k))
    }
    setSaving('')
    check()
  }

  const hasSchedule = slots.size > 0
  const dayName = WEEKDAYS.find(([n]) => n === isoWeekday(date))?.[1] ?? ''
  // Gộp theo học sinh để không lặp tên khi lớp có nhiều tiết trong ngày.
  const byStudent = missing.reduce((acc, r) => {
    (acc[r.student_id] ||= { name: r.full_name, mshs: r.mshs, periods: [] })
    if (r.period != null) acc[r.student_id].periods.push(r.period)
    return acc
  }, {})
  const list = Object.values(byStudent).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  return <>
    <section className="card sched-card">
      <div className="section-title"><div>
        <h2><CalendarClock size={19} /> Lịch tự học cố định của lớp {className}</h2>
        <p>Tick những tiết lớp được phân giờ tự học hằng tuần. Dùng để biết chính xác ngày nào em nào chưa đăng ký.</p>
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

      {!hasSchedule && <p className="muted-text small">
        Chưa khai lịch. Khi chưa khai, phần kiểm tra bên dưới chỉ xét “em này có kế hoạch nào trong ngày không”,
        thay vì xét theo từng tiết.
      </p>}
    </section>

    <section className="card sched-card">
      <div className="section-title"><div>
        <h2><UserX size={19} /> Ai chưa đăng ký</h2>
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
      </div>

      {msg && <div className="form-error">{msg}</div>}

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
  </>
}
