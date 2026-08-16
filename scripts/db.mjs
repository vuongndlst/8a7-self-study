import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath chứ không phải URL.pathname: đường dẫn dự án có dấu cách và
// tiếng Việt nên pathname trả về bản đã mã hóa %20, đọc file sẽ hỏng.
const ROOT = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envOf = (file) => {
  const out = {}
  try {
    for (const line of readFileSync(resolve(ROOT, file), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/)
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}
const env = { ...envOf('.env'), ...envOf('.env.admin') }
const ref = (env.SUPABASE_URL || env.VITE_SUPABASE_URL).match(/https:\/\/([^.]+)\./)[1]
const token = env.SUPABASE_ACCESS_TOKEN

export async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${r.status} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

if (process.argv[3]) {
  const sql = readFileSync(process.argv[3], 'utf8')
  const res = await q(sql)
  console.log('OK', JSON.stringify(res).slice(0, 2000))
}
