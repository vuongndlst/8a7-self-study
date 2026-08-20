import test from 'node:test'
import assert from 'node:assert/strict'
import { PERIOD_TIMES, periodTimeLabel, sessionTimeLabel } from './schoolSchedule.js'

test('giờ 9 tiết khớp thời khóa biểu của trường', () => {
  assert.deepEqual(PERIOD_TIMES, {
    1: ['07:40', '08:20'], 2: ['08:25', '09:05'], 3: ['09:20', '10:00'],
    4: ['10:05', '10:45'], 5: ['10:50', '11:30'], 6: ['13:15', '13:55'],
    7: ['14:00', '14:40'], 8: ['14:55', '15:35'], 9: ['15:40', '16:20'],
  })
  assert.equal(periodTimeLabel(1), '07:40–08:20')
  assert.equal(sessionTimeLabel(7, 2), '14:00–15:35')
})
