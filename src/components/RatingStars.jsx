import { Star } from 'lucide-react'

// Mức 1–2 sao là cảnh báo: đỏ cho 1, vàng cho 2.
export const ratingTone = (rating) => {
  if (rating == null) return ''
  if (rating <= 1) return 'alarm-red'
  if (rating <= 2) return 'alarm-amber'
  return 'rating-ok'
}

export const ratingLabel = (rating) => ({
  1: 'Cần làm lại',
  2: 'Chưa đạt yêu cầu',
  3: 'Đạt',
  4: 'Tốt',
  5: 'Rất tốt',
}[rating] ?? '')

export default function RatingStars({ value, onChange, size = 18, readOnly }) {
  const stars = [1, 2, 3, 4, 5]
  return <span className={`rating-stars ${ratingTone(value)} ${readOnly ? 'read-only' : ''}`}>
    {stars.map((n) => {
      const filled = value != null && n <= value
      return readOnly
        ? <Star key={n} size={size} className={filled ? 'on' : 'off'} fill={filled ? 'currentColor' : 'none'} />
        : <button key={n} type="button" title={`${n} sao — ${ratingLabel(n)}`} aria-label={`${n} sao`}
                  onClick={() => onChange(value === n ? null : n)}>
            <Star size={size} className={filled ? 'on' : 'off'} fill={filled ? 'currentColor' : 'none'} />
          </button>
    })}
    {value != null && <small>{value}/5 · {ratingLabel(value)}</small>}
  </span>
}
