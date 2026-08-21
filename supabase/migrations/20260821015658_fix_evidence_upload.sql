-- Frontend thu nhỏ ảnh JPEG/PNG thành WebP trước khi upload, nên bucket phải
-- nhận WebP. Giới hạn 12 MB khớp với ảnh gốc mà giao diện cho phép; PDF vẫn bị
-- giới hạn 5 MB ở giao diện.
update storage.buckets
set file_size_limit = 12582912,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id = 'evidence';
