import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, ChevronDown, ExternalLink, FileUp, KeyRound, MessageSquare, MessageSquareQuote, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase, callFunction } from '../lib/supabase'
import { daysUntil, formatDate, registrationStatus, todayISO } from '../utils/date'
import { passwordChecks, validateStudentPassword } from '../utils/password'
import StatusBadge from '../components/StatusBadge'
import RatingStars, { ratingTone, ratingLabel } from '../components/RatingStars'
import ChatPanel, { getOrCreateConversation } from '../components/ChatPanel'
import SessionRegister from '../components/SessionRegister'
import Avatar, { AvatarUploader } from '../components/Avatar'

const activityOptions=['Bài tập cá nhân','Ôn tập','Công việc nhóm','Đọc sách','Chuẩn bị nội dung chia sẻ','Khác']
const subjectOptions=['Toán','Ngữ văn','Tiếng Anh','Khoa học tự nhiên','Lịch sử & Địa lý','GDCD','Tin học','Công nghệ','Nghệ thuật','Khác']
const priorityOptions=['Cao','Trung bình','Thấp']
const fallbackOptions=['Làm nhiệm vụ tiếp theo','Ôn tập','Đọc sách','Chuẩn bị nội dung chia sẻ']
const emptyPlan={study_date:'',period:'1',activity_type:'Bài tập cá nhân',subject:'Toán',task:'',priority:'Trung bình',goal:'',use_device:false,device_purpose:'',fallback_activity:'Làm nhiệm vụ tiếp theo'}

