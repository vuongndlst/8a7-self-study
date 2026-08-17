import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BookShareResults, BookShareUpcoming, BookSharePanel } from '../components/BookShare'

// DASHBOARD CHIA SẺ SÁCH — đứng riêng, không lồng vào dashboard tự học.
//
// Hai hoạt động này khác nhau về nhịp (tự học là hằng ngày, chia sẻ sách là hằng
// tuần), khác người theo dõi (cán sự thư viện chỉ quan tâm phần sách), và khác
// vòng đời. Gộp chung một trang thì thanh tab phình ra và hộp việc cần xử lý lẫn
// hai loại việc không liên quan.
export default function BooksPage() {
  const { context, assistant, isStaff } = useAuth()
  const [tab, setTab] = useState('results')
  const [roster, setRoster] = useState([])

  useEffect(() => {
    if (!isStaff || !context.classId) return
    supabase.from('enrollments')
      .select('mshs, students!inner(mshs, full_name)')
      .eq('class_id', context.classId).eq('is_active', true)
      .then(({ data }) => setRoster((data ?? []).map((e) => e.students)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'vi'))))
  }, [isStaff, context.classId])

  if (!context.classId) return <div className="page narrow-page">
    <div className="empty-state"><p>Bạn chưa thuộc lớp nào của năm học hiện tại.</p></div>
  </div>

  if (!context.bookShare) return <div className="page narrow-page">
    <section className="page-heading">
      <span className="eyebrow"><BookOpen size={13} /> CHIA SẺ SÁCH</span>
      <h1>Lớp {context.className} chưa bật hoạt động này</h1>
    </section>
    <div className="empty-state">
      <p>Hoạt động chia sẻ sách do quản trị viên bật cho từng lớp.
         Thầy cô chủ nhiệm cần bật thì liên hệ quản trị viên nhé.</p>
    </div>
  </div>

  const canMonitor = isStaff || !!assistant?.can_review_books

  return <div className="page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow"><BookOpen size={13} /> CHIA SẺ SÁCH</span>
        <h1>Chia sẻ sách {context.className}</h1>
        <p>{isStaff
          ? 'Xếp lịch, theo dõi tiến độ nộp bài và đánh giá phần trình bày của học sinh.'
          : 'Đọc lại những cuốn sách các bạn trong lớp đã giới thiệu.'}
          {context.yearName ? ` Năm học ${context.yearName}.` : ''}</p>
      </div>
    </section>

    {/* Cán sự thư viện và giáo viên cần thấy lịch LIÊN TỤC, không chỉ lúc hệ
        thống bắn thông báo — nên dải này đứng trên cùng, trước cả thanh tab. */}
    {canMonitor && <BookShareUpcoming classId={context.classId} weeks={4} />}

    {isStaff && <div className="segmented view-switch">
      <button type="button" className={tab === 'results' ? 'active' : ''} onClick={() => setTab('results')}>Kết quả chia sẻ</button>
      <button type="button" className={tab === 'manage' ? 'active' : ''} onClick={() => setTab('manage')}>Xếp lịch &amp; chấm</button>
    </div>}

    {(!isStaff || tab === 'results')
      && <BookShareResults classId={context.classId} canMonitor={canMonitor} />}
    {isStaff && tab === 'manage'
      && <BookSharePanel classId={context.classId} className={context.className} roster={roster} />}
  </div>
}
