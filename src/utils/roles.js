// Một định nghĩa duy nhất cho câu hỏi "vai trò này đi đâu, làm được gì".
// Trước đây mỗi trang tự viết `role === 'teacher'` nên khi thêm 'admin' là có
// chỗ nhớ chỗ quên — riêng LoginPage còn đăng xuất luôn tài khoản quản trị.

// Quản trị viên ở trường này cũng chủ nhiệm một lớp, nên vẫn là "nhân sự lớp".
export const isStaffRole = (role) => role === 'teacher' || role === 'admin'

// Trang mặc định sau khi đăng nhập, hoặc khi bị đá khỏi trang không thuộc quyền.
export const homeForRole = (role) => {
  if (role === 'admin') return '/admin'
  if (role === 'teacher') return '/teacher'
  if (role === 'student') return '/student'
  return '/login'
}

// Nhãn hiển thị cạnh tên người gửi trong khung chat.
export const roleLabel = (role) => (role === 'admin' ? ' · QTV' : role === 'teacher' ? ' · GV' : '')