export default function StudentPage(){
  const {profile,context}=useAuth()
  const [plans,setPlans]=useState([])
  const [reflections,setReflections]=useState({})
  const [evidence,setEvidence]=useState({})
  const [status,setStatus]=useState({})
  const [form,setForm]=useState(emptyPlan)
  const [showForm,setShowForm]=useState(false)
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  const [openPlan,setOpenPlan]=useState(null)
  const [showPassword,setShowPassword]=useState(false)
  const [showChat,setShowChat]=useState(false)
  const [conversationId,setConversationId]=useState(null)
  const [showAvatar,setShowAvatar]=useState(false)

  const load=async()=>{
    if(!profile?.id)return
    // Lọc theo chính em đang đăng nhập. RLS cho trợ giảng đọc được cả lớp,
    // nên nếu không lọc thì trang "kế hoạch của em" sẽ lẫn kế hoạch của bạn khác.
    const {data:p}=await supabase.from('plans').select('*').eq('student_id',profile.id)
      .order('study_date',{ascending:false}).order('period',{ascending:true})
    const planList=p||[]
    setPlans(planList)
    if(planList.length){
      const ids=planList.map(x=>x.id)
      const [{data:r},{data:e},{data:s}]=await Promise.all([
        supabase.from('reflections').select('*').in('plan_id',ids),
        supabase.from('evidence').select('*').in('plan_id',ids).order('created_at',{ascending:true}),
        // Trạng thái tiến độ do CSDL tính — giao diện không tự suy diễn để khỏi lệch.
        supabase.from('plan_status').select('plan_id,progress,overdue_at,auto_evaluate_at').in('plan_id',ids)
      ])
      setReflections(Object.fromEntries((r||[]).map(x=>[x.plan_id,x])))
      const grouped={};(e||[]).forEach(x=>{(grouped[x.plan_id] ||= []).push(x)});setEvidence(grouped)
      setStatus(Object.fromEntries((s||[]).map(x=>[x.plan_id,x])))
    }else{setReflections({});setEvidence({});setStatus({})}
  }
  useEffect(()=>{load()},[profile?.id])

  const submitPlan=async(e)=>{
    e.preventDefault();setMessage('')
    if(!form.study_date)return setMessage('Hãy chọn ngày tự học.')
    if(form.use_device&&!form.device_purpose.trim())return setMessage('Hãy ghi rõ mục đích sử dụng thiết bị.')
    setBusy(true)
    // class_id do trigger phía CSDL gán theo lớp của em trong năm hiện hành.
    const payload={...form,period:Number(form.period),student_id:profile.id,
      device_purpose:form.use_device?form.device_purpose.trim():null,
      device_status:form.use_device?'Chờ duyệt':'Không dùng'}
    const {error}=await supabase.from('plans').insert(payload)
    setBusy(false)
    if(error){
      if(error.code==='23505')setMessage('Em đã có kế hoạch cho ngày và tiết này.')
      else if(/ghi danh/i.test(error.message||''))setMessage('Tài khoản của em chưa được ghi danh vào lớp nào của năm học này. Hãy báo giáo viên.')
      else setMessage('Không thể lưu kế hoạch. Hãy kiểm tra thông tin và thử lại.')
      return
    }
    setForm(emptyPlan);setShowForm(false);setMessage('✓ Đã lưu kế hoạch tự học.');load()
  }

  // Gom nhiệm vụ theo BUỔI: một buổi có thể có nhiều nhiệm vụ.
  const sessions=useMemo(()=>{
    const m=new Map()
    for(const p of plans){
      const k=p.session_id??`${p.study_date}-${p.period}`
      if(!m.has(k))m.set(k,{key:k,study_date:p.study_date,period:p.period,tasks:[]})
      m.get(k).tasks.push(p)
    }
    return [...m.values()]
      .map(s=>({...s,tasks:s.tasks.sort((a,b)=>a.created_at.localeCompare(b.created_at))}))
      .sort((a,b)=>b.study_date.localeCompare(a.study_date)||a.period-b.period)
  },[plans])
  const upcoming=useMemo(()=>sessions.filter(s=>s.study_date>=todayISO()),[sessions])
  const past=useMemo(()=>sessions.filter(s=>s.study_date<todayISO()),[sessions])
  const onTimeCount=plans.filter(p=>registrationStatus(p.study_date,p.created_at)==='Đúng hạn').length
  const completedCount=Object.values(reflections).filter(r=>r.completion_status==='Hoàn thành').length
  const evidenceCount=Object.values(evidence).reduce((sum,list)=>sum+list.length,0)
  const onTimeRate=plans.length?Math.round(onTimeCount/plans.length*100):0
  // Nhiệm vụ (không phải buổi) đã qua mà chưa cập nhật kết quả.
  const pendingReflections=past.reduce((n,s)=>n+s.tasks.filter(t=>!reflections[t.id]).length,0)
  const newComments=Object.values(reflections).filter(r=>r.teacher_comment).length
  const rated=Object.values(reflections).filter(r=>r.rating!=null)
  const avgRating=rated.length?(rated.reduce((s,r)=>s+r.rating,0)/rated.length).toFixed(1):null
  // Tiết bị chấm 1–2 sao mà em chưa viết phản hồi điều chỉnh.
  const needsAck=plans.filter(p=>{const r=reflections[p.id];return r?.rating!=null&&r.rating<=2&&!r.student_ack_at})
  const overdue=plans.filter(p=>status[p.id]?.progress==='Trễ hạn cập nhật')
  const autoRated=plans.filter(p=>status[p.id]?.progress==='Hệ thống tự đánh giá')

  const openChat=async()=>{
    if(!context.classId)return
    const id=conversationId??await getOrCreateConversation(context.classId,profile.id)
    setConversationId(id);setShowChat(true)
  }

  return <div className="page">
    <section className="dashboard-heading">
      <div className="heading-with-avatar">
        <button type="button" className="avatar-button" onClick={()=>setShowAvatar(true)} title="Đổi ảnh đại diện">
          <Avatar name={profile?.full_name} path={profile?.avatar_path} size={64}/>
          <span className="avatar-edit-dot">✎</span>
        </button>
        <div>
        <span className="eyebrow">KẾ HOẠCH CỦA EM</span>
        <h1>Chào {profile?.full_name}</h1>
        <p>MSHS: <strong>{profile?.mshs}</strong>{context.className?<> · Lớp <strong>{context.className}</strong>{context.yearName?` (${context.yearName})`:''}</>:null} · Lập kế hoạch trước, thực hiện có mục tiêu, rồi nhìn lại kết quả.</p>
        </div>
      </div>
      <div className="button-row">
        <button className="button ghost" onClick={openChat}><MessageSquare size={17}/> Nhắn giáo viên</button>
        <button className="button ghost" onClick={()=>setShowPassword(true)}><KeyRound size={17}/> Đổi mật khẩu</button>
        <button className="button primary" onClick={()=>setShowForm(!showForm)}><CalendarPlus size={18}/> Đăng ký giờ tự học</button>
      </div>
    </section>

    <section className="student-summary">
      <Stat label="Buổi sắp tới" value={upcoming.length}/>
      <Stat label="Đúng hạn" value={`${onTimeRate}%`}/>
      <Stat label="Nhiệm vụ hoàn thành" value={completedCount}/>
      <Stat label="Điểm trung bình" value={avgRating?`${avgRating}/5`:'—'}/>
    </section>

    {needsAck.length>0&&<div className="notice danger"><AlertTriangle size={18}/><span>
      Có <strong>{needsAck.length} tiết</strong> bị đánh giá thấp và em <strong>chưa viết phản hồi</strong>. Mở thẻ có viền đỏ/vàng bên dưới, đọc nhận xét rồi ghi một dòng cho biết em sẽ điều chỉnh thế nào.
    </span></div>}
    {overdue.length>0&&<div className="notice danger"><AlertTriangle size={18}/><span>
      <strong>{overdue.length} tiết đã quá hạn cập nhật kết quả.</strong> Nếu để quá 5 ngày, hệ thống sẽ tự ghi nhận 1 sao. Em bổ sung sớm giúp thầy cô theo dõi đúng tiến độ nhé.
    </span></div>}
    {autoRated.length>0&&<div className="notice warning"><AlertTriangle size={18}/><span>
      <strong>{autoRated.length} tiết được hệ thống tự đánh giá</strong> do quá hạn cập nhật. Em vẫn có thể bổ sung kết quả — thầy cô sẽ xem lại và chấm lại.
    </span></div>}
    {pendingReflections>0&&overdue.length===0&&<div className="notice warning"><ShieldCheck size={18}/><span>Em còn <strong>{pendingReflections} tiết</strong> đã qua mà chưa cập nhật kết quả. Mở thẻ ở mục “Lịch sử gần đây” để bổ sung.</span></div>}
    {newComments>0&&<div className="notice"><MessageSquareQuote size={18}/><span>Giáo viên đã nhận xét <strong>{newComments}</strong> lần phản tư của em.</span></div>}
    {message&&<div className="notice"><ShieldCheck size={18}/><span>{message}</span></div>}
    {showForm&&<SessionRegister
      onCancel={()=>setShowForm(false)}
      onDone={()=>{setShowForm(false);setMessage('✓ Đã đăng ký buổi tự học.');load()}}/>}

    <section className="section-block">
      <div className="section-title"><div><h2>Sắp tới</h2><p>Các kế hoạch từ hôm nay trở đi. Kế hoạch tương lai có thể chỉnh sửa hoặc xóa.</p></div><button className="icon-button" onClick={load} title="Làm mới"><RefreshCw size={18}/></button></div>
      {upcoming.length===0?<EmptyState text="Chưa có buổi tự học sắp tới."/>:<div className="plan-grid">{upcoming.map(s=><SessionCard key={s.key} session={s} reflections={reflections} evidence={evidence} status={status} onOpen={setOpenPlan} onChanged={load}/>)}</div>}
    </section>

    <section className="section-block">
      <div className="section-title"><div><h2>Lịch sử gần đây</h2><p>Sau giờ tự học, cập nhật kết quả và minh chứng nếu có.</p></div></div>
      {past.length===0?<EmptyState text="Chưa có lịch sử tự học."/>:<div className="plan-grid">{past.slice(0,15).map(s=><SessionCard key={s.key} session={s} reflections={reflections} evidence={evidence} status={status} onOpen={setOpenPlan} onChanged={load}/>)}</div>}
    </section>

    {openPlan&&(openPlan.study_date>todayISO()
      ?<EditPlanModal plan={openPlan} onClose={()=>setOpenPlan(null)} onSaved={()=>{setOpenPlan(null);load()}}/>
      :<ReflectionModal plan={openPlan} existing={reflections[openPlan.id]} evidence={evidence[openPlan.id]||[]} onClose={()=>setOpenPlan(null)} onSaved={()=>{setOpenPlan(null);load()}}/>)}
    {showPassword&&<ChangePasswordModal mshs={profile?.mshs} onClose={()=>setShowPassword(false)}/>}
    {showAvatar&&<AvatarUploader onClose={()=>setShowAvatar(false)}/>}
    {showChat&&<div className="modal-backdrop" onMouseDown={()=>setShowChat(false)}>
      <div className="modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">TIN NHẮN</span><h2>Hỏi giáo viên</h2></div><button className="icon-button" onClick={()=>setShowChat(false)}>✕</button></div>
        <ChatPanel conversationId={conversationId}/>
      </div>
    </div>}
  </div>
}

