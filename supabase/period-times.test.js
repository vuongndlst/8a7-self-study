import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('./schema-10-period-times.sql', import.meta.url), 'utf8')

test('CSDL tách giờ được cập nhật khỏi giờ bắt đầu nhắc', () => {
  assert.match(sql, /result_available_at/)
  assert.match(sql, /study_period_start\(p_study_date, p_period\)/)
  assert.match(sql, /study_period_end\(p_study_date, p_period, p_span\)/)
  assert.match(sql, /then 'Đang thực hiện'/)
  assert.match(sql, /now\(\) >= public\.study_period_start/)
})

test('CSDL có đủ giờ bắt đầu và kết thúc của 9 tiết', () => {
  for (const time of ['07:40','08:20','08:25','09:05','09:20','10:00','10:05','10:45','10:50','11:30','13:15','13:55','14:00','14:40','14:55','15:35','15:40','16:20']) {
    assert.ok(sql.includes(`time '${time}'`), `thiếu mốc ${time}`)
  }
})
