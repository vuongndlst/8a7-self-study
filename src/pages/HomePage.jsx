import { ArrowRight, BookOpenCheck, CalendarDays, CheckCircle2, FileUp, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const BRAND_MARK = import.meta.env.VITE_BRAND_MARK || '8A7'

export default function HomePage() {
  const { profile } = useAuth()
  const destination = profile?.role === 'teacher' ? '/teacher' : profile?.role === 'student' ? '/student' : '/login'
  return <div className="page home-page">
    <section className="hero hero-polished">
      <div className="hero-copy">
        <span className="pill-label"><Sparkles size={14}/> LỚP {BRAND_MARK} · GIỜ TỰ HỌC</span>
        <h1>Lập kế hoạch rõ ràng.<br/><span>Tự học có mục tiêu.</span></h1>
        <p>Một không gian đơn giản để học sinh đăng ký kế hoạch, thực hiện nhiệm vụ và nhìn lại kết quả sau mỗi giờ tự học.</p>
        <div className="hero-actions"><Link className="button primary large" to={destination}>Bắt đầu <ArrowRight size={18}/></Link><Link className="button ghost large" to="/guide">Xem hướng dẫn</Link></div>
        <div className="hero-trust"><span><ShieldCheck size={17}/> Tài khoản riêng</span><span><LockKeyhole size={17}/> Dữ liệu theo từng HS</span><span><FileUp size={17}/> Minh chứng tùy chọn</span></div>
      </div>
      <div className="planner-mock">
        <div className="mock-window">
          <div className="mock-top"><div className="mock-dots"><i/><i/><i/></div><span>{BRAND_MARK} Self-Study</span><small>● Online</small></div>
          <div className="mock-body">
            <div className="mock-title"><div><small>KẾ HOẠCH CỦA EM</small><h3>Tuần này</h3></div><button>+ Đăng ký</button></div>
            <div className="mock-stats"><div><strong>3</strong><span>Tiết đã đăng ký</span></div><div><strong>100%</strong><span>Đúng hạn</span></div><div><strong>2</strong><span>Đã hoàn thành</span></div></div>
            <div className="mock-plan"><div className="mock-date"><strong>12</strong><span>Thg 8</span></div><div className="mock-plan-main"><small>TOÁN · TIẾT 4</small><strong>Hoàn thành bài 5–10 trang 24</strong><div className="mock-chips"><span>Ưu tiên cao</span><span>Đúng hạn</span></div></div><CheckCircle2 size={22}/></div>
            <div className="mock-plan muted"><div className="mock-date"><strong>14</strong><span>Thg 8</span></div><div className="mock-plan-main"><small>TIẾNG ANH · TIẾT 6</small><strong>Ôn vocabulary Unit 2</strong><div className="mock-chips"><span>Trung bình</span><span>Đã đăng ký</span></div></div><CalendarDays size={22}/></div>
          </div>
        </div>
      </div>
    </section>

    <section className="section-intro"><span className="eyebrow">PLAN · DO · REFLECT</span><h2>Một quy trình đủ gọn để dùng mỗi tuần.</h2></section>
    <section className="feature-grid polished-grid">
      <article className="feature-card"><span className="feature-number">01</span><CalendarDays/><h3>Plan</h3><p>Tự chọn ngày, tiết 1–9, nhiệm vụ, ưu tiên và mục tiêu cuối tiết.</p></article>
      <article className="feature-card"><span className="feature-number">02</span><BookOpenCheck/><h3>Do</h3><p>Thực hiện đúng kế hoạch đã đăng ký và sử dụng thiết bị đúng mục đích.</p></article>
      <article className="feature-card"><span className="feature-number">03</span><FileUp/><h3>Reflect</h3><p>Cập nhật kết quả, điều cần hỗ trợ và ảnh/PDF/link minh chứng khi cần.</p></article>
    </section>
  </div>
}