function Stat({label,value}){return <div className="stat-card"><span>{label}</span><strong>{value}</strong></div>}

function DeviceBadge({plan}){
  if(!plan.use_device)return <span>Không thiết bị</span>
  const map={'Chờ duyệt':'Thiết bị: chờ duyệt','Đã duyệt':'Thiết bị: đã duyệt','Từ chối':'Thiết bị: bị từ chối'}
  return <StatusBadge value={plan.device_status} label={map[plan.device_status]||'Thiết bị'}/>
}

function PlanForm({form,setForm,onSubmit,busy}){
  const update=(k,v)=>setForm({...form,[k]:v});const days=daysUntil(form.study_date)
  return <form className="card plan-form" onSubmit={onSubmit}>
    <div className="section-title"><div><h2>Đăng ký kế hoạch mới</h2><p>Chọn đúng ngày và tiết tự học. Hệ thống tự ghi thời điểm đăng ký.</p></div></div>
    <div className="form-grid three">
      <div><label>Ngày tự học *</label><input type="date" min={todayISO()} value={form.study_date} onChange={e=>update('study_date',e.target.value)} required/>{form.study_date&&<small className={days<=0?'text-warning':'text-success'}>{days<=0?'Đăng ký trong ngày sẽ được đánh dấu trễ.':days===1?'Còn 1 ngày — vẫn đúng hạn.':`Còn ${days} ngày — đăng ký đúng hạn.`}</small>}</div>
      <div><label>Tiết *</label><select value={form.period} onChange={e=>update('period',e.target.value)}>{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={n}>Tiết {n}</option>)}</select></div>
      <div><label>Mức ưu tiên *</label><select value={form.priority} onChange={e=>update('priority',e.target.value)}>{priorityOptions.map(x=><option key={x}>{x}</option>)}</select></div>
    </div>
    <div className="form-grid two">
      <div><label>Loại hoạt động *</label><select value={form.activity_type} onChange={e=>update('activity_type',e.target.value)}>{activityOptions.map(x=><option key={x}>{x}</option>)}</select></div>
      <div><label>Môn / nội dung *</label><select value={form.subject} onChange={e=>update('subject',e.target.value)}>{subjectOptions.map(x=><option key={x}>{x}</option>)}</select></div>
    </div>
    <label>Nhiệm vụ cụ thể *</label><textarea rows="3" maxLength={1000} value={form.task} onChange={e=>update('task',e.target.value)} placeholder="Ví dụ: Hoàn thành bài 5–10 trang 24." required/>
    <label>Mục tiêu cuối tiết *</label><textarea rows="2" maxLength={1000} value={form.goal} onChange={e=>update('goal',e.target.value)} placeholder="Ví dụ: Hoàn thành đủ 6 bài và tự kiểm tra lại đáp án." required/>
    <div className="toggle-row"><label className="switch"><input type="checkbox" checked={form.use_device} onChange={e=>update('use_device',e.target.checked)}/><span/></label><div><strong>Sử dụng thiết bị điện tử</strong><small>Cần đăng ký trước ít nhất 1 ngày, ghi đúng mục đích và <strong>chờ giáo viên duyệt</strong>.</small></div></div>
    {form.use_device&&<div><label>Mục đích sử dụng thiết bị *</label><input maxLength={500} value={form.device_purpose} onChange={e=>update('device_purpose',e.target.value)} placeholder="Ví dụ: Truy cập tài liệu bài tập trên Canvas." required/></div>}
    <label>Nếu hoàn thành sớm</label><select value={form.fallback_activity} onChange={e=>update('fallback_activity',e.target.value)}>{fallbackOptions.map(x=><option key={x}>{x}</option>)}</select>
    <div className="form-actions"><button type="button" className="button ghost" onClick={()=>setForm(emptyPlan)}>Làm lại</button><button className="button primary" disabled={busy}>{busy?'Đang lưu…':'Đăng ký kế hoạch'}</button></div>
  </form>
}

