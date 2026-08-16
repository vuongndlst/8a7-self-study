import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { roleLabel } from '../utils/roles'
import { useAuth } from '../context/AuthContext'

// Một luồng cho mỗi học sinh. Giáo viên và trợ giảng (nếu được bật quyền chat)
// cùng đọc và trả lời trong luồng đó.
export default function ChatPanel({ conversationId, studentName, compact }) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [senders, setSenders] = useState({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  const load = async () => {
    if (!conversationId) return
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    const list = data ?? []
    setMessages(list)

    const ids = [...new Set(list.map((m) => m.sender_id))]
    if (ids.length) {
      const { data: people } = await supabase.from('profiles').select('id,full_name,role').in('id', ids)
      setSenders(Object.fromEntries((people ?? []).map((p) => [p.id, p])))
    }
    // Ghi mốc đã đọc để chuông không đếm lại tin cũ.
    await supabase.from('conversation_reads')
      .upsert({ conversation_id: conversationId, user_id: profile.id, last_read_at: new Date().toISOString() },
              { onConflict: 'conversation_id,user_id' })
  }

  useEffect(() => {
    load()
    if (!conversationId) return
    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [conversationId])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  const send = async (e) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || !conversationId) return
    setBusy(true)
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId, sender_id: profile.id, body,
    })
    setBusy(false)
    if (error) return
    setText('')
    load()
  }

  if (!conversationId) return <div className="chat-empty">Chưa mở được cuộc trò chuyện.</div>

  return <div className={`chat-panel ${compact ? 'compact' : ''}`}>
    <div className="chat-scroll">
      {messages.length === 0
        ? <div className="chat-empty">Chưa có tin nhắn nào.{studentName ? ` Nhắn cho ${studentName} để bắt đầu.` : ' Hãy gửi tin đầu tiên.'}</div>
        : messages.map((m) => {
            const me = m.sender_id === profile.id
            const who = senders[m.sender_id]
            return <div key={m.id} className={`chat-msg ${me ? 'mine' : ''}`}>
              {!me && <span className="chat-who">{who?.full_name ?? '—'}{roleLabel(who?.role)}</span>}
              <p>{m.body}</p>
              <em>{new Date(m.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</em>
            </div>
          })}
      <div ref={endRef} />
    </div>
    <form className="chat-input" onSubmit={send}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000}
             placeholder="Nhập tin nhắn…" autoComplete="off" />
      <button className="button primary" disabled={busy || !text.trim()}><Send size={16} /></button>
    </form>
  </div>
}

// Lấy (hoặc tạo) luồng của một học sinh. Dùng chung cho cả 3 vai trò.
export async function getOrCreateConversation(classId, studentId) {
  const { data: found } = await supabase
    .from('conversations').select('id')
    .eq('class_id', classId).eq('student_id', studentId).maybeSingle()
  if (found) return found.id
  const { data: created, error } = await supabase
    .from('conversations').insert({ class_id: classId, student_id: studentId }).select('id').maybeSingle()
  if (error) {
    // Có thể một phía khác vừa tạo trước — đọc lại.
    const { data: again } = await supabase
      .from('conversations').select('id')
      .eq('class_id', classId).eq('student_id', studentId).maybeSingle()
    return again?.id ?? null
  }
  return created?.id ?? null
}
