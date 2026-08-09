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

export function registrationStatus(studyDate, createdAt) {
  if (!studyDate || !createdAt) return '—'
  const createdDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(new Date(createdAt))
  return dayNumber(studyDate) - dayNumber(createdDate) >= 1 ? 'Đúng hạn' : 'Trễ'
}

export function daysUntil(studyDate) {
  if (!studyDate) return null
  return dayNumber(studyDate) - dayNumber(todayISO())
}
