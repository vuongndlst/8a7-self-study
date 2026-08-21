export function evidenceUploadError(error) {
  const detail = [error?.message, error?.error, error?.statusCode, error?.status]
    .filter(Boolean).join(' ').toLowerCase()

  if (/mime|media type|content.?type|format/.test(detail)) {
    return 'Định dạng file chưa được hỗ trợ. Em hãy dùng ảnh JPG, PNG, WebP hoặc file PDF.'
  }
  if (/too large|maximum|size|413|entity too/.test(detail)) {
    return 'File vẫn còn quá lớn sau khi xử lý. Em thử chụp lại ở độ phân giải thấp hơn hoặc chọn file khác nhé.'
  }
  if (/row.level|policy|unauthorized|forbidden|401|403/.test(detail)) {
    return 'Phiên đăng nhập chưa có quyền tải file. Em tải lại trang, đăng nhập lại rồi thử thêm một lần nữa.'
  }
  if (/network|fetch|timeout|timed out|offline/.test(detail)) {
    return 'Kết nối mạng bị gián đoạn khi tải file. Kết quả đã được lưu; em có thể thử thêm minh chứng lại.'
  }
  return 'Kết quả đã được lưu nhưng file minh chứng chưa tải lên được. Em thử lại hoặc chọn file khác nhé.'
}
