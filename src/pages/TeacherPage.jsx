import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ClipboardCopy, Download, ExternalLink, KeyRound, LifeBuoy, MessageSquare, MessageSquareQuote, RefreshCw, Search, Shuffle, UsersRound, X } from 'lucide-react'
import { supabase, callFunction } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import { generateTempPassword, passwordChecks, validateStudentPassword } from '../utils/password'
import StatusBadge from '../components/StatusBadge'
import RatingStars, { ratingTone, ratingLabel } from '../components/RatingStars'
import ChatPanel, { getOrCreateConversation } from '../components/ChatPanel'

const tomorrowISO = () => {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

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
  const [selected,setSelected]=useState(new Set())
  const [resetTargets,setResetTargets]=useState(null)
  const [taskTarget,setTaskTarget]=useState(null)
  const [studentDetail,setStudentDetail]=useState(null)
  const [chatWith,setChatWith]=useState(null)
  const [assistants,setAssistants]=useState([])

  const load=async()=>{
    setLoading(true)
    const [{data:s},{data:enr},{data:p},{data:ta}]=await Promise.all([
      supabase.from('profiles').select('id,mshs,full_name,created_at,must_change_password').eq('role','student').order('full_name'),
      supabase.from('enrollments').select('mshs,is_active,students!inner(mshs,full_name,claimed_user_id)').eq('is_active',true),
      supabase.from('plans').select('*').order('study_date',{ascending:false}).order('period'),
      supabase.from('class_assistants').select('*')
    ])
    const studentList=s||[];const planList=p||[]
    setStudents(studentList)
    setRoster((enr||[]).map(e=>e.students).sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi')))
    setPlans(planList)
    setAssistants(ta||[])
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
      pendingDevices:rows.filter(p=>p.use_device&&p.device_status==='Chờ duyệt').length,
      lowRated:rows.filter(p=>(reflections[p.id]?.rating??5)<=2).length,
      unrated:rows.filter(p=>reflections[p.id]&&reflections[p.id].rating==null).length,
    }
  },[rows,reflections])

  // Một dòng cho MỖI học sinh trong lớp — kể cả em chưa lập kế hoạch nào,
  // để giáo viên luôn đặt lại được mật khẩu.
  const perStudent=useMemo(()=>{
    const tmr=tomorrowISO()
    const map=new Map()
    for(const s of roster){
      map.set(s.mshs,{
        mshs:s.mshs, name:s.full_name,
        id:s.claimed_user_id, hasAccount:!!s.claimed_user_id,
        mustChange:!!studentMap[s.claimed_user_id]?.must_change_password,
        isTa:assistants.some(a=>a.student_id===s.claimed_user_id),
        total:0,ontime:0,done:0,pending:0,help:0,low:0,ratingSum:0,ratingCount:0,avg:null,plannedTomorrow:false,
      })
    }
    const byUser=new Map([...map.values()].filter(r=>r.id).map(r=>[r.id,r]))
    for(const p of plans){
      const row=byUser.get(p.student_id)
      if(!row)continue
      const r=reflections[p.id]
      row.total++
      if(registrationStatus(p.study_date,p.created_at)==='Đúng hạn')row.ontime++
      if(r?.completion_status==='Hoàn thành')row.done++
      if(!r&&p.study_date<todayISO())row.pending++
      if(r?.need_help&&!r?.help_resolved)row.help++
      if(p.study_date===tmr)row.plannedTomorrow=true
      if(r?.rating!=null){row.ratingSum+=r.rating;row.ratingCount++;if(r.rating<=2)row.low++}
    }
    for(const r of map.values())r.avg=r.ratingCount?r.ratingSum/r.ratingCount:null
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi'))
  },[roster,plans,reflections,studentMap,assistants])

  const openChat=async(studentId,name)=>{
    const id=await getOrCreateConversation(context.classId,studentId)
    setChatWith({id,name})
  }

  const subjects=[...new Set(plans.map(p=>p.subject))].sort()
  const rosterTotal=roster.length
  const claimed=roster.filter(x=>x.claimed_user_id).length
  const unclaimed=roster.filter(x=>!x.claimed_user_id)
  // Thay cho email nhắc: đưa thẳng lên dashboard.
  const noPlanTomorrow=perStudent.filter(r=>r.hasAccount&&!r.plannedTomorrow)
  const withPending=perStudent.filter(r=>r.pending>0)
  const mustChangeList=perStudent.filter(r=>r.mustChange)

  const selectedRows=perStudent.filter(r=>selected.has(r.mshs)&&r.hasAccount)
  const toggle=(mshs)=>setSelected(prev=>{const n=new Set(prev);n.has(mshs)?n.delete(mshs):n.add(mshs);return n})
  const toggleAll=()=>setSelected(prev=>{
    const withAccount=perStudent.filter(r=>r.hasAccount).map(r=>r.mshs)
    return prev.size===withAccount.length?new Set():new Set(withAccount)
  })

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
      lines.push([s.mshs,s.full_name,p.study_date,p.period,p.subject,p.task,p.goal,p.priority,
        p.use_device?'Có':'Không',p.device_purpose||'',p.use_device?p.device_status:'',
        registrationStatus(p.study_date,p.created_at),r.completion_status||'',
        r.need_help?'Có':'Không',r.help_note||'',r.teacher_comment||'']
        .map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(','))
    })
    downloadCsv(lines,`self-study-${context.className||'lop'}-${todayISO()}.csv`)
  }

  const exportSummaryCsv=()=>{
    const lines=[['MSHS','Họ tên','Có tài khoản','Số kế hoạch','Đúng hạn','Hoàn thành','Chưa cập nhật','Cần hỗ trợ'].join(',')]
    perStudent.forEach(r=>lines.push([r.mshs,r.name,r.hasAccount?'Có':'Chưa',r.total,r.ontime,r.done,r.pending,r.help]
      .map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')))
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
      <Stat label="Chưa chấm sao" value={stats.unrated}/>
      <Stat label="Bị 1–2 sao" value={stats.lowRated} alert={stats.lowRated>0}/>
      <Stat label="Cần hỗ trợ" value={stats.help} alert={stats.help>0}/>
    </section>

    <section className="teacher-meta-grid">
      <article className="card roster-card">
        <div className="roster-head"><div><span className="eyebrow">TÀI KHOẢN HỌC SINH</span><h3>{claimed} / {rosterTotal} đã đăng ký</h3></div><UsersRound size={24}/></div>
        <div className="roster-progress"><span style={{width:`${rosterTotal?Math.round(claimed/rosterTotal*100):0}%`}}/></div>
        <div className="roster-unclaimed">{unclaimed.length?<>Chưa đăng ký: <strong>{unclaimed.map(x=>x.full_name).join(' · ')}</strong></>:'✓ Tất cả học sinh đã tạo tài khoản.'}</div>
        <button className="button ghost full" onClick={()=>setView('students')}><KeyRound size={16}/> Quản lý tài khoản &amp; đặt lại mật khẩu</button>
      </article>
      <article className="card insight-card">
        <span className="eyebrow"><AlertTriangle size={13}/> CẦN CHÚ Ý</span>
        <div className="insight-list">
          <div className="insight-row"><span>Chưa lập kế hoạch cho ngày mai</span><strong className={noPlanTomorrow.length?'help-flag':''}>{noPlanTomorrow.length}</strong></div>
          <div className="insight-row"><span>Có tiết chưa cập nhật kết quả</span><strong className={withPending.length?'help-flag':''}>{withPending.length}</strong></div>
          <div className="insight-row"><span>Đang chờ tự đặt lại mật khẩu</span><strong>{mustChangeList.length}</strong></div>
        </div>
        {noPlanTomorrow.length>0&&<p className="muted-text small">{noPlanTomorrow.slice(0,8).map(r=>r.name).join(' · ')}{noPlanTomorrow.length>8?` … +${noPlanTomorrow.length-8}`:''}</p>}
      </article>
    </section>

    <div className="segmented view-switch">
      <button type="button" className={view==='plans'?'active':''} onClick={()=>setView('plans')}>Theo kế hoạch</button>
      <button type="button" className={view==='students'?'active':''} onClick={()=>setView('students')}>Theo học sinh</button>
      <button type="button" className={view==='assistants'?'active':''} onClick={()=>setView('assistants')}>Trợ giảng</button>
    </div>

    {view==='assistants'&&<AssistantsPanel
      classId={context.classId} perStudent={perStudent} assistants={assistants} onChanged={load}/>}

    {view==='plans'&&<section className="card filters">
      <div className="search-box"><Search size={17}/><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Tìm tên, MSHS, môn, nhiệm vụ…"/></div>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} title="Từ ngày"/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} title="Đến ngày"/>
      <select value={filters.student} onChange={e=>setFilters({...filters,student:e.target.value})}><option value="">Tất cả học sinh</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
      <select value={filters.subject} onChange={e=>setFilters({...filters,subject:e.target.value})}><option value="">Tất cả môn</option>{subjects.map(x=><option key={x}>{x}</option>)}</select>
      <select value={filters.completion} onChange={e=>setFilters({...filters,completion:e.target.value})}><option value="">Tất cả kết quả</option><option>Hoàn thành</option><option>Một phần</option><option>Chưa hoàn thành</option><option>Chưa cập nhật</option></select>
    </section>}

    {view==='students'&&<section className="card bulk-bar">
      <div>
        <strong>{selectedRows.length}</strong> học sinh được chọn
        <small className="muted-text"> · chỉ chọn được em đã tạo tài khoản</small>
      </div>
      <button className="button primary" disabled={selectedRows.length===0} onClick={()=>setResetTargets(selectedRows)}>
        <KeyRound size={17}/> Đặt lại mật khẩu {selectedRows.length>0?`(${selectedRows.length})`:''}
      </button>
    </section>}

    {view!=='assistants'&&<section className="card table-card">
      {loading?<div className="empty-state">Đang tải dữ liệu…</div>
      :view==='students'
      ?<div className="table-wrap"><table>
        <thead><tr>
          <th className="pick"><input type="checkbox" title="Chọn tất cả" onChange={toggleAll}
            checked={selectedRows.length>0&&selectedRows.length===perStudent.filter(r=>r.hasAccount).length}/></th>
          <th>Học sinh</th><th>Tài khoản</th><th>Kế hoạch</th><th>Đúng hạn</th><th>Điểm TB</th>
          <th>Chưa cập nhật</th><th>Cần hỗ trợ</th><th>Thao tác</th>
        </tr></thead>
        <tbody>{perStudent.map(r=><tr key={r.mshs} className={selected.has(r.mshs)?'picked':''}>
          <td className="pick"><input type="checkbox" disabled={!r.hasAccount} checked={selected.has(r.mshs)} onChange={()=>toggle(r.mshs)}/></td>
          <td>
            {r.hasAccount
              ? <button className="link-button name-link" onClick={()=>setStudentDetail(r)}>{r.name}</button>
              : <strong>{r.name}</strong>}
            <small>{r.mshs}{r.isTa?' · TA':''}</small>
          </td>
          <td>{r.hasAccount
            ? (r.mustChange?<StatusBadge value="Chờ duyệt" label="Chờ HS đổi"/>:<StatusBadge value="Đúng hạn" label="Đã có"/>)
            : <StatusBadge value="Trễ" label="Chưa tạo"/>}</td>
          <td>{r.total}</td>
          <td>{r.total?`${Math.round(r.ontime/r.total*100)}%`:'—'}</td>
          <td>{r.avg!=null?<span className={ratingTone(Math.round(r.avg))}>{r.avg.toFixed(1)}{r.low>0?` (${r.low}⚠)`:''}</span>:'—'}</td>
          <td>{r.pending>0?<strong className="help-flag">{r.pending}</strong>:'—'}</td>
          <td>{r.help>0?<strong className="help-flag">{r.help}</strong>:'—'}</td>
          <td><span className="row-actions">
            <button className="icon-button" title="Nhắn tin" disabled={!r.hasAccount} onClick={()=>openChat(r.id,r.name)}><MessageSquare size={16}/></button>
            <button className="icon-button" title={r.hasAccount?'Đặt lại mật khẩu':'Em này chưa tạo tài khoản'}
                disabled={!r.hasAccount} onClick={()=>setResetTargets([r])}><KeyRound size={16}/></button>
          </span></td>
        </tr>)}</tbody>
      </table>{perStudent.length===0&&<div className="empty-state">Chưa có học sinh nào trong lớp.</div>}</div>
      :<div className="table-wrap"><table>
        <thead><tr><th>Học sinh</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Đăng ký</th><th>Kết quả</th><th>Thiết bị</th><th>Minh chứng</th><th>Thao tác</th></tr></thead>
        <tbody>{rows.map(p=>{
          const s=studentMap[p.student_id]||{};const r=reflections[p.id];const ev=evidence[p.id]||[]
          return <tr key={p.id} className={ratingTone(r?.rating)}>
            <td><strong>{s.full_name}</strong><small>{s.mshs}</small></td>
            <td>{formatDate(p.study_date)}<small>Tiết {p.period}</small></td>
            <td><button className="link-button task-link" onClick={()=>setTaskTarget({plan:p,student:s})}>{p.subject}</button><small title={p.task}>{p.task}</small></td>
            <td><StatusBadge value={registrationStatus(p.study_date,p.created_at)}/></td>
            <td>{r?<>
                <StatusBadge value={r.completion_status}/>
                {r.rating!=null&&<RatingStars value={r.rating} readOnly size={13}/>}
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
            <td><button className="icon-button" title="Xem chi tiết và chấm sao" onClick={()=>setTaskTarget({plan:p,student:s})}><MessageSquareQuote size={16}/></button></td>
          </tr>})}</tbody>
      </table>{rows.length===0&&<div className="empty-state">Không có dữ liệu phù hợp bộ lọc.</div>}</div>}
    </section>}

    {resetTargets&&<ResetPasswordModal targets={resetTargets} onClose={()=>setResetTargets(null)} onDone={()=>{setSelected(new Set());load()}}/>}
    {taskTarget&&<TaskDetailModal plan={taskTarget.plan} student={taskTarget.student}
      reflection={reflections[taskTarget.plan.id]} evidence={evidence[taskTarget.plan.id]||[]}
      onOpenEvidence={openEvidence} onClose={()=>setTaskTarget(null)} onSaved={()=>{setTaskTarget(null);load()}}/>}
    {studentDetail&&<StudentDetailModal row={studentDetail} plans={plans} reflections={reflections} evidence={evidence}
      onClose={()=>setStudentDetail(null)}
      onOpenTask={(p)=>{setStudentDetail(null);setTaskTarget({plan:p,student:studentMap[p.student_id]||{full_name:studentDetail.name,mshs:studentDetail.mshs}})}}
      onChat={()=>{const d=studentDetail;setStudentDetail(null);openChat(d.id,d.name)}}/>}
    {chatWith&&<div className="modal-backdrop" onMouseDown={()=>setChatWith(null)}>
      <div className="modal" onMouseDown={e=>e.stopPropagation()}>
        <div className="modal-head"><div><span className="eyebrow">TIN NHẮN</span><h2>{chatWith.name}</h2></div>
          <button className="icon-button" onClick={()=>setChatWith(null)}>✕</button></div>
        <ChatPanel conversationId={chatWith.id} studentName={chatWith.name}/>
      </div>
    </div>}
  </div>
}

function downloadCsv(lines,filename){
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href)
}

function Stat({label,value,alert}){return <div className={`stat-card ${alert?'alert':''}`}><span>{label}</span><strong>{value}</strong></div>}

// Đặt lại mật khẩu cho 1 hoặc nhiều học sinh. Mật khẩu tạm sinh tự động và chỉ
// hiện đúng một lần ở đây — hệ thống không lưu lại được bản đọc được.
function ResetPasswordModal({targets,onClose,onDone}){
  const single=targets.length===1
  const [pw,setPw]=useState(()=>single?generateTempPassword(targets[0].mshs):'')
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  const [results,setResults]=useState(null)
  const checks=single?passwordChecks(pw,targets[0].mshs):[]

  const runSingle=async()=>{
    setMsg('')
    if(!validateStudentPassword(pw,targets[0].mshs).ok)return setMsg('Mật khẩu tạm chưa đáp ứng đầy đủ rule của học sinh.')
    setBusy(true)
    const {ok,data}=await callFunction('teacher-reset-password',{studentId:targets[0].id,newPassword:pw})
    setBusy(false)
    if(!ok)return setMsg(data?.error||'Không thể đặt lại mật khẩu.')
    setResults([{...targets[0],password:pw,ok:true}])
  }

  const runBulk=async()=>{
    setBusy(true);setMsg('')
    const out=[]
    for(const t of targets){
      const temp=generateTempPassword(t.mshs)
      const {ok,data}=await callFunction('teacher-reset-password',{studentId:t.id,newPassword:temp})
      out.push({...t,password:ok?temp:'',ok,error:ok?null:(data?.error||'lỗi')})
    }
    setBusy(false);setResults(out)
  }

  const copyAll=async()=>{
    const text=results.filter(r=>r.ok).map(r=>`${r.mshs}\t${r.name}\t${r.password}`).join('\n')
    try{await navigator.clipboard.writeText(text);setMsg('✓ Đã chép danh sách vào clipboard.')}
    catch{setMsg('Trình duyệt chặn clipboard — hãy bôi đen và chép tay.')}
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head">
      <div>
        <span className="eyebrow">ĐẶT LẠI MẬT KHẨU</span>
        <h2>{single?targets[0].name:`${targets.length} học sinh`}</h2>
        {single&&<p>MSHS: {targets[0].mshs}</p>}
      </div>
      <button className="icon-button" onClick={onClose}>✕</button>
    </div>

    {!results?<>
      <div className="notice compact"><KeyRound size={17}/><span>Sau khi đặt lại, học sinh đăng nhập bằng mật khẩu tạm và <strong>bắt buộc phải tự đặt mật khẩu riêng</strong> trước khi vào được trang kế hoạch.</span></div>

      {single?<>
        <label>Mật khẩu tạm</label>
        <div className="input-with-action">
          <input value={pw} onChange={e=>setPw(e.target.value)} spellCheck={false}/>
          <button type="button" className="button ghost" onClick={()=>setPw(generateTempPassword(targets[0].mshs))}><Shuffle size={15}/> Tạo lại</button>
        </div>
        <div className="password-rules visible">{checks.map(i=><div key={i.key} className={i.ok?'rule-ok':'rule-pending'}>{i.ok?'✓':'○'} <span>{i.label}</span></div>)}</div>
      </>:<>
        <p className="muted-text">Mỗi em sẽ nhận một mật khẩu tạm riêng, sinh tự động. Danh sách hiện ra sau khi xong — hãy chép lại trước khi đóng.</p>
        <ul className="target-list">{targets.map(t=><li key={t.mshs}><strong>{t.name}</strong> <small>{t.mshs}</small></li>)}</ul>
      </>}

      {msg&&<div className="form-error">{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Hủy</button>
        <button className="button primary" onClick={single?runSingle:runBulk} disabled={busy}>
          {busy?'Đang đặt lại…':single?'Đặt lại mật khẩu':`Đặt lại cho ${targets.length} em`}
        </button>
      </div>
    </>:<>
      <div className="notice"><Check size={17}/><span>Xong. <strong>Chép lại ngay</strong> — đóng cửa sổ này là không xem lại được nữa.</span></div>
      <div className="table-wrap result-table"><table>
        <thead><tr><th>MSHS</th><th>Họ tên</th><th>Mật khẩu tạm</th></tr></thead>
        <tbody>{results.map(r=><tr key={r.mshs}>
          <td>{r.mshs}</td><td>{r.name}</td>
          <td>{r.ok?<code>{r.password}</code>:<span className="help-flag">{r.error}</span>}</td>
        </tr>)}</tbody>
      </table></div>
      {msg&&<div className={msg.startsWith('✓')?'notice':'form-error'}>{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={copyAll}><ClipboardCopy size={16}/> Chép danh sách</button>
        <button className="button primary" onClick={()=>{onDone();onClose()}}>Đã chép xong, đóng</button>
      </div>
    </>}
  </div></div>
}

// Chi tiết một tiết học sinh đã thực hiện: kế hoạch, tự đánh giá, minh chứng,
// rồi giáo viên chấm sao và viết nhận xét.
function TaskDetailModal({plan,student,reflection,evidence,onOpenEvidence,onClose,onSaved}){
  const [rating,setRating]=useState(reflection?.rating??null)
  const [text,setText]=useState(reflection?.teacher_comment||'')
  const [resolved,setResolved]=useState(reflection?.help_resolved||false)
  const [busy,setBusy]=useState(false);const [msg,setMsg]=useState('')

  const save=async()=>{
    setBusy(true);setMsg('')
    const {error}=await supabase.from('reflections')
      .update({rating,teacher_comment:text.trim()||null,help_resolved:resolved})
      .eq('plan_id',plan.id)
    setBusy(false)
    if(error)return setMsg('Không thể lưu đánh giá.')
    onSaved()
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head">
      <div><span className="eyebrow">CHI TIẾT TIẾT TỰ HỌC</span><h2>{student.full_name}</h2>
        <p>{formatDate(plan.study_date)} · Tiết {plan.period} · {plan.subject}</p></div>
      <button className="icon-button" onClick={onClose}>✕</button>
    </div>

    <div className="detail-box">
      <strong>Nhiệm vụ</strong><p>{plan.task}</p>
      <strong>Mục tiêu</strong><p>{plan.goal}</p>
      <div className="detail-inline">
        <span>Ưu tiên: <StatusBadge value={plan.priority}/></span>
        <span>Đăng ký: <StatusBadge value={registrationStatus(plan.study_date,plan.created_at)}/></span>
        {plan.use_device&&<span>Thiết bị: <StatusBadge value={plan.device_status}/></span>}
      </div>
      {plan.use_device&&plan.device_purpose&&<><strong>Mục đích thiết bị</strong><p>{plan.device_purpose}</p></>}
    </div>

    {reflection?<>
      <div className="detail-box">
        <strong>Học sinh tự đánh giá</strong><p><StatusBadge value={reflection.completion_status}/></p>
        {reflection.note&&<><strong>Ghi chú của em</strong><p>{reflection.note}</p></>}
      </div>
      {reflection.need_help&&<div className="detail-box highlight"><strong>Em cần hỗ trợ</strong><p>{reflection.help_note}</p></div>}
      {reflection.student_ack_note&&<div className="detail-box highlight">
        <strong>Phản hồi của em sau khi bị đánh giá thấp</strong><p>{reflection.student_ack_note}</p>
        <small className="muted-text">{new Date(reflection.student_ack_at).toLocaleString('vi-VN')}</small>
      </div>}
      {evidence.length>0&&<div className="evidence-block">
        <h3>Minh chứng đã nộp</h3>
        {evidence.map(x=><button key={x.id} type="button" className="evidence-item" onClick={()=>onOpenEvidence(x)}>
          {x.kind==='link'?'🔗':'📎'} {x.display_name||'Minh chứng'} <ExternalLink size={14}/>
        </button>)}
      </div>}

      <div className={`rating-editor ${ratingTone(rating)}`}>
        <label>Đánh giá của giáo viên</label>
        <RatingStars value={rating} onChange={setRating}/>
        {rating!=null&&rating<=2&&<div className="notice warning compact"><AlertTriangle size={16}/>
          <span>Chấm {rating} sao sẽ hiện viền cảnh báo trên thẻ của em và <strong>bắt em viết một dòng phản hồi</strong> về cách điều chỉnh.</span></div>}
      </div>

      <label>Nhận xét gửi lại học sinh</label>
      <textarea rows="4" maxLength={1000} value={text} onChange={e=>setText(e.target.value)}
                placeholder="Phản hồi ngắn gọn để em biết cần điều chỉnh gì…"/>
      {reflection.need_help&&<div className="toggle-row"><label className="switch"><input type="checkbox" checked={resolved} onChange={e=>setResolved(e.target.checked)}/><span/></label><div><strong>Đã xử lý yêu cầu hỗ trợ</strong><small>Tắt cảnh báo “cần hỗ trợ” cho tiết này.</small></div></div>}
      {msg&&<div className="form-error">{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Đóng</button>
        <button className="button primary" onClick={save} disabled={busy}>{busy?'Đang lưu…':'Lưu đánh giá'}</button>
      </div>
    </>:<>
      <div className="empty-state"><p>Học sinh chưa cập nhật kết quả cho tiết này, nên chưa chấm sao được.</p></div>
      <div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button></div>
    </>}
  </div></div>
}

// Hồ sơ một học sinh: thống kê + toàn bộ lịch sử tiết tự học.
function StudentDetailModal({row,plans,reflections,evidence,onClose,onOpenTask,onChat}){
  const mine=plans.filter(p=>p.student_id===row.id)
  const done=mine.filter(p=>reflections[p.id]?.completion_status==='Hoàn thành').length
  const rated=mine.map(p=>reflections[p.id]?.rating).filter(v=>v!=null)
  const avg=rated.length?(rated.reduce((a,b)=>a+b,0)/rated.length).toFixed(1):null
  const bySubject=useMemo(()=>{
    const m={}
    for(const p of mine){m[p.subject]=(m[p.subject]||0)+1}
    return Object.entries(m).sort((a,b)=>b[1]-a[1])
  },[mine])

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal wide" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head">
      <div><span className="eyebrow">HỒ SƠ HỌC SINH</span><h2>{row.name}</h2>
        <p>MSHS {row.mshs}{row.isTa?' · Trợ giảng':''}</p></div>
      <button className="icon-button" onClick={onClose}>✕</button>
    </div>

    <div className="student-summary">
      <div className="stat-card"><span>Tổng số tiết</span><strong>{mine.length}</strong></div>
      <div className="stat-card"><span>Đúng hạn</span><strong>{mine.length?`${Math.round(row.ontime/mine.length*100)}%`:'—'}</strong></div>
      <div className="stat-card"><span>Hoàn thành</span><strong>{mine.length?`${Math.round(done/mine.length*100)}%`:'—'}</strong></div>
      <div className={`stat-card ${row.low>0?'alert':''}`}><span>Điểm trung bình</span><strong>{avg?`${avg}/5`:'—'}</strong></div>
    </div>

    {bySubject.length>0&&<div className="detail-box">
      <strong>Môn đăng ký nhiều nhất</strong>
      <p>{bySubject.slice(0,4).map(([s,n])=>`${s} (${n})`).join(' · ')}</p>
    </div>}

    <div className="section-title"><div><h3>Lịch sử tiết tự học</h3><p>Bấm vào một tiết để xem chi tiết và chấm sao.</p></div>
      <button className="button ghost" onClick={onChat}><MessageSquare size={16}/> Nhắn tin</button></div>

    <div className="table-wrap detail-history"><table>
      <thead><tr><th>Ngày / Tiết</th><th>Môn</th><th>Nhiệm vụ</th><th>Kết quả</th><th>Sao</th></tr></thead>
      <tbody>{mine.map(p=>{
        const r=reflections[p.id]
        return <tr key={p.id} className={`clickable ${ratingTone(r?.rating)}`} onClick={()=>onOpenTask(p)}>
          <td>{formatDate(p.study_date)}<small>Tiết {p.period}</small></td>
          <td>{p.subject}</td>
          <td><small title={p.task}>{p.task}</small></td>
          <td>{r?<StatusBadge value={r.completion_status}/>:<span className="muted-text">Chưa cập nhật</span>}</td>
          <td>{r?.rating!=null?<RatingStars value={r.rating} readOnly size={13}/>:'—'}</td>
        </tr>
      })}</tbody>
    </table>{mine.length===0&&<div className="empty-state">Em này chưa đăng ký tiết tự học nào.</div>}</div>
  </div></div>
}

// Cử trợ giảng và bật/tắt từng quyền.
const TA_PERMS=[
  ['can_view_plans','Xem kế hoạch lớp','Môn, nhiệm vụ, đúng hạn/trễ'],
  ['can_view_help','Xem yêu cầu hỗ trợ','Danh sách bạn đang cần giúp'],
  ['can_chat','Nhắn tin với bạn','Giáo viên vẫn đọc được luồng'],
  ['can_view_reflections','Xem phản tư đầy đủ','Gồm ghi chú riêng của bạn'],
  ['can_view_evidence','Xem minh chứng','File bạn đã nộp'],
  ['can_rate','Chấm sao 1–5','Hệ thống ghi rõ ai chấm'],
  ['can_comment','Viết nhận xét','Gửi thẳng tới học sinh'],
  ['can_review_device','Duyệt đăng ký thiết bị','Đồng ý hoặc từ chối'],
]

function AssistantsPanel({classId,perStudent,assistants,onChanged}){
  const [busy,setBusy]=useState('')
  const [msg,setMsg]=useState('')
  const byId=Object.fromEntries(assistants.map(a=>[a.student_id,a]))
  const candidates=perStudent.filter(r=>r.hasAccount)
  const current=candidates.filter(r=>byId[r.id])

  const addTa=async(studentId)=>{
    if(!studentId)return
    setBusy(studentId);setMsg('')
    const {error}=await supabase.from('class_assistants').insert({class_id:classId,student_id:studentId})
    setBusy('')
    if(error)return setMsg('Không cử được trợ giảng.')
    onChanged()
  }
  const removeTa=async(studentId)=>{
    if(!window.confirm('Thôi cử em này làm trợ giảng?'))return
    setBusy(studentId);setMsg('')
    const {error}=await supabase.from('class_assistants').delete()
      .eq('class_id',classId).eq('student_id',studentId)
    setBusy('')
    if(error)return setMsg('Không gỡ được.')
    onChanged()
  }
  const togglePerm=async(studentId,key,value)=>{
    setBusy(studentId);setMsg('')
    const {error}=await supabase.from('class_assistants').update({[key]:value})
      .eq('class_id',classId).eq('student_id',studentId)
    setBusy('')
    if(error)return setMsg('Không lưu được quyền.')
    onChanged()
  }

  return <section className="card ta-panel">
    <div className="section-title"><div>
      <h2><LifeBuoy size={19}/> Trợ giảng lớp</h2>
      <p>Cử học sinh hỗ trợ khi thầy cô không có mặt. Mỗi ô tick là một quyền riêng — mặc định chỉ mở những việc không đụng vào phần riêng tư của bạn cùng lớp.</p>
    </div></div>

    <div className="ta-add">
      <label>Cử thêm trợ giảng</label>
      <select value="" onChange={e=>addTa(e.target.value)}>
        <option value="">— Chọn học sinh —</option>
        {candidates.filter(r=>!byId[r.id]).map(r=><option key={r.mshs} value={r.id}>{r.name} ({r.mshs})</option>)}
      </select>
    </div>

    {msg&&<div className="form-error">{msg}</div>}

    {current.length===0
      ? <div className="empty-state"><p>Chưa cử trợ giảng nào.</p></div>
      : <div className="table-wrap"><table className="ta-table">
          <thead><tr>
            <th>Trợ giảng</th>
            {TA_PERMS.map(([k,label,hint])=><th key={k} title={hint}>{label}</th>)}
            <th></th>
          </tr></thead>
          <tbody>{current.map(r=>{
            const a=byId[r.id]
            return <tr key={r.mshs} className={busy===r.id?'saving':''}>
              <td><strong>{r.name}</strong><small>{r.mshs}</small></td>
              {TA_PERMS.map(([k])=><td key={k} className="pick">
                <input type="checkbox" checked={!!a[k]} disabled={busy===r.id}
                       onChange={e=>togglePerm(r.id,k,e.target.checked)}/>
              </td>)}
              <td><button className="icon-button danger" title="Thôi cử" onClick={()=>removeTa(r.id)}><X size={16}/></button></td>
            </tr>
          })}</tbody>
        </table></div>}

    <p className="muted-text small">
      Trợ giảng không bao giờ đặt lại được mật khẩu, không sửa/xóa kế hoạch của bạn, không cử trợ giảng khác,
      và không xem được quyền của trợ giảng khác. Mọi lượt chấm sao hay nhận xét đều ghi rõ người thực hiện.
    </p>
  </section>
}
