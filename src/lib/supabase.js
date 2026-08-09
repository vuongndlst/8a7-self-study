import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('Thiếu cấu hình Supabase')

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// MSHS chính là phần trước @ trong email trường cấp: 2406002@lsts.edu.vn
export const STUDENT_EMAIL_DOMAIN = import.meta.env.VITE_STUDENT_EMAIL_DOMAIN || 'lsts.edu.vn'
export const studentEmail = (mshs) => `${String(mshs).trim()}@${STUDENT_EMAIL_DOMAIN}`

// Link trong email khôi phục quay về gốc site; AuthContext bắt sự kiện PASSWORD_RECOVERY.
export const recoveryRedirectTo = () =>
  `${window.location.origin}${window.location.pathname}`

export async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${session?.access_token ?? supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  })
  let payload = null
  try { payload = await res.json() } catch { /* thân rỗng */ }
  return { status: res.status, ok: res.ok && payload?.ok === true, data: payload }
}
