import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, FileCheck2, ImagePlus, KeyRound, Laptop, Layers, ListPlus, Lock, LockKeyhole, MessageSquare, Star, UploadCloud, UserPlus } from 'lucide-react'
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

    <section className="card deadline-card">
      <div className="deadline-head"><Lock size={22}/><div>
        <span className="eyebrow">HẠN ĐĂNG KÝ</span>
        <h2>Đăng ký xong trước 24:00 đêm hôm trước</h2>
      </div></div>
      <p>Muốn tự học ngày mai thì đăng ký <strong>chậm nhất là tối nay</strong>. Quá nửa đêm là đã sang ngày mới,
         và buổi đó bị tính là <em>Trễ</em>.</p>
      <div className="guide-tip"><AlertTriangle size={16}/><span>
        Giáo viên có thể <strong>khóa hẳn</strong> việc đăng ký trễ. Khi lớp đã khóa, quá 24:00 là em
        <strong> không đăng ký được nữa</strong> cho ngày hôm đó — ô chọn ngày sẽ bắt đầu từ ngày mai.
        Đây không phải lỗi, mà là quy định của lớp.
      </span></div>
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
        <h3><CalendarCheck2 size={20}/> Đăng ký một <em>buổi</em>, trong buổi có thể có nhiều nhiệm vụ</h3>
        <p>Bấm <strong>Đăng ký giờ tự học</strong> rồi làm theo 3 bước: chọn <strong>ngày</strong> → chọn <strong>tiết</strong> → ghi <strong>nhiệm vụ</strong>.
           Màn hình mặc định chỉ hiện <strong>một nhiệm vụ</strong>. Nếu buổi đó em định làm nhiều việc, bấm
           <strong> “+ Thêm nhiệm vụ”</strong> để thêm khối thứ hai, thứ ba… Mỗi nhiệm vụ có môn, nội dung và mục tiêu riêng,
           và sau này được chấm sao riêng.</p>
        <div className="guide-tip"><ListPlus size={16}/> Ở bước chọn tiết, hệ thống chỉ mở <strong>những tiết lớp mình thực sự
          được phân giờ tự học</strong> theo thời khóa biểu. Thứ nào lớp không có giờ tự học thì không chọn được — như vậy là đúng, không phải lỗi.</div>
        <div className="guide-tip"><Layers size={16}/><span>
          Nếu lớp có <strong>hai tiết tự học liền nhau</strong> và em có nhiệm vụ lớn, tick ô
          <strong> “Làm suốt 2 tiết”</strong>. Nhiệm vụ đó tính cho cả hai tiết — em chỉ ghi một lần và
          cập nhật kết quả một lần. Ô này chỉ hiện khi tiết liền sau cũng là giờ tự học của lớp mình.
        </span></div>
        <div className="guide-tip">Nếu buổi đó em đã đăng ký rồi, nhiệm vụ mới sẽ được <strong>thêm vào buổi đang có</strong> chứ không tạo buổi trùng.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">4</span><div>
        <h3><CheckCircle2 size={20}/> Duyệt: chỉ nhiệm vụ có dùng thiết bị mới cần chờ</h3>
        <p>Nhiệm vụ <strong>không dùng thiết bị điện tử</strong> ghi <em>Không cần duyệt</em> và có hiệu lực ngay — em cứ thế mà học.</p>
        <p>Nhiệm vụ <strong>có dùng thiết bị</strong> thì ở trạng thái <strong>Chờ duyệt</strong> cho tới khi thầy cô xem. Khi thầy cô
           duyệt thiết bị thì nhiệm vụ cũng chuyển sang <strong>Đã duyệt</strong> ngay trong cùng một lần — em không phải chờ hai lượt.</p>
        <div className="guide-tip"><Laptop size={16}/> Nhớ ghi <strong>rõ mục đích</strong> dùng thiết bị. “Tra tài liệu” chung chung
          thường bị trả về; “Mở đề bài tập Toán trên Canvas” thì được duyệt nhanh.</div>
        <div className="guide-tip">Nếu bị <strong>Cần điều chỉnh</strong>, em sửa lại ngay trong thẻ kế hoạch — nó tự quay về hàng chờ duyệt,
          không cần đăng ký lại từ đầu.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">5</span><div>
        <h3><UploadCloud size={20}/> Cập nhật kết quả — nút to màu xanh</h3>
        <p>Những nhiệm vụ em chưa ghi kết quả được gom lên đầu trang ở mục
           <strong> “Cần cập nhật kết quả”</strong>, thẻ có viền cam và dòng nhiệm vụ có vạch cam bên trái —
           em không thể bỏ sót. Mỗi nhiệm vụ như vậy có một nút lớn
           <strong> “Cập nhật kết quả”</strong> ngay bên dưới. Bấm vào đó, chọn Hoàn thành / Một phần / Chưa hoàn thành,
           ghi vài dòng, và bật <em>“Em cần giáo viên hỗ trợ”</em> nếu còn vướng.</p>
        <div className="guide-tip"><ListPlus size={16}/><span>
          Ở mục <strong>“Nhiệm vụ của em”</strong> bên dưới, em lọc nhanh bằng các nút
          <em> Tất cả · Sắp tới · Chưa có kết quả · Đã xong · Cần viết phản hồi</em>, tìm theo môn hoặc nội dung,
          đổi thứ tự sắp xếp, và chuyển trang khi danh sách dài.
        </span></div>
        <div className="guide-tip"><FileCheck2 size={16}/><span>
          <strong>Minh chứng nộp kiểu nào cũng được</strong> (tối đa 3 mục mỗi nhiệm vụ):
          <ul className="tip-list">
            <li><strong>Mô tả bằng chữ</strong> — làm bài trong vở thì chỉ cần tả lại em đã làm gì.</li>
            <li><strong>Ảnh hoặc file</strong> — JPG, PNG, PDF, tối đa 5 MB.</li>
            <li><strong>Liên kết</strong> — Canva, Google Docs, Padlet…</li>
          </ul>
          Không có sản phẩm số cũng không sao — phần mô tả bằng chữ là đủ.
        </span></div>
      </div></article>

      <article className="guide-step"><span className="step-number">6</span><div>
        <h3><Star size={20}/> Xem đánh giá và nhận xét</h3>
        <p>Thầy cô chấm <strong>1–5 sao</strong> và viết nhận xét cho từng nhiệm vụ.</p>
        <div className="guide-tip"><AlertTriangle size={16}/> Nhiệm vụ bị <strong>1 hoặc 2 sao</strong> sẽ có viền đỏ/vàng, và em cần viết một dòng cho biết sẽ điều chỉnh thế nào ở lần sau. Đây không phải hình phạt — chỉ là cách để em dừng lại một chút và nghĩ về cách làm khác.</div>
      </div></article>

      <article className="guide-step"><span className="step-number">7</span><div>
        <h3><ImagePlus size={20}/> Ảnh đại diện (tùy chọn)</h3>
        <p>Bấm vào vòng tròn tên viết tắt ở góc trên trang <strong>Kế hoạch của em</strong> để đổi ảnh. Ảnh được cắt vuông và thu nhỏ tự động.</p>
        <div className="guide-tip"><LockKeyhole size={16}/> Ảnh này <strong>không công khai</strong>. Chỉ giáo viên và trợ giảng lớp em nhìn thấy. Em có thể bỏ ảnh bất cứ lúc nào.</div>
      </div></article>
    </div>

    <section className="guide-rules card">
      <h2>Trước · Trong · Sau giờ tự học</h2>
      <div className="three-rule-grid">
        <div><span>TRƯỚC</span><strong>Lên kế hoạch</strong><p>Chọn ngày và tiết, ghi một hoặc nhiều nhiệm vụ, đăng ký thiết bị nếu cần và gửi sớm để được duyệt.</p></div>
        <div><span>TRONG</span><strong>Học theo kế hoạch</strong><p>Ổn định đúng giờ và tập trung vào mục tiêu đã đặt.</p></div>
        <div><span>SAU</span><strong>Nhìn lại</strong><p>Bấm nút <em>Cập nhật kết quả</em> trong vòng 2 ngày, nộp minh chứng (chữ, ảnh, file hoặc link) và ghi điều em cần hỗ trợ.</p></div>
      </div>
    </section>

    <section className="card privacy-card">
      <h2><MessageSquare size={20}/> Ai nhìn thấy gì</h2>
      <p className="muted-text">Em nên biết rõ điều này trước khi viết phần phản tư.</p>
      <ul className="privacy-list">
        <li><strong>Giáo viên chủ nhiệm lớp em</strong> đọc được toàn bộ kế hoạch, phản tư, minh chứng và tin nhắn của em.</li>
        <li><strong>Bạn cùng lớp</strong> không đọc được gì của em — kể cả kế hoạch và ảnh đại diện.</li>
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
