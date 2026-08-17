// Nén ảnh minh chứng ngay trên máy học sinh, TRƯỚC khi tải lên.
//
// Vì sao cần: đo trên dữ liệu thật của 8A7 — 21 file minh chứng thì cả 21 đều là
// ảnh, JPEG trung bình 732 KB, file lớn nhất 3,5 MB. Đó là ảnh gốc chụp bằng điện
// thoại: 4000×3000 px. Thầy cô xem trên màn hình chỉ cần khoảng 1600 px là đã sắc
// nét hơn mức cần thiết. Phần dôi ra vừa ngốn dung lượng lưu trữ, vừa ngốn băng
// thông MỖI LẦN có người mở ảnh ra xem — và ảnh minh chứng thì được mở đi mở lại.
//
// Nén ở phía trình duyệt (không phải phía máy chủ) còn tiết kiệm cả lượt tải lên:
// mạng nhà trường không phải cõng 3,5 MB rồi mới biết là thừa.

const MAX_EDGE = 1600      // cạnh dài nhất sau khi thu nhỏ
const QUALITY = 0.82       // đủ nét cho chữ viết tay và bài làm chụp lại

// Trình duyệt cũ có thể không có createImageBitmap hoặc không encode được WebP.
// Trong trường hợp đó ta trả lại chính file gốc — thà nặng còn hơn em không nộp được.
const canProcess = () =>
  typeof createImageBitmap === 'function' && typeof document !== 'undefined'

/**
 * Trả về { blob, name, type, before, after } để nơi gọi vừa upload được vừa
 * hiển thị được cho học sinh biết ảnh đã nhẹ đi bao nhiêu.
 * File không phải ảnh (PDF) thì trả nguyên trạng.
 */
export async function shrinkImage(file) {
  const untouched = { blob: file, name: file.name, type: file.type, before: file.size, after: file.size }
  if (!file.type.startsWith('image/') || !canProcess()) return untouched

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', QUALITY))
    // Không nén được, hoặc nén xong lại to hơn (ảnh vốn đã nhỏ) → giữ bản gốc.
    if (!blob || blob.size >= file.size) return untouched

    return {
      blob,
      name: file.name.replace(/\.[^.]+$/, '') + '.webp',
      type: 'image/webp',
      before: file.size,
      after: blob.size,
    }
  } catch {
    return untouched
  }
}

export const kb = (bytes) => (bytes >= 1024 * 1024
  ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
  : Math.round(bytes / 1024) + ' KB')
