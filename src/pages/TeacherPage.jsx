import { useEffect, useMemo, useState } from 'react'
import { Check, Download, ExternalLink, KeyRound, MessageSquareQuote, RefreshCw, Search, UsersRound, X } from 'lucide-react'
import { supabase, callFunction } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import { passwordChecks, validateStudentPassword } from '../utils/password'
import StatusBadge from '../components/StatusBadge'

export default function TeacherPage(){
  const {context}=useAuth()
  const [students,setStudents]=useState([])
  const [roster,setRoster]=useState([])
  const [plans,setPlans]=useState([])
  const [reflections,setReflections]=useState({})
  const [evidence,setEvidence]=useState({})
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState('plans')
  const [filters,setFilters]=useState({from:'',to:'',student:'',subject:'',completion:'',search:''})
  const [resetTarget,setResetTarget]=useState(null)
  const [commentTarget,setCommentTarget]=useState(null)

  const load=async()=>{
    setLoading(true)
    const [{data:s},{data:enr},{data:p}]=await Promise.all([
      supabase.from('profiles').select('id,mshs,full_name,created_at').eq('role','student').order('full_name'),
      supabase.from('enrollments').select('mshs,is_active,students!inner(mshs,full_name,claimed_user_id)').eq('is_active',true),
      supabase.from('plans').select('*').order('study_date',{ascending:false}).order('period')
    ])
    const studentList=s||[];const planList=p||[]
    setStudents(studentList)
    setRoster((enr||[]).map(e=>e.students).sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi')))
    setPlans(planList)
    if(planList.length){
      const ids=planList.map(x=>x.id)
      const [{data:r},{data:e}]=await Promise.all([
        supabase.from('reflections').select('*').in('plan_id',ids),
        supabase.from('evidence').select('*').in('plan_id',ids)
      ])
      setReflections(Object.fromEntries((r||[]).map(x=>[x.plan_id,x])))
      const grouped={};(e||[]).forEach(x=>(grouped[x.plan_id] ||= []).push(x));setEvidence(grouped)
    }else{setReflections({});setEvidence({})}
    setLoading(false)
  }
  useEffect(()=>{load()},[])

  const studentMap=useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students])
  const rows=useMemo(()=>plans.filter(p=>{
    const s=studentMap[p.student_id];const r=reflections[p.id]
    if(filters.from&&p.study_date<filters.from)return false
    if(filters.to&&p.study_date>filters.to)return false
    if(filters.student&&p.student_id!==filters.student)return false
    if(filters.subject&&p.subject!==filters.subject)return false
    if(filters.completion&&(r?.completion_status||'Chưa cập nhật')!==filters.completion)return false
    const q=filters.search.trim().toLowerCase()
    if(q&&!`${s?.full_name||''} ${s?.mshs||''} ${p.task} ${p.subject}`.toLowerCase().includes(q))return false
    return true
  }),[plans,filters,studentMap,reflections])

  const stats=useMemo(()=>{
    const total=rows.length
    return{
      total,
      ontime:rows.filter(p=>registrationStatus(p.study_date,p.created_at)==='Đúng hạn').length,
      done:rows.filter(p=>reflections[p.id]?.completion_status==='Hoàn thành').length,
      help:rows.filter(p=>reflections[p.id]?.need_help&&!reflections[p.id]?.help_resolved).length,
      devices:rows.filter(p=>p.use_device).length,
      pendingDevices:rows.filter(p=>p.use_device&&p.device_status==='Chờ duyệt').length,
    }
  },[rows,reflections])

  // Tổng hợp theo học sinh — mỗi em một dòng.
  const perStudent=useMemo(()=>{
    const map=new Map()
    for(const s of roster){
      map.set(s.claimed_user_id||`chua-${s.mshs}`,{mshs:s.mshs,name:s.full_name,hasAccount:!!s.claimed_user_id,total:0,ontime:0,done:0,pending:0,help:0})
    }
    for(const p of rows){
      const key=p.student_id
      if(!map.has(key))continue
      const row=map.get(key);const r=reflections[p.id]
      row.total++
      if(registrationStatus(p.study_date,p.created_at)==='Đúng hạn')row.ontime++
      if(r?.completion_status==='Hoàn thành')row.done++
      if(!r&&p.study_date<todayISO())row.pending++
      if(r?.need_help&&!r?.help_resolved)row.help++
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'))
  },[roster,rows,reflections])

  const subjects=[...new Set(plans.map(p=>p.subject))].sort()
  const rosterTotal=roster.length
  const claimed=roster.filter(x=>x.claimed_user_id).length
  const unclaimed=roster.filter(x=>!x.claimed_user_id)
  const topSubjects=useMemo(()=>{
    const counts={};rows.forEach(p=>{counts[p.subject]=(counts[p.subject]||0)+1})
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3)
  },[rows])

  const openEvidence=async(item)=>{
    if(item.kind==='link')return window.open(item.external_url,'_blank','noopener,noreferrer')
    const {data}=await supabase.storage.from('evidence').createSignedUrl(item.storage_path,180)
    if(data?.signedUrl)window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }

  const reviewDevice=async(plan,status)=>{
    const note=status==='Từ chối'?(window.prompt('Lý do từ chối (tùy chọn):')||null):null
    const {error}=await supabase.from('plans').update({device_status:status,device_review_note:note}).eq('id',plan.id)
    if(error)window.alert('Không thể cập nhật trạng thái duyệt.')
    load()
  }

  const exportCsv=()=>{
    const lines=[['MSHS','Họ tên','Ngày','Tiết','Môn','Nhiệm vụ','Mục tiêu','Ưu tiên','Thiết bị','Mục đích thiết bị','Duyệt thiết bị','Đăng ký','Kết quả','Cần hỗ trợ','Ghi chú hỗ trợ','Nhận xét GV'].join(',')]
    rows.forEach(p=>{
      const s=studentMap[p.student_id]||{};const r=reflections[p.id]||{}
      const vals=[s.mshs,s.full_name,p.study_date,p.period,p.subject,p.task,p.goal,p.priority,
        p.use_device?'Có':'Không',p.device_purpose||'',p.use_device?p.device_status:'',
        registrationStatus(p.study_date,p.created_at),r.completion_status||'',
        r.need_help?'Có':'Không',r.help_note||'',r.teacher_comment||'']
        .map(v=>`"${String(v??'').replaceAll('"','""')}"`)
      lines.push(vals.join(','))
    })
    downloadCsv(lines,`self-study-${context.className||'lop'}-${todayISO()}.csv`)
  }

  const exportSummaryCsv=()=>{
    const lines=[['MSHS','Họ tên','Có tài khoản','Số kế hoạch','Đúng hạn','Hoàn thành','Chưa cập nhật','Cần hỗ trợ'].join(',')]
    perStudent.forEach(r=>{
      lines.push([r.mshs,r.name,r.hasAccount?'Có':'Chưa',r.total,r.ontime,r.done,r.pending,r.help]
        .map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))
    })
    downloadCsv(lines,`self-study-tong-hop-${context.className||'lop'}-${todayISO()}.csv`)
  }

  return <div className="page teacher-page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow">TEACHER DASHBOARD</span>
        <h1>Quản lý giờ tự học {context.className||''}</h1>
        <p>Theo dõi kế hoạch, kết quả và nhu cầu hỗ trợ của {rosterTotal} học sinh{context.yearName?` · năm học ${context.yearName}`:''}.</p>
      </div>
      <div className="button-row">
        <button className="button ghost" onClick={load}><RefreshCw size={17}/> Làm mới</button>
        <button className="button primary" onClick={view==='plans'?exportCsv:exportSummaryCsv}><Download size={17}/> Xuất CSV</button>
      </div>
    </section>

    <section className="stats-grid">
      <Stat label="Tài khoản HS" value={`${claimed}/${rosterTotal}`}/>
      <Stat label="Lượt đăng ký" value={stats.total}/>
      <Stat label="Đúng hạn" value={stats.total?`${Math.round(stats.ontime/stats.total*100)}%`:'0%'}/>
      <Stat label="Hoàn thành" value={stats.total?`${Math.round(stats.done/stats.total*100)}%`:'0%'}/>
      <Stat label="Thiết bị chờ duyệt" value={stats.pendingDevices} alert={stats.pendingDevices>0}/>
      <Stat label="Cần hỗ trợ" value={stats.help} alert={stats.help>0}/>
    </section>

    <section className="teacher-meta-grid">
      <article className="card roster-card">
        <div className="roster-head"><div><span className="eyebrow">TÀI KHOẢN HỌC SINH</span><h3>{claimed} / {rosterTotal} đã đăng ký</h3></div><UsersRound size={24}/></div>
        <div className="roster-progress"><span style={{width:`${rosterTotal?Math.round(claimed/rosterTotal*100):0}%`}}/></div>
        <div className="roster-unclaimed">{unclaimed.length?<>Chưa đăng ký: <strong>{unclaimed.map(x=>x.full_name).join(' · ')}</strong></>:'✓ Tất cả học sinh đã tạo tài khoản.'}</div>
      </article>
      <article className="card insight-card">
        <span className="eyebrow">TỔNG QUAN BỘ LỌC</span>
        <div className="insight-list">
          <div className="insight-row"><span>Tổng kế hoạch đang xem</span><strong>{rows.length}</strong></div>
          <div className="insight-row"><span>Môn được đăng ký nhiều</span><strong>{topSubjects[0]?.[0]||'—'}</strong></div>
          <div className="insight-row"><span>Chưa cập nhật kết quả</span><strong>{rows.filter(p=>!reflections[p.id]).length}</strong></div>
        </div>
      </article>
    </section>

    <section className="card filters">
      <div className="search-box"><Search size={17}/><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Tìm tên, MSHS, môn, nhiệm vụ…"/></div>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} title="Từ ngày"/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} title="Đến ngày"/>
      <select value={filters.student} onChange={e=>setFilters({...filters,student:e.target.value})}><option value="">Tất cả học sinh</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
      <select value={filters.subject} onChange={e=>setFilters({...filters,subject:e.target.value})}><option value="">Tất cả môn</option>{subjects.map(x=><option key={x}>{x}</option>)}</select>
      <select value={filters.completion} onChange={e=>setFilters({...filters,completion:e.target.value})}><option value="">Tất cả kết quả</option><option>Hoàn thành</option><option>Một phần</option><option>Chưa hoàn thành</option><option>Chưa cập nhật</option></select>
    </section>

    <div className="segmented view-switch">
      <button type="button" className={view==='plans'?'active':''} onClick={()=>setView('plans')}>Theo kế hoạch</button>
      <button type="button" className={view==='students'?'active':''} onClick={()=>setView('students')}>Theo học sinh</button>
    </div>

    <section className="card table-card">
      {loading?<div className="empty-state">Đang tải dữ liệu…</div>
      :view==='students'
      ?<div className="table-wrap"><table>
        <thead><tr><th>Học sinh</th><th>Tài khoản</th><th>Kế hoạch</th><th>Đúng hạn</th><th>Hoàn thành</th><th>Chưa cập nhật</th><th>Cần hỗ trợ</th></tr></thead>
        <tbody>{perStudent.map(r=><tr key={r.mshs}>
          <td><strong>{r.name}</strong><small>{r.mshs}</small></td>
          <td>{r.hasAccount?<StatusBadge value="Đúng hạn" label="Đã có"/>:<StatusBadge value="Trễ" label="Chưa tạo"/>}</td>
          <td>{r.total}</td>
          <td>{r.total?`${Math.round(r.ontime/r.total*100)}%`:'—'}</td>
          <td>{r.total?`${Math.round(r.done/r.total*100)}%`:'—'}</td>
          <td>{r.pending>0?<strong className="help-flag">{r.pending}</strong>:'—'}</td>
          <td>{r.help>0?<strong className="help-flag">{r.help}</strong>:'—'}</td>
        </tr>)}</tbody>
      </table>{perStudent.length===0&&<div className="empty-state">Chưa có học sinh nào trong lớp.</div>}</div>
      :<div className="table-wrap"><table>
        <thead><tr><th>Học sinh</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Đăng ký</th><th>Kết quả</th><th>Thiết bị</th><th>Minh chứng</th><th>Thao tác</th></tr></thead>
        <tbody>{rows.map(p=>{
          const s=studentMap[p.student_id]||{};const r=reflections[p.id];const ev=evidence[p.id]||[]
          return <tr key={p.id}>
            <td><strong>{s.full_name}</strong><small>{s.mshs}</small></td>
            <td>{formatDate(p.study_date)}<small>Tiết {p.period}</small></td>
            <td><strong>{p.subject}</strong><small title={p.task}>{p.task}</small></td>
            <td><StatusBadge value={registrationStatus(p.study_date,p.created_at)}/></td>
            <td>{r?<>
                <StatusBadge value={r.completion_status}/>
                {r.need_help&&!r.help_resolved&&<small className="help-flag">⚠ Cần hỗ trợ: {r.help_note||''}</small>}
                {r.teacher_comment&&<small className="teacher-comment-mini">💬 {r.teacher_comment}</small>}
              </>:<span className="muted-text">Chưa cập nhật</span>}</td>
            <td>{p.use_device?<div className="device-cell">
                <span title={p.device_purpose}>💻</span> <StatusBadge value={p.device_status}/>
                {p.device_status==='Chờ duyệt'&&<span className="device-actions">
                  <button className="icon-button success" title="Duyệt" onClick={()=>reviewDevice(p,'Đã duyệt')}><Check size={15}/></button>
                  <button className="icon-button danger" title="Từ chối" onClick={()=>reviewDevice(p,'Từ chối')}><X size={15}/></button>
                </span>}
              </div>:'—'}</td>
            <td>{ev.length?ev.map(x=><button key={x.id} className="mini-link" onClick={()=>openEvidence(x)}>{x.kind==='link'?'🔗':'📎'}<ExternalLink size={12}/></button>):'—'}</td>
            <td><span className="row-actions">
              <button className="icon-button" title={r?'Nhận xét phản tư':'Học sinh chưa cập nhật kết quả'} disabled={!r} onClick={()=>setCommentTarget({plan:p,reflection:r,student:s})}><MessageSquareQuote size={16}/></button>
              <button className="icon-button" title="Đặt lại mật khẩu" onClick={()=>setResetTarget(s)}><KeyRound size={16}/></button>
            </span></td>
          </tr>})}</tbody>
      </table>{rows.length===0&&<div className="empty-state">Không có dữ liệu phù hợp bộ lọc.</div>}</div>}
    </section>

    {resetTarget&&<ResetPasswordModal student={resetTarget} onClose={()=>setResetTarget(null)}/>}
    {commentTarget&&<CommentModal {...commentTarget} onClose={()=>setCommentTarget(null)} onSaved={()=>{setCommentTarget(null);load()}}/>}
  </div>
}

