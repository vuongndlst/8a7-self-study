// Dùng chung cho mọi Edge Function.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

// Domain email của trường. MSHS chính là phần trước @.
export const STUDENT_EMAIL_DOMAIN = Deno.env.get('STUDENT_EMAIL_DOMAIN') ?? 'lsts.edu.vn'
export const studentEmail = (mshs: string) => `${String(mshs).trim()}@${STUDENT_EMAIL_DOMAIN}`

// Luật mật khẩu — bản gốc ở đây, frontend chỉ lặp lại để hiển thị.
//
// `mshs` có thể RỖNG: giáo viên và quản trị viên không có MSHS. Phải chặn trường
// hợp đó trước, vì `"batky".includes("")` luôn trả về true trong JavaScript —
// nghĩa là `!password.includes('')` luôn false, và cả luật luôn hỏng. Đúng lỗi
// này từng khoá cứng mọi tài khoản giáo viên mới ở màn hình bắt đổi mật khẩu:
// giao diện tick xanh đủ 6 điều kiện, máy chủ thì từ chối không đường thoát.
export function validStudentPassword(password: string, mshs?: string | null) {
  const code = String(mshs ?? '').trim()
  return password.length >= 10
    && password.length <= 64
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && !/\s/.test(password)
    && (code === '' || !password.includes(code))
}

export const PASSWORD_RULE_MESSAGE =
  'Mật khẩu cần tối thiểu 10 ký tự, có chữ hoa, chữ thường, số; không có khoảng trắng và không chứa MSHS.'

export const normalizeName = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')

// Không gửi email: trường dùng Microsoft 365 và tài khoản giáo viên không có quyền
// quản trị Entra ID để tạo app Mail.Send, cũng không bật được SMTP AUTH.
// Thay thế: giáo viên đặt lại mật khẩu ngay trên dashboard, và các nhắc nhở
// "chưa lập kế hoạch / chưa cập nhật kết quả" hiển thị thẳng trong ứng dụng.
