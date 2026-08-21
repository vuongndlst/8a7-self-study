# Self-Study — quản lý giờ tự học toàn trường

Web quản lý giờ tự học theo quy trình **Plan → Do → Reflect**, dùng chung cho nhiều lớp,
nhiều giáo viên và nhiều năm học. Trường THCS & THPT Đinh Thiện Lý (LSTS).

**Đang chạy tại:** https://vuongndlst.github.io/lsts-self-study/

- Frontend: React + Vite · Hosting: GitHub Pages · Backend: Supabase
- Routing: HashRouter (không lỗi 404 khi refresh trên GitHub Pages)
- Tiết tự học 1–9 · Minh chứng: **mô tả bằng chữ**, ảnh ≤ 12 MB, PDF ≤ 5 MB, hoặc link — tối đa 3/nhiệm vụ

## 1. Mô hình dữ liệu (đa năm học, đa lớp, đa giáo viên)

Mỗi học sinh giữ **một tài khoản duy nhất suốt các năm**. Lên lớp = thêm một dòng ghi
danh, không tạo lại tài khoản, không mất lịch sử.

```text
school_years   2026-2027, 2027-2028…   (đúng một năm is_active = năm hiện tại)
class_catalog  danh mục 6A1–8A10        ← tên lớp, không gõ tay
classes        8A7 CỦA năm nào          ← đã là cặp lớp × năm học
students       MSHS + họ tên, theo em suốt các năm
enrollments    em nào học lớp nào       ← "danh sách lớp", có school_year_id
class_teachers ai phụ trách lớp nào     ← primary/co, active/inactive
```

Giáo viên **chỉ thấy lớp mình phụ trách** — kế hoạch, hồ sơ, minh chứng, và chỉ đặt lại
được mật khẩu cho học sinh lớp mình. Nhiều giáo viên dùng chung một hệ thống mà không
thấy dữ liệu của nhau.

### Ba ràng buộc chống sai dữ liệu, đặt ở database

| Ràng buộc | Ngăn điều gì |
|---|---|
| `one_primary_teacher_per_class` | Hai giáo viên cùng nhận một lớp |
| `one_active_class_per_year` | Một học sinh ở hai lớp trong cùng năm |
| `students.mshs` là khóa chính | Lên lớp tạo ra học sinh trùng |

**Lên lớp không tạo học sinh mới.** Cùng MSHS, năm mới, lớp khác → chỉ **thêm một dòng
ghi danh**. Tài khoản, mật khẩu, ảnh đại diện và toàn bộ lịch sử năm cũ giữ nguyên.

## 1b. Vai trò và quyền

| Vai trò | Phạm vi |
|---|---|
| `admin` | Toàn trường. Ở trường này admin **cũng chủ nhiệm một lớp** nên vào được cả dashboard giáo viên |
| `teacher` + `approved` | Chỉ lớp được phân công, trong năm hiện tại |
| `teacher` + `pending`/`suspended`/`rejected` | Gần như bằng người chưa đăng nhập — chỉ đọc được hồ sơ của chính mình |
| Trợ giảng | Vẫn là **học sinh**, thêm dòng trong `class_assistants`. Không phải một role riêng — biến TA thành role sẽ làm mất dữ liệu tự học của chính em ấy |
| `student` | Chỉ dữ liệu của chính mình |

**Trạng thái duyệt tách khỏi role.** Dùng role để biểu diễn trạng thái duyệt sẽ khiến mọi
policy phải biết "teacher_pending" là gì.

Bốn hàm `is_teacher` / `teaches_class` / `teaches_mshs` / `teaches_user` là **chỗ duy nhất**
quyết định "ai là nhân sự của lớp này". Chúng đòi `approval_status='approved'` và
`class_teachers.status='active'`, đồng thời mở đường cho admin. Siết một chỗ là siết cả hệ
thống — không phải sửa hàng chục policy rồi bỏ sót một cái.

Không có đường nào từ giao diện nâng role lên `admin`. Cột `role` không nằm trong bất kỳ
`GRANT UPDATE` nào, nên học sinh gọi thẳng API sẽ bị chặn ở tầng quyền bảng, trước cả RLS.

## 2. Tài khoản học sinh

MSHS chính là phần trước `@` trong email trường: `2406002` → `2406002@lsts.edu.vn`.
Học sinh đăng nhập bằng MSHS; hệ thống tự ghép thành email này.

### Luật mật khẩu

Tối thiểu 10 ký tự, có chữ hoa + chữ thường + số, không khoảng trắng, không chứa MSHS.

Luật được ép ở **ba tầng** để không thể bỏ qua bằng DevTools:

| Tầng | Chỗ nào | Chặn được gì |
|---|---|---|
| Giao diện | `src/utils/password.js` | Báo lỗi sớm cho học sinh |
| Supabase Auth | Password policy của project | Mọi đường đổi mật khẩu, kể cả gọi API trực tiếp |
| Edge Function | `student-change-password` | Thêm luật "không chứa MSHS" |

### `includes("")` — lỗi khoá cứng mọi tài khoản giáo viên mới

Luật mật khẩu có vế *"không được chứa MSHS"*, viết là `!password.includes(mshs)`.

Giáo viên và quản trị viên **không có MSHS**, nên `mshs` là chuỗi rỗng. Mà trong JavaScript
`"batky".includes("")` luôn trả về **true** — nên `!password.includes("")` luôn **false**, và cả
luật luôn hỏng, với mọi mật khẩu.

Triệu chứng nhìn rất khó hiểu: giao diện tick xanh đủ 6 điều kiện, hai ô mật khẩu khớp nhau, mà
bấm nút vẫn ra thông báo "chưa đạt yêu cầu". Vì hai bên kiểm bằng **hai đoạn mã khác nhau**:
`src/utils/password.js` có chốt chặn `!code ||` nên hiện đúng, còn bản gốc ở
`supabase/functions/_shared/common.ts` thì không.

Hệ quả: **mọi tài khoản giáo viên do quản trị viên tạo đều kẹt vĩnh viễn** ở màn hình bắt đổi
mật khẩu — không vào được hệ thống, cũng không có đường vòng nào.

Đã sửa ở bản gốc: `code === '' || !password.includes(code)`.

Hai đường của **học sinh** chưa bao giờ hỏng vì luôn truyền MSHS 7 chữ số thật. Đã kiểm lại:
mật khẩu chứa MSHS bị từ chối, mật khẩu ngắn bị từ chối, mật khẩu hợp lệ đổi được.

Màn hình này cũng từng xưng hô lẫn lộn — tiêu đề ghi *"thầy/cô"* mà đoạn dưới vẫn *"em cần tự
đặt"*. Nay lời văn đổi theo vai trò, và dòng "Không chứa MSHS" tự ẩn với người không có MSHS.

### Khi giáo viên đặt lại mật khẩu

`teacher-reset-password` bật cờ `profiles.must_change_password`. Lần đăng nhập kế tiếp,
học sinh bị chặn ở màn **“Đặt mật khẩu riêng của em”** trước khi vào được bất kỳ trang
nào. Chỉ Edge Function mới hạ được cờ — học sinh không tự sửa `profiles` được.

### Quên mật khẩu — hai đường

**Đường 1 — tự đặt lại qua email.** Nút **Quên mật khẩu?** ngay trang đăng nhập. Xem mục 2b.

**Đường 2 — giáo viên cấp mật khẩu tạm.** Dùng khi em không mở được hộp thư trường. Trên
dashboard, tab **Theo học sinh** liệt kê **toàn bộ** học sinh của lớp (kể cả em chưa tạo
tài khoản) — tick chọn một hoặc nhiều em rồi bấm **Đặt lại mật khẩu**. Hệ thống sinh mật
khẩu tạm cho từng em và hiện ra một lần duy nhất, kèm nút chép cả danh sách.

Mật khẩu tạm bỏ các ký tự dễ đọc nhầm khi chép tay (`0/O`, `1/l/I`).

> **Nhắc nhở vẫn hiển thị trong ứng dụng, không gửi email.** SMTP đã cấu hình nhưng chỉ
> phục vụ thư xác thực của Supabase (đặt lại mật khẩu, magic link) — không dùng để gửi
> thư tùy ý. Gửi nhắc quá hạn cho vài trăm học sinh mỗi ngày cũng vượt hạn mức Gmail.
> Xem mục 10.

## 2b. Email: quên mật khẩu

Nút **Quên mật khẩu?** có ở cả hai tab đăng nhập. Học sinh nhập MSHS (thư đi tới
`MSHS@lsts.edu.vn`), giáo viên nhập email trường.

SMTP đã được cấu hình trên project này. Ghi lại các bước để năm sau dựng lại còn biết
đường — và vì nếu thiếu bước nào, Supabase vẫn nhận lệnh nhưng thư không bao giờ tới.

Supabase Dashboard → Project Settings → **Authentication → SMTP Settings** → *Enable custom
SMTP*:

| Trường | Gmail | Google Workspace (khuyến nghị) |
|---|---|---|
| Host | `smtp.gmail.com` | `smtp.gmail.com` |
| Port | `465` (SSL) hoặc `587` (TLS) | như trái |
| Username | địa chỉ Gmail đầy đủ | email trường dùng để gửi |
| Password | **App Password** 16 ký tự | như trái |
| Sender email | trùng username | ví dụ `noreply@lsts.edu.vn` |

