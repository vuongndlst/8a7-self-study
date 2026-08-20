import { useEffect, useState } from 'react'
import { AlertTriangle, BookOpen, CalendarPlus, ChevronDown, FileCheck2, ShieldAlert, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { todayISO } from '../utils/date'

const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '—')
const daysTo = (iso) =>
  Math.round((new Date(iso + 'T00:00:00Z') - new Date(todayISO() + 'T00:00:00Z')) / 86400000)

// Đã đóng trong phiên này thì thôi, nhưng LẦN SAU VÀO LẠI VẪN HIỆN. Việc chưa
// xong thì không được phép tắt vĩnh viễn — chỉ khi em nộp bài / đăng ký xong
// thì popup mới thực sự biến mất.
const dismissKey = (profileId) => `selfstudy.alertsDismissed.${profileId || 'guest'}`
const dismissedThisSession = (profileId) => sessionStorage.getItem(dismissKey(profileId)) === todayISO()
const markDismissed = (profileId) => sessionStorage.setItem(dismissKey(profileId), todayISO())

export default function StudentAlerts({ onRegister, onOpenBook, onOpenReflections, reflectionReminder, reloadKey }) {
  const { profile, context } = useAuth()
  const [book, setBook] = useState(null)
  const [att, setAtt] = useState(null)
  const [closed, setClosed] = useState(false)

  useEffect(() => { setClosed(dismissedThisSession(profile?.id)) }, [profile?.id])

  useEffect(() => {
    if (profile?.role !== 'student') return
    let alive = true
    Promise.all([
      context.bookShare ? supabase.rpc('my_book_share') : Promise.resolve({ data: [] }),
      supabase.rpc('my_attendance_status'),
    ]).then(([b, a]) => {
      if (!alive) return
      setBook((b.data ?? [])[0] ?? null)
      setAtt(a.data ?? null)
    })
    return () => { alive = false }
  }, [profile?.id, context.bookShare, context.classId, reloadKey])

  if (profile?.role !== 'student' || closed) return null

  // ---- Dựng danh sách việc cần báo, xếp theo mức cấp bách ----
  const items = []

  // 1) Chưa đăng ký tự học cho HÔM NAY. Cấp bách nhất vì hết ngày là mất lượt.
  if (att?.bat && att.con_thieu_hom_nay > 0) {
    items.push({
      key: 'chua-dang-ky',
      tone: 'danger',
      icon: CalendarPlus,
      title: `Hôm nay em chưa đăng ký ${att.con_thieu_hom_nay} tiết tự học`,
      body: att.so_tiet_hom_nay > 1
        ? `Lớp có ${att.so_tiet_hom_nay} tiết tự học hôm nay và em còn thiếu ${att.con_thieu_hom_nay} tiết.`
        : 'Lớp có tiết tự học hôm nay mà em chưa đăng ký kế hoạch.',
      action: { label: 'Đăng ký ngay', onClick: onRegister },
    })
  }

  // 2) Buổi đã kết thúc mà em chưa nhìn lại kết quả. Bấm một lần là tới đúng
  // danh sách cần làm, không bắt em tự tìm giữa toàn bộ kế hoạch.
  if (reflectionReminder?.total > 0) {
    const late = reflectionReminder.overdue > 0
    items.push({
      key: 'cap-nhat-ket-qua',
      tone: late ? 'danger' : 'warn',
      icon: FileCheck2,
      title: late
        ? `Em có ${reflectionReminder.overdue} nhiệm vụ đã quá hạn cập nhật`
        : `Em có ${reflectionReminder.total} nhiệm vụ cần cập nhật kết quả`,
      body: 'Em chỉ cần ghi ngắn gọn mình đã làm được gì. Nếu có sản phẩm, hãy thêm ảnh, file hoặc liên kết làm minh chứng.',
      action: { label: 'Cập nhật ngay', onClick: onOpenReflections },
    })
  }

  // 3) Sắp tới hạn nộp bài chia sẻ sách — báo từ TRƯỚC HẠN MỘT TUẦN.
  if (book && !book.link_url && book.due_date && daysTo(book.due_date) <= 7) {
    const d = daysTo(book.due_date)
    items.push({
      key: 'chia-se-sach',
      tone: d < 0 ? 'danger' : 'warn',
      icon: BookOpen,
      title: d < 0
        ? `Em đã trễ hạn nộp bài chia sẻ sách ${-d} ngày`
        : d === 0 ? 'Hôm nay là hạn nộp bài chia sẻ sách của em'
        : `Còn ${d} ngày nữa là tới hạn nộp bài chia sẻ sách`,
      body: `Em chia sẻ trước lớp ngày ${dmy(book.report_date)}, hạn nộp nội dung và link `
            + `trình chiếu là ${dmy(book.due_date)}.`,
      action: { label: 'Nhập bài chia sẻ', onClick: onOpenBook },
    })
  }

  // 4) Mức kỷ luật đã có thẻ thường trực phía dưới, nên chỉ đưa vào popup khi
  // vẫn còn chỗ. Popup tối đa ba việc để học sinh không bị quá tải.
  if (items.length < 3 && att?.bat && att.da_quen > 0) {
    const muc = att.muc ?? {}
    items.push({
      key: 'ky-luat',
      tone: muc.bac >= 1 ? 'danger' : 'warn',
      icon: muc.bac >= 1 ? ShieldAlert : AlertTriangle,
      title: muc.bac >= 1
        ? `Mức kỷ luật hiện tại: ${muc.nhan}`
        : `Em đã quên đăng ký ${att.da_quen} lần trong học kỳ này`,
      body: muc.chi_tiet,
      rules: true,
    })
  }

  if (!items.length) return null

  const close = () => { markDismissed(profile?.id); setClosed(true) }

  return <div className="modal-backdrop" onMouseDown={close}>
    <div className="modal alert-modal" role="dialog" aria-modal="true" aria-labelledby="student-alert-title" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div>
          <span className="eyebrow">NHẮC NHỞ</span>
          <h2 id="student-alert-title">{items.length > 1 ? `Em có ${items.length} việc cần làm` : 'Em có một việc cần làm'}</h2>
        </div>
        <button className="icon-button" onClick={close} aria-label="Đóng"><X size={18} /></button>
      </div>

      {items.map((it) => {
        const Icon = it.icon
        return <div key={it.key} className={`alert-item ${it.tone}`}>
          <span className="alert-icon"><Icon size={20} /></span>
          <div>
            <strong>{it.title}</strong>
            <p>{it.body}</p>
            {it.rules && <DisciplineRules att={att} />}
            {it.action && <button className="button primary" onClick={() => { close(); it.action.onClick?.() }}>
              {it.action.label}
            </button>}
          </div>
        </div>
      })}

      <button className="button ghost full" onClick={close}>Để sau</button>
      <p className="muted-text small center">Nếu việc chưa xong, hệ thống sẽ nhắc lại vào lần đăng nhập sau.</p>
    </div>
  </div>
}

