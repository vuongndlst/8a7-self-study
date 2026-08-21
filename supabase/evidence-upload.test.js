import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const migration = readFileSync(new URL('./migrations/20260821015658_fix_evidence_upload.sql', import.meta.url), 'utf8')
const imageCode = readFileSync(new URL('../src/lib/image.js', import.meta.url), 'utf8')

test('bucket minh chứng nhận đúng định dạng WebP do frontend tạo ra', () => {
  assert.match(imageCode, /canvas\.toBlob\(r, 'image\/webp'/)
  assert.match(schema, /12582912,array\['image\/jpeg','image\/png','image\/webp','application\/pdf'\]/)
  assert.match(migration, /allowed_mime_types = array\['image\/jpeg','image\/png','image\/webp','application\/pdf'\]/)
  assert.match(migration, /file_size_limit = 12582912/)
})
