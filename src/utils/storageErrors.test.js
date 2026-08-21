import test from 'node:test'
import assert from 'node:assert/strict'
import { evidenceUploadError } from './storageErrors.js'

test('giải thích lỗi Storage bằng lời dễ hiểu', () => {
  assert.match(evidenceUploadError({ message: 'mime type image/webp is not supported' }), /Định dạng file/)
  assert.match(evidenceUploadError({ statusCode: 413, message: 'Payload too large' }), /quá lớn/)
  assert.match(evidenceUploadError({ statusCode: 403, message: 'new row violates row-level security policy' }), /đăng nhập/)
  assert.match(evidenceUploadError({ message: 'Failed to fetch' }), /mạng/)
})
