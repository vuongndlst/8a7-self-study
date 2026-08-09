import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, KeyRound, RefreshCw, Search, UsersRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import { passwordChecks, validateStudentPassword } from '../utils/password'
import StatusBadge from '../components/StatusBadge'

export default function TeacherPage(){
  const [students,setStudents]=useState([])
  const [roster,setRoster]=useState([])
  const [plans,setPlans]=useState([])
  const [reflections,setReflections]=useState({})
  const [evidence,setEvidence]=useState({})
  const [loading,setLoading]=useState(true)
  const [filters,setFilters]=useState({from:'',to:'',student:'',subject:'',completion:'',search:''})
  const [resetTarget,setResetTarget]=useState(null)

  const load=async()=>{
    setLoading(true)
    const [{data:s},{data:rster},{data:p}]=await Promise.all([
      supabase.from('profiles').select('id,mshs,full_name,created_at').eq('role','student').order('full_name'),
      supabase.from('student_roster').select('mshs,full_name,claimed_user_id').order('full_name'),
      supabase.from('plans').select('*').order('study_date',{ascending:false}).order('period')
    ])
    const studentList=s||[];const planList=p||[]
    setStudents(studentList);setRoster(rster||[]);setPlans(planList)
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
    const ontime=rows.filter(p=>registrationStatus(p.study_date,p.created_at)==='Đúng hạn').length
    const done=rows.filter(p=>reflections[p.id]?.completion_status==='Hoàn thành').length
    const help=rows.filter(p=>reflections[p.id]?.need_help).length
    const devices=rows.filter(p=>p.use_device).length
    return{total,ontime,done,help,devices}
  },[rows,reflections])

  const subjects=[...new Set(plans.map(p=>p.subject))].sort()
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
  const exportCsv=()=>{
    const lines=[['MSHS','Họ tên','Ngày','Tiết','Môn','Nhiệm vụ','Mục tiêu','Ưu tiên','Thiết bị','Mục đích thiết bị','Đăng ký','Kết quả','Cần hỗ trợ','Ghi chú hỗ trợ'].join(',')]
    rows.forEach(p=>{
      const s=studentMap[p.student_id]||{};const r=reflections[p.id]||{}
      const vals=[s.mshs,s.full_name,p.study_date,p.period,p.subject,p.task,p.goal,p.priority,p.use_device?'Có':'Không',p.device_purpose||'',registrationStatus(p.study_date,p.created_at),r.completion_status||'',r.need_help?'Có':'Không',r.help_note||''].map(v=>`"${String(v??'').replaceAll('"','""')}"`)
      lines.push(vals.join(','))
    })
    const blob=new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`8A7-self-study-${todayISO()}.csv`;a.click();URL.revokeObjectURL(a.href)
  }

  return <div className="page teacher-page">
    <section className="dashboard-heading"><div><span className="eyebrow">TEACHER DASHBOARD</span><h1>Quản lý giờ tự học 8A7</h1><p>Theo dõi trực tiếp kế hoạch, kết quả và nhu cầu hỗ trợ của 31 học sinh.</p></div><div className="button-row"><button className="button ghost" onClick={load}><RefreshCw size={17}/> Làm mới</button><button className="button primary" onClick={exportCsv}><Download size={17}/> Xuất CSV</button></div></section>

    <section className="stats-grid"><Stat label="Tài khoản HS" value={`${claimed}/31`}/><Stat label="Lượt đăng ký" value={stats.total}/><Stat label="Đúng hạn" value={stats.total?`${Math.round(stats.ontime/stats.total*100)}%`:'0%'}/><Stat label="Hoàn thành" value={stats.total?`${Math.round(stats.done/stats.total*100)}%`:'0%'}/><Stat label="Dùng thiết bị" value={stats.devices}/><Stat label="Cần hỗ trợ" value={stats.help} alert={stats.help>0}/></section>

    <section className="teacher-meta-grid">
      <article className="card roster-card"><div className="roster-head"><div><span className="eyebrow">TÀI KHOẢN HỌC SINH</span><h3>{claimed} / 31 đã đăng ký</h3></div><UsersRound size={24}/></div><div className="roster-progress"><span style={{width:`${Math.round(claimed/31*100)}%`}}/></div><div className="roster-unclaimed">{unclaimed.length?<>Chưa đăng ký: <strong>{unclaimed.map(x=>x.full_name).join(' · ')}</strong></>:'✓ Tất cả học sinh đã tạo tài khoản.'}</div></article>
      <article className="card insight-card"><span className="eyebrow">TỔNG QUAN BỘ LỌC</span><div className="insight-list"><div className="insight-row"><span>Tổng kế hoạch đang xem</span><strong>{rows.length}</strong></div><div className="insight-row"><span>Môn được đăng ký nhiều</span><strong>{topSubjects[0]?.[0]||'—'}</strong></div><div className="insight-row"><span>Chưa cập nhật kết quả</span><strong>{rows.filter(p=>!reflections[p.id]).length}</strong></div></div></article>
    </section>

    <section className="card filters"><div className="search-box"><Search size={17}/><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Tìm tên, MSHS, môn, nhiệm vụ…"/></div><input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} title="Từ ngày"/><input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} title="Đến ngày"/><select value={filters.student} onChange={e=>setFilters({...filters,student:e.target.value})}><option value="">Tất cả học sinh</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select><select value={filters.subject} onChange={e=>setFilters({...filters,subject:e.target.value})}><option value="">Tất cả môn</option>{subjects.map(x=><option key={x}>{x}</option>)}</select><select value={filters.completion} onChange={e=>setFilters({...filters,completion:e.target.value})}><option value="">Tất cả kết quả</option><option>Hoàn thành</option><option>Một phần</option><option>Chưa hoàn thành</option><option>Chưa cập nhật</option></select></section>

    <section className="card table-card">
      {loading?<div className="empty-state">Đang tải dữ liệu…</div>:<div className="table-wrap"><table><thead><tr><th>Học sinh</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Đăng ký</th><th>Kết quả</th><th>Thiết bị</th><th>Minh chứng</th><th>Bảo mật</th></tr></thead><tbody>{rows.map(p=>{const s=studentMap[p.student_id]||{};const r=reflections[p.id];const ev=evidence[p.id]||[];return <tr key={p.id}><td><strong>{s.full_name}</strong><small>{s.mshs}</small></td><td>{formatDate(p.study_date)}<small>Tiết {p.period}</small></td><td><strong>{p.subject}</strong><small title={p.task}>{p.task}</small></td><td><StatusBadge value={registrationStatus(p.study_date,p.created_at)}/></td><td>{r?<><StatusBadge value={r.completion_status}/>{r.need_help&&<small className="help-flag">⚠ Cần hỗ trợ: {r.help_note||''}</small>}</>:<span className="muted-text">Chưa cập nhật</span>}</td><td>{p.use_device?<span title={p.device_purpose}>💻 Có</span>:'—'}</td><td>{ev.length?ev.map(x=><button key={x.id} className="mini-link" onClick={()=>openEvidence(x)}>{x.kind==='link'?'🔗':'📎'}<ExternalLink size={12}/></button>):'—'}</td><td><button className="icon-button" title="Đặt lại mật khẩu" onClick={()=>setResetTarget(s)}><KeyRound size={16}/></button></td></tr>})}</tbody></table>{rows.length===0&&<div className="empty-state">Không có dữ liệu phù hợp bộ lọc.</div>}</div>}
    </section>
    {resetTarget&&<ResetPasswordModal student={resetTarget} onClose={()=>setResetTarget(null)}/>} 
  </div>
}

