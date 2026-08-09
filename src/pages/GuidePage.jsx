import { AlertTriangle, CalendarCheck2, CheckCircle2, FileCheck2, KeyRound, Laptop, LockKeyhole, UploadCloud, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function GuidePage() {
  return <div className="page narrow-page guide-page">
    <section className="page-heading centered-heading">
      <span className="pill-label">HƯỚNG DẪN HỌC SINH</span>
      <h1>4 bước để sử dụng hệ thống</h1>
      <p>Đọc một lần trước khi đăng ký tài khoản. Sau đó mỗi tuần chỉ cần khoảng một phút để lập kế hoạch.</p>
      <div className="hero-actions centered-actions"><Link className="button primary" to="/register">Tạo tài khoản lần đầu</Link><Link className="button ghost" to="/login">Đăng nhập</Link></div>
    </section>

    <div className="guide-list modern-guide">
      <article className="guide-step"><span className="step-number">1</span><div><h3><UserPlus size={20}/> Tạo tài khoản một lần</h3><p>Nhập <strong>đúng họ và tên có dấu</strong> và <strong>đúng MSHS 7 chữ số</strong> theo danh sách lớp. Sau đó tự đặt mật khẩu riêng.</p><div className="guide-tip"><LockKeyhole size={16}/> Mỗi MSHS chỉ tạo được một tài khoản.</div></div></article>
      <article className="guide-step"><span className="step-number">2</span><div><h3><KeyRound size={20}/> Ghi nhớ mật khẩu</h3><p>Mật khẩu cần tối thiểu <strong>10 ký tự</strong>, có chữ hoa, chữ thường và số; không có khoảng trắng và không chứa MSHS.</p><div className="guide-tip">Ví dụ cấu trúc: <strong>HocTap2026Ab</strong> — hãy tự tạo mật khẩu khác, không dùng ví dụ này.</div></div></article>
      <article className="guide-step"><span className="step-number">3</span><div><h3><CalendarCheck2 size={20}/> Đăng ký trước giờ tự học</h3><p>Chọn <strong>ngày + tiết 1–9</strong>, nội dung, nhiệm vụ, ưu tiên và mục tiêu. Nên lập kế hoạch trước tối thiểu 1–2 ngày.</p><div className="guide-tip"><Laptop size={16}/> Nếu dùng thiết bị điện tử, ghi rõ mục đích và đăng ký trước ít nhất 1 ngày.</div></div></article>
      <article className="guide-step"><span className="step-number">4</span><div><h3><UploadCloud size={20}/> Cập nhật sau giờ tự học</h3><p>Chọn Hoàn thành / Một phần / Chưa hoàn thành, ghi điều cần hỗ trợ nếu có và nộp minh chứng tùy chọn.</p><div className="guide-tip"><FileCheck2 size={16}/> Minh chứng: JPG, PNG, PDF hoặc link Canva/Google Docs/website; tối đa 3 mục cho một kế hoạch.</div></div></article>
    </div>

    <section className="guide-rules card">
      <h2>Trước · Trong · Sau giờ tự học</h2>
      <div className="three-rule-grid"><div><span>TRƯỚC</span><strong>Lên kế hoạch</strong><p>Ưu tiên nhiệm vụ theo thời hạn, đăng ký thiết bị nếu cần.</p></div><div><span>TRONG</span><strong>Học theo kế hoạch</strong><p>Ổn định đúng giờ và tập trung vào mục tiêu đã đặt.</p></div><div><span>SAU</span><strong>Nhìn lại</strong><p>Cập nhật kết quả và điều mình cần hỗ trợ.</p></div></div>
    </section>

    <div className="notice warning"><AlertTriangle/><div><strong>Lưu ý quan trọng</strong><p>Không dùng tên, MSHS hoặc tài khoản của bạn khác. Quên mật khẩu thì báo giáo viên chủ nhiệm để nhận <strong>mật khẩu tạm</strong>; ngay lần đăng nhập kế tiếp em sẽ được yêu cầu tự đặt mật khẩu riêng. Không tạo tài khoản lần hai.</p></div></div>
  </div>
}
