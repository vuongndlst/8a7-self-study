# 8A7 Self-Study

Web quản lý giờ tự học cho lớp 8A7 theo quy trình **Plan → Do → Reflect**.

- Frontend: React + Vite
- Hosting: GitHub Pages
- Database/Auth/Storage: Supabase
- Routing: HashRouter (ổn định khi refresh trên GitHub Pages)
- Tiết tự học: 1–9
- Roster: 31 HS, đối chiếu Họ tên + MSHS khi đăng ký lần đầu
- Minh chứng: JPG / PNG / PDF ≤ 5 MB hoặc link; tối đa 3 minh chứng/kế hoạch

## 1. Password rule học sinh

Học sinh tự tạo mật khẩu. Rule:

- tối thiểu 10 ký tự;
- có chữ hoa + chữ thường + số;
- không có khoảng trắng;
- không chứa MSHS.

Rule được kiểm tra ở `src/utils/password.js` và lặp lại ở Edge Functions để không thể bỏ qua bằng DevTools/API.

## 2. Cài package

```bash
npm install
npm run dev
```

> Project dùng `@supabase/supabase-js`; không dùng `@supabase/ssr` vì GitHub Pages là frontend tĩnh, không chạy Next.js middleware/Server Components.

## 3. Kết nối Supabase

Project đã có `.env.production` và `.env.example` với publishable URL/key của project hiện tại:

```env
VITE_SUPABASE_URL=https://qzvlwffxvewhfztnxxzb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_3C1vKuN1fLbiqZkRb7lEpg_oK0ekWfv
VITE_TEACHER_EMAIL=ict.vuongnd@lsts.edu.vn
```

Publishable key có thể xuất hiện trong frontend. Không đưa `service_role`/server secret vào các file trên.

## 4. Tạo database + RLS + Storage

Supabase Dashboard → **SQL Editor**:

1. Chạy toàn bộ `supabase/schema.sql`.
2. Sau đó chạy `supabase/seed-roster.private.sql`.

`seed-roster.private.sql` chứa danh sách 31 HS và đã nằm trong `.gitignore`.

## 5. Deploy Edge Functions

Cài/login Supabase CLI, sau đó:

```bash
npx supabase login
npx supabase link --project-ref qzvlwffxvewhfztnxxzb
npx supabase functions deploy register-student --no-verify-jwt
npx supabase functions deploy teacher-reset-password --no-verify-jwt
```

`supabase/config.toml` cũng đã để `verify_jwt = false`. Đây là chủ ý vì project đang dùng publishable key mới; hai function tự kiểm tra quyền cần thiết bên trong:

- `register-student`: public để HS chưa có tài khoản đăng ký, nhưng phải khớp roster và MSHS chưa được claim.
- `teacher-reset-password`: tự đọc Bearer token, xác minh người gọi có profile `teacher` rồi mới dùng Admin API.

## 6. Tạo tài khoản Teacher

Không cần gửi password teacher vào source code.

```bash
cp .env.admin.example .env.admin
```

Mở `.env.admin` và tự điền:

```env
SUPABASE_URL=https://qzvlwffxvewhfztnxxzb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_KEY
TEACHER_EMAIL=ict.vuongnd@lsts.edu.vn
TEACHER_PASSWORD=YOUR_STRONG_PASSWORD
TEACHER_NAME=Nguyễn Đình Vương
```

Sau đó:

```bash
npm run create-teacher
```

`.env.admin` đã nằm trong `.gitignore`.

## 7. Auth flow học sinh

### Lần đầu

1. HS mở `#/register`.
2. Nhập Họ tên + MSHS + password.
3. Edge Function đọc `student_roster` bằng server key.
4. Nếu tên/MSHS khớp và chưa claim → `auth.admin.createUser()` tạo user Auth nội bộ.
5. User nhận email nội bộ dạng `2406002@student.8a7.example.com` (HS không cần biết email này).
6. `profiles` và `student_roster.claimed_user_id` được cập nhật.
7. Frontend đăng nhập bằng MSHS + password.

### Những lần sau

Frontend tự ánh xạ:

```text
MSHS 2406002 → 2406002@student.8a7.example.com
```

rồi gọi `supabase.auth.signInWithPassword()`.

## 8. Quyền dữ liệu

### Student

- chỉ đọc profile của mình;
- chỉ đọc plan/reflection/evidence của mình;
- chỉ tạo plan cho hôm nay hoặc tương lai;
- chỉ chỉnh plan khi plan cũ còn ở tương lai;
- chỉ nộp reflection/evidence cho plan của chính mình vào ngày học hoặc sau đó;
- không đọc `student_roster`;
- không đọc dữ liệu học sinh khác.

### Teacher

- đọc toàn bộ roster/profile/plan/reflection/evidence;
- xem file minh chứng private bằng signed URL;
- reset password HS thông qua Edge Function;
- xuất CSV theo bộ lọc.

## 9. GitHub Pages

Push repo lên GitHub, sau đó Repository → **Settings → Pages → Source: GitHub Actions**.

Workflow `.github/workflows/deploy-pages.yml` đã có sẵn. Mỗi lần push `main`, GitHub Actions sẽ chạy:

```bash
npm install
npm run build
```

và publish thư mục `dist`.

Vì app dùng `HashRouter`, URL dạng:

```text
https://USERNAME.github.io/REPO/#/login
https://USERNAME.github.io/REPO/#/student
https://USERNAME.github.io/REPO/#/teacher
```

không bị lỗi 404 khi refresh route.

## 10. Kiểm tra trước khi dùng thật

- [ ] Chạy `schema.sql` thành công.
- [ ] Seed đủ 31 HS.
- [ ] Deploy 2 Edge Functions.
- [ ] Tạo teacher.
- [ ] Tạo thử 1 tài khoản HS test.
- [ ] HS test không xem được roster/HS khác.
- [ ] Upload thử JPG/PDF.
- [ ] Teacher mở được signed URL minh chứng.
- [ ] Teacher reset password test.
- [ ] `git status` không có `.env.admin` hoặc `seed-roster.private.sql`.

## 11. Cấu trúc

```text
src/
  components/
  context/
  lib/
  pages/
  utils/
supabase/
  schema.sql
  seed-roster.private.sql     # private, gitignored
  functions/
    register-student/
    teacher-reset-password/
scripts/
  create-teacher.mjs
.github/workflows/
  deploy-pages.yml
```
