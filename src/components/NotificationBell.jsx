import { useEffect, useRef, useState } from 'react'
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
  const boxRef = useRef(null)

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

  useEffect(() => {
    const onClickOutside = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

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

  return <div className="bell-wrap" ref={boxRef}>
    <button className="nav-button bell" onClick={() => setOpen(!open)} title="Thông báo" aria-label="Thông báo">
      <Bell size={18} />
      {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
    </button>

    {open && <div className="bell-panel card">
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
    </div>}
  </div>
}
