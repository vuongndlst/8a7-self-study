import { BookOpen } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { BookShareBoard } from '../components/BookShare'

// Bảng chia sẻ sách của cả lớp — ai trong lớp cũng vào xem được bất cứ lúc nào,
// không phải chỉ đúng tuần của mình. Đây là chỗ để các em xem lại bạn đã giới
// thiệu sách gì suốt cả năm.
//
// "Công khai" ở đây nghĩa là công khai TRONG LỚP, không phải công khai với
// Internet: trang vẫn yêu cầu đăng nhập và RLS vẫn chặn người ngoài lớp. Bài làm
// của học sinh chưa thành niên không nên để ai có link cũng đọc được.
export default function BooksPage() {
  const { context, assistant, isStaff } = useAuth()

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

  return <div className="page">
    <BookShareBoard
      classId={context.classId}
      className={context.className}
      canMonitor={isStaff || !!assistant?.can_review_books}
    />
  </div>
}
