import test from 'node:test'
import assert from 'node:assert/strict'
import { canUpdateReflection, isReflectionDue, reflectionReminder } from './studentReminders.js'

test('chỉ nhắc phản tư sau khi buổi tự học kết thúc', () => {
  assert.equal(isReflectionDue('Chưa tới buổi'), false)
  assert.equal(isReflectionDue('Đang chờ cập nhật'), true)
  assert.equal(isReflectionDue('Trễ hạn cập nhật'), true)
  assert.equal(isReflectionDue('Hệ thống tự đánh giá'), false)
})

test('không nhắc nhiệm vụ đã có phần nhìn lại', () => {
  const plans = [{ id: 'future' }, { id: 'pending' }, { id: 'late' }, { id: 'done' }]
  const status = {
    future: { progress: 'Chưa tới buổi' },
    pending: { progress: 'Đang chờ cập nhật' },
    late: { progress: 'Trễ hạn cập nhật' },
    done: { progress: 'Đang chờ cập nhật' },
  }
  const result = reflectionReminder(plans, { done: { id: 'reflection' } }, status)

  assert.equal(result.total, 2)
  assert.equal(result.pending, 1)
  assert.equal(result.overdue, 1)
  assert.deepEqual([...result.planIds], ['pending', 'late'])
})

test('cho cập nhật từ khi tiết bắt đầu, không cần chờ tiết kết thúc', () => {
  const start = '2026-08-21T00:40:00.000Z' // 07:40 giờ Việt Nam
  assert.equal(canUpdateReflection(start, Date.parse('2026-08-21T00:39:59.999Z')), false)
  assert.equal(canUpdateReflection(start, Date.parse(start)), true)
  assert.equal(canUpdateReflection(start, Date.parse('2026-08-21T01:00:00.000Z')), true)
})
