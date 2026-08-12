import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, UploadCloud } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const SIZE = 256                    // ảnh lưu là hình vuông 256×256
const MAX_UPLOAD = 5 * 1024 * 1024  // chặn sớm file quá to trước khi đọc

// Chữ cái đầu dùng khi chưa có ảnh: lấy 2 từ cuối của tên tiếng Việt.
export const initialsOf = (name = '') => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Màu nền ổn định theo tên, để mỗi em có một màu riêng nhất quán.
const hueOf = (name = '') => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}

// Bộ nhớ tạm cho signed URL — bucket để riêng tư nên URL có hạn.
const urlCache = new Map()

export async function signedAvatarUrls(paths = []) {
  const need = [...new Set(paths.filter(Boolean))].filter((p) => {
    const hit = urlCache.get(p)
    return !hit || hit.expires < Date.now()
  })
  if (need.length) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(need, 3600)
    for (const row of data ?? []) {
      if (row.signedUrl) urlCache.set(row.path, { url: row.signedUrl, expires: Date.now() + 55 * 60 * 1000 })
    }
  }
  return Object.fromEntries([...new Set(paths.filter(Boolean))].map((p) => [p, urlCache.get(p)?.url ?? null]))
}

export default function Avatar({ name, path, size = 40, url }) {
  const [src, setSrc] = useState(url ?? null)
  useEffect(() => {
    if (url) { setSrc(url); return }
    let alive = true
    if (!path) { setSrc(null); return }
    signedAvatarUrls([path]).then((m) => { if (alive) setSrc(m[path] ?? null) })
    return () => { alive = false }
  }, [path, url])

  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) }
  if (src) return <img className="avatar" style={style} src={src} alt={name || 'Ảnh đại diện'} />
  return <span className="avatar initials" style={{ ...style, background: `hsl(${hueOf(name)} 42% 88%)`, color: `hsl(${hueOf(name)} 45% 30%)` }}>
    {initialsOf(name)}
  </span>
}

// Hộp thoại đổi ảnh: chọn ảnh → cắt vuông ở giữa → xem trước → lưu.
export function AvatarUploader({ onClose }) {
  const { profile, refreshProfile } = useAuth()
  const [preview, setPreview] = useState(null)
  const [blob, setBlob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMsg('Chỉ nhận ảnh JPG, PNG hoặc WebP.')
    if (file.size > MAX_UPLOAD) return setMsg('Ảnh vượt quá 5 MB. Em chọn ảnh nhỏ hơn nhé.')

    try {
      const bitmap = await createImageBitmap(file)
      // Cắt vuông ở giữa rồi thu về 256×256 — file lưu luôn nhỏ và đồng đều.
      const side = Math.min(bitmap.width, bitmap.height)
      const sx = (bitmap.width - side) / 2
      const sy = (bitmap.height - side) / 2
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, SIZE, SIZE)
      const out = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.9))
      if (!out) return setMsg('Không xử lý được ảnh này. Em thử ảnh khác nhé.')
      setBlob(out)
      setPreview(URL.createObjectURL(out))
    } catch {
      setMsg('Không đọc được ảnh này. Em thử ảnh khác nhé.')
    }
  }

  const save = async () => {
    if (!blob) return
    setBusy(true); setMsg('')
    const path = `${profile.id}/avatar.webp`
    const { error } = await supabase.storage.from('avatars')
      .upload(path, blob, { upsert: true, contentType: 'image/webp' })
    if (error) { setBusy(false); return setMsg('Không tải ảnh lên được. ' + (error.message || '')) }
    // Lưu đúng đường dẫn thật — thêm query vào đây sẽ làm hỏng createSignedUrls.
    // Ảnh mới hiển thị ngay nhờ xóa bộ nhớ tạm bên dưới.
    const { error: e2 } = await supabase.from('profiles')
      .update({ avatar_path: path }).eq('id', profile.id)
    setBusy(false)
    if (e2) return setMsg('Đã tải ảnh nhưng chưa lưu được. ' + (e2.message || ''))
    urlCache.clear()
    await refreshProfile()
    onClose()
  }

  const remove = async () => {
    setBusy(true); setMsg('')
    await supabase.storage.from('avatars').remove([`${profile.id}/avatar.webp`])
    await supabase.from('profiles').update({ avatar_path: null }).eq('id', profile.id)
    urlCache.clear()
    setBusy(false)
    await refreshProfile()
    onClose()
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">HỒ SƠ</span><h2>Ảnh đại diện</h2></div>
        <button className="icon-button" onClick={onClose}>✕</button></div>

      <div className="avatar-editor">
        {preview
          ? <img className="avatar-preview" src={preview} alt="Xem trước" />
          : <Avatar name={profile?.full_name} path={profile?.avatar_path} size={128} />}
        <div>
          <p className="muted-text small">Ảnh sẽ được cắt vuông và thu về 256×256. Nhận JPG, PNG hoặc WebP, tối đa 5 MB.</p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} hidden />
          <button className="button ghost" onClick={() => fileRef.current?.click()}><UploadCloud size={16} /> Chọn ảnh</button>
        </div>
      </div>

      <p className="muted-text small">Chỉ giáo viên và trợ giảng lớp em nhìn thấy ảnh này. Ảnh không công khai trên mạng.</p>
      {msg && <div className="form-error">{msg}</div>}

      <div className="form-actions spread">
        {profile?.avatar_path
          ? <button className="button ghost danger" onClick={remove} disabled={busy}><Trash2 size={16} /> Bỏ ảnh</button>
          : <span />}
        <span>
          <button className="button ghost" onClick={onClose}>Đóng</button>
          <button className="button primary" onClick={save} disabled={busy || !blob}>
            <Camera size={16} />{busy ? 'Đang lưu…' : 'Lưu ảnh'}
          </button>
        </span>
      </div>
    </div>
  </div>
}