function downloadCsv(lines,filename){
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href)
}

function Stat({label,value,alert}){return <div className={`stat-card ${alert?'alert':''}`}><span>{label}</span><strong>{value}</strong></div>}

function CommentModal({plan,reflection,student,onClose,onSaved}){
  const [text,setText]=useState(reflection?.teacher_comment||'')
  const [resolved,setResolved]=useState(reflection?.help_resolved||false)
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('')
  const save=async()=>{
    setBusy(true);setMsg('')
    // Trigger phía CSDL bảo đảm giáo viên chỉ ghi được đúng hai cột này.
    const {error}=await supabase.from('reflections')
      .update({teacher_comment:text.trim()||null,help_resolved:resolved})
      .eq('plan_id',plan.id)
    setBusy(false)
    if(error)return setMsg('Không thể lưu nhận xét.')
    onSaved()
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">NHẬN XÉT PHẢN TƯ</span><h2>{student.full_name}</h2><p>{formatDate(plan.study_date)} · Tiết {plan.period} · {plan.subject}</p></div><button className="icon-button" onClick={onClose}>✕</button></div>
    <div className="detail-box"><strong>Nhiệm vụ</strong><p>{plan.task}</p><strong>Kết quả học sinh tự đánh giá</strong><p><StatusBadge value={reflection.completion_status}/></p>{reflection.note&&<><strong>Ghi chú của em</strong><p>{reflection.note}</p></>}</div>
    {reflection.need_help&&<div className="detail-box highlight"><strong>Em cần hỗ trợ</strong><p>{reflection.help_note}</p></div>}
    <label>Nhận xét của giáo viên</label>
    <textarea rows="4" maxLength={1000} value={text} onChange={e=>setText(e.target.value)} placeholder="Phản hồi ngắn gọn để em biết cần điều chỉnh gì…"/>
    {reflection.need_help&&<div className="toggle-row"><label className="switch"><input type="checkbox" checked={resolved} onChange={e=>setResolved(e.target.checked)}/><span/></label><div><strong>Đã xử lý yêu cầu hỗ trợ</strong><small>Tắt cảnh báo “cần hỗ trợ” cho tiết này.</small></div></div>}
    {msg&&<div className="form-error">{msg}</div>}
    <div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary" onClick={save} disabled={busy}>{busy?'Đang lưu…':'Lưu nhận xét'}</button></div>
  </div></div>
}

function ResetPasswordModal({student,onClose}){
  const [pw,setPw]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false)
  const checks=passwordChecks(pw,student.mshs)
  const reset=async()=>{
    setMsg('')
    if(!validateStudentPassword(pw,student.mshs).ok)return setMsg('Mật khẩu tạm chưa đáp ứng đầy đủ rule của học sinh.')
    setBusy(true)
    const {ok,data}=await callFunction('teacher-reset-password',{studentId:student.id,newPassword:pw})
    setBusy(false)
    if(!ok)return setMsg(data?.error||'Không thể đặt lại mật khẩu.')
    setMsg('✓ Đã đặt lại. Gửi mật khẩu tạm trực tiếp cho học sinh — lần đăng nhập tới em sẽ phải tự đặt mật khẩu riêng.')
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head"><div><span className="eyebrow">ĐẶT LẠI MẬT KHẨU</span><h2>{student.full_name}</h2><p>MSHS: {student.mshs}</p></div><button className="icon-button" onClick={onClose}>✕</button></div>
    <label>Mật khẩu tạm mới</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Tối thiểu 10 ký tự"/>
    <div className="password-rules visible">{checks.map(i=><div key={i.key} className={i.ok?'rule-ok':'rule-pending'}>{i.ok?'✓':'○'} <span>{i.label}</span></div>)}</div>
    {msg&&<div className={msg.startsWith('✓')?'notice':'form-error'}>{msg}</div>}
    <div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary" onClick={reset} disabled={busy}>{busy?'Đang đặt lại…':'Đặt lại mật khẩu'}</button></div>
  </div></div>
}