function Stat({label,value,alert}){return <div className={`stat-card ${alert?'alert':''}`}><span>{label}</span><strong>{value}</strong></div>}

function ResetPasswordModal({student,onClose}){
  const [pw,setPw]=useState('');const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false)
  const checks=passwordChecks(pw,student.mshs)
  const reset=async()=>{
    setMsg('')
    if(!validateStudentPassword(pw,student.mshs).ok)return setMsg('Mật khẩu tạm chưa đáp ứng đầy đủ rule của học sinh.')
    setBusy(true)
    const {data,error}=await supabase.functions.invoke('teacher-reset-password',{body:{studentId:student.id,newPassword:pw}})
    setBusy(false)
    if(error||!data?.ok)return setMsg(data?.error||error?.message||'Không thể đặt lại mật khẩu.')
    setMsg('✓ Đã đặt lại mật khẩu. Hãy gửi mật khẩu tạm trực tiếp cho học sinh.')
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal small" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">ĐẶT LẠI MẬT KHẨU</span><h2>{student.full_name}</h2><p>MSHS: {student.mshs}</p></div><button className="icon-button" onClick={onClose}>✕</button></div><label>Mật khẩu tạm mới</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Tối thiểu 10 ký tự"/><div className="password-rules visible">{checks.map(i=><div key={i.key} className={i.ok?'rule-ok':'rule-pending'}>{i.ok?'✓':'○'} <span>{i.label}</span></div>)}</div>{msg&&<div className={msg.startsWith('✓')?'notice':'form-error'}>{msg}</div>}<div className="form-actions"><button className="button ghost" onClick={onClose}>Đóng</button><button className="button primary" onClick={reset} disabled={busy}>{busy?'Đang đặt lại…':'Đặt lại mật khẩu'}</button></div></div></div>
}