// Một thẻ = một BUỔI tự học, bên trong liệt kê các nhiệm vụ của buổi đó.
function SessionCard({session,reflections,evidence,status,onOpen,onChanged}){
  const {study_date,period,tasks}=session
  const editable=study_date>todayISO()
  const regStatus=registrationStatus(study_date,tasks[0]?.created_at)
  // Trạng thái buổi suy ra từ các nhiệm vụ — giống hệt cách CSDL tính.
  const done=tasks.filter(t=>reflections[t.id]).length
  const pending=tasks.length-done
  const late=tasks.filter(t=>['Trễ hạn cập nhật','Hệ thống tự đánh giá'].includes(status[t.id]?.progress)).length
  const worst=tasks.reduce((m,t)=>{const r=reflections[t.id]?.rating;return r!=null&&(m==null||r<m)?r:m},null)
  const tone=ratingTone(worst)
  const needsAck=tasks.some(t=>{const r=reflections[t.id];return r?.rating!=null&&r.rating<=2&&!r.student_ack_at})

  const removeSession=async(e)=>{
    e.stopPropagation()
    if(!window.confirm(`Xóa cả buổi tự học ngày ${formatDate(study_date)} tiết ${period} (${tasks.length} nhiệm vụ)?`))return
    const {error}=await supabase.from('plans').delete().in('id',tasks.map(t=>t.id))
    if(error)return window.alert('Không thể xóa buổi này.')
    if(session.key&&tasks[0]?.session_id)await supabase.from('self_study_sessions').delete().eq('id',tasks[0].session_id)
    onChanged()
  }

  return <article className={`card session-card ${tone}`}>
    <div className="plan-card-top">
      <span className="date-chip">{formatDate(study_date)} · Tiết {period}</span>
      <span className="plan-card-actions">
        <StatusBadge value={regStatus}/>
        {editable&&<button type="button" className="icon-button danger" title="Xóa cả buổi" onClick={removeSession}><Trash2 size={15}/></button>}
      </span>
    </div>

    <div className="session-meta">
      <strong>{tasks.length} nhiệm vụ</strong>
      <span className="muted-text">· đã cập nhật {done}/{tasks.length}</span>
      {late>0&&<span className="help-flag">· {late} trễ hạn</span>}
    </div>
    {needsAck&&<div className="ack-warning"><AlertTriangle size={14}/><span>Có nhiệm vụ em cần viết phản hồi</span></div>}

    <ul className="session-tasks">{tasks.map(t=>{
      const r=reflections[t.id];const st=status[t.id];const ev=evidence[t.id]||[]
      return <li key={t.id}>
        <button type="button" className={`task-row ${ratingTone(r?.rating)}`} onClick={()=>onOpen(t)}>
          <span className="task-row-main">
            <strong>{t.subject==='Khác'&&t.subject_other?t.subject_other:t.subject}</strong>
            <small>{t.task}</small>
          </span>
          <span className="task-row-side">
            {t.use_device&&<StatusBadge value={t.review_status} label={t.review_status==='Chờ duyệt'?'💻 chờ duyệt':'💻'}/>}
            {r?<StatusBadge value={r.completion_status}/>
              :st?.progress&&st.progress!=='Chưa tới buổi'?<StatusBadge value={st.progress}/>
              :<span className="muted-text small">chưa cập nhật</span>}
            {r?.rating!=null&&<RatingStars value={r.rating} readOnly size={13}/>}
            {ev.length>0&&<span className="muted-text small">📎{ev.length}</span>}
          </span>
          <ChevronDown size={15}/>
        </button>
        {/* Cập nhật kết quả là việc quan trọng nhất sau giờ tự học — cho nó một
            nút riêng, to rõ, thay vì bắt em đoán rằng bấm vào dòng sẽ ra. */}
        {!editable&&(r
          ? <button type="button" className="button ghost task-cta" onClick={()=>onOpen(t)}>
              <MessageSquareQuote size={16}/> Xem lại / bổ sung kết quả
            </button>
          : <button type="button" className="button primary task-cta" onClick={()=>onOpen(t)}>
              <FileUp size={18}/> Cập nhật kết quả
            </button>)}
        {editable&&<button type="button" className="button ghost task-cta" onClick={()=>onOpen(t)}>
          Chỉnh sửa nhiệm vụ
        </button>}
      </li>
    })}</ul>

    {!editable&&pending>0&&<p className="session-cta-hint">
      Còn <strong>{pending}</strong> nhiệm vụ chưa có kết quả. Cập nhật sớm để thầy cô theo dõi đúng tiến độ nhé.
    </p>}
  </article>
}

