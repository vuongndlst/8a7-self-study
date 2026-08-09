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
Nhờ vậy Supabase gửi được email thật (khôi phục mật khẩu, thông báo, nhắc quá hạn).

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

> File có khối `drop table` để nâng cấp từ v1. Nếu đã có dữ liệu thật của học sinh,
> **đừng chạy khối đó** — hãy viết migration chuyển dữ liệu sang cấu trúc mới.

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

## 6. Nhắc quá hạn — hiển thị trong ứng dụng

Không gửi email (lý do ở mục 2), nên các nhắc nhở nằm ngay trên màn hình:

- **Giáo viên** — thẻ *“Cần chú ý”* trên dashboard: bao nhiêu em chưa lập kế hoạch cho
  ngày mai (kèm tên), bao nhiêu em còn tiết chưa cập nhật kết quả, bao nhiêu em đang chờ
  tự đặt lại mật khẩu.
- **Học sinh** — banner cảnh báo số tiết đã qua mà chưa cập nhật kết quả, và báo khi
  giáo viên có nhận xét mới.

## 7. Deploy Edge Functions

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

## 8. Quyền dữ liệu

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

## 9. Cấu trúc

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
