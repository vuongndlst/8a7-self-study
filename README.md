# Self-Study — quản lý giờ tự học

Web quản lý giờ tự học theo quy trình **Plan → Do → Reflect**.

**Đang chạy tại:** https://vuongndlst.github.io/8a7-self-study/

- Frontend: React + Vite · Hosting: GitHub Pages · Backend: Supabase
- Routing: HashRouter (không lỗi 404 khi refresh trên GitHub Pages)
- Tiết tự học 1–9 · Minh chứng JPG/PNG/PDF ≤ 5 MB hoặc link, tối đa 3/kế hoạch

## 1. Mô hình dữ liệu (đa năm học, đa lớp, đa giáo viên)

Mỗi học sinh giữ **một tài khoản duy nhất suốt các năm**. Lên lớp = thêm một dòng ghi
danh, không tạo lại tài khoản, không mất lịch sử.

```text
school_years   2026-2027, 2027-2028…   (đúng một năm is_active)
classes        8A7 thuộc năm nào
students       MSHS + họ tên, theo em suốt các năm
enrollments    em nào học lớp nào       ← "danh sách lớp"
class_teachers giáo viên phụ trách lớp nào
```

Giáo viên **chỉ thấy lớp mình phụ trách** — kế hoạch, hồ sơ, minh chứng, và chỉ đặt lại
được mật khẩu cho học sinh lớp mình. Nhiều giáo viên dùng chung một hệ thống mà không
thấy dữ liệu của nhau.

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

Supabase Dashboard → SQL Editor → chạy toàn bộ `supabase/schema.sql`.

> File **chạy lại nhiều lần được và không xóa dữ liệu**: chỉ `create … if not exists`,
> `alter … add column if not exists`, `create or replace function`, và dựng lại policy.
> Nâng cấp hệ thống đang chạy thật chỉ cần chạy lại file này.

Sau đó bật password policy: Authentication → Sign In / Providers → Password Requirements
→ tối thiểu **10** ký tự, yêu cầu **chữ thường + chữ hoa + chữ số**.

## 5. Tạo lớp và giáo viên

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

Dashboard riêng của TA ở `#/ta`, chỉ hiện khi em được cử.

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

Tab **Chưa đăng ký** trên dashboard giáo viên.

Lớp thường được phân giờ tự học **cố định theo tuần**. Khai bằng lưới tick 7 thứ × 9 tiết
(bảng `class_schedule`). Khai xong thì phần kiểm tra bên dưới biết chính xác **từng tiết**
ai chưa đăng ký, thay vì chỉ biết "em này không có kế hoạch nào trong ngày".

Chọn ngày (hoặc bấm *Hôm nay* / *Ngày mai*) → hàm `missing_registrations(class, date)` trả
về danh sách em còn thiếu, gộp theo học sinh kèm số tiết còn thiếu.

Ba trường hợp được phân biệt rõ:

| Tình huống | Kết quả |
|---|---|
| Lớp đã khai lịch, ngày đó **có** tiết tự học | Liệt kê theo từng tiết còn thiếu |
| Lớp đã khai lịch, ngày đó **không** có tiết | Không báo ai thiếu cả |
| Lớp **chưa khai** lịch bao giờ | Chỉ xét "có kế hoạch nào trong ngày không" |

Hàm là `security definer` nhưng tự kiểm `staff_perm(class, 'view_plans')` bên trong, nên
học sinh gọi vào cũng không lấy được dữ liệu lớp.

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

```bash
npx supabase login
npx supabase link --project-ref qzvlwffxvewhfztnxxzb
npx supabase functions deploy register-student --no-verify-jwt
npx supabase functions deploy teacher-reset-password --no-verify-jwt
npx supabase functions deploy student-change-password --no-verify-jwt
```

`verify_jwt = false` là chủ ý — mỗi function tự kiểm quyền bên trong:

| Function | Ai gọi được | Tự kiểm gì |
|---|---|---|
| `register-student` | công khai | khớp ghi danh năm hiện hành + MSHS chưa claim |
| `teacher-reset-password` | giáo viên | đọc Bearer token, phải là teacher **và** phụ trách lớp của HS đó |
| `student-change-password` | học sinh | phải là student, đúng mật khẩu hiện tại, đủ luật mật khẩu |

## 12. Quyền dữ liệu

**Học sinh** — chỉ đọc/ghi dữ liệu của chính mình; không đọc danh sách lớp; chỉ tạo kế
hoạch cho hôm nay trở đi; chỉ sửa/xóa kế hoạch còn ở tương lai; chỉ nộp phản tư và minh
chứng vào ngày học hoặc sau đó; không tự duyệt đăng ký thiết bị; không tự viết nhận xét
giáo viên; không tự hạ cờ đổi mật khẩu.

**Giáo viên** — đọc toàn bộ dữ liệu **lớp mình phụ trách**; xem minh chứng bằng signed
URL; duyệt/từ chối đăng ký thiết bị; nhận xét phản tư và đánh dấu đã xử lý yêu cầu hỗ
trợ; đặt lại mật khẩu học sinh lớp mình; xuất CSV. **Không** sửa hay xóa được kế hoạch,
tự đánh giá của học sinh.

Ranh giới được giữ bằng ba lớp: RLS theo dòng, grant theo bảng, và trigger tách cột
(`plans_guard_columns`, `reflections_guard_columns`) — vì RLS chặn được dòng nhưng không
chặn được cột.

> Các policy tra chéo giữa `students` và `enrollments` phải gọi qua hàm `security definer`
> (`teaches_mshs`, `my_mshs`). Viết thẳng `exists (select … from enrollments)` trong policy
> của `students` sẽ khiến Postgres báo `42P17 infinite recursion`.

## 13. Cấu trúc

```text
src/
  components/   Layout · ProtectedRoute · PasswordGate · StatusBadge
  context/      AuthContext (phiên, hồ sơ, lớp/năm, cờ khôi phục)
  lib/          supabase.js (client, email học sinh, gọi Edge Function)
  pages/        Home · Guide · Register · Login · Student · Teacher · NotFound
  utils/        date.js · password.js
supabase/
  schema.sql
  functions/
    _shared/common.ts            # CORS, luật mật khẩu
    register-student/
    teacher-reset-password/
    student-change-password/
scripts/
  create-teacher.mjs             # tạo 1 giáo viên từ .env.admin
  setup-class.mjs                # năm học + lớp + giáo viên + ghi danh
admin/
  class.example.json             # mẫu; file thật đã gitignore
.github/workflows/
  deploy-pages.yml
```