function PlanCard({plan,reflection,evidence,progress,onOpen,onChanged}){
  const regStatus=registrationStatus(plan.study_date,plan.created_at)
  const editable=plan.study_date>todayISO()
  const remove=async(e)=>{
    e.stopPropagation()
    if(!window.confirm(`Xóa kế hoạch ngày ${formatDate(plan.study_date)} tiết ${plan.period}?`))return
    const {error}=await supabase.from('plans').delete().eq('id',plan.id)
    if(error)window.alert('Không thể xóa kế hoạch này.')
    onChanged()
  }
  // Viền đỏ khi bị 1 sao, viền vàng khi 2 sao — để em nhìn thấy ngay trong danh sách.
  const tone=ratingTone(reflection?.rating)
  const needsAck=reflection?.rating!=null&&reflection.rating<=2&&!reflection.student_ack_at
  return <article className={`card plan-card ${tone}`} onClick={onOpen}>
    <div className="plan-card-top">
      <span className="date-chip">{formatDate(plan.study_date)} · Tiết {plan.period}</span>
      <span className="plan-card-actions">
        <StatusBadge value={regStatus}/>
        {editable&&<button type="button" className="icon-button danger" title="Xóa kế hoạch" onClick={remove}><Trash2 size={15}/></button>}
      </span>
    </div>
    <h3>{plan.subject}</h3><p>{plan.task}</p>
    <div className="plan-meta"><span>Ưu tiên: <StatusBadge value={plan.priority}/></span><DeviceBadge plan={plan}/></div>
    {reflection?.rating!=null&&<div className="plan-rating"><RatingStars value={reflection.rating} readOnly size={15}/>
      {reflection.auto_evaluated&&<small className="auto-tag">hệ thống tự đánh giá</small>}</div>}
    {progress?.progress&&progress.progress!=='Chưa tới buổi'&&status.progress!=='Đã hoàn thành'
      &&<div className="plan-progress"><StatusBadge value={progress.progress}/></div>}
    {needsAck&&<div className="ack-warning"><AlertTriangle size={14}/><span>Em cần viết phản hồi cho tiết này</span></div>}
    {reflection?.teacher_comment&&<div className="teacher-comment"><MessageSquareQuote size={14}/><span>{reflection.teacher_comment}</span></div>}
    <div className="plan-footer">
      <span>{reflection?<StatusBadge value={reflection.completion_status}/>:<span className="muted-text">Chưa cập nhật kết quả</span>}</span>
      <span>{evidence.length?`📎 ${evidence.length} minh chứng`:(editable?'Chỉnh sửa kế hoạch':'Cập nhật kết quả')} <ChevronDown size={15}/></span>
    </div>
  </article>
}

