import test from 'node:test'
import assert from 'node:assert/strict'
import { isLateRegistration, registrationDeadline, registrationStatus } from './date.js'

test('hạn đăng ký là 24:00 của ngày hôm trước theo giờ Việt Nam', () => {
  assert.equal(registrationDeadline('2026-08-21').toISOString(), '2026-08-20T17:00:00.000Z')
})

test('đăng ký trước 24:00 vẫn đúng hạn', () => {
  assert.equal(registrationStatus('2026-08-21', '2026-08-20T16:59:59.999Z'), 'Đúng hạn')
  assert.equal(isLateRegistration('2026-08-21', '2026-08-20T16:59:59.999Z'), false)
})

test('từ 24:00 trở đi được tính là trễ', () => {
  assert.equal(registrationStatus('2026-08-21', '2026-08-20T17:00:00.000Z'), 'Trễ')
  assert.equal(isLateRegistration('2026-08-21', '2026-08-20T17:00:00.000Z'), true)
})

test('dữ liệu ngày giờ không hợp lệ không bị gắn nhãn sai', () => {
  assert.equal(registrationDeadline('khong-phai-ngay'), null)
  assert.equal(registrationStatus('2026-08-21', 'khong-phai-gio'), '—')
})
