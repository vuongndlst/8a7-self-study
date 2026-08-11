import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, FileCheck2, KeyRound, Laptop, LockKeyhole, MessageSquare, Star, UploadCloud, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function GuidePage() {
  return <div className="page narrow-page guide-page">
    <section className="page-heading centered-heading">
      <span className="pill-label">HƯỚNG DẪN HỌC SINH</span>
      <h1>Những điều em cần biết</h1>
      <p>Đọc một lần trước khi bắt đầu. Sau đó mỗi tuần chỉ cần khoảng một phút để lập kế hoạch, và vài phút sau giờ tự học để ghi lại kết quả.</p>
      <div className="hero-actions centered-actions">
        <Link className="button primary" to="/register">Tạo tài khoản lần đầu</Link>
        <Link className="button ghost" to="/login">Đăng nhập</Link>
      </div>
    </section>

    {/* Phần quan trọng nhất đặt lên đầu: hạn cập nhật kết quả. */}
    <section className="card deadline-card">
      <div className="deadline-head"><Clock size={22} /><div>
        <span className="eyebrow">QUY TẮC QUAN TRỌNG NHẤT</span>
        <h2>Nhớ cập nhật kết quả sau giờ tự học</h2>
      </div></div>
      <p>Đăng ký kế hoạch mới là một nửa. Nửa còn lại là quay lại ghi xem em đã làm được đến đâu — đó mới là phần giúp em nhìn ra mình đang tiến bộ thế nào.</p>

      <div className="timeline-rule">
        <div><span className="step-dot ok">1</span><div>
          <strong>Ngay sau giờ tự học</strong>
          <small>Mở thẻ của tiết đó, chọn kết quả và ghi vài dòng. Chỉ mất khoảng một phút.</small>
        </div></div>
        <div><span className="step-dot warn">2</span><div>
          <strong>Sau 2 ngày mà chưa cập nhật</strong>
          <small>Tiết đó chuyển sang <em>Trễ hạn cập nhật</em> và em nhận một thông báo nhắc.</small>
        </div></div>
        <div><span className="step-dot danger">3</span><div>
          <strong>Sau 5 ngày mà vẫn chưa cập nhật</strong>
          <small>Hệ thống tự ghi nhận <strong>1 sao</strong> cho tiết đó kèm một lời nhắc.</small>
        </div></div>
      </div>

      <div className="notice"><CheckCircle2 size={18} /><span>
        Bị tự đánh giá <strong>không phải là kết thúc</strong>. Em vẫn cập nhật bổ sung được bất cứ lúc nào — hệ thống sẽ báo cho thầy cô xem lại và chấm lại.
      </span></div>

      <p className="muted-text small">
        Thời hạn được tính từ <strong>lúc kết thúc buổi tự học</strong>, không phải lúc em đăng ký.
        Nên em đăng ký trước cả tuần cũng hoàn toàn không sao.
      </p>
    </section>

    <div className="guide-list modern-guide">
      <article className="guide-step"><span className="step-number">1</span><div>
        <h3><UserPlus size={20}/> Tạo tài khoản một lần</h3>
        <p>Nhập <strong>đúng họ và tên có dấu</strong> và <strong>đúng MSHS 7 chữ số</strong> theo danh sách lớp. Sau đó tự đặt mật khẩu riêng.</p>
        <div className="guide-tip"><LockKeyhole size={16}/> Mỗi MSHS chỉ tạo được một tài khoản. Tài khoản gắn với email trường của em.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">2</span><div>
        <h3><KeyRound size={20}/> Ghi nhớ mật khẩu</h3>
        <p>Mật khẩu cần tối thiểu <strong>10 ký tự</strong>, có chữ hoa, chữ thường và số; không có khoảng trắng và không chứa MSHS.</p>
        <div className="guide-tip">Quên mật khẩu thì báo giáo viên để nhận mật khẩu tạm. Ngay lần đăng nhập kế tiếp, em sẽ được yêu cầu tự đặt lại mật khẩu riêng.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">3</span><div>
        <h3><CalendarCheck2 size={20}/> Đăng ký trước giờ tự học</h3>
        <p>Chọn <strong>ngày + tiết 1–9</strong>, nội dung, nhiệm vụ và mục tiêu. Nên lập kế hoạch trước tối thiểu <strong>1 ngày</strong> — đăng ký trong ngày sẽ bị đánh dấu <em>Trễ</em>.</p>
        <div className="guide-tip"><Laptop size={16}/> Nếu dùng thiết bị điện tử, ghi rõ mục đích. Đăng ký thiết bị <strong>phải chờ giáo viên duyệt</strong>.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">4</span><div>
        <h3><CheckCircle2 size={20}/> Chờ kế hoạch được duyệt</h3>
        <p>Sau khi đăng ký, kế hoạch ở trạng thái <strong>Chờ duyệt</strong>. Thầy cô xem rồi chuyển sang <strong>Đã duyệt</strong>, hoặc <strong>Cần điều chỉnh</strong> kèm lời nhắn nếu nhiệm vụ còn chung chung.</p>
        <div className="guide-tip">Khi em sửa lại kế hoạch bị yêu cầu điều chỉnh, nó tự quay về hàng chờ duyệt — em không cần đăng ký lại từ đầu.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">5</span><div>
        <h3><UploadCloud size={20}/> Cập nhật sau giờ tự học</h3>
        <p>Chọn Hoàn thành / Một phần / Chưa hoàn thành, ghi điều cần hỗ trợ nếu có, và nộp minh chứng nếu muốn.</p>
        <div className="guide-tip"><FileCheck2 size={16}/> Minh chứng: JPG, PNG, PDF (≤ 5 MB) hoặc link Canva/Google Docs; tối đa 3 mục cho một kế hoạch.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">6</span><div>
        <h3><Star size={20}/> Xem đánh giá và nhận xét</h3>
        <p>Thầy cô chấm <strong>1–5 sao</strong> và viết nhận xét cho tiết tự học của em.</p>
        <div className="guide-tip"><AlertTriangle size={16}/> Tiết bị <strong>1 hoặc 2 sao</strong> sẽ có viền đỏ/vàng, và em cần viết một dòng cho biết sẽ điều chỉnh thế nào ở lần sau. Đây không phải hình phạt — chỉ là cách để em dừng lại một chút và nghĩ về cách làm khác.</div>
      </div></article>
    </div>

    <section className="guide-rules card">
      <h2>Trước · Trong · Sau giờ tự học</h2>
      <div className="three-rule-grid">
        <div><span>TRƯỚC</span><strong>Lên kế hoạch</strong><p>Chọn nhiệm vụ theo thời hạn, đăng ký thiết bị nếu cần, gửi sớm để được duyệt.</p></div>
        <div><span>TRONG</span><strong>Học theo kế hoạch</strong><p>Ổn định đúng giờ và tập trung vào mục tiêu đã đặt.</p></div>
        <div><span>SAU</span><strong>Nhìn lại</strong><p>Cập nhật kết quả trong vòng 2 ngày và ghi điều em cần hỗ trợ.</p></div>
      </div>
    </section>

    <section className="card privacy-card">
      <h2><MessageSquare size={20}/> Ai nhìn thấy gì</h2>
      <p className="muted-text">Em nên biết rõ điều này trước khi viết phần phản tư.</p>
      <ul className="privacy-list">
        <li><strong>Giáo viên chủ nhiệm lớp em</strong> đọc được toàn bộ kế hoạch, phản tư, minh chứng và tin nhắn của em.</li>
        <li><strong>Bạn cùng lớp</strong> không đọc được gì của em — kể cả kế hoạch.</li>
        <li><strong>Trợ giảng</strong> là bạn được thầy cô cử ra để hỗ trợ. Mặc định các bạn ấy chỉ thấy kế hoạch và danh sách ai đang cần giúp — <strong>không</strong> đọc được phần phản tư riêng hay minh chứng của em, trừ khi thầy cô mở thêm quyền.</li>
        <li>Tin nhắn em gửi nằm trong <strong>một luồng chung với thầy cô</strong>, không phải tin nhắn riêng tư tuyệt đối.</li>
      </ul>
      <div className="guide-tip">Nếu có điều gì em chỉ muốn nói riêng với thầy cô, hãy gặp trực tiếp thay vì ghi vào phần phản tư.</div>
    </section>

    <div className="notice warning"><AlertTriangle/><div>
      <strong>Lưu ý quan trọng</strong>
      <p>Không dùng tên, MSHS hoặc tài khoản của bạn khác. Không tạo tài khoản lần hai. Kế hoạch và kết quả là của riêng em — hãy ghi trung thực, vì mục đích là để em nhìn thấy sự tiến bộ của chính mình, không phải để lấy điểm.</p>
    </div></div>
  </div>
}