function EditPlanModal({plan,onClose,onSaved}){
  const [form,setForm]=useState({study_date:plan.study_date,period:String(plan.period),activity_type:plan.activity_type,subject:plan.subject,task:plan.task,priority:plan.priority,goal:plan.goal,use_device:plan.use_device,device_purpose:plan.device_purpose||'',fallback_activity:plan.fallback_activity||'Làm nhiệm vụ tiếp theo'})
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('')
  const update=(k,v)=>setForm({...form,[k]:v})
  const save=async()=>{
    setMsg('')
    if(form.use_device&&!form.device_purpose.trim())return setMsg('Hãy ghi rõ mục đích sử dụng thiết bị.')
    setBusy(true)
    const payload={...form,period:Number(form.period),device_purpose:form.use_device?form.device_purpose.trim():null}
    const {error}=await supabase.from('plans').update(payload).eq('id',plan.id)
    setBusy(false)
    if(error){if(error.code==='23505')return setMsg('Em đã có kế hoạch ở ngày và tiết này.');return setMsg('Không thể lưu điều chỉnh.')}
    onSaved()
  }
  const remove=async()=>{
    if(!window.confirm('Xóa hẳn kế hoạch này?'))return
    setBusy(true)
    const {error}=await supabase.from('plans').delete().eq('id',plan.id)
    setBusy(false)
    if(error)return setMsg('Không thể xóa kế hoạch này.')
    onSaved()
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">CHỈNH SỬA KẾ HOẠCH</span><h2>{plan.subject}</h2></div><button className="icon-button" onClick={onClose}>✕</button></div>
    <div className="form-grid two"><div><label>Ngày tự học</label><input type="date" min={todayISO()} value={form.study_date} onChange={e=>update('study_date',e.target.value)}/></div><div><label>Tiết</label><select value={form.period} onChange={e=>update('period',e.target.value)}>{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={n}>Tiết {n}</option>)}</select></div></div>
    <div className="form-grid two"><div><label>Loại hoạt động</label><select value={form.activity_type} onChange={e=>update('activity_type',e.target.value)}>{activityOptions.map(x=><option key={x}>{x}</option>)}</select></div><div><label>Môn / nội dung</label><select value={form.subject} onChange={e=>update('subject',e.target.value)}>{subjectOptions.map(x=><option key={x}>{x}</option>)}</select></div></div>
    <label>Nhiệm vụ cụ thể</label><textarea rows="3" maxLength={1000} value={form.task} onChange={e=>update('task',e.target.value)}/>
    <label>Mục tiêu cuối tiết</label><textarea rows="2" maxLength={1000} value={form.goal} onChange={e=>update('goal',e.target.value)}/>
    <label>Mức ưu tiên</label><select value={form.priority} onChange={e=>update('priority',e.target.value)}>{priorityOptions.map(x=><option key={x}>{x}</option>)}</select>
    <div className="toggle-row"><label className="switch"><input type="checkbox" checked={form.use_device} onChange={e=>update('use_device',e.target.checked)}/><span/></label><div><strong>Sử dụng thiết bị điện tử</strong><small>Bật/tắt sẽ đưa đăng ký về trạng thái chờ giáo viên duyệt lại.</small></div></div>
    {form.use_device&&<input maxLength={500} value={form.device_purpose} onChange={e=>update('device_purpose',e.target.value)} placeholder="Mục đích sử dụng"/>}
    <label>Nếu hoàn thành sớm</label><select value={form.fallback_activity} onChange={e=>update('fallback_activity',e.target.value)}>{fallbackOptions.map(x=><option key={x}>{x}</option>)}</select>
    {msg&&<div className="form-error">{msg}</div>}
    <div className="form-actions spread">
      <button className="button danger ghost" onClick={remove} disabled={busy}><Trash2 size={16}/> Xóa kế hoạch</button>
      <span><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary" onClick={save} disabled={busy}>{busy?'Đang lưu…':'Lưu điều chỉnh'}</button></span>
    </div>
  </div></div>
}

