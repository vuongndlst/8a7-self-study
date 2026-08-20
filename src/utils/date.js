export function formatDate(value) {
  if (!value) return '—'
  const [y,m,d] = String(value).slice(0,10).split('-')
  return `${d}/${m}/${y}`
}

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date())
}

function dayNumber(isoDate) {
  return Date.parse(`${isoDate}T00:00:00Z`) / 86400000
}

// Hạn đăng ký là 24:00 của ngày hôm trước, tức 0:00 của ngày tự học
// theo giờ Việt Nam. Giữ phép tính ở một chỗ để nhãn, cảnh báo và thống kê
// không tự hiểu mốc này theo những cách khác nhau.
export function registrationDeadline(studyDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(studyDate ?? ''))) return null
  const value = new Date(`${studyDate}T00:00:00+07:00`)
  return Number.isNaN(value.getTime()) ? null : value
}

export function isLateRegistration(studyDate, at = new Date()) {
  const deadline = registrationDeadline(studyDate)
  const time = at instanceof Date ? at.getTime() : new Date(at).getTime()
  return deadline ? Number.isFinite(time) && time >= deadline.getTime() : false
}

export function registrationStatus(studyDate, createdAt) {
  if (!studyDate || !createdAt) return '—'
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return '—'
  return isLateRegistration(studyDate, created) ? 'Trễ' : 'Đúng hạn'
}

export function daysUntil(studyDate) {
  if (!studyDate) return null
  return dayNumber(studyDate) - dayNumber(todayISO())
}
