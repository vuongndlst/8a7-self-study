export const STUDENT_PASSWORD_MIN = 10

export function passwordChecks(password = '', mshs = '') {
  const value = String(password)
  const code = String(mshs || '').trim()
  return [
    { key: 'length', label: `Ít nhất ${STUDENT_PASSWORD_MIN} ký tự`, ok: value.length >= STUDENT_PASSWORD_MIN },
    { key: 'upper', label: 'Có ít nhất 1 chữ hoa (A–Z)', ok: /[A-Z]/.test(value) },
    { key: 'lower', label: 'Có ít nhất 1 chữ thường (a–z)', ok: /[a-z]/.test(value) },
    { key: 'number', label: 'Có ít nhất 1 chữ số (0–9)', ok: /\d/.test(value) },
    { key: 'space', label: 'Không có khoảng trắng', ok: !/\s/.test(value) },
    { key: 'mshs', label: 'Không chứa MSHS của em', ok: !code || !value.includes(code) },
  ]
}

export function validateStudentPassword(password, mshs) {
  const checks = passwordChecks(password, mshs)
  return { ok: checks.every((item) => item.ok), checks }
}

// Mật khẩu tạm cho giáo viên phát lại. Bỏ các ký tự dễ đọc nhầm khi chép tay
// (0/O, 1/l/I) vì thầy cô thường viết ra giấy đưa cho học sinh.
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnpqrstuvwxyz'
const DIGIT = '23456789'

export function generateTempPassword(mshs = '') {
  const pool = UPPER + LOWER + DIGIT
  const pick = (set) => set[Math.floor(Math.random() * set.length)]
  for (let attempt = 0; attempt < 20; attempt++) {
    // Bảo đảm có đủ hoa + thường + số, rồi bù cho đủ 12 ký tự.
    const chars = [pick(UPPER), pick(LOWER), pick(DIGIT)]
    while (chars.length < 12) chars.push(pick(pool))
    for (let i = chars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
    const value = chars.join('')
    if (validateStudentPassword(value, mshs).ok) return value
  }
  return `Tu${Date.now().toString().slice(-6)}Hoc`
}
