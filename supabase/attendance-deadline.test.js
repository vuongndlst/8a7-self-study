import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('./schema-8-attendance.sql', import.meta.url), 'utf8')

test('cron điểm danh chạy sau 24:00 và xử lý ngày vừa kết thúc', () => {
  assert.match(schema, /coalesce\(p_date,\s*public\.vn_today\(\)\s*-\s*1\)/)
  assert.match(schema, /cron\.schedule\('attendance-misses',\s*'5 17 \* \* \*'/)
  assert.doesNotMatch(schema, /'0 16 \* \* \*'/)
})
