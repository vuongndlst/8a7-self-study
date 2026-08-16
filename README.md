# Self-Study — quản lý giờ tự học

Web quản lý giờ tự học theo quy trình **Plan → Do → Reflect**.

**Đang chạy tại:** https://vuongndlst.github.io/8a7-self-study/

- Frontend: React + Vite · Hosting: GitHub Pages · Backend: Supabase
- Routing: HashRouter (không lỗi 404 khi refresh trên GitHub Pages)
- Tiết tự học 1–9 · Minh chứng: **mô tả bằng chữ**, ảnh/PDF ≤ 5 MB, hoặc link — tối đa 3/nhiệm vụ

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

### Khi giáo viên đặt lại mật khẩu

`teacher-reset-password` bật cờ `profiles.must_change_password`. Lần đăng nhập kế tiếp,
học sinh bị chặn ở màn **“Đặt mật khẩu riêng của em”** trước khi vào được bất kỳ trang
nào. Chỉ Edge Function mới hạ được cờ — học sinh không tự sửa `profiles` được.

### Quên mật khẩu

Học sinh báo giáo viên. Trên dashboard, tab **Theo học sinh** liệt kê **toàn bộ** học
sinh của lớp (kể cả em chưa tạo tài khoản) — tick chọn một hoặc nhiều em rồi bấm **Đặt
lại mật khẩu**. Hệ thống sinh mật khẩu tạm cho từng em và hiện ra một lần duy nhất, kèm
nút chép cả danh sách. Giáo viên đưa trực tiếp cho học sinh.

Mật khẩu tạm bỏ các ký tự dễ đọc nhầm khi chép tay (`0/O`, `1/l/I`).

> Hệ thống **không gửi email**: domain trường nằm trên Microsoft 365, tài khoản giáo viên
> không có quyền quản trị Entra ID để tạo app `Mail.Send`, và cũng không bật được SMTP
> AUTH. Mọi nhắc nhở vì thế hiển thị thẳng trong ứng dụng thay vì gửi thư.

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
VITE_BRAND_MARK=8A7
```

Publishable key được phép lộ ra frontend. **Không** đưa `service_role` / secret key vào
các file `VITE_*`.

## 4. Dựng cơ sở dữ liệu

Supabase Dashboard → SQL Editor → chạy **ba file, đúng thứ tự này**:

```text
1. supabase/schema.sql          lõi: kế hoạch, phản tư, minh chứng, chat, thông báo
2. supabase/schema-2-school.sql lớp nền tảng toàn trường: vai trò, danh mục lớp, import
3. supabase/schema-3-rls.sql    quyền, nghiệp vụ, số liệu, và chuyển dữ liệu cũ
```

Thứ tự có ý nghĩa: file 3 định nghĩa lại các hàm quyền của file 1 để thêm `admin` và
điều kiện "đã được duyệt", và phần **chuyển dữ liệu cũ nằm ở cuối file 3** — sau khi mọi
trigger đã được thay xong. Chạy sớm hơn thì trigger bản cũ sẽ âm thầm hoàn nguyên.

> Cả ba **chạy lại nhiều lần được và không xóa dữ liệu**: chỉ `create … if not exists`,
> `alter … add column if not exists`, `create or replace function`, và dựng lại policy.
> Nâng cấp hệ thống đang chạy thật chỉ cần chạy lại đủ ba file.

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

Giáo viên **mới** nhận mật khẩu tạm hiện **đúng một lần** (server chỉ lưu bản băm), và bị
bắt tự đổi ở lần đăng nhập đầu.

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

## 8. Lịch tự học cố định và ai chưa đăng ký

Hai việc khác nhau nên nằm ở **hai tab riêng**:

- **Lịch tự học** — khai một lần đầu năm, gần như không đụng lại.
- **HS chưa đăng ký** — mở gần như mỗi ngày.

### Tab *Lịch tự học* — hạn đăng ký

Hạn khóa cố định là **24:00 đêm hôm trước**, đúng bằng cách `registrationStatus()` chấm
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
| `image` / `file` | Storage `evidence/`, signed URL | Ảnh chụp bài, PDF ≤ 5 MB |
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
mốc bắt đầu = MUỘN HƠN giữa (lúc đăng ký) và (22:00 ngày tự học)
trễ hạn      = mốc bắt đầu + 48 giờ
tự đánh giá  = mốc bắt đầu + 120 giờ
```

Lấy mốc muộn hơn để em đăng ký trước 10 ngày **không** bị đánh trễ trước cả ngày học.
Ba con số nằm ở bảng `app_settings`, đổi quy định thì sửa một dòng, không phải sửa code.

### Trạng thái tiến độ

Suy ra từ dữ liệu, không nhập tay — hàm `progress_status()` và view `plan_status`:

| Trạng thái | Khi nào |
|---|---|
| Chưa tới buổi | Chưa tới mốc bắt đầu đếm |
| Đang chờ cập nhật | Đã qua buổi, còn trong 48 giờ |
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
- **Học sinh** — banner cảnh báo số tiết đã qua mà chưa cập nhật kết quả, và báo khi
  giáo viên có nhận xét mới.

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

`admin-manage-teacher` có bốn action, `create` và `bulk` dùng chung `upsertTeacher()` nên
hai đường không thể lệch luật:

| action | Việc |
|---|---|
| `create` | Tạo tài khoản + gán lớp trong một bước, trả mật khẩu tạm một lần |
| `bulk` | Import cả danh sách từ Excel trong một lần gọi |
| `assign` | Gán thêm lớp cho giáo viên đã có |
| `reset` | Cấp lại mật khẩu tạm |

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