// Bảng quy định hiển thị NGAY trong popup. Học sinh phải đọc được luật ở đúng
// lúc bị nhắc, chứ không phải đi tìm trong trang hướng dẫn.
export function DisciplineRules({ att }) {
  if (!att?.bat) return null
  const free = att.quyen_mien_tru
  const n = att.da_quen
  const rows = [
    [`1–${free} lần`, 'Được miễn trừ, không có kỷ luật', n >= 1 && n <= free],
    [`Lần ${free + 1}`, 'Lao động công ích 5 lượt', n === free + 1],
    [`Lần ${free + 2}`, 'Lao động công ích 10 lượt', n === free + 2],
    [`Từ lần ${free + 3}`, 'Thầy cô trao đổi với phụ huynh', n >= free + 3],
  ]
  return <div className="rule-table">
    <span className="rule-caption">Quy định của lớp — tính từ {att.tu_ngay.split('-').reverse().join('/')}</span>
    {rows.map(([khi, hinh, dangO]) => <div key={khi} className={`rule-row ${dangO ? 'now' : ''}`}>
      <span>{khi}</span><strong>{hinh}</strong>
      {dangO && <em>em đang ở mức này</em>}
    </div>)}
  </div>
}

// ---------------------------------------------------------------------------
//  THẺ ĐIỂM DANH THƯỜNG TRỰC — em luôn biết mình còn mấy lần miễn trừ
// ---------------------------------------------------------------------------
export function MyAttendance({ reloadKey }) {
  const { profile } = useAuth()
  const [att, setAtt] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (profile?.role !== 'student') return
    supabase.rpc('my_attendance_status').then(({ data }) => setAtt(data ?? null))
  }, [profile?.id, reloadKey])

  if (!att?.bat) return null
  const muc = att.muc ?? {}
  const tone = muc.bac >= 2 ? 'danger' : muc.bac >= 1 ? 'danger' : att.da_quen > 0 ? 'warn' : 'ok'

  return <section className={`card attend-card tone-${tone}`}>
    <button type="button" className="attend-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
      <span className="attend-count"><strong>{att.da_quen}</strong><small>lần quên</small></span>
      <span className="attend-main">
        <span className="eyebrow">ĐĂNG KÝ TỰ HỌC · HỌC KỲ NÀY</span>
        <strong>{muc.nhan}</strong>
        <small>{muc.chi_tiet}</small>
      </span>
      <ChevronDown size={20} className={`chev ${open ? 'up' : ''}`} />
    </button>
    {open && <div className="attend-body"><DisciplineRules att={att} /></div>}
  </section>
}