function ReflectionModal({plan,existing,evidence,onClose,onSaved}){
  const [form,setForm]=useState({completion_status:existing?.completion_status||'Hoàn thành',note:existing?.note||'',need_help:existing?.need_help||false,help_note:existing?.help_note||''})
  const [ack,setAck]=useState(existing?.student_ack_note||'')
  const [ackBusy,setAckBusy]=useState(false)
  const [ackMsg,setAckMsg]=useState('')
  const [link,setLink]=useState('');const [file,setFile]=useState(null);const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('')
  const lowRating=existing?.rating!=null&&existing.rating<=2

  const saveAck=async()=>{
    setAckMsg('')
    if(!ack.trim())return setAckMsg('Hãy viết một dòng cho biết em sẽ điều chỉnh thế nào.')
    setAckBusy(true)
    const {error}=await supabase.from('reflections').update({student_ack_note:ack.trim()}).eq('plan_id',plan.id)
    setAckBusy(false)
    if(error)return setAckMsg('Không lưu được phản hồi.')
    setAckMsg('✓ Đã gửi phản hồi cho giáo viên.')
    onSaved()
  }

  const save=async()=>{
    setBusy(true);setMsg('')
    const additions=(link.trim()?1:0)+(file?1:0)+(note.trim()?1:0)
    if(evidence.length+additions>3){setBusy(false);return setMsg('Tối đa 3 minh chứng cho mỗi tiết.')}
    if(note.trim()&&note.trim().length<10){setBusy(false);return setMsg('Phần mô tả kết quả cần ít nhất 10 ký tự để thầy cô hiểu em đã làm gì.')}
    if(form.need_help&&!form.help_note.trim()){setBusy(false);return setMsg('Hãy ghi ngắn gọn điều em cần hỗ trợ.')}
    if(link.trim()){try{new URL(link.trim())}catch{setBusy(false);return setMsg('Liên kết minh chứng chưa hợp lệ.')}}
    if(file){
      if(file.size>5*1024*1024){setBusy(false);return setMsg('File vượt quá 5 MB.')}
      if(!['image/jpeg','image/png','application/pdf'].includes(file.type)){setBusy(false);return setMsg('Chỉ nhận JPG, PNG hoặc PDF.')}
    }
    // Không gửi các cột của giáo viên; trigger phía CSDL cũng chặn sẵn.
    const payload={plan_id:plan.id,student_id:plan.student_id,...form,help_note:form.need_help?form.help_note.trim():null,completed_at:new Date().toISOString()}
    const {error}=await supabase.from('reflections').upsert(payload,{onConflict:'plan_id'})
    if(error){setBusy(false);return setMsg('Không thể lưu kết quả.')}
    if(link.trim()){
      const {error:e}=await supabase.from('evidence').insert({plan_id:plan.id,student_id:plan.student_id,kind:'link',external_url:link.trim(),display_name:'Liên kết sản phẩm'})
      if(e){setBusy(false);return setMsg('Đã lưu kết quả nhưng chưa thêm được liên kết.')}
    }
    if(file){
      const safeExt=file.type==='application/pdf'?'pdf':file.type==='image/png'?'png':'jpg'
      const path=`${plan.student_id}/${plan.id}/${crypto.randomUUID()}.${safeExt}`
      const {error:upErr}=await supabase.storage.from('evidence').upload(path,file,{upsert:false,contentType:file.type})
      if(upErr){setBusy(false);return setMsg('Đã lưu kết quả nhưng upload file chưa thành công.')}
      const {error:e}=await supabase.from('evidence').insert({plan_id:plan.id,student_id:plan.student_id,kind:file.type.startsWith('image/')?'image':'file',storage_path:path,display_name:file.name})
      if(e){await supabase.storage.from('evidence').remove([path]);setBusy(false);return setMsg('Không thể ghi nhận file minh chứng.')}
    }
    if(note.trim()){
      const {error:e}=await supabase.from('evidence').insert({plan_id:plan.id,student_id:plan.student_id,kind:'text',
        body_text:note.trim().slice(0,2000),display_name:'Mô tả kết quả'})
      if(e){setBusy(false);return setMsg('Đã lưu kết quả nhưng chưa thêm được phần mô tả.')}
    }
    setBusy(false);onSaved()
  }
  const openEvidence=async(item)=>{
    if(item.kind==='text')return window.alert(item.body_text||'')
    if(item.kind==='link')return window.open(item.external_url,'_blank','noopener,noreferrer')
    const {data}=await supabase.storage.from('evidence').createSignedUrl(item.storage_path,120)
    if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  const removeEvidence=async(item)=>{
    if(!window.confirm('Xóa minh chứng này?'))return
    if(item.storage_path)await supabase.storage.from('evidence').remove([item.storage_path])
    await supabase.from('evidence').delete().eq('id',item.id)
    onSaved()
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">{formatDate(plan.study_date)} · TIẾT {plan.period}</span><h2>{plan.subject}</h2></div><button className="icon-button" onClick={onClose}>✕</button></div>
    <div className="detail-box"><strong>Nhiệm vụ</strong><p>{plan.task}</p><strong>Mục tiêu</strong><p>{plan.goal}</p></div>
    {plan.use_device&&<div className="detail-box"><strong>Đăng ký thiết bị điện tử</strong><p><StatusBadge value={plan.device_status}/> {plan.device_review_note?`— ${plan.device_review_note}`:''}</p></div>}

    {existing?.auto_evaluated&&<div className="detail-box alarm-amber">
      <strong>Hệ thống đã tự đánh giá tiết này</strong>
      <p className="muted-text small">Kế hoạch quá hạn cập nhật kết quả nên hệ thống ghi nhận 1 sao. Em vẫn cập nhật bổ sung được — thầy cô sẽ xem lại và chấm lại.</p>
    </div>}
    {existing?.rating!=null&&<div className={`detail-box rating-box ${ratingTone(existing.rating)}`}>
      <strong>{existing.auto_evaluated?'Đánh giá hiện tại':'Giáo viên đánh giá'}</strong>
      <p><RatingStars value={existing.rating} readOnly/> — {ratingLabel(existing.rating)}</p>
    </div>}
    {existing?.teacher_comment&&<div className="detail-box highlight"><strong>Nhận xét của giáo viên</strong><p>{existing.teacher_comment}</p></div>}

    {lowRating&&<div className={`detail-box ${existing.student_ack_at?'':'alarm-red'}`}>
      <strong>{existing.student_ack_at?'Phản hồi của em':'Em cần phản hồi trước khi tiếp tục'}</strong>
      <p className="muted-text small">Tiết này được đánh giá {existing.rating}/5. Hãy ghi ngắn gọn em sẽ điều chỉnh thế nào ở tiết sau.</p>
      <textarea rows="2" maxLength={500} value={ack} onChange={e=>setAck(e.target.value)}
                placeholder="Ví dụ: Em sẽ chuẩn bị đề cương trước và không dùng điện thoại trong giờ."/>
      {ackMsg&&<div className={ackMsg.startsWith('✓')?'notice compact':'form-error'}>{ackMsg}</div>}
      <button type="button" className="button primary" onClick={saveAck} disabled={ackBusy}>
        {ackBusy?'Đang gửi…':existing.student_ack_at?'Cập nhật phản hồi':'Gửi phản hồi'}
      </button>
      {existing.student_ack_at&&<small className="muted-text">Đã gửi lúc {new Date(existing.student_ack_at).toLocaleString('vi-VN')}</small>}
    </div>}
    <label>Kết quả *</label><select value={form.completion_status} onChange={e=>setForm({...form,completion_status:e.target.value})}><option>Hoàn thành</option><option>Một phần</option><option>Chưa hoàn thành</option></select>
    <label>Ghi chú sau giờ tự học</label><textarea rows="2" maxLength={1000} value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Điều em muốn ghi lại…"/>
    <div className="toggle-row"><label className="switch"><input type="checkbox" checked={form.need_help} onChange={e=>setForm({...form,need_help:e.target.checked})}/><span/></label><div><strong>Em cần giáo viên hỗ trợ</strong><small>Bật khi em còn vướng và muốn giáo viên biết.</small></div></div>
    {form.need_help&&<input maxLength={500} value={form.help_note} onChange={e=>setForm({...form,help_note:e.target.value})} placeholder="Em cần hỗ trợ về…"/>}
    <div className="evidence-block"><h3>Minh chứng <span className="muted-text">(tùy chọn, tối đa 3)</span></h3>
      <p className="muted-text small">Em nộp theo cách nào cũng được: <strong>liên kết</strong>, <strong>ảnh/file</strong>, hoặc chỉ cần <strong>mô tả bằng chữ</strong> nếu sản phẩm nằm trong vở.</p>
      {evidence.length>0&&<div className="evidence-list">{evidence.map(x=><span key={x.id} className="evidence-row">
        <button type="button" className="evidence-item" onClick={()=>openEvidence(x)}>
          {x.kind==='link'?'🔗':x.kind==='text'?'📝':'📎'} {x.kind==='text'?(x.body_text||'').slice(0,60)+((x.body_text||'').length>60?'…':''):(x.display_name||'Minh chứng')}
          {x.kind!=='text'&&<ExternalLink size={14}/>}
        </button>
        <button type="button" className="evidence-item" title="Xóa minh chứng" onClick={()=>removeEvidence(x)}>✕</button>
      </span>)}</div>}
      {evidence.length<3&&<>
        <label>Mô tả kết quả bằng chữ</label>
        <textarea rows="2" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}
                  placeholder="Ví dụ: Em đã làm xong bài 5–10 trang 24 trong vở Toán, có tự dò lại đáp án."/>
        <label>Upload ảnh/PDF (≤ 5 MB)</label>
        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/>
        <label>Liên kết sản phẩm</label>
        <input type="url" value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…"/>
      </>}
    </div>
    {msg&&<div className="form-error">{msg}</div>}
    <div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary big" onClick={save} disabled={busy}><FileUp size={19}/>{busy?'Đang lưu…':'Lưu kết quả'}</button></div>
  </div></div>
}

function ChangePasswordModal({mshs,onClose}){
  const [current,setCurrent]=useState('');const [pw,setPw]=useState('');const [confirm,setConfirm]=useState('');const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('')
  const checks=passwordChecks(pw,mshs)
  const save=async()=>{
    setMsg('')
    if(!current)return setMsg('Hãy nhập mật khẩu hiện tại.')
    if(!validateStudentPassword(pw,mshs).ok)return setMsg('Mật khẩu mới chưa đáp ứng đầy đủ yêu cầu.')
    if(pw!==confirm)return setMsg('Hai lần nhập mật khẩu chưa khớp.')
    setBusy(true)
    // Edge Function kiểm lại luật phía server — không thể bỏ qua bằng DevTools.
    const {ok,data}=await callFunction('student-change-password',{currentPassword:current,newPassword:pw})
    setBusy(false)
    if(!ok)return setMsg(data?.error||'Không thể đổi mật khẩu. Hãy thử lại.')
    setCurrent('');setPw('');setConfirm('');setMsg('✓ Đã đổi mật khẩu thành công.')
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">BẢO MẬT TÀI KHOẢN</span><h2>Đổi mật khẩu</h2></div><button className="icon-button" onClick={onClose}>✕</button></div>
    <label>Mật khẩu hiện tại</label><input type="password" value={current} onChange={e=>setCurrent(e.target.value)} autoComplete="current-password"/>
    <label>Mật khẩu mới</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="new-password"/>
    <div className="password-rules visible">{checks.map(i=><div key={i.key} className={i.ok?'rule-ok':'rule-pending'}>{i.ok?'✓':'○'} <span>{i.label}</span></div>)}</div>
    <label>Nhập lại mật khẩu mới</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
    {msg&&<div className={msg.startsWith('✓')?'notice':'form-error'}>{msg}</div>}
    <div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary" onClick={save} disabled={busy}>{busy?'Đang đổi…':'Đổi mật khẩu'}</button></div>
  </div></div>
}

function EmptyState({text}){return <div className="empty-state"><Plus size={22}/><p>{text}</p></div>}
