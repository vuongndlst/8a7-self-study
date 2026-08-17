import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bell, MessageSquare, Star, Laptop, MessageSquareQuote } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ICON = {
  rating: Star,
  comment: MessageSquareQuote,
  message: MessageSquare,
  device: Laptop,
  system: Bell,
}

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'vừa xong'
  if (mins < 60) return `${mins} phút trước`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} giờ trước`
  return `${Math.round(hours / 24)} ngày trước`
}

export default function NotificationBell({ onOpenPlan, onOpenChat }) {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(null)      // toạ độ để neo bảng thông báo
  const boxRef = useRef(null)
  const panelRef = useRef(null)

  const load = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data ?? [])
  }

  useEffect(() => {
    if (!profile) return
    load()
    // Realtime để chuông kêu ngay, kèm nhịp dự phòng nếu websocket rớt.
    const channel = supabase
      .channel('notif')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => load())
      .subscribe()
    const timer = setInterval(load, 60000)
    return () => { supabase.removeChannel(channel); clearInterval(timer) }
  }, [profile?.id])

  // Bảng thông báo được dựng ra ngoài <body>, nên "bấm ra ngoài để đóng" phải xét
  // CẢ nút chuông lẫn bảng — nếu chỉ xét nút thì bấm vào chính bảng cũng đóng nó.
  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current?.contains(e.target)) return
      if (panelRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [])

  // Đo vị trí nút chuông ngay trước khi vẽ bảng, và đo lại khi cuộn/đổi cỡ màn.
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const r = boxRef.current?.getBoundingClientRect()
      if (!r) return
      // Bề rộng bảng phải khớp công thức trong CSS thì mới kẹp đúng được.
      const vw = window.innerWidth
      const w = Math.min(360, vw - 24)
      // Neo mép phải theo nút chuông, nhưng không để bảng thò ra ngoài màn hình:
      // trên điện thoại nút chuông sát mép phải, bảng rộng gần bằng cả màn nên
      // nếu chỉ neo theo nút thì mép trái tụt ra ngoài.
      const right = Math.min(Math.max(12, vw - r.right), vw - w - 12)
      setAt({ top: r.bottom + 8, right })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  if (!profile) return null
  const unread = items.filter((n) => !n.read_at).length

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id)
    if (!ids.length) return
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })))
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
  }

  const click = async (n) => {
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)))
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    }
    setOpen(false)
    if (n.conversation_id && onOpenChat) onOpenChat(n.conversation_id)
    else if (n.plan_id && onOpenPlan) onOpenPlan(n.plan_id)
  }

  // Bảng thông báo PHẢI dựng ra ngoài <body>.
  //
  // Thanh điều hướng có `overflow-x:auto` (để menu cuộn ngang thay vì vỡ hàng).
  // Một phần tử `position:absolute` nằm trong vùng cuộn đó thì bị CẮT theo khung
  // của vùng cuộn — mà bảng thông báo lại thả xuống dưới thanh 70px, tức là hoàn
  // toàn nằm ngoài khung. Kết quả: chuông vẫn bấm được nhưng bảng biến mất, nhìn
  // như thông báo "không bấm vào được".
  //
  // Đưa qua portal + `position:fixed` là cách duy nhất chắc chắn: bảng không còn
  // là con của vùng cuộn nên không có gì cắt nó nữa. (Chỉ đổi sang `fixed` tại
  // chỗ thì vẫn hỏng — `backdrop-filter` trên thanh điều hướng tạo containing
  // block mới, nên `fixed` vẫn bị neo vào trong thanh.)
  const panel = <div className="bell-panel card" ref={panelRef} role="dialog" aria-label="Thông báo"
    style={{ top: at?.top ?? 0, right: at?.right ?? 12 }}>
    <div className="bell-head">
      <strong>Thông báo</strong>
      {unread > 0 && <button className="link-button" onClick={markAllRead}>Đánh dấu đã đọc</button>}
    </div>
    {items.length === 0
      ? <div className="bell-empty">Chưa có thông báo nào.</div>
      : <ul className="bell-list">{items.map((n) => {
          const Icon = ICON[n.kind] ?? Bell
          const isLow = n.kind === 'rating' && /\b[12]\/5$/.test(n.title)
          return <li key={n.id}>
            <button className={`bell-item ${n.read_at ? '' : 'unread'} ${isLow ? 'alarm' : ''}`} onClick={() => click(n)}>
              <Icon size={16} />
              <span>
                <strong>{n.title}</strong>
                {n.body && <small>{n.body}</small>}
                <em>{timeAgo(n.created_at)}</em>
              </span>
            </button>
          </li>
        })}</ul>}
  </div>

  return <div className="bell-wrap" ref={boxRef}>
    <button className="nav-button bell" onClick={() => setOpen(!open)} title="Thông báo"
            aria-label="Thông báo" aria-expanded={open}>
      <Bell size={18} />
      {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
    </button>
    {open && at && createPortal(panel, document.body)}
  </div>
}
