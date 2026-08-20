export const PERIOD_TIMES = Object.freeze({
  1: ['07:40', '08:20'],
  2: ['08:25', '09:05'],
  3: ['09:20', '10:00'],
  4: ['10:05', '10:45'],
  5: ['10:50', '11:30'],
  6: ['13:15', '13:55'],
  7: ['14:00', '14:40'],
  8: ['14:55', '15:35'],
  9: ['15:40', '16:20'],
})

export function periodTimeLabel(period) {
  const times = PERIOD_TIMES[period]
  return times ? `${times[0]}–${times[1]}` : ''
}

export function sessionTimeLabel(period, span = 1) {
  const start = PERIOD_TIMES[period]?.[0]
  const endPeriod = Math.min(9, Number(period) + Math.max(1, Number(span)) - 1)
  const end = PERIOD_TIMES[endPeriod]?.[1]
  return start && end ? `${start}–${end}` : ''
}
