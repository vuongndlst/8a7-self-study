import { supabase } from './supabase'

// PostgREST nhét toàn bộ danh sách id vào query string của URL. Một lớp 32 em
// trong 60 ngày đã là ~550 kế hoạch; 550 uuid là chuỗi URL dài hơn 20 KB —
// vượt giới hạn của proxy và bị trả về lỗi 414 mà không có thông báo rõ ràng.
// Vì vậy mọi truy vấn dạng `.in('plan_id', ids)` đều phải cắt khúc.
const CHUNK = 150

/**
 * Chạy `select ... where col in (...)` theo từng khúc, song song, rồi gộp kết quả.
 * Trả về mảng phẳng. Lỗi ở một khúc sẽ ném ra ngoài như một truy vấn bình thường.
 */
export async function selectIn(table, columns, col, values, tweak) {
  const ids = [...new Set(values)]
  if (ids.length === 0) return []

  const chunks = []
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))

  const parts = await Promise.all(chunks.map((c) => {
    let qb = supabase.from(table).select(columns).in(col, c)
    if (tweak) qb = tweak(qb)
    return qb
  }))
  return parts.flatMap((p) => p.data ?? [])
}

// Mốc "n ngày trước" theo giờ Việt Nam, dạng yyyy-mm-dd.
export function daysAgoISO(n) {
  const now = new Date(Date.now() + 7 * 3600 * 1000)   // UTC+7
  now.setUTCDate(now.getUTCDate() - n)
  return now.toISOString().slice(0, 10)
}

// Các mốc nạp dữ liệu cho bảng điều khiển. 0 = cả năm học.
export const LOAD_WINDOWS = [
  [30, '30 ngày qua'],
  [60, '60 ngày qua'],
  [120, 'Học kỳ này'],
  [0, 'Cả năm học'],
]
