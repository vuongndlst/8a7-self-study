# Security notes — 8A7 Self-Study

## Nguyên tắc

- Frontend chỉ chứa `VITE_SUPABASE_PUBLISHABLE_KEY`. Đây là key dành cho client; dữ liệu được bảo vệ bằng Postgres grants + Row Level Security (RLS).
- Không bao giờ đưa `service_role` / server secret vào `src/`, `.env.production`, GitHub Pages hoặc commit Git.
- Mật khẩu HS được xử lý bởi Supabase Auth; app không có bảng/cột lưu mật khẩu plaintext.
- `student_roster` không có policy SELECT cho học sinh. Chỉ teacher đọc được; Edge Function dùng quyền server để đối chiếu khi đăng ký.
- Mỗi plan/reflection/evidence đều bị RLS ràng buộc theo `auth.uid()`.
- Student chỉ sửa/xóa plan khi plan cũ còn ở tương lai; không thể sửa plan quá khứ bằng cách gọi API trực tiếp.
- Storage bucket `evidence` là private. File nằm dưới thư mục `<auth.uid()>/<plan_id>/...` và teacher mở bằng signed URL ngắn hạn.

## Password rule học sinh

- 10–64 ký tự.
- Có ít nhất 1 chữ hoa A–Z.
- Có ít nhất 1 chữ thường a–z.
- Có ít nhất 1 chữ số.
- Không có khoảng trắng.
- Không chứa chính MSHS.

Rule được kiểm tra ở cả client và Edge Function. Kiểm tra phía server mới là rào chắn bảo mật thực sự.

## Trước khi public repo

1. Kiểm tra `.gitignore` có `.env.admin` và `supabase/seed-roster.private.sql`.
2. Chạy `git status` và chắc chắn hai file trên không nằm trong staging.
3. Không commit ảnh/PDF minh chứng.
4. Nếu lỡ commit server secret, rotate key ngay trong Supabase Dashboard.
