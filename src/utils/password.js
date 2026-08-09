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