App Password lấy ở [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
— **bắt buộc bật xác minh 2 bước trước**, và **không** dùng mật khẩu đăng nhập thường.

Sau đó vào **Authentication → URL Configuration**, thêm site URL vào *Redirect URLs*:

```text
https://vuongndlst.github.io/lsts-self-study/
```

Thiếu bước này thì bấm link trong email sẽ ra trang trắng.

> **Đổi tên repo là phải sửa lại chỗ này.** Redirect URL phải khớp chính xác URL trang
> đang chạy; đổi tên repo mà quên sửa thì link đặt lại mật khẩu gãy im lặng — người dùng
> bấm vào chỉ thấy trang trắng, không có thông báo lỗi nào.

> **Giới hạn cần biết.** Gmail cá nhân ~500 thư/ngày, Workspace ~2000. Đủ cho việc đặt lại
> mật khẩu, **không đủ** để gửi nhắc nhở hàng loạt cho vài trăm học sinh mỗi ngày. Với
> nhắc nhở, xem mục 10.
>
> Supabase cũng giới hạn tần suất gửi (mặc định ~4 thư/giờ mỗi địa chỉ). Nới ở
> **Authentication → Rate Limits** nếu cần.

Đặt lại mật khẩu bằng email **không thay thế** đường cũ: giáo viên vẫn cấp được mật khẩu
tạm cho học sinh lớp mình, và quản trị viên vẫn cấp lại được cho giáo viên. Trường hợp học
sinh không mở được hộp thư trường thì đó vẫn là đường duy nhất.

## 3. Cài đặt và chạy

```bash
npm install
npm run dev
```

Vite chỉ nạp `.env.production` khi **build**. Muốn `npm run dev` chạy được, tạo thêm
`.env.local` với nội dung như `.env.example` (file này đã gitignore).

```env
VITE_SUPABASE_URL=https://qzvlwffxvewhfztnxxzb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
VITE_TEACHER_EMAIL=ict.vuongnd@lsts.edu.vn
VITE_STUDENT_EMAIL_DOMAIN=lsts.edu.vn
VITE_BRAND_MARK=LSTS
```

Publishable key được phép lộ ra frontend. **Không** đưa `service_role` / secret key vào
các file `VITE_*`.

## 4. Dựng cơ sở dữ liệu

Supabase Dashboard → SQL Editor → chạy **bốn file, đúng thứ tự này**:

```text
1. supabase/schema.sql             lõi: kế hoạch, phản tư, minh chứng, chat, thông báo
2. supabase/schema-2-school.sql    nền tảng toàn trường: vai trò, danh mục lớp, import
3. supabase/schema-3-rls.sql       quyền, nghiệp vụ, số liệu, và chuyển dữ liệu cũ
4. supabase/schema-4-hardening.sql thu hồi quyền thừa, chỉ mục, chống lạm dụng
```

Thứ tự có ý nghĩa:

- **File 3** định nghĩa lại các hàm quyền của file 1 để thêm `admin` và điều kiện "đã được
  duyệt". Phần **chuyển dữ liệu cũ nằm ở cuối file 3** — sau khi mọi trigger đã được thay
  xong. Chạy sớm hơn thì trigger bản cũ sẽ âm thầm hoàn nguyên.
- **File 4 phải chạy sau cùng.** Nó duyệt danh sách bảng/hàm *đang có* rồi thu hồi quyền;
  chạy trước khi ba file kia tạo xong thì sẽ bỏ sót đúng những thứ mới tạo.

> Cả bốn **chạy lại nhiều lần được và không xóa dữ liệu**: chỉ `create … if not exists`,
> `alter … add column if not exists`, `create or replace function`, và dựng lại policy.
> Nâng cấp hệ thống đang chạy thật chỉ cần chạy lại đủ bốn file.

Bootstrap quản trị viên nằm ở cuối file 3: tài khoản `ict.vuongnd@lsts.edu.vn` được đặt
`role='admin'`. Email chỉ dùng để **tìm đúng tài khoản một lần**; sau bước đó quyền nằm ở
`profiles.role`, không ở email.

Sau đó bật password policy: Authentication → Sign In / Providers → Password Requirements
→ tối thiểu **10** ký tự, yêu cầu **chữ thường + chữ hoa + chữ số**.

## 5. Tạo lớp và giáo viên

### Cách chính: trang Quản trị (`#/admin`)

Từ khi hệ thống chạy cho cả trường, mọi việc này làm trên giao diện — không cần chạy
script nữa.

**Thêm giáo viên** (tab *Giáo viên*):

| Cách | Dùng khi |
|---|---|
| **Import từ Excel** | Đầu năm, nhận danh sách cả trường. 3 cột: `Họ và tên` · `Email` · `Lớp chủ nhiệm` |
| **Thêm giáo viên** | Một người lẻ. Chọn lớp luôn trong cùng form |

Tải file mẫu ngay trong hộp thoại (`public/templates/Mau_import_giao_vien.xlsx`).

**Quy tắc quan trọng nhất: tài khoản giáo viên là duy nhất theo email.** Email đã có thì
**dùng lại**, chỉ thêm phân công lớp — không tạo tài khoản thứ hai, không đổi mật khẩu
thầy cô đang dùng, không mất lịch sử đã xử lý. Đây chính là ca *"giáo viên cũ, năm mới"*
mà mỗi năm đều gặp.

### Mật khẩu tạm — không có mật khẩu mặc định

**Không có mật khẩu mặc định dùng chung.** Mỗi giáo viên mới nhận một mật khẩu ngẫu nhiên
12 ký tự, sinh riêng cho từng người. Cố ý như vậy: một mật khẩu mặc định dùng chung nghĩa
là ai biết quy luật cũng đăng nhập được vào tài khoản đồng nghiệp chưa kích hoạt.

Mật khẩu bỏ các ký tự dễ nhìn nhầm (`0/O`, `1/l/I`) vì thầy cô hay đọc qua điện thoại.

Nó hiện **đúng một lần** — server chỉ lưu bản băm nên **không có cách nào xem lại**. Sau
khi import, bấm ngay **Chép toàn bộ danh sách**.

**Lỡ đóng cửa sổ trước khi chép?** Vào tab *Giáo viên*, lọc **Chưa đăng nhập**, bấm
**Cấp lại mật khẩu (N)** → tải về CSV. Mật khẩu cũ ngừng hoạt động ngay.

> Danh sách giáo viên đầu năm thường có **cả dòng của chính quản trị viên** (vì admin cũng
> chủ nhiệm một lớp). Import **không** hạ quyền admin — đã có bảo vệ ở cả Edge Function
> lẫn trigger `protect_last_admin` trong database. Xem mục 12.

**Năm học** (tab *Năm học*): nút *Tạo năm học*. Hệ thống **không tự đoán ngày** từ tên
năm — trường có thể bắt đầu sớm hay muộn, đoán sai sẽ làm lệch phạm vi mọi biểu đồ. Đặt
làm năm hiện tại là một quyết định riêng, có modal xác nhận nói rõ dữ liệu năm cũ vẫn
được lưu trữ.

**Khóa tài khoản** (tab *Giáo viên*): *Tạm khóa* / *Từ chối* / *Khôi phục*. Khóa xong,
phân công lớp ngừng hiệu lực **ngay**, và RLS chặn ở tầng database chứ không chỉ ở giao
diện. Không cho khóa tài khoản quản trị viên — khóa xong sẽ không còn ai mở lại được.

### Giáo viên tự thiết lập lớp

Giáo viên được duyệt mà **chưa có lớp** thì không thấy dashboard rỗng, mà thấy màn hình
onboarding ba bước: tài khoản đã duyệt → chọn lớp chủ nhiệm → import danh sách. Nhận lớp
đi qua `claim_class()`, chỉ mở khi lớp đó **chưa có ai phụ trách** trong năm hiện tại.

> Được duyệt tài khoản **không** đồng nghĩa được truy cập mọi lớp. Rủi ro lớn nhất khi
> triển khai toàn trường không phải lỗi Excel mà là *hai giáo viên cùng nhận một lớp*.

### Cách cũ: script JSON

Vẫn dùng được, hữu ích khi dựng lại từ đầu.

Mỗi lớp là **một file JSON** trong `admin/` — đó là nguồn duy nhất, không cần chạy SQL.
Lớp 8A7 năm 2026-2027 đã có sẵn ở `admin/8a7-2026-2027.json`.

```bash
# sửa file rồi chạy lại — script chạy lại bao nhiêu lần cũng được
npm run setup-class -- admin/8a7-2026-2027.json
npm run classes      # xem lại toàn bộ năm / lớp / giáo viên
```

Lớp mới thì copy `admin/class.example.json` thành file riêng.

> `supabase/seed-roster.private.sql` là cách cũ, làm cùng một việc bằng SQL. Đã dùng
> file JSON thì không cần tới nó nữa — xóa được cho gọn.

Script làm đủ 4 việc: năm học → lớp → tài khoản giáo viên → ghi danh học sinh. Học sinh
có thể khai trong `students`, hoặc trỏ `studentsCsv` tới file CSV hai cột `mshs,full_name`
xuất từ Excel.

- **Giáo viên mới**: tạo file JSON cho lớp của họ. Script in **một lần duy nhất** mật khẩu
  tạm; đưa trực tiếp cho giáo viên. Giáo viên đã có tài khoản thì mật khẩu giữ nguyên.
- **Sang năm học mới**: file JSON mới với `schoolYear` mới và lớp mới. Đặt `isActive: true`
  cho năm mới — script tự tắt các năm còn lại. Học sinh giữ nguyên tài khoản và lịch sử.
- **Học sinh chuyển lớp**: bỏ khỏi danh sách rồi chạy lại — script chỉ tắt ghi danh, không
  xóa dữ liệu cũ.

File `admin/*.json` và `admin/*.csv` đã gitignore vì chứa tên học sinh.

## 6. Đánh giá, chat và trợ giảng

### Chấm sao và phản hồi

Giáo viên bấm vào tên môn trong bảng kế hoạch (hoặc vào tên học sinh → chọn một tiết)
để mở **chi tiết tiết tự học**: kế hoạch, tự đánh giá của em, minh chứng đã nộp. Ở đó
chấm **1–5 sao** và viết nhận xét gửi lại học sinh.

**Chấm 1–2 sao là mức cảnh báo.** Thẻ của em hiện viền đỏ (1 sao) hoặc vàng (2 sao),
kèm thông báo, một banner đếm tổng số tiết bị đánh giá thấp, và **bắt em viết một dòng**
cho biết sẽ điều chỉnh thế nào. Chấm lại lên ≥ 3 sao thì phần phản hồi cũ tự xóa.

### Chat

Mỗi học sinh có **một luồng** trong lớp. Giáo viên và trợ giảng (nếu được bật quyền chat)
cùng đọc và trả lời trong luồng đó; học sinh không thấy luồng của bạn. Tin đã gửi không
sửa/xóa được.

### Trợ giảng (TA)

Trợ giảng **vẫn là học sinh** — giữ nguyên tài khoản, dữ liệu cá nhân vẫn riêng tư. Giáo
viên vào tab **Trợ giảng** để cử và tick từng quyền:

| Quyền | Mặc định |
|---|---|
| Xem kế hoạch lớp | ✅ |
| Xem yêu cầu hỗ trợ | ✅ |
| Nhắn tin với bạn | ✅ |
| Xem phản tư đầy đủ | ❌ |
| Xem minh chứng | ❌ |
| Chấm sao 1–5 | ❌ |
| Viết nhận xét | ❌ |
| Duyệt đăng ký thiết bị | ❌ |

Mặc định đóng các quyền nhạy cảm vì **TA là bạn cùng lớp**: phản tư và ghi chú riêng
được học sinh viết ra với giả định chỉ giáo viên đọc.

TA chỉ có `view_help` vẫn thấy được danh sách cần hỗ trợ, qua view `public.help_requests` —
view chỉ lộ nội dung yêu cầu hỗ trợ, **không** lộ ghi chú phản tư, nhận xét hay điểm sao.
Cần view riêng vì RLS chặn được dòng nhưng không chặn được cột.

TA **không bao giờ**: đặt lại mật khẩu, sửa/xóa kế hoạch của bạn, cử TA khác, xem quyền
của TA khác, hay thấy dữ liệu lớp khác. Mọi lượt chấm sao / nhận xét đều ghi rõ người thực hiện
(`rating_by`, `teacher_comment_by`).

Dashboard riêng của TA ở `#/ta`, chỉ hiện khi em được cử. Trên đó có: thẻ thống kê theo
đúng khoảng đang lọc, danh sách bạn cần hỗ trợ, danh sách **bạn chưa đăng ký** theo ngày,
và bảng kế hoạch lớp có phân trang. Mỗi cột chỉ hiện khi quyền tương ứng được bật; quyền
chưa bật thì nói thẳng là *"giáo viên chưa bật quyền"* thay vì để một ô trống khó hiểu.

Hai chỗ dễ nhầm, đã xử lý:

- Trang **Kế hoạch của em** phải lọc `student_id = chính mình` ở phía client. RLS cho TA
  đọc cả lớp, nên không lọc thì trang cá nhân sẽ lẫn kế hoạch của bạn — và tệ hơn, form
  đăng ký có thể gắn nhiệm vụ mới vào **buổi tự học của bạn khác**.
- Đọc **tên** bạn dùng `staff_sees_student_name()` (teacher hoặc TA có bất kỳ quyền nào
  trong `view_plans` / `view_help` / `chat`), rộng hơn `staff_sees_student(…, 'view_plans')`.
  Nếu không, TA chỉ được bật `view_help` sẽ thấy một dashboard toàn dấu gạch.

## 7. Duyệt kế hoạch

**Chỉ kế hoạch có đăng ký thiết bị điện tử mới cần duyệt.** Kế hoạch không dùng thiết bị
vào thẳng trạng thái `Không cần duyệt`, không làm phình hàng chờ của giáo viên. Học sinh
bật/tắt ô thiết bị thì trạng thái duyệt tự đổi theo.

Một kế hoạch có **hai chiều độc lập** — đừng trộn lẫn:

| Chiều | Giá trị | Ai đổi |
|---|---|---|
| **Duyệt** (`review_status`) | Chờ duyệt · Đã duyệt · Cần điều chỉnh · Không cần duyệt | Giáo viên, hoặc TA có `can_approve_plan` |
| **Tiến độ** (`progress`) | Chưa tới buổi · Đang chờ cập nhật · Trễ hạn · Đã hoàn thành · Hệ thống tự đánh giá | Suy ra từ dữ liệu, không ai nhập tay |

Trạng thái *"Đã duyệt · Trễ hạn cập nhật"* là hoàn toàn hợp lệ: duyệt xong không có nghĩa là đã làm.

**Duyệt thiết bị và duyệt kế hoạch là một quyết định, đồng bộ hai chiều ngay trong
trigger** `plans_guard_columns`:

| Thầy cô làm | Hệ thống làm thêm |
|---|---|
| Duyệt thiết bị (`device_status = 'Đã duyệt'`) | `review_status = 'Đã duyệt'`, ghi `review_by/at`, tăng `review_version` |
| Từ chối thiết bị | `review_status = 'Cần điều chỉnh'`, lấy lý do từ chối làm `review_note` |
| Duyệt kế hoạch có dùng thiết bị | `device_status = 'Đã duyệt'`, ghi `device_reviewed_by/at` |

Đặt ở trigger chứ không ở giao diện, nên mọi đường vào — bảng, popup chi tiết,
`bulk_review_plans` — đều cho ra cùng một kết quả. Cả hai chiều đều kiểm
`staff_perm(class, 'review_device')` trước khi đổi.

### Duyệt hàng loạt

Dashboard mở bằng hàng thẻ **việc cần xử lý** — bấm vào thẻ là lọc thẳng xuống bảng.
Từ đó **3 click là duyệt xong cả nhóm**: bấm thẻ *Chờ duyệt* → *Chọn tất cả chờ duyệt* →
*Duyệt N kế hoạch* → xác nhận.

Toàn bộ chạy trong **một lệnh** `bulk_review_plans(ids, status, note)` chứ không phải N
request. Hàm chạy dưới quyền người gọi (không phải `security definer`) nên RLS và trigger
tách cột vẫn áp dụng nguyên vẹn — chỉ những kế hoạch thuộc lớp mà người gọi có quyền mới
đổi được. Hàm trả về `{yêu_cầu, đã_xử_lý, bỏ_qua}` để giao diện nói đúng phạm vi.

Bộ lọc: duyệt · tiến độ · khoảng ngày · học sinh · môn · tiết · thiết bị · tìm kiếm, kèm
6 kiểu sắp xếp. Đổi bộ lọc thì **tự bỏ chọn** để không thao tác nhầm lên nhóm không còn nhìn thấy.

### Yêu cầu điều chỉnh

Giáo viên gửi kèm lời nhắn (bắt buộc). Học sinh nhận thông báo có nội dung nhắn.
Khi em **sửa lại nhiệm vụ/mục tiêu/môn**, kế hoạch **tự quay về hàng chờ duyệt** và tăng
`review_version` — không phải đăng ký lại từ đầu. Khóa chống trùng thông báo dùng
`plan-review:<id>:<version>` nên mỗi vòng duyệt chỉ báo một lần.

### Xem nhanh, phân trang, bấm dòng

Trên tab **Theo kế hoạch** có hàng nút xem nhanh: *Hôm nay · Ngày mai · Thiết bị chờ duyệt ·
Có dùng thiết bị · Trễ hạn cập nhật*. Bảng phân trang 25 dòng. **Bấm vào bất kỳ đâu trên
một dòng** là mở popup chi tiết tiết đó; các ô có nút riêng (tick chọn, duyệt thiết bị,
minh chứng) không kích hoạt popup.

Ô tick ở đầu bảng chỉ chọn **trang đang xem**; muốn cả bộ lọc thì dùng nút *"Chọn tất cả N
kế hoạch chờ duyệt"* ở thanh bên trên — nói rõ phạm vi để không thao tác nhầm.

### Hộp việc cần xử lý: mỗi ô là một nút lọc

Đầu trang giáo viên từng có **11 ô số liệu + một thẻ “Cần chú ý” 7 dòng** — 18 con số phải
đọc trước khi tới được dữ liệu. Chúng trùng nhau (*trễ hạn*, *chờ chấm sao*, *tài khoản HS*
đều xuất hiện hai lần) và phần lớn không bấm được: thầy cô đọc thấy “64 tiết trễ hạn” rồi
vẫn phải tự đi tìm 64 tiết đó ở đâu.

Nay chỉ còn **8 ô, tất cả đều là việc phải làm gì đó, tất cả bấm được**:

| Ô | Bấm vào thì |
|---|---|
| Chờ duyệt · Cần điều chỉnh | lọc theo trạng thái duyệt |
| Trễ hạn cập nhật | lọc tiến độ quá 48 giờ chưa có kết quả |
| Chờ chấm sao | lọc tiết **đã có kết quả mà chưa có sao** |
| Cần hỗ trợ | lọc tiết học sinh đang giơ tay, chưa được giải quyết |
| Hệ thống tự chấm | lọc tiết bị tự ghi 1 sao do quá hạn |
| Bổ sung muộn | lọc tiết em nộp **sau khi** đã bị chấm — điểm cũ có thể không còn đúng |
| Chưa lập KH ngày mai | mở thẳng tab *HS chưa đăng ký* |

Ba quy ước giữ cho các con số không tự mâu thuẫn:

1. **Hộp việc cần xử lý đếm trên toàn bộ dữ liệu đã nạp, KHÔNG theo bộ lọc.** Nếu đếm theo
   phần đã lọc thì bấm “Chờ duyệt” xong mọi ô còn lại tụt về 0, và thầy cô tưởng đã hết việc
   trong khi chỉ đang nhìn qua một khe hẹp.
2. **Mỗi ô đặt LẠI toàn bộ bộ lọc rồi mới bật điều kiện của mình** (hằng `CLEAR`). Chồng thêm
   thì bấm “Chờ duyệt” rồi bấm “Cần hỗ trợ” sẽ ra giao của hai điều kiện, và con số hiện ra
   không khớp với con số trên ô vừa bấm.
3. **Ô bằng 0 được làm mờ**, để hộp 8 ô mà 6 ô rỗng đọc ra ngay là “gần như không còn việc”.

Số liệu **mô tả** (lượt đăng ký, % hoàn thành, điểm trung bình…) chuyển sang tab **Phân
tích**, và cũng tính trên toàn bộ khoảng đang nạp chứ không theo bộ lọc — bộ lọc nằm ở tab
khác, không nhìn thấy được từ đây. Thẻ tài khoản học sinh chuyển sang tab **Theo học sinh**.

## 8. Lịch tự học cố định và ai chưa đăng ký

Hai việc khác nhau nên nằm ở **hai tab riêng**:

- **Lịch tự học** — khai một lần đầu năm, gần như không đụng lại.
- **HS chưa đăng ký** — mở gần như mỗi ngày.

### Tab *Lịch tự học* — hạn đăng ký

Hạn khóa cố định là **24:00 của ngày hôm trước** (0:00 của ngày tự học), đúng bằng cách `registrationStatus()` chấm
"Đúng hạn / Trễ" từ trước tới nay. Ô tick `classes.allow_late_registration` quyết định
điều gì xảy ra sau mốc đó:

| Ô tick | Đăng ký cho hôm nay | Đăng ký cho ngày mai |
|---|---|---|
| **Bật** (mặc định) | Được, nhưng đánh dấu *Trễ* | Được |
| **Tắt** | Bị chặn | Được |

Chặn ở **RLS** (`can_register_on(class, date)` trên cả `self_study_sessions` và `plans`),
không chỉ ở giao diện — gọi thẳng API cũng không lách được. Ô tick này đi qua ba lớp:
`grant update (allow_late_registration)` cấp đúng một cột, RLS `classes_teacher_update`
giới hạn về lớp mình phụ trách, và trigger `classes_guard_columns` khóa nốt phần còn lại
(tên lớp, năm học). Học sinh gọi update thì sửa được **0 dòng**.

### Tab *Lịch tự học* — khung giờ

Lớp thường được phân giờ tự học **cố định theo tuần**. Khai bằng lưới tick 7 thứ × 9 tiết
(bảng `class_schedule`). Khai xong thì hai chỗ hưởng lợi: học sinh **chỉ chọn được đúng
những tiết lớp thực sự có giờ tự học**, và phần kiểm tra biết chính xác **từng tiết** ai
chưa đăng ký thay vì chỉ biết "em này không có kế hoạch nào trong ngày".

### Tab *HS chưa đăng ký*

Chọn ngày (hoặc bấm *Hôm nay* / *Ngày mai*) → hàm `missing_registrations(class, date)` trả
về danh sách em còn thiếu, gộp theo học sinh kèm số tiết còn thiếu. Có nút **Chép danh sách**
để dán thẳng vào tin nhắn lớp. Trợ giảng có `can_view_plans` cũng thấy phần này trên
dashboard của mình.

Ba trường hợp được phân biệt rõ:

| Tình huống | Kết quả |
|---|---|
| Lớp đã khai lịch, ngày đó **có** tiết tự học | Liệt kê theo từng tiết còn thiếu |
| Lớp đã khai lịch, ngày đó **không** có tiết | Không báo ai thiếu cả |
| Lớp **chưa khai** lịch bao giờ | Chỉ xét "có kế hoạch nào trong ngày không" |

Hàm là `security definer` nhưng tự kiểm `staff_perm(class, 'view_plans')` bên trong, nên
học sinh gọi vào cũng không lấy được dữ liệu lớp.

## 8b. Buổi tự học, nhiều nhiệm vụ, và minh chứng

Một **buổi** (`self_study_sessions`: học sinh × ngày × tiết) chứa **một hoặc nhiều nhiệm vụ**
(`plans.session_id`). Form đăng ký mặc định mở **đúng một khối nhiệm vụ**; muốn thêm thì bấm
*"+ Thêm nhiệm vụ"*. Đăng ký lại vào buổi đã có thì nhiệm vụ mới được **thêm vào buổi đang có**,
không tạo buổi trùng. Ràng buộc duy nhất `(student, date, period)` nằm ở `self_study_sessions`
chứ không còn ở `plans`.

Sau giờ tự học, mỗi nhiệm vụ chưa có kết quả hiện một **nút lớn "Cập nhật kết quả"** ngay
dưới dòng nhiệm vụ — trước đây phải đoán rằng bấm vào dòng sẽ mở popup.

### Đầu trang học sinh: chỉ hiện việc còn tồn, và bấm được

Chỗ này từng là **4 ô số liệu + 5 dòng cảnh báo dài**. Hai vấn đề:

- Bốn ô đó **trùng với mục “Số liệu của em”** ở cuối trang, mà lại **lệch số** vì tính theo
  hai cách khác nhau (ô trên tính ở trình duyệt trên toàn bộ kế hoạch; mục dưới tính ở CSDL
  theo khoảng ngày đang chọn). Cùng nhãn *Điểm trung bình*, một bên 3.4 một bên 3.6.
- Năm dòng cảnh báo bảo em *“mở thẻ có viền đỏ/vàng bên dưới”* — đọc xong vẫn phải tự đi tìm.

Nay đầu trang chỉ còn **thẻ việc cần làm**, và chỉ dựng thẻ cho việc **còn tồn** — không việc
gì thì cả dải biến mất. Mỗi thẻ bấm vào là **lọc danh sách + cuộn xuống đúng chỗ** (nếu chỉ
đổi bộ lọc mà không cuộn, em bấm xong tưởng như không có gì xảy ra):

| Thẻ | Lọc ra |
|---|---|
| *tiết cần em viết phản hồi* | bị chấm 1–2 sao mà chưa viết một dòng điều chỉnh |
| *tiết đã quá hạn cập nhật* | quá 48 giờ chưa ghi kết quả |
| *tiết chưa ghi kết quả* | buổi đã qua, chưa cập nhật, nhưng chưa tới mức quá hạn |
| *tiết hệ thống tự chấm* | bị tự ghi 1 sao do quá hạn |

Hàng chip lọc ở mục *Nhiệm vụ của em* dùng **chung một biến bộ lọc** với các thẻ trên, nên
không có hai nguồn sự thật. Mục *“Cần cập nhật kết quả”* tách riêng trước đây đã bỏ: nó vẽ
lại đúng những thẻ mà danh sách chính bên dưới cũng vẽ, và chip *Chưa có kết quả* làm đúng
việc của nó chỉ với một cú bấm.

Danh sách phân trang **6 buổi/trang**. Lưới thẻ dùng `repeat(auto-fill,minmax(300px,1fr))`
kèm `min-width:0` — `1fr` mặc định là `minmax(auto,1fr)`, tức ô lưới **không bao giờ hẹp hơn
nội dung của nó**, và đó chính là thứ đẩy trang tràn ngang. Đã đo lại ở 375 / 1024 / 1140 /
1280 px: không còn thanh cuộn ngang ở cỡ nào.

### Nhiệm vụ kéo dài 2 tiết

Lớp hay được xếp **hai tiết tự học liền nhau**. Nhiệm vụ lớn thì đăng ký **một lần cho cả
hai tiết**: `plans.span` = 1 hoặc 2.

Lưu bằng **độ dài** chứ không phải tiết kết thúc — `period` vẫn là tiết bắt đầu nên mọi
truy vấn cũ theo `period` còn đúng nguyên vẹn, và không thể sinh ra khoảng ngược
(`end < start`). Ràng buộc `period + span - 1 <= 9`.

Ô tick chỉ hiện khi **tiết liền sau cũng là giờ tự học của lớp**, và điều kiện đó được
kiểm lại trong trigger `plans_set_class` (INSERT) lẫn `plans_guard_columns` (UPDATE) —
không phải chỉ ở giao diện. `missing_registrations` xét theo khoảng
`[period, period + span - 1]` nên tiết thứ hai không bị báo thiếu oan.

Ngày và tiết **không sửa được lẻ ở popup chỉnh sửa** nữa: chúng thuộc về *buổi*, sửa lẻ
thì nhiệm vụ lệch khỏi buổi chứa nó. Muốn đổi khung giờ thì xóa và đăng ký lại.

Minh chứng có **bốn dạng** (`evidence.kind`), tối đa 3 mục mỗi nhiệm vụ:

| kind | Lưu ở | Dùng khi |
|---|---|---|
| `text` | `body_text` (1–2000 ký tự) | Sản phẩm nằm trong vở — chỉ cần tả lại đã làm gì |
| `image` / `file` | Storage `evidence/`, signed URL | Ảnh chụp bài ≤ 12 MB, PDF ≤ 5 MB |
| `link` | `external_url` | Canva, Google Docs, Padlet… |

`kind='text'` là bổ sung mới; ràng buộc `evidence_location` chặn text rỗng, và chặn nhầm
lẫn giữa ba dạng (text không được có `storage_path`/`external_url`, và ngược lại).

## 8bis. Import danh sách học sinh

Tab **Học sinh** trên dashboard giáo viên. File mẫu:
`public/templates/Mau_import_danh_sach_hoc_sinh.xlsx` — 3 cột `STT` · `MSHS` ·
`Họ và tên học sinh`. `STT` chỉ để nhìn, **không bao giờ** là khóa dữ liệu.

Luồng bắt buộc: **đọc file → kiểm tra → xem trước → xác nhận → mới ghi.** Không bao giờ
upload-rồi-ghi-thẳng. Hộp xác nhận cuối nói rõ **lớp, năm học và số lượng**.

Bản xem trước gọi `preview_class_roster()` — **dùng chung bộ luật** với
`import_class_roster()`. Nếu để trình duyệt tự đoán, sẽ có ngày giáo viên thấy
"30 hợp lệ" rồi hệ thống ghi ra con số khác.

### Sáu quy tắc an toàn

| Tình huống | Hệ thống làm gì |
|---|---|
| MSHS `0012345` | Giữ nguyên số 0 đầu (đọc dạng text, cột Excel đặt sẵn kiểu Text) |
| MSHS đã có, **tên khác** | **Không ghi đè** tên chính thức. Báo *"Trong hệ thống: …"*, bỏ qua dòng |
| Đang học lớp khác **cùng năm** | Báo **xung đột**, không tự chuyển lớp. Admin xử lý |
| Đã có trong lớp | Không tạo ghi danh trùng |
| **Vắng mặt** trong file mới | **Không** bị xóa. Vắng mặt ≠ lệnh xóa |
| Bấm Import hai lần | `client_token` cho ra kết quả cũ, không nhân bản |

Lỗi mạng giữa chừng thì **giữ nguyên bản xem trước** để bấm lại được — token không đổi
nên bấm lại cũng không ghi hai lần.

Gỡ học sinh khỏi lớp = `is_active = false` ở ghi danh. **Không xóa** học sinh khỏi hệ
thống; tài khoản, ảnh đại diện và lịch sử giữ nguyên.

`student_import_batches` lưu ai import, lúc nào, lớp nào, bao nhiêu dòng — để đối chiếu
khi giáo viên báo *"tôi vừa import nhầm file"*.

### Bộ đọc `.xlsx` tự viết

`src/lib/xlsx.js`, không phụ thuộc thư viện ngoài. Bản `xlsx` trên npm dừng ở 0.18.5 và
còn CVE khi đọc file không tin cậy; bản vá chỉ phát hành ngoài npm. Ở đây chỉ cần đọc ba
cột chữ nên tự đọc gọn hơn và không kéo theo rủi ro nào. Giải nén bằng
`DecompressionStream` có sẵn trong trình duyệt (Chrome 103+, Firefox 113+, Safari 16.4+).

## 8c. Phân tích số liệu

Bốn chỗ, một nguồn số:

| Ở đâu | Ai xem | Hàm |
|---|---|---|
| Tab **Phân tích** trên dashboard giáo viên | GV, TA có `view_plans` | `class_analytics(class, from, to)` |
| Cuối trang **Kế hoạch của em** | chính em đó | `student_analytics(student, from, to)` |
| Tab **Phân tích số liệu** trong popup hồ sơ học sinh | GV / TA phụ trách em | `student_analytics(student, from, to)` |
| Tab **Thống kê** trong trang Quản trị | admin | `school_analytics(from, to, khối, lớp)` |

### Phạm vi luôn nằm trong một năm học

Bản đầu chỉ lọc theo lớp và khoảng ngày. Với một lớp một năm thì đủ, nhưng khi học sinh
**lên lớp**, số liệu cá nhân của em sẽ gộp cả năm cũ lẫn năm mới vào một rổ.

Giờ `student_analytics()` **kẹp** khoảng ngày vào trong năm học hiện tại: dù giao diện gửi
khoảng nào, số liệu cũng không thể tràn sang năm khác. Đã kiểm bằng cách xin thẳng
`2020-01-01 … 2030-12-31` → trả về đúng `2026-08-01 … 2027-05-31`.

Phạm vi mặc định là **trọn năm học**, cắt ở hôm nay — không phải "30 ngày gần nhất", vì
đầu năm học sẽ ra biểu đồ trống trơn.

Bảng *Mức độ sử dụng theo lớp* của admin để biết **lớp nào cần hỗ trợ triển khai**, không
phải bảng xếp hạng lớp.

### Gộp ở CSDL, không gộp ở trình duyệt

Cả ba đều gọi chung `analytics_build()`. Ba lý do đặt ở CSDL:

1. **Một request** thay vì kéo cả nghìn dòng về rồi tính bằng JavaScript.
2. **Một định nghĩa duy nhất** cho "hoàn thành", "trễ hạn", "đúng hạn" — dùng lại view
   `plan_status`. Số của học sinh và số của giáo viên không thể lệch nhau.
3. **Quyền kiểm ở server.** Học sinh gọi thẳng RPC với `student_id` của bạn khác sẽ bị
   `42501`, không phải chỉ bị giao diện giấu đi.

`analytics_build()` là `security definer` nhưng **không cấp quyền cho ai cả** — kể cả
`authenticated`. Chỉ hai hàm bọc ngoài được cấp, và mỗi hàm tự kiểm quyền trước khi gọi:
`class_analytics` kiểm `staff_perm(class, 'view_plans')`, `student_analytics` kiểm
`p_student = auth.uid() or staff_sees_student(p_student, 'view_plans')`.

### Ba quy ước dễ làm sai, đã cố định

- **Nhiệm vụ chưa tới ngày không vào mẫu số.** Tỷ lệ cập nhật và tỷ lệ hoàn thành chỉ tính
  trên `study_date < vn_today()`. Không thì mỗi lần cả lớp đăng ký trước một tuần là tỷ lệ
  hoàn thành tụt xuống, dù chưa ai làm gì sai.
- **Sao hệ thống tự ghi tách khỏi sao thầy cô chấm.** Gộp chung thì trung bình lớp bị kéo
  xuống bởi những tiết chưa ai đọc — biểu đồ sẽ nói sai về chất lượng học. Giao diện hiện
  điểm thầy cô chấm làm số chính, và chỉ ghi thêm một dòng nếu gộp cả sao tự động thì khác.
- **Ngưỡng mẫu tối thiểu 5 nhiệm vụ.** Em dưới ngưỡng bị đánh dấu *"ít dữ liệu"* và làm mờ
  trong bảng. Một em có đúng một nhiệm vụ 5 sao không phải là em học tốt nhất lớp.

Múi giờ: mọi phép nhóm theo ngày dùng `study_date` (vốn đã là ngày theo giờ Việt Nam) và
`vn_today()`; "đúng hạn" so `study_date` với `created_at at time zone 'Asia/Ho_Chi_Minh'`,
đúng bằng công thức mà giao diện dùng.

### Nội dung

KPI · nhịp đăng ký theo ngày · thói quen lập kế hoạch (báo trước bao lâu) · môn/hoạt động ·
theo tiết · phân bố sao · thiết bị điện tử (kèm so sánh điểm có/không thiết bị) · số nhiệm
vụ mỗi buổi · việc còn tồn · bảng từng học sinh có sắp xếp và **xuất CSV**.

Biểu đồ tự vẽ bằng CSS/SVG, không thêm thư viện — mấy hình này đều đơn giản và gói biểu đồ
nào cũng nặng hơn toàn bộ phần còn lại của trang cộng lại.

## 9. Hạn cập nhật kết quả — tự động hóa

Vòng lặp Plan → Do → **Update** → Reflect hay đứt ở bước 3: lúc audit có **7/9 kế hoạch
đã qua ngày không bao giờ được cập nhật kết quả (78%)**. Hệ thống tự xử lý phần này.

### Đồng hồ đếm hạn

```text
mở cập nhật  = MUỘN HƠN giữa (lúc đăng ký) và (giờ bắt đầu tiết)
mốc đếm hạn  = MUỘN HƠN giữa (lúc đăng ký) và (giờ kết thúc tiết cuối)
trễ hạn      = mốc đếm hạn + 48 giờ
tự đánh giá  = mốc đếm hạn + 120 giờ
```

Học sinh được cập nhật từ khi tiết bắt đầu nên nếu hoàn thành sau 20 phút vẫn ghi kết quả
ngay được. Popup chỉ nhắc sau giờ kết thúc thật của tiết; nhiệm vụ kéo dài hai tiết dùng giờ
kết thúc của tiết thứ hai. Hai thời hạn 48/120 giờ nằm ở `app_settings`.

### Trạng thái tiến độ

Suy ra từ dữ liệu, không nhập tay — hàm `progress_status()` và view `plan_status`:

| Trạng thái | Khi nào |
|---|---|
| Chưa tới buổi | Chưa tới giờ bắt đầu tiết |
| Đang thực hiện | Tiết đã bắt đầu nhưng chưa kết thúc; học sinh đã có thể cập nhật |
| Đang chờ cập nhật | Đã hết tiết, còn trong 48 giờ |
| Trễ hạn cập nhật | Quá 48 giờ, chưa có kết quả |
| Hệ thống tự đánh giá | Quá 120 giờ → tự ghi 1 sao |
| Đã hoàn thành | Đã có kết quả |

Giao diện đọc thẳng `plan_status` nên **không có chuyện frontend và CSDL lệch nhau**.

### Job chạy nền

`process_self_study_deadlines()` chạy bằng **pg_cron**, lịch `0 1,12 * * *` UTC
= **08:00 và 19:00 giờ Việt Nam** mỗi ngày.

- Quá 48 giờ → thông báo nhắc học sinh.
- Quá 120 giờ → tạo bản tự đánh giá **1 sao** kèm một trong **10 phản hồi thiện chí**
  (bảng `auto_feedback_templates`), chọn ngẫu nhiên **một lần** rồi lưu vào CSDL —
  không random lại mỗi lần hiển thị.

Hàm **idempotent**: chạy lại bao nhiêu lần cũng không sinh trùng, nhờ khóa
`notifications.dedupe_key` (`task-overdue:<id>`, `task-auto-rating:<id>`) và điều kiện
"chưa có phản tư".

Chạy tay để kiểm tra:

```sql
select public.process_self_study_deadlines();
```

### Cập nhật bổ sung sau hạn

Học sinh vẫn cập nhật được sau khi bị tự đánh giá. Khi đó hệ thống **giữ nguyên** lịch sử
(`auto_evaluated`, `auto_evaluated_at`), đóng dấu `late_result_at` và bật `needs_recheck`
để giáo viên thấy trên dashboard và chấm lại. Học sinh không tự xóa được các dấu này.

## 10. Nhắc quá hạn — hiển thị trong ứng dụng

Không gửi email (lý do ở mục 2), nên các nhắc nhở nằm ngay trên màn hình:

- **Giáo viên** — thẻ *“Cần chú ý”* trên dashboard: bao nhiêu em chưa lập kế hoạch cho
  ngày mai (kèm tên), bao nhiêu em còn tiết chưa cập nhật kết quả, bao nhiêu em đang chờ
  tự đặt lại mật khẩu.
- **Học sinh** — ngay sau khi buổi tự học kết thúc, popup gom tối đa ba việc quan trọng
  và có nút đi thẳng tới các nhiệm vụ cần cập nhật. Popup chỉ nhắc một lần trong phiên,
  tách theo từng học sinh trên thiết bị dùng chung. Phần nhìn lại ngắn là bắt buộc;
  minh chứng bằng chữ, ảnh, file hoặc liên kết được khuyến khích nhưng không bắt buộc.

## 11. Deploy Edge Functions

Không cần `login` tương tác — đặt sẵn access token là deploy được:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy register-student --project-ref qzvlwffxvewhfztnxxzb --no-verify-jwt
```

Bốn function cần deploy:

```bash
npx supabase functions deploy register-student        --project-ref qzvlwffxvewhfztnxxzb --no-verify-jwt
npx supabase functions deploy teacher-reset-password  --project-ref qzvlwffxvewhfztnxxzb --no-verify-jwt
npx supabase functions deploy student-change-password --project-ref qzvlwffxvewhfztnxxzb --no-verify-jwt
npx supabase functions deploy admin-manage-teacher    --project-ref qzvlwffxvewhfztnxxzb --no-verify-jwt
```

`verify_jwt = false` là chủ ý — mỗi function tự kiểm quyền bên trong:

| Function | Ai gọi được | Tự kiểm gì |
|---|---|---|
| `register-student` | công khai | khớp ghi danh năm hiện hành + MSHS chưa claim |
| `teacher-reset-password` | GV / admin | Bearer token; giáo viên phải **đã được duyệt** và phân công **còn hiệu lực** |
| `student-change-password` | mọi vai trò | đúng mật khẩu hiện tại, đủ luật mật khẩu |
| `admin-manage-teacher` | admin | đọc `role` **từ CSDL**, không từ email trong token |

> `student-change-password` trước đây chặn `role !== 'student'`. Từ khi quản trị viên tạo
> được tài khoản giáo viên kèm mật khẩu tạm, cái chặn đó khiến **giáo viên mới kẹt cứng**
> ở màn hình đổi mật khẩu, không vào được hệ thống. Giờ dùng cho mọi vai trò, và lấy đúng
> email đăng nhập theo từng vai trò (học sinh là `MSHS@domain`, nhân sự là email thật).

`admin-manage-teacher` có năm action, `create` và `bulk` dùng chung `upsertTeacher()` nên
hai đường không thể lệch luật:

| action | Việc |
|---|---|
| `create` | Tạo tài khoản + gán lớp trong một bước, trả mật khẩu tạm một lần |
| `bulk` | Import cả danh sách từ Excel trong một lần gọi |
| `assign` | Gán thêm lớp cho giáo viên đã có |
| `reset` | Cấp lại mật khẩu tạm cho một người |
| `bulk-reset` | Cấp lại cho nhiều người, tải về CSV — lối thoát khi lỡ mất mật khẩu tạm |

## 11a. Bảo mật và chịu tải

### Quyền cấp bảng: hai lớp, không phải một

Supabase cấp sẵn **toàn quyền cho `anon` và `authenticated`** trên mọi bảng mới tạo trong
schema `public`. Bảng cũ đã thu hồi thủ công, nhưng bảng thêm ở file 2 và 3 thì chưa —
kiểm tra thực tế phát hiện `anon` (người **chưa đăng nhập**) đang có
`INSERT/UPDATE/DELETE/TRUNCATE` trên `audit_log`, `class_catalog`,
`student_import_batches`, `student_import_rows`, `class_access_requests`.

RLS vẫn chặn từng dòng nên chưa có rò rỉ. Nhưng như thế là đang dựa vào **một** lớp phòng
thủ: chỉ cần một bảng sau này quên bật policy là thủng. File 4 thu hồi sạch của `anon`
rồi cấp lại đúng phần `authenticated` cần.

Tương tự với hàm: **31 hàm** `security definer` đang cho `anon` gọi. Phần lớn trả về
`false` vì `auth.uid()` là NULL, nhưng `setting_text()` thì lộ được cấu hình hệ thống, và
các hàm trigger không có lý do gì để lộ ra API. Sau khi gia cố:

| | Trước | Sau |
|---|---|---|
| Bảng `anon` chạm được | 8 | **0** |
| Hàm `anon` gọi được | 31 | **0** |

`analytics_build()` / `analytics_build_many()` **không cấp cho ai cả** — chúng không tự
kiểm quyền, chỉ được gọi từ trong ba hàm bọc ngoài đã kiểm sẵn.

### Chịu tải

Hiện 1 lớp / ~120 nhiệm vụ nên truy vấn nào cũng nhanh. Ở quy mô 30 lớp (~900 học sinh,
vài chục nghìn nhiệm vụ mỗi năm) thì thiếu chỉ mục sẽ thành quét toàn bảng mỗi lần mở
dashboard. File 4 thêm 7 chỉ mục theo đúng hình dạng truy vấn thật của giao diện.

`statement_timeout` do Supabase đặt sẵn: `authenticated` 8s, `anon` 3s — một truy vấn hỏng
không giữ kết nối mãi.

Ba giới hạn nghiệp vụ chống lạm dụng, đặt ở trigger nên gọi thẳng API cũng không lách được:

| Giới hạn | Ngăn |
|---|---|
| ≤ 20 nhiệm vụ mỗi buổi | Một tài khoản làm phình bảng `plans` |
| ≤ 20 tin nhắn mỗi phút | Spam luồng chat |
| `protect_last_admin` | Mất sạch quản trị viên (đã xảy ra thật — xem mục 12) |

`prune_old_data()` chạy 2 giờ sáng Chủ nhật: xóa thông báo **đã đọc** cũ hơn 120 ngày và
chi tiết từng dòng import cũ hơn 90 ngày. Bản tóm tắt `student_import_batches` **giữ vĩnh
viễn** để còn đối chiếu khi giáo viên báo nhập nhầm file.

Job này **không đụng tới kế hoạch, phản tư, minh chứng hay điểm sao** — không có dữ liệu học
tập nào bị xóa, ở bất kỳ thời điểm nào. Nó chỉ dọn hai thứ vô hại: thông báo cũ trong chuông
mà em đã đọc rồi, và bản nháp từng dòng của các lần import cũ.

### Chỉ nạp phần đang cần — lọc theo lớp, theo khoảng thời gian

Chỉ mục thôi chưa đủ. Bảng điều khiển giáo viên trước đây gọi
`from('plans').select('*')` **không kèm điều kiện lọc nào** — nó kéo về mọi kế hoạch mà RLS
cho phép nhìn thấy. Với một lớp thì không ai nhận ra; với giáo viên dạy nhiều lớp qua nhiều
năm — và nhất là **tài khoản quản trị, vốn nhìn thấy toàn trường** — thì mỗi lần mở trang là
một lần tải về toàn bộ lịch sử. Trang TA mắc đúng lỗi đó.

Đo trên bảng thử 90.000 dòng (30 lớp × 30 em × 100 nhiệm vụ/năm), cùng chỉ mục
`(class_id, study_date desc, student_id)`:

| Truy vấn | Kế hoạch thực thi | Thời gian | Dòng trả về |
|---|---|---|---|
| Không lọc gì (mã cũ) | Seq Scan — quét toàn bảng | 120,4 ms | 90.000 |
| Lọc theo lớp, cả năm | Index Scan | 7,9 ms | 3.000 |
| Lọc theo lớp + 60 ngày | Index Scan | **3,2 ms** | **600** |

Thời gian truy vấn giảm 38 lần, nhưng phần quan trọng hơn là **lượng dữ liệu đi qua mạng**:
600 dòng thay vì 90.000 — và mỗi dòng kế hoạch còn kéo theo phản tư, minh chứng, trạng thái
tiến độ đi cùng.

Lớp thuộc đúng một năm học, nên **lọc theo lớp đã tự khoanh luôn theo năm** — không cần điều
kiện riêng cho năm học.

Ô **“Nạp: 60 ngày qua”** trên thanh lọc cho giáo viên tự chọn 30 / 60 / 120 ngày / cả năm.
Cần phân biệt với hai ô **“Từ ngày / Đến ngày”** ngay cạnh: ô *Nạp* quyết định lấy bao nhiêu
về máy, hai ô kia chỉ lọc trong phần đã lấy.

### Cắt khúc mọi truy vấn `.in(...)`

PostgREST nhét cả danh sách id vào query string. Một lớp 32 em trong 60 ngày là ~550 kế
hoạch; 550 uuid là URL dài hơn 20 KB — vượt giới hạn proxy và trả về 414 mà **không có thông
báo lỗi rõ ràng**, giao diện chỉ hiện trống trơn.

`selectIn()` trong [`src/lib/query.js`](src/lib/query.js) cắt thành khúc 150 id, chạy song
song rồi gộp lại. Mọi chỗ trước đây dùng `.in('plan_id', ids)` đều đã chuyển sang hàm này.

### Ảnh minh chứng: nén trên máy học sinh trước khi tải lên

Đo trên dữ liệu thật: 21 file minh chứng thì **cả 21 đều là ảnh**, JPEG trung bình **732 KB**,
file lớn nhất **3,5 MB**. Đó là ảnh gốc điện thoại — 4000×3000 px, trong khi màn hình thầy cô
chỉ cần khoảng 1600 px là đã dư nét.

[`src/lib/image.js`](src/lib/image.js) thu ảnh về cạnh dài 1600 px, mã hóa WebP chất lượng
0,82 — nhẹ đi khoảng 6 lần. Nén ở trình duyệt chứ không phải ở máy chủ, nên mạng nhà trường
cũng không phải cõng 3,5 MB rồi mới biết là thừa.

Ba lối thoát an toàn: trình duyệt cũ không có `createImageBitmap`, không encode được WebP,
hoặc nén xong lại to hơn bản gốc (ảnh vốn đã nhỏ) → giữ nguyên file gốc. Thà nặng còn hơn em
không nộp được bài.

Vì ảnh được nén trước khi lên, mốc cho phép nâng từ 5 MB lên **12 MB cho ảnh**; PDF tải lên
nguyên trạng nên vẫn giữ 5 MB.

Bucket `evidence` phải cho phép `image/webp` và có `file_size_limit` 12 MB. Nếu bucket chỉ
nhận JPEG/PNG, chính ảnh đã nén thành WebP sẽ bị Storage từ chối dù file nhẹ hơn.

### Vì sao không chuyển kho ảnh sang Google Drive

Đã cân nhắc và **không làm**, vì ba lý do kỹ thuật:

1. **Không có chỗ an toàn để giữ khóa.** Truy cập Drive cần OAuth token hoặc service account.
   Không được đưa thứ đó xuống frontend — cùng nguyên tắc với service-role key. Muốn làm đúng
   thì phải qua Edge Function, tức là thêm một tầng phải tự bảo trì.
2. **Drive không hiểu RLS.** Hiện mỗi lần xem ảnh, hệ thống cấp một link ký hạn 120 giây, và
   ai được xem thì do chính RLS quyết định. Trên Drive chỉ có hai lựa chọn: “ai có link đều
   xem được” (rò rỉ bài làm của học sinh) hoặc chia sẻ từng người (không quản nổi ở quy mô
   900 em).
3. **Bài làm của trẻ vị thành niên** nằm trong Drive cá nhân của một giáo viên là quản trị dữ
   liệu kém hơn hẳn so với một bucket có phân quyền.

Sau khi nén, ước tính ở quy mô toàn trường còn khoảng **1,4 GB/năm** thay vì ~8,3 GB — bài
toán dung lượng không còn là lý do phải đổi kiến trúc.

## 11b. Kiểm tra hồi quy

```bash
npm run regress
```

Chạy thẳng vào Supabase thật, **chỉ đọc** — bước cuối tự kiểm rằng không có dòng nào bị
đổi. Kiểm 18 điểm: cấu trúc còn đủ, không còn dữ liệu hổng, admin vừa có quyền quản trị
vừa có quyền giáo viên, học sinh bị chặn đúng chỗ, và số liệu bị kẹp trong năm học.

> Bộ test **không cắm số cứng** — mọi mốc đều chụp ngay đầu lần chạy. Học sinh vẫn đang
> dùng hệ thống thật nên số nhiệm vụ/phản tư đổi từng ngày; test cắm số cứng sẽ báo động
> giả rồi mất luôn tác dụng.

## 11bis. Chấm sao hàng loạt

Một lớp 32 em, mỗi tuần vài tiết tự học. Mở từng popup để chấm là hàng trăm cú bấm mỗi tuần,
trong khi phần lớn các tiết đều "đạt" — thứ đáng dừng lại đọc kỹ chỉ là số ít.

Bấm ô **Chờ chấm sao** → thanh thao tác hiện nút *"Chọn N chờ chấm sao"* → *"Chấm sao N tiết"*.
Toàn bộ ở [`supabase/schema-7-bulk-rating.sql`](supabase/schema-7-bulk-rating.sql).

### Ba lằn ranh an toàn

1. **Mặc định KHÔNG đè lên sao thầy cô đã chấm.** Chọn 25 dòng mà 3 dòng đã có 5 sao rồi bấm
   "chấm 4 sao" — hạ điểm 3 em đó xuống là chuyện không ai ngờ tới. Muốn đè phải bật một công
   tắc riêng, và công tắc đó nói rõ *sẽ đè lên mấy tiết*.
2. **Chỉ chấm được tiết ĐÃ CÓ kết quả.** Tiết em chưa cập nhật thì không có gì để chấm; tạo
   phản tư rỗng thay em là làm sai dữ liệu.
3. **Tiết bị hệ thống tự chấm 1 sao được tính là "chưa chấm"** — đây chính là nhóm cần thầy cô
   xem lại nhiều nhất, nên nó nằm trong tầm với của thao tác hàng loạt.

Để trống ô nhận xét thì nhận xét cũ của từng tiết **được giữ nguyên**, không bị xoá.

### Không nới quyền cho ai

`bulk_rate_reflections` **không** dùng `security definer` — giống hệt `bulk_review_plans`. Nó chỉ
gom nhiều lần UPDATE thành một lượt gọi; RLS và trigger `reflections_guard_columns` vẫn chạy đủ.

Đã thử bằng phiên đăng nhập thật của học sinh gọi thẳng API: **HTTP 400, sao vẫn `null`**.

### Hai lỗi phát hiện khi kiểm chứng

**Đếm sai số tiết đã chấm.** Guard hoàn nguyên cột `rating` khi người gọi không có quyền, nhưng
câu UPDATE vẫn coi như đã đụng vào dòng đó nên `RETURNING` vẫn trả về. Bản đầu đếm theo đó nên
báo *"đã chấm 1"* cho cả tài khoản **học sinh** — dữ liệu không hề đổi, nhưng con số báo về thì
sai. `RETURNING` trả giá trị **sau** khi BEFORE trigger chạy, nên lọc theo đúng số sao mong muốn
là đếm được phần có hiệu lực thật; lệch nhau thì báo lỗi quyền thẳng.

**Cờ tự động không bao giờ tắt.** `mark_late_result` bật `needs_recheck`, và `process_self_study_deadlines`
bật `auto_evaluated` — nhưng không chỗ nào tắt chúng khi thầy cô chấm lại. Hậu quả: chấm xong,
ô *"Bổ sung muộn"* và *"Hệ thống tự chấm"* vẫn đếm tiết đó, còn ô *"Đã chấm sao"* vẫn không đếm.
Thầy cô làm xong việc mà bảng điều khiển vẫn báo còn việc.

Trigger `trg_zz_clear_recheck` tắt cả hai cờ khi `rating_at` đổi. Bám vào `rating_at` thay vì tự
kiểm quyền lần nữa: cột đó chỉ đổi khi guard đã xác nhận người chấm **có** quyền, nên hai chỗ
không thể lệch nhau. Tên bắt đầu bằng `trg_zz` để chạy sau cùng — Postgres gọi trigger theo thứ
tự bảng chữ cái.

## 11c. Chia sẻ sách

Mỗi tuần một học sinh giới thiệu một cuốn sách trước lớp. Em nộp nội dung và link trình chiếu
**trước ngày báo cáo 3 ngày**. Toàn bộ nằm ở [`supabase/schema-5-books.sql`](supabase/schema-5-books.sql)
và [`src/components/BookShare.jsx`](src/components/BookShare.jsx).

### Công tắc theo lớp — không phải lớp nào cũng làm

`classes.book_share_enabled`, **chỉ quản trị viên bật/tắt** (tab *Lớp học* trong trang Quản trị).
Lớp chưa bật thì mục lục, tab giáo viên, thẻ học sinh đều ẩn. Hiện chỉ bật cho **8A7**.

Quyền kiểm ở `set_book_share_enabled()` — `is_admin()` chứ không phải chỉ ẩn nút.

### Lịch là dữ liệu, không phải code

`book_share_weeks` giữ 43 tuần với ba loại:

| Loại | Nghĩa |
|---|---|
| `share` | Tuần có chia sẻ, đã xếp học sinh |
| `reserve` | **Tuần dự phòng** — để trống, dùng khi cần dời lịch |
| `off` | Nghỉ hẳn: ôn thi, thi, Tết |

Chỉ tuần **ôn thi / thi / Tết** mới là `off`. Mọi tuần trống còn lại là **dự phòng**, để giáo
viên có chỗ dời khi một em ốm hay lớp có sự kiện. 8A7 hiện: **31 share · 6 dự phòng · 6 nghỉ**.

`due_date` là **cột GENERATED** `= report_date - 3`. Không ai ghi tay vào được, và đổi ngày báo
cáo là nó tự tính lại — đúng hành vi file Excel gốc. Ba tuần dời lịch (20/11, Noel, 16/04) chỉ
là ba dòng dữ liệu khác nhau, không phải ba nhánh `if` trong code.

Giáo viên đổi loại tuần, dời ngày, xếp lại học sinh ngay trong bảng ở tab **Chia sẻ sách**;
hoặc nhập hàng loạt từ [file mẫu](public/templates/Mau_lich_chia_se_sach.xlsx).

### Thẻ của học sinh: gập lại, đổi màu theo giai đoạn

Thẻ mở sẵn chiếm gần trọn màn hình đầu tiên của trang *Kế hoạch của em*, mà phần lớn thời gian
em chẳng có gì để sửa. Nay **mặc định gập lại — 90px thay vì ~600px**, bấm mới mở form.

Dòng tóm tắt vẫn nói đủ để em biết có cần bấm hay không: tuần · tên sách (hoặc *“Bấm để nhập
bài chia sẻ của em”* khi còn trống) · ngày báo cáo · hạn nộp kèm đếm ngược · huy hiệu trạng thái.

**Sáu giai đoạn, mỗi giai đoạn một màu viền trái** — nhìn màu là biết đang ở đâu, không cần đọc chữ:

| Giai đoạn | Màu | Khi nào |
|---|---|---|
| `waiting` | xám | còn hơn 3 ngày tới hạn |
| `soon` | vàng | còn ≤ 3 ngày, chưa có link |
| `late` | đỏ (kèm nền hồng nhạt) | quá hạn, chưa có link |
| `submitted` | xanh lá | đã nộp link, chờ tới buổi |
| `shared` | xanh dương | đã đứng lớp chia sẻ |
| `done` | xanh lá đậm | thầy cô đã chấm |

Màu chuyển **dần** theo mức cấp bách chứ không nhảy thẳng từ xám sang đỏ. Mỗi giai đoạn kèm một
câu gợi ý riêng khi mở thẻ ra.

### Nút mở bài trình chiếu cố tình TO

`.canva-button` — **1135×70px** trên thẻ học sinh, **636×70px** trong popup. Đây là thứ người
xem vào đây để bấm; để nó thành một link chữ nhỏ lẫn giữa các link phụ là chôn mất nó.

Trong bảng kết quả thì là nút *“Xem bài”* có nền và viền (97×34px), không phải chữ gạch chân.

### Popup chi tiết — đủ để đọc và để chấm

Bấm một dòng trong bảng kết quả mở popup: tên sách cỡ lớn, tác giả + người giới thiệu + số sao
trên một dòng, **nút Canva ngay dưới tiêu đề**, rồi *Tóm tắt nội dung* và *Bài học rút ra* (mục
này có vạch nhấn bên trái), cuối cùng là nhận xét của giáo viên và cán sự.

Popup **chấm điểm của giáo viên dùng cùng bố cục ấy**, cộng thêm phần đánh giá ở cuối. Trước đây
nó chỉ hiện tên sách trơ trọi — thầy cô phải mở hai chỗ rồi nhớ chéo qua lại mới chấm được.

### Học sinh chỉ sửa được nội dung — chặn bằng trigger, không bằng RLS

RLS chặn được **dòng** chứ không chặn được **cột**. Nếu chỉ dựa vào RLS thì em nào biết gọi API
là tự chấm 5 sao cho mình được. `book_shares_guard_columns` (cùng cơ chế với `plans_guard_columns`)
hoàn nguyên mọi cột ngoài phạm vi của người đang sửa:

| Ai | Sửa được |
|---|---|
| Học sinh (chính chủ) | tên sách · tác giả · tóm tắt · bài học · link |
| Cán sự thư viện | nhận xét cán sự |
| Giáo viên | tất cả, kể cả phân công tuần |

Đã thử tấn công thật bằng phiên đăng nhập của học sinh, gọi thẳng PostgREST:

| Tấn công | Kết quả |
|---|---|
| Tự chấm 5 sao + tự viết nhận xét giáo viên + tự đánh dấu đã chia sẻ | HTTP 200 nhưng **cả 4 cột vẫn null** — trigger hoàn nguyên |
| Đổi ngày báo cáo của tuần | RLS chặn — ngày giữ nguyên |
| Xoá lượt của bạn khác | RLS chặn — dòng còn nguyên |
| Đổi chủ nhân lượt sang bạn khác | trigger hoàn nguyên — `mshs` không đổi |

Trong cả bốn lần, phần nội dung em **được phép** sửa vẫn giữ nguyên vẹn.

### Cán sự thư viện tái dùng bảng trợ giảng

Thêm cờ `class_assistants.can_review_books` thay vì dựng hệ vai trò thứ hai. Cán sự thấy dải
*Sắp chia sẻ sách* ngay đầu trang trợ giảng và viết được nhận xét trong bảng lớp.

### Hai dashboard tách hẳn nhau

Chia sẻ sách **không nằm trong dashboard tự học**. Nó có mục lục riêng và trang riêng
(`#/books`), vì hai hoạt động khác nhịp (tự học hằng ngày, chia sẻ sách hằng tuần), khác người
theo dõi (cán sự thư viện chỉ quan tâm phần sách) và khác vòng đời. Gộp chung thì thanh tab
phình ra và hộp việc cần xử lý lẫn hai loại việc không liên quan.

| Vai trò | Thấy gì ở `#/books` |
|---|---|
| Học sinh | **Kết quả chia sẻ** — bảng 5 cột: họ tên · tên sách · nội dung · bài học rút ra · link |
| Cán sự thư viện | thêm dải *Sắp chia sẻ sách* và ô nhận xét trong popup chi tiết |
| Giáo viên | thêm tab *Xếp lịch & chấm* |

Bảng kết quả cố ý **đơn giản**: chỉ hiện lượt đã có nội dung, không có cột tuần, ngày báo cáo
hay trạng thái. Học sinh vào đây để đọc bạn mình giới thiệu sách gì, không phải để theo dõi
tiến độ — theo dõi tiến độ là việc của giáo viên, ở tab bên cạnh.

### Công tắc lớp phải nạp cùng lúc với lớp

Ban đầu tôi đọc `book_share_enabled` bằng một `useEffect` riêng chạy sau khi có `classId`. Hậu
quả: mục lục và các tab liên quan hiện lên trễ vài trăm mili giây — nhìn như giao diện nhấp
nháy, lúc ẩn lúc hiện. Nay công tắc được đọc **trong chính `loadProfile`**, cùng một lượt với
lớp, nên `context` không bao giờ ở trạng thái "đã có lớp nhưng chưa biết có bật hay không".

### Nhìn thấy liên tục, không chỉ lúc có thông báo

Thông báo đẩy một lần rồi trôi; lịch thì phải luôn nhìn thấy. Nên có **cả hai**:

- Dải **Sắp chia sẻ sách** (4 tuần) ngay đầu trang `#/books`, hiện tên em sắp tới lượt, tình
  trạng nộp bài, và **tô đỏ dòng quá hạn nộp mà link còn trống**.
- Bảng **Kết quả chia sẻ** — ai trong lớp cũng vào đọc bất cứ lúc nào.

Năm mốc nhắc, chạy trên `process_book_share_reminders()` lúc 08:00 giờ Việt Nam, `dedupe_key`
đảm bảo không nhắc trùng:

| Mốc | Ai nhận |
|---|---|
| Sáng thứ Hai — tóm tắt tuần này + tuần sau | GV + cán sự |
| Báo cáo − 7 ngày | Học sinh |
| Báo cáo − 3 ngày (hạn nộp), chỉ khi link còn trống | Học sinh |
| Báo cáo − 1 ngày | GV + cán sự |
| Quá hạn nộp | GV + cán sự |

### Ba chi tiết dễ làm sai, đã cố định

1. **`upcoming_book_shares` sắp theo `report_date`, không phải `starts_on`.** Giáo viên dời lịch
   là hai mốc này lệch nhau — lúc kiểm chứng, ô dashboard hiện “tuần 4” trong khi tuần 42 báo cáo
   sớm hơn 9 ngày.
2. **`teacher_by` / `monitor_by` dùng `ON DELETE SET NULL`.** Không có thì xoá một tài khoản giáo
   viên cũ sẽ bị khoá lại vì còn bài chia sẻ tham chiếu tới.
3. **“Công khai” nghĩa là công khai TRONG LỚP.** Trang `#/books` vẫn yêu cầu đăng nhập và RLS vẫn
   chặn người ngoài lớp. Bài làm của học sinh chưa thành niên không nên để ai có link cũng đọc được.

Hai bảng mới cũng bị thu hồi quyền `anon` như mục 17/18 — **0 bảng, 0 hàm**. Hàm trigger nằm ngoài
whitelist nên phải revoke tay; kiểm tra thực tế bắt được đúng một hàm bị sót.

## 11d. Quên đăng ký tự học — miễn trừ, miễn buổi, kỷ luật

[`schema-8-attendance.sql`](supabase/schema-8-attendance.sql) và
[`schema-9-terms.sql`](supabase/schema-9-terms.sql).

### Mỗi lớp tự khai mốc của mình

Hệ thống dùng cho toàn trường: mỗi lớp bắt đầu áp dụng ở một thời điểm khác nhau, và mốc học kỳ
đổi theo từng năm. Nên đây là **ô nhập trên giao diện**, không phải hằng số trong mã nguồn.

Tab **Kỷ luật** → giáo viên khai: ngày bắt đầu tính · số lần miễn trừ · đầu và cuối của **cả hai
học kỳ**. Lớp chưa bật thì học sinh không thấy popup và hệ thống không ghi nhận gì.

Ba quy tắc về khoảng đếm:

1. **Bộ đếm tự về 0 khi sang học kỳ II** — `term_bounds()` trả về khoảng đang áp dụng.
2. **Không bao giờ đếm trước `tracking_from`**, kể cả khi học kỳ bắt đầu sớm hơn. Lớp áp dụng
   giữa chừng thì phần trước đó không tính.
3. **Ngoài hai khoảng đã khai — nghỉ hè, nghỉ Tết, giữa hai học kỳ — không ghi nhận gì.**

### Vì sao phải LƯU những lần quên thay vì đếm lại

Lịch tự học của lớp có thể đổi giữa năm. Đếm lại theo lịch hiện tại sẽ làm những lần quên trong
quá khứ **biến mất hoặc tự mọc thêm** — mà đây là dữ liệu dùng để kỷ luật học sinh, không được
phép đổi sau lưng. Nên có bảng `attendance_misses`, được cron chốt lúc **00:05 giờ Việt Nam
của ngày hôm sau** — sau khi hạn 24:00 đã qua.

Hàm mặc định xử lý **ngày vừa kết thúc** (`vn_today() - 1`). Vì lớp có thể đang bật
*"cho phép đăng ký trễ"*, học sinh đăng ký trong giờ cuối cùng của ngày vẫn phải được tính là có đăng ký.

### Thang kỷ luật

Tính theo **tổng số lần quên trong học kỳ**, không cộng dồn hình phạt — quên lần thứ 5 thì mức là
"10 lượt", không phải 5 + 10.

| Số lần | Mức |
|---|---|
| 1–3 | Được miễn trừ, không có kỷ luật |
| Lần 4 | Lao động công ích 5 lượt |
| Lần 5 | Lao động công ích 10 lượt |
| Từ lần 6 | Thầy cô trao đổi với phụ huynh |

Bảng quy định hiển thị **ngay trong popup** và dòng em đang ở được đánh dấu — học sinh đọc được
luật đúng lúc bị nhắc, chứ không phải đi tìm trong trang hướng dẫn.

### Miễn buổi — một cơ chế, hai tình huống

`attendance_exemptions`: `mshs` NULL là **cả lớp** (thứ Sáu tiết 8–9 đi sự kiện), có giá trị là
**riêng một em** (nghỉ ốm). `period` NULL là cả ngày.

Ba điều đã đo bằng dữ liệu thật của 8A7 (thứ Sáu có tiết 8 và 9, 32 em):

| Tình huống | Số lượt quên ghi nhận |
|---|---|
| Không miễn | **64** = 32 em × 2 tiết |
| Miễn cả lớp | **0** |
| Miễn riêng một em | **62** |
| Miễn **sau khi** sổ đã ghi | lượt đã ghi bị **gỡ** |

Trường hợp cuối quan trọng: giáo viên bấm miễn sau khi hết ngày là chuyện bình thường (em xin
phép muộn), và lúc đó sổ đã ghi rồi — không gỡ thì em bị tính oan.

`missing_registrations()` cũng phải tôn trọng lệnh miễn, nếu không giáo viên vừa bấm miễn cả lớp
xong mở tab ra vẫn thấy 31 em bị gắn cờ thiếu — nút miễn nhìn như không có tác dụng.

### Popup nhắc việc

`StudentAlerts` gộp tối đa ba việc vào **một** popup, xếp theo mức cấp bách:

| Việc | Khi nào | Nút |
|---|---|---|
| Chưa đăng ký tự học hôm nay | lớp có tiết mà em chưa có kế hoạch | *Đăng ký ngay* |
| Sắp tới hạn nộp bài chia sẻ sách | **từ trước hạn một tuần**, cho tới khi nộp | *Nhập bài chia sẻ* |
| Mức kỷ luật đang ở | đã quên ít nhất một lần | — |

Đóng popup chỉ có tác dụng **trong phiên hiện tại** — lần sau vào lại vẫn hiện. Việc chưa xong thì
không được phép tắt vĩnh viễn; chỉ khi em nộp bài / đăng ký xong thì nó mới thực sự biến mất.

Hai nút đều đưa **thẳng tới chỗ cần làm**: mở form đăng ký và cuộn lên đầu, hoặc bung thẻ chia sẻ
sách và cuộn tới. Bấm xong mà vẫn phải tự đi tìm thì nút không có ý nghĩa gì.

### Dashboard giáo viên

Ô **"Đang chịu kỷ luật"** trong hộp việc cần xử lý, đổi nhãn thành *"có em cần mời PH"* khi có em
ở bậc cao nhất. Bấm vào mở tab **Kỷ luật** — ba ô tổng hợp theo mức, kèm bảng chi tiết.

Sổ `attendance_misses` có RLS chặt hơn phần còn lại: **em chỉ đọc được dòng của chính mình**. Số
lần quên của bạn khác là chuyện riêng của bạn ấy. Không ai ghi tay vào sổ được — policy ghi là
`false`, chỉ cron và hàm miễn buổi đụng tới được.

## 12. Quyền dữ liệu

**Học sinh** — chỉ đọc/ghi dữ liệu của chính mình; không đọc danh sách lớp; chỉ tạo kế
hoạch cho hôm nay trở đi; chỉ sửa/xóa kế hoạch còn ở tương lai; chỉ nộp phản tư và minh
chứng vào ngày học hoặc sau đó; không tự duyệt đăng ký thiết bị; không tự viết nhận xét
giáo viên; không tự hạ cờ đổi mật khẩu.

**Giáo viên** (đã được duyệt) — đọc toàn bộ dữ liệu **lớp mình phụ trách**; xem minh chứng
bằng signed URL; duyệt/từ chối đăng ký thiết bị; nhận xét phản tư và đánh dấu đã xử lý yêu
cầu hỗ trợ; đặt lại mật khẩu học sinh lớp mình; import danh sách lớp; xuất CSV. **Không**
sửa hay xóa được kế hoạch, tự đánh giá của học sinh.

**Giáo viên chờ duyệt / bị tạm khóa** — quyền dữ liệu gần như bằng người chưa đăng nhập:
chỉ đọc được hồ sơ của chính mình. Bốn hàm `teaches_*` đều đòi `approval_status='approved'`
nên gọi thẳng API cũng không đọc được roster hay kế hoạch của lớp nào. Giao diện chỉ hiện
màn hình *"Tài khoản đang chờ duyệt"* cho dễ hiểu — hàng rào thật nằm ở RLS.

**Quản trị viên** — toàn trường, qua nhánh `is_admin()` trong chính bốn hàm đó nên không
cần policy riêng cho từng bảng. Quản lý năm học, danh mục lớp, tài khoản và phân công giáo
viên. Vẫn dùng tài khoản `authenticated` + RLS như mọi người; **service_role key không bao
giờ xuống frontend**.

**Không ai xem được mật khẩu của ai.** Mật khẩu tạm chỉ tồn tại trong bộ nhớ trình duyệt
đúng một lần lúc tạo — server chỉ lưu bản băm.

### Không bao giờ được phép còn 0 quản trị viên

**Đã xảy ra thật.** Danh sách giáo viên đầu năm có cả dòng của chính quản trị viên (vì
admin cũng chủ nhiệm một lớp). Import ghi đè `role='teacher'` lên hồ sơ đó → hệ thống mất
sạch admin, không ai vào lại được trang quản trị. Phải khôi phục bằng service role.

Hai lớp bảo vệ, cả hai đều cần vì chúng chặn ở hai tầng khác nhau:

1. **Edge Function** — `upsertTeacher()` không gán `role` khi hồ sơ hiện tại đã là `admin`.
2. **Trigger `protect_last_admin`** — chặn hạ quyền *hoặc* khóa người admin **cuối cùng**,
   ở tầng database. Đã kiểm: **service role cũng không vượt qua được**. Có admin thứ hai
   thì lại hạ được người kia bình thường — đây là chốt an toàn, không phải chặn cứng.

Ranh giới được giữ bằng ba lớp: RLS theo dòng, grant theo bảng, và trigger tách cột
(`plans_guard_columns`, `reflections_guard_columns`) — vì RLS chặn được dòng nhưng không
chặn được cột.

> Các policy tra chéo giữa `students` và `enrollments` phải gọi qua hàm `security definer`
> (`teaches_mshs`, `my_mshs`). Viết thẳng `exists (select … from enrollments)` trong policy
> của `students` sẽ khiến Postgres báo `42P17 infinite recursion`.

## 13. Cấu trúc

```text
src/
  components/   Layout · ProtectedRoute · PasswordGate · TeacherGate · StatusBadge
                Avatar · ChatPanel · Analytics · SchoolAnalytics
                SessionRegister · ClassSchedule · ClassSwitcher
                RosterPanel · StudentImport · TeacherImport · TeacherOnboarding
  context/      AuthContext (phiên, hồ sơ, lớp/năm, danh sách lớp, cờ khôi phục)
  lib/          supabase.js (client, email học sinh, gọi Edge Function)
                xlsx.js      (đọc .xlsx, không phụ thuộc thư viện ngoài)
  pages/        Home · Guide · Register · Login · Student · Teacher · Ta · Admin
  utils/        date.js · password.js · roles.js
public/
  templates/    Mau_import_giao_vien.xlsx · Mau_import_danh_sach_hoc_sinh.xlsx
supabase/
  schema.sql            # lõi — chạy trước
  schema-2-school.sql   # vai trò, danh mục lớp, bảng import
  schema-3-rls.sql      # quyền, nghiệp vụ, số liệu, chuyển dữ liệu cũ
  functions/
    _shared/common.ts            # CORS, luật mật khẩu
    register-student/
    teacher-reset-password/
    student-change-password/
    admin-manage-teacher/        # tạo / import / gán lớp / cấp lại mật khẩu
scripts/
  create-teacher.mjs             # tạo 1 giáo viên từ .env.admin
  setup-class.mjs                # năm học + lớp + giáo viên + ghi danh
admin/
  class.example.json             # mẫu; file thật đã gitignore
.github/workflows/
  deploy-pages.yml
```
