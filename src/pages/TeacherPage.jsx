import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ClipboardCheck, Star, ClipboardCopy, Download, ExternalLink, KeyRound, LifeBuoy, MessageSquare, MessageSquareQuote, RefreshCw, Search, Shuffle, UsersRound, X } from 'lucide-react'
import { supabase, callFunction } from '../lib/supabase'
import { selectIn, daysAgoISO, LOAD_WINDOWS } from '../lib/query'
import { useAuth } from '../context/AuthContext'
import { formatDate, registrationStatus, todayISO } from '../utils/date'
import { generateTempPassword, passwordChecks, validateStudentPassword } from '../utils/password'
import StatusBadge from '../components/StatusBadge'
import RatingStars, { ratingTone, ratingLabel } from '../components/RatingStars'
import ChatPanel, { getOrCreateConversation } from '../components/ChatPanel'
import { ClassScheduleSettings, MissingRegistrations } from '../components/ClassSchedule'
import Avatar from '../components/Avatar'
import RosterPanel from '../components/RosterPanel'
import ClassSwitcher from '../components/ClassSwitcher'
import TeacherOnboarding from '../components/TeacherOnboarding'
import { ClassAnalytics, StudentAnalytics } from '../components/Analytics'

const PAGE_SIZE = 25

// Bộ lọc rỗng. Mỗi ô ở hộp việc cần xử lý đặt LẠI toàn bộ rồi mới bật điều kiện
// của mình — nếu chỉ chồng thêm, thầy cô bấm "Chờ duyệt" xong bấm "Cần hỗ trợ"
// sẽ ra giao của hai điều kiện và tưởng là hệ thống báo sai số.
const CLEAR = { from:'', to:'', student:'', subject:'', completion:'', search:'', review:'',
                progress:'', period:'', device:'', rating:'', help:'', recheck:'' }

const tomorrowISO = () => {
  const d = new Date(todayISO() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export default function TeacherPage(){
  const {context,classes,refreshProfile}=useAuth()
  const [students,setStudents]=useState([])
  const [roster,setRoster]=useState([])
  const [plans,setPlans]=useState([])
  const [reflections,setReflections]=useState({})
  const [evidence,setEvidence]=useState({})
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState('plans')
  const [filters,setFilters]=useState({...CLEAR})
  const [selectedPlans,setSelectedPlans]=useState(new Set())
  const [bulkAction,setBulkAction]=useState(null)
  const [bulkRate,setBulkRate]=useState(false)
  const [sortBy,setSortBy]=useState('date_desc')
  const [page,setPage]=useState(1)
  const [selected,setSelected]=useState(new Set())
  const [resetTargets,setResetTargets]=useState(null)
  const [taskTarget,setTaskTarget]=useState(null)
  const [studentDetail,setStudentDetail]=useState(null)
  const [chatWith,setChatWith]=useState(null)
  const [assistants,setAssistants]=useState([])
  const [status,setStatus]=useState({})
  // Khoảng thời gian được NẠP về máy (khác với bộ lọc "Từ ngày/Đến ngày" bên dưới,
  // vốn chỉ lọc trong phần đã nạp). Mặc định 60 ngày là đủ cho việc theo dõi hằng
  // ngày; cần xa hơn thì đổi ở ô ngay trên bảng.
  const [windowDays,setWindowDays]=useState(60)

  // Bảng điều khiển CHỈ nạp dữ liệu của lớp đang chọn, trong một khoảng thời gian
  // có giới hạn. Trước đây nó nạp mọi kế hoạch mà RLS cho phép nhìn thấy — với
  // một lớp thì không sao, nhưng giáo viên dạy nhiều lớp qua nhiều năm (và nhất là
  // tài khoản quản trị, vốn nhìn thấy toàn trường) sẽ kéo về hàng chục nghìn dòng
  // mỗi lần mở trang. Lớp thuộc đúng một năm học, nên lọc theo lớp đã tự khoanh
  // luôn theo năm.
  const load=async()=>{
    if(!context.classId){setLoading(false);return}
    setLoading(true)
    const since=windowDays?daysAgoISO(windowDays):null

    let planQuery=supabase.from('plans').select('*').eq('class_id',context.classId)
    if(since)planQuery=planQuery.gte('study_date',since)
    const [{data:enr},{data:p},{data:ta}]=await Promise.all([
      supabase.from('enrollments').select('mshs,is_active,students!inner(mshs,full_name,claimed_user_id)')
        .eq('class_id',context.classId).eq('is_active',true),
      planQuery.order('study_date',{ascending:false}).order('period'),
      supabase.from('class_assistants').select('*').eq('class_id',context.classId),
    ])

    const roll=(enr||[]).map(e=>e.students).sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi'))
    const planList=p||[]
    const ids=planList.map(x=>x.id)
    const uids=roll.map(x=>x.claimed_user_id).filter(Boolean)

    // Vòng gọi thứ hai: tất cả đều phụ thuộc kết quả vòng một nên phải đợi, nhưng
    // bốn truy vấn này chạy song song với nhau — tổng cộng 2 lượt đi/về, không phải 3.
    const [s,st,r,e]=await Promise.all([
      selectIn('profiles','id,mshs,full_name,created_at,must_change_password,avatar_path','id',uids),
      selectIn('plan_status','plan_id,progress,overdue_at,needs_recheck,auto_evaluated','plan_id',ids),
      selectIn('reflections','*','plan_id',ids),
      selectIn('evidence','*','plan_id',ids),
    ])

    setStudents(s.sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi')))
    setRoster(roll)
    setPlans(planList)
    setAssistants(ta||[])
    setStatus(Object.fromEntries(st.map(x=>[x.plan_id,x])))
    setReflections(Object.fromEntries(r.map(x=>[x.plan_id,x])))
    const grouped={};e.forEach(x=>(grouped[x.plan_id] ||= []).push(x));setEvidence(grouped)
    setLoading(false)
  }
  useEffect(()=>{load()},[context.classId,windowDays])


  const studentMap=useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students])
  const rows=useMemo(()=>{
    const list=plans.filter(p=>{
      const s=studentMap[p.student_id];const r=reflections[p.id]
      if(filters.from&&p.study_date<filters.from)return false
      if(filters.to&&p.study_date>filters.to)return false
      if(filters.student&&p.student_id!==filters.student)return false
      if(filters.subject&&p.subject!==filters.subject)return false
      if(filters.completion&&(r?.completion_status||'Chưa cập nhật')!==filters.completion)return false
      if(filters.review&&p.review_status!==filters.review)return false
      if(filters.progress&&status[p.id]?.progress!==filters.progress)return false
      if(filters.period&&String(p.period)!==filters.period)return false
      if(filters.device==='co'&&!p.use_device)return false
      if(filters.device==='khong'&&p.use_device)return false
      // Chờ chấm = ĐÃ có kết quả nhưng CHƯA có sao. Đã chấm = có sao thầy cô cho.
      if(filters.rating==='cho_cham'&&!(r&&r.rating==null))return false
      if(filters.rating==='da_cham'&&!(r&&r.rating!=null&&!r.auto_evaluated))return false
      if(filters.rating==='sao_thap'&&!(r&&r.rating!=null&&r.rating<=2))return false
      if(filters.rating==='tu_dong'&&!r?.auto_evaluated)return false
      // Em đang giơ tay xin hỗ trợ và thầy cô chưa đánh dấu là đã giải quyết.
      if(filters.help==='can_ho_tro'&&!(r?.need_help&&!r.help_resolved))return false
      // Em nộp kết quả SAU khi đã bị chấm — điểm cũ có thể không còn đúng nữa.
      if(filters.recheck==='co'&&!status[p.id]?.needs_recheck)return false
      const q=filters.search.trim().toLowerCase()
      if(q&&!`${s?.full_name||''} ${s?.mshs||''} ${p.task} ${p.subject}`.toLowerCase().includes(q))return false
      return true
    })
    const name=(p)=>studentMap[p.student_id]?.full_name||''
    const cmp={
      date_desc:(a,b)=>b.study_date.localeCompare(a.study_date)||a.period-b.period,
      date_asc:(a,b)=>a.study_date.localeCompare(b.study_date)||a.period-b.period,
      created_desc:(a,b)=>b.created_at.localeCompare(a.created_at),
      created_asc:(a,b)=>a.created_at.localeCompare(b.created_at),
      student_asc:(a,b)=>name(a).localeCompare(name(b),'vi')||a.study_date.localeCompare(b.study_date),
      student_desc:(a,b)=>name(b).localeCompare(name(a),'vi')||a.study_date.localeCompare(b.study_date),
    }[sortBy]
    return [...list].sort(cmp)
  },[plans,filters,studentMap,reflections,status,sortBy])

  // Chỉ những kế hoạch đang hiển thị VÀ chưa duyệt mới là mục tiêu hợp lệ.
  const pendingInView=useMemo(()=>rows.filter(p=>p.review_status==='Chờ duyệt'),[rows])
  // Chấm sao được nghĩa là ĐÃ CÓ kết quả mà chưa có sao thầy cô cho. Tiết em chưa
  // cập nhật thì không có gì để chấm; tiết hệ thống tự chấm 1 sao thì tính là
  // chưa chấm, vì đó chính là nhóm cần thầy cô xem lại nhiều nhất.
  const rateableInView=useMemo(()=>rows.filter(p=>{
    const r=reflections[p.id]
    return r&&(r.rating==null||r.auto_evaluated)
  }),[rows,reflections])
  const selectedList=useMemo(()=>rows.filter(p=>selectedPlans.has(p.id)),[rows,selectedPlans])
  const selectedPending=useMemo(()=>selectedList.filter(p=>p.review_status==='Chờ duyệt'),[selectedList])
  const selectedRateable=useMemo(()=>selectedList.filter(p=>{
    const r=reflections[p.id]
    return r&&(r.rating==null||r.auto_evaluated)
  }),[selectedList,reflections])
  const togglePlan=(id)=>setSelectedPlans(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})
  // Ô tick ở đầu bảng chỉ tác động lên TRANG đang xem; muốn cả bộ lọc thì dùng
  // nút "Chọn tất cả … chờ duyệt" ở thanh bên trên — nói rõ phạm vi để khỏi nhầm.
  const toggleAllPlans=()=>setSelectedPlans(prev=>{
    const ids=pageRows.map(p=>p.id)
    const allOn=ids.length>0&&ids.every(id=>prev.has(id))
    const n=new Set(prev)
    ids.forEach(id=>allOn?n.delete(id):n.add(id))
    return n
  })
  const selectAllPending=()=>setSelectedPlans(new Set(pendingInView.map(p=>p.id)))
  const selectAllRateable=()=>setSelectedPlans(new Set(rateableInView.map(p=>p.id)))
  // Đổi bộ lọc thì bỏ chọn, tránh thao tác nhầm lên nhóm không còn nhìn thấy.
  useEffect(()=>{setSelectedPlans(new Set());setPage(1)},[filters,sortBy])

  const totalPages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE))
  const pageRows=useMemo(()=>rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),[rows,page])

  // Số liệu tổng quan tính trên TOÀN BỘ khoảng đang nạp, không theo bộ lọc.
  // Bộ lọc nằm ở tab "Theo kế hoạch"; nếu để nó chi phối cả mấy ô ở tab "Phân
  // tích" thì thầy cô mở tab kia ra sẽ thấy "Lượt đăng ký: 1" mà không hiểu tại
  // sao — cái đang thu hẹp nó lại không nhìn thấy được từ đây.
  const stats=useMemo(()=>{
    const total=plans.length
    return{
      total,
      ontime:plans.filter(p=>registrationStatus(p.study_date,p.created_at)==='Đúng hạn').length,
      done:plans.filter(p=>reflections[p.id]?.completion_status==='Hoàn thành').length,
      rated:plans.filter(p=>{const r=reflections[p.id];return r&&r.rating!=null&&!r.auto_evaluated}).length,
      avg:(()=>{
        const v=plans.map(p=>reflections[p.id]?.rating).filter(x=>x!=null)
        return v.length?(v.reduce((a,b)=>a+b,0)/v.length):null
      })(),
    }
  },[plans,reflections])

  // Một dòng cho MỖI học sinh trong lớp — kể cả em chưa lập kế hoạch nào,
  // để giáo viên luôn đặt lại được mật khẩu.
  const perStudent=useMemo(()=>{
    const tmr=tomorrowISO()
    const map=new Map()
    for(const s of roster){
      map.set(s.mshs,{
        mshs:s.mshs, name:s.full_name,
        id:s.claimed_user_id, hasAccount:!!s.claimed_user_id,
        avatarPath:studentMap[s.claimed_user_id]?.avatar_path??null,
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
  // Trạng thái do CSDL tính (hạn 48h / tự đánh giá 120h).
  // HỘP VIỆC CẦN XỬ LÝ đếm trên TOÀN BỘ dữ liệu đã nạp, cố tình KHÔNG theo bộ lọc.
  // Nếu đếm theo `rows` (đã lọc) thì bấm "Chờ duyệt" xong mọi ô còn lại tụt về 0,
  // và thầy cô tưởng đã hết việc trong khi chỉ là đang nhìn qua một khe hẹp.
  // Số liệu mô tả ở tab Phân tích thì ngược lại — chúng PHẢI theo bộ lọc.
  const inbox=useMemo(()=>({
    pendingReview:plans.filter(p=>p.review_status==='Chờ duyệt').length,
    needsRevision:plans.filter(p=>p.review_status==='Cần điều chỉnh').length,
    overdue:      plans.filter(p=>status[p.id]?.progress==='Trễ hạn cập nhật').length,
    unrated:      plans.filter(p=>reflections[p.id]&&reflections[p.id].rating==null).length,
    help:         plans.filter(p=>reflections[p.id]?.need_help&&!reflections[p.id]?.help_resolved).length,
    autoRated:    plans.filter(p=>status[p.id]?.auto_evaluated).length,
    recheck:      plans.filter(p=>status[p.id]?.needs_recheck).length,
  }),[plans,status,reflections])

  const selectedRows=perStudent.filter(r=>selected.has(r.mshs)&&r.hasAccount)
  const toggle=(mshs)=>setSelected(prev=>{const n=new Set(prev);n.has(mshs)?n.delete(mshs):n.add(mshs);return n})
  const toggleAll=()=>setSelected(prev=>{
    const withAccount=perStudent.filter(r=>r.hasAccount).map(r=>r.mshs)
    return prev.size===withAccount.length?new Set():new Set(withAccount)
  })

  const openEvidence=async(item)=>{
    if(item.kind==='text')return window.alert(item.body_text||'')
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

  // Chưa có lớp thì KHÔNG dựng dashboard đầy biểu đồ rỗng — chỉ ra ba việc cần làm.
  if(!context.classId)return <TeacherOnboarding onDone={refreshProfile}/>

  return <div className="page teacher-page">
    <section className="dashboard-heading">
      <div>
        <span className="eyebrow">TEACHER DASHBOARD</span>
        <h1>Quản lý giờ tự học {context.className||''}</h1>
        <p>Theo dõi kế hoạch, kết quả và nhu cầu hỗ trợ của {rosterTotal} học sinh{context.yearName?` · năm học ${context.yearName}`:''}.</p>
      </div>
      <div className="button-row">
        <ClassSwitcher/>
        <button className="button ghost" onClick={load}><RefreshCw size={17}/> Làm mới</button>
        <button className="button primary" onClick={view==='plans'?exportCsv:exportSummaryCsv}><Download size={17}/> Xuất CSV</button>
      </div>
    </section>

    {/* HỘP VIỆC CẦN XỬ LÝ — và chỉ có thế.
        Trước đây chỗ này là 11 ô số liệu cộng một thẻ "Cần chú ý" 7 dòng: 18 con
        số phải đọc trước khi tới được dữ liệu, phần lớn trùng nhau (trễ hạn, chờ
        chấm sao, tài khoản HS đều xuất hiện hai lần) và phần lớn không bấm được.
        Giờ giữ đúng những mục THẦY CÔ PHẢI LÀM GÌ ĐÓ, mỗi mục bấm là lọc ngay.
        Số liệu mô tả chuyển sang tab Phân tích, tài khoản chuyển sang tab Theo
        học sinh — đúng chỗ người ta đi tìm chúng. */}
    <section className="stats-grid inbox-grid">
      <Stat label="Chờ duyệt" value={inbox.pendingReview} alert={inbox.pendingReview>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,review:'Chờ duyệt'})}}
            active={filters.review==='Chờ duyệt'}/>
      <Stat label="Cần điều chỉnh" value={inbox.needsRevision} alert={inbox.needsRevision>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,review:'Cần điều chỉnh'})}}
            active={filters.review==='Cần điều chỉnh'}/>
      <Stat label="Trễ hạn cập nhật" value={inbox.overdue} alert={inbox.overdue>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,progress:'Trễ hạn cập nhật'})}}
            active={filters.progress==='Trễ hạn cập nhật'}/>
      {/* Bấm vào là lọc ĐÚNG những tiết em đã nộp kết quả mà chưa được chấm sao,
          không phải mọi tiết đã hoàn thành. */}
      <Stat label="Chờ chấm sao" value={inbox.unrated} alert={inbox.unrated>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,rating:'cho_cham'})}}
            active={filters.rating==='cho_cham'}/>
      <Stat label="Cần hỗ trợ" value={inbox.help} alert={inbox.help>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,help:'can_ho_tro'})}}
            active={filters.help==='can_ho_tro'}/>
      <Stat label="Hệ thống tự chấm" value={inbox.autoRated} alert={inbox.autoRated>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,rating:'tu_dong'})}}
            active={filters.rating==='tu_dong'}/>
      <Stat label="Bổ sung muộn" value={inbox.recheck} alert={inbox.recheck>0}
            onClick={()=>{setView('plans');setFilters({...CLEAR,recheck:'co'})}}
            active={filters.recheck==='co'}/>
      <Stat label="Chưa lập KH ngày mai" value={noPlanTomorrow.length} alert={noPlanTomorrow.length>0}
            onClick={()=>setView('missing')} active={view==='missing'}/>
    </section>

    <div className="segmented view-switch">
      <button type="button" className={view==='plans'?'active':''} onClick={()=>setView('plans')}>Theo kế hoạch</button>
      <button type="button" className={view==='students'?'active':''} onClick={()=>setView('students')}>Theo học sinh</button>
      <button type="button" className={view==='analytics'?'active':''} onClick={()=>setView('analytics')}>Phân tích</button>
      <button type="button" className={view==='roster'?'active':''} onClick={()=>setView('roster')}>Học sinh</button>
      <button type="button" className={view==='missing'?'active':''} onClick={()=>setView('missing')}>HS chưa đăng ký</button>
      <button type="button" className={view==='schedule'?'active':''} onClick={()=>setView('schedule')}>Lịch tự học</button>
      <button type="button" className={view==='assistants'?'active':''} onClick={()=>setView('assistants')}>Trợ giảng</button>
    </div>

    {view==='schedule'&&<ClassScheduleSettings classId={context.classId} className={context.className}/>}
    {view==='missing'&&<MissingRegistrations classId={context.classId}/>}
    {view==='roster'&&<RosterPanel classId={context.classId} className={context.className} yearName={context.yearName}/>}

    {/* Số liệu MÔ TẢ (không phải việc cần làm) sống ở tab Phân tích. */}
    {view==='analytics'&&<>
      <section className="stats-grid secondary-grid">
        <Stat label="Lượt đăng ký" value={stats.total}/>
        <Stat label="Đã hoàn thành" value={stats.total?`${Math.round(stats.done/stats.total*100)}%`:'0%'}/>
        <Stat label="Đã chấm sao" value={stats.rated}
              onClick={()=>{setView('plans');setFilters({...CLEAR,rating:'da_cham'})}}
              active={filters.rating==='da_cham'}/>
        <Stat label="Đăng ký đúng hạn" value={stats.total?`${Math.round(stats.ontime/stats.total*100)}%`:'0%'}/>
        <Stat label="Điểm trung bình" value={stats.avg!=null?`${stats.avg.toFixed(1)}/5`:'—'}/>
      </section>
      <p className="muted-text small">Năm ô trên tính trên toàn bộ khoảng đang nạp của lớp {context.className} (xem ô “Nạp” ở tab <strong>Theo kế hoạch</strong>), không phụ thuộc bộ lọc. Các biểu đồ bên dưới lấy thẳng từ cơ sở dữ liệu theo khoảng ngày riêng của chúng.</p>
      <ClassAnalytics classId={context.classId} className={context.className}/>
    </>}

    {view==='assistants'&&<AssistantsPanel
      classId={context.classId} perStudent={perStudent} assistants={assistants} onChanged={load}/>}

    {view==='plans'&&<div className="quick-views">
      <span className="muted-text">Xem nhanh:</span>
      {/* Mỗi chip đặt lại bộ lọc rồi bật đúng điều kiện của nó — bấm chip này rồi
          chip kia không cộng dồn thành giao của hai điều kiện. */}
      <QuickChip on={filters.from===todayISO()&&filters.to===todayISO()}
        set={setFilters} f={{from:todayISO(),to:todayISO()}} label="Hôm nay"/>
      <QuickChip on={filters.from===tomorrowISO()&&filters.to===tomorrowISO()}
        set={setFilters} f={{from:tomorrowISO(),to:tomorrowISO()}} label="Ngày mai"/>
      <QuickChip on={filters.device==='co'&&filters.review==='Chờ duyệt'}
        set={setFilters} f={{device:'co',review:'Chờ duyệt'}} label="Thiết bị chờ duyệt"/>
      <QuickChip on={filters.device==='co'&&!filters.review}
        set={setFilters} f={{device:'co'}} label="Có dùng thiết bị"/>
      <QuickChip on={filters.progress==='Trễ hạn cập nhật'}
        set={setFilters} f={{progress:'Trễ hạn cập nhật'}} label="Trễ hạn cập nhật"/>
      <QuickChip on={filters.help==='can_ho_tro'}
        set={setFilters} f={{help:'can_ho_tro'}} label="Đang cần hỗ trợ"/>
      <QuickChip on={filters.rating==='cho_cham'}
        set={setFilters} f={{rating:'cho_cham'}} label="Chờ chấm sao"/>
      <QuickChip on={filters.rating==='da_cham'}
        set={setFilters} f={{rating:'da_cham'}} label="Đã chấm"/>
      <QuickChip on={filters.rating==='sao_thap'}
        set={setFilters} f={{rating:'sao_thap'}} label="Bị 1–2 sao"/>
    </div>}

    {view==='plans'&&<section className="card filters filters-wide">
      <div className="search-box"><Search size={17}/><input value={filters.search} onChange={e=>setFilters({...filters,search:e.target.value})} placeholder="Tìm tên, MSHS, môn, nhiệm vụ…"/></div>
      <select value={windowDays} onChange={e=>setWindowDays(Number(e.target.value))}
              title="Khoảng dữ liệu nạp từ máy chủ — nạp ít thì trang mở nhanh hơn">
        {LOAD_WINDOWS.map(([d,label])=><option key={d} value={d}>Nạp: {label}</option>)}</select>
      <select value={filters.review} onChange={e=>setFilters({...filters,review:e.target.value})} title="Trạng thái duyệt">
        <option value="">Duyệt: tất cả</option><option>Chờ duyệt</option><option>Đã duyệt</option><option>Cần điều chỉnh</option></select>
      <select value={filters.progress} onChange={e=>setFilters({...filters,progress:e.target.value})} title="Tiến độ cập nhật">
        <option value="">Tiến độ: tất cả</option><option>Chưa tới buổi</option><option>Đang chờ cập nhật</option><option>Trễ hạn cập nhật</option><option>Đã hoàn thành</option><option>Hệ thống tự đánh giá</option></select>
      <input type="date" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})} title="Từ ngày"/>
      <input type="date" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})} title="Đến ngày"/>
      <select value={filters.student} onChange={e=>setFilters({...filters,student:e.target.value})}><option value="">Tất cả học sinh</option>{students.map(s=><option key={s.id} value={s.id}>{s.full_name}</option>)}</select>
      <select value={filters.subject} onChange={e=>setFilters({...filters,subject:e.target.value})}><option value="">Tất cả môn</option>{subjects.map(x=><option key={x}>{x}</option>)}</select>
      <select value={filters.period} onChange={e=>setFilters({...filters,period:e.target.value})} title="Tiết">
        <option value="">Tất cả tiết</option>{Array.from({length:9},(_,i)=>i+1).map(n=><option key={n} value={String(n)}>Tiết {n}</option>)}</select>
      <select value={filters.device} onChange={e=>setFilters({...filters,device:e.target.value})} title="Thiết bị">
        <option value="">Thiết bị: tất cả</option><option value="co">Có dùng</option><option value="khong">Không dùng</option></select>
      <select value={filters.rating} onChange={e=>setFilters({...filters,rating:e.target.value})} title="Trạng thái chấm sao">
        <option value="">Chấm sao: tất cả</option>
        <option value="cho_cham">Chờ chấm sao</option>
        <option value="da_cham">Thầy cô đã chấm</option>
        <option value="sao_thap">Bị 1–2 sao</option>
        <option value="tu_dong">Hệ thống tự đánh giá</option></select>
      <select value={filters.help} onChange={e=>setFilters({...filters,help:e.target.value})} title="Nhu cầu hỗ trợ">
        <option value="">Hỗ trợ: tất cả</option><option value="can_ho_tro">Đang cần hỗ trợ</option></select>
      <select value={filters.recheck} onChange={e=>setFilters({...filters,recheck:e.target.value})} title="Học sinh bổ sung sau khi đã chấm">
        <option value="">Bổ sung muộn: tất cả</option><option value="co">Cần chấm lại</option></select>
      <select value={sortBy} onChange={e=>setSortBy(e.target.value)} title="Sắp xếp">
        <option value="date_desc">Ngày học: mới nhất</option><option value="date_asc">Ngày học: cũ nhất</option>
        <option value="created_desc">Đăng ký: mới nhất</option><option value="created_asc">Đăng ký: cũ nhất</option>
        <option value="student_asc">Học sinh A–Z</option><option value="student_desc">Học sinh Z–A</option></select>
      {Object.values(filters).some(Boolean)&&
        <button className="button ghost" onClick={()=>setFilters({...CLEAR})}>Xóa bộ lọc</button>}
    </section>}

    {view==='plans'&&<div className={`bulk-bar sticky ${selectedList.length?'on':''}`}>
      <div>
        {selectedList.length>0
          ? <><strong>{selectedList.length}</strong> kế hoạch được chọn
              {selectedRateable.length>0&&<small className="muted-text"> · {selectedRateable.length} chấm sao được</small>}</>
          : <span className="muted-text">Đang hiển thị <strong>{rows.length}</strong> kế hoạch
              {pendingInView.length>0&&<> · <strong>{pendingInView.length}</strong> chờ duyệt</>}
              {rateableInView.length>0&&<> · <strong>{rateableInView.length}</strong> chờ chấm sao</>}</span>}
      </div>
      <div className="button-row">
        {/* Hai nút "chọn tất cả" tách riêng cho hai việc khác nhau. Gộp một nút
            thì thầy cô chọn nhầm nhóm rồi bấm duyệt/chấm lên đúng nhóm đó. */}
        {selectedList.length===0&&pendingInView.length>0&&
          <button className="button ghost" onClick={selectAllPending}><ClipboardCheck size={17}/> Chọn {pendingInView.length} chờ duyệt</button>}
        {selectedList.length===0&&rateableInView.length>0&&
          <button className="button primary" onClick={selectAllRateable}><Star size={17}/> Chọn {rateableInView.length} chờ chấm sao</button>}
        {selectedList.length>0&&<>
          <button className="button ghost" onClick={()=>setSelectedPlans(new Set())}>Bỏ chọn</button>
          {selectedPending.length>0&&<>
            <button className="button ghost danger" onClick={()=>setBulkAction('Cần điều chỉnh')}>Yêu cầu điều chỉnh</button>
            <button className="button ghost" onClick={()=>setBulkAction('Đã duyệt')}><Check size={17}/> Duyệt {selectedPending.length}</button>
          </>}
          {selectedRateable.length>0&&
            <button className="button primary" onClick={()=>setBulkRate(true)}>
              <Star size={17}/> Chấm sao {selectedRateable.length} tiết</button>}
        </>}
      </div>
    </div>}

    {/* Tình trạng tài khoản thuộc về tab này, không phải trang đầu. */}
    {view==='students'&&<article className="card roster-card">
      <div className="roster-head"><div><span className="eyebrow">TÀI KHOẢN HỌC SINH</span><h3>{claimed} / {rosterTotal} đã đăng ký</h3></div><UsersRound size={24}/></div>
      <div className="roster-progress"><span style={{width:`${rosterTotal?Math.round(claimed/rosterTotal*100):0}%`}}/></div>
      <div className="roster-unclaimed">{unclaimed.length
        ? <>Chưa đăng ký: <strong>{unclaimed.map(x=>x.full_name).join(' · ')}</strong></>
        : '✓ Tất cả học sinh đã tạo tài khoản.'}</div>
      {mustChangeList.length>0&&<div className="roster-unclaimed">
        Đang chờ tự đặt lại mật khẩu: <strong>{mustChangeList.length}</strong> em
      </div>}
    </article>}

    {view==='students'&&<section className="card bulk-bar">
      <div>
        <strong>{selectedRows.length}</strong> học sinh được chọn
        <small className="muted-text"> · chỉ chọn được em đã tạo tài khoản</small>
      </div>
      <button className="button primary" disabled={selectedRows.length===0} onClick={()=>setResetTargets(selectedRows)}>
        <KeyRound size={17}/> Đặt lại mật khẩu {selectedRows.length>0?`(${selectedRows.length})`:''}
      </button>
    </section>}

    {(view==='plans'||view==='students')&&<section className="card table-card">
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
            <span className="cell-with-avatar"><Avatar name={r.name} path={r.avatarPath} size={30}/><span>
              {r.hasAccount
                ? <button className="link-button name-link" onClick={()=>setStudentDetail(r)}>{r.name}</button>
                : <strong>{r.name}</strong>}
              <small>{r.mshs}{r.isTa?' · TA':''}</small>
            </span></span>
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
        <thead><tr>
          <th className="pick"><input type="checkbox" title="Chọn tất cả trên trang này"
            checked={pageRows.length>0&&pageRows.every(p=>selectedPlans.has(p.id))}
            ref={el=>{if(el){const n=pageRows.filter(p=>selectedPlans.has(p.id)).length
              el.indeterminate=n>0&&n<pageRows.length}}}
            onChange={toggleAllPlans}/></th>
          <th>Học sinh</th><th>Ngày / Tiết</th><th>Nội dung</th><th>Duyệt</th><th>Tiến độ</th><th>Thiết bị</th><th>Minh chứng</th><th>Thao tác</th>
        </tr></thead>
        <tbody>{pageRows.map(p=>{
          const s=studentMap[p.student_id]||{};const r=reflections[p.id];const ev=evidence[p.id]||[]
          // Bấm vào bất kỳ đâu trên dòng đều mở chi tiết; các ô có nút riêng thì chặn nổi bọt.
          return <tr key={p.id} className={`${ratingTone(r?.rating)} ${selectedPlans.has(p.id)?'picked':''} clickable`}
                     onClick={()=>setTaskTarget({plan:p,student:s})}>
            <td className="pick" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedPlans.has(p.id)} onChange={()=>togglePlan(p.id)}/></td>
            <td><span className="cell-with-avatar"><Avatar name={s.full_name} path={s.avatar_path} size={30}/>
              <span><strong>{s.full_name}</strong><small>{s.mshs}</small></span></span></td>
            <td>{formatDate(p.study_date)}<small>Tiết {p.period}{p.span===2?`–${p.period+1} (2 tiết)`:''}</small></td>
            <td><button className="link-button task-link" onClick={()=>setTaskTarget({plan:p,student:s})}>{p.subject}</button><small title={p.task}>{p.task}</small></td>
            <td>
              <StatusBadge value={p.review_status}/>
              {p.review_note&&<small title={p.review_note}>{p.review_note}</small>}
              <small className="muted-text">{registrationStatus(p.study_date,p.created_at)}</small>
            </td>
            <td>{r?<>
                <StatusBadge value={r.completion_status}/>
                {status[p.id]?.needs_recheck&&<small className="help-flag">↩ Bổ sung muộn — cần xem lại</small>}
                {r.auto_evaluated&&<small className="auto-tag">hệ thống tự đánh giá</small>}
                {/* Đã nộp kết quả mà chưa có sao thì nói thẳng là đang chờ thầy cô,
                    để không lẫn với tiết đã chấm xong. */}
                {r.rating!=null
                  ? <RatingStars value={r.rating} readOnly size={13}/>
                  : <small className="pill-todo">⏳ chờ chấm sao</small>}
                {r.need_help&&!r.help_resolved&&<small className="help-flag">⚠ Cần hỗ trợ: {r.help_note||''}</small>}
                {r.teacher_comment&&<small className="teacher-comment-mini">💬 {r.teacher_comment}</small>}
              </>:<><span className="muted-text">Chưa cập nhật</span>
                    {status[p.id]?.progress==='Trễ hạn cập nhật'&&<small className="help-flag">⏱ Trễ hạn cập nhật</small>}</>}</td>
            <td onClick={e=>e.stopPropagation()}>{p.use_device?<div className="device-cell">
                <span title={p.device_purpose}>💻</span> <StatusBadge value={p.device_status}/>
                {p.device_status==='Chờ duyệt'&&<span className="device-actions">
                  <button className="icon-button success" title="Duyệt" onClick={()=>reviewDevice(p,'Đã duyệt')}><Check size={15}/></button>
                  <button className="icon-button danger" title="Từ chối" onClick={()=>reviewDevice(p,'Từ chối')}><X size={15}/></button>
                </span>}
              </div>:'—'}</td>
            <td onClick={e=>e.stopPropagation()}>{ev.length?ev.map(x=><button key={x.id} className="mini-link" onClick={()=>openEvidence(x)}>{x.kind==='link'?'🔗':x.kind==='text'?'📝':'📎'}<ExternalLink size={12}/></button>):'—'}</td>
            <td onClick={e=>e.stopPropagation()}><button className="icon-button" title="Xem chi tiết và chấm sao" onClick={()=>setTaskTarget({plan:p,student:s})}><MessageSquareQuote size={16}/></button></td>
          </tr>})}</tbody>
      </table>{rows.length===0&&<div className="empty-state">Không có dữ liệu phù hợp bộ lọc.</div>}</div>}

      {view==='plans'&&rows.length>PAGE_SIZE&&<div className="pager">
        <button className="button ghost" disabled={page===1} onClick={()=>setPage(p=>p-1)}>← Trước</button>
        <span>Trang <strong>{page}</strong> / {totalPages} · {rows.length} kế hoạch</span>
        <button className="button ghost" disabled={page===totalPages} onClick={()=>setPage(p=>p+1)}>Sau →</button>
      </div>}
    </section>}

    {bulkRate&&<BulkRateModal plans={selectedRateable} students={studentMap} reflections={reflections}
      onClose={()=>setBulkRate(false)}
      onDone={()=>{setBulkRate(false);setSelectedPlans(new Set());load()}}/>}

    {bulkAction&&<BulkReviewModal action={bulkAction} plans={selectedList} studentMap={studentMap}
      onClose={()=>setBulkAction(null)}
      onDone={()=>{setBulkAction(null);setSelectedPlans(new Set());load()}}/>}
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

// Duyệt / trả về điều chỉnh cho nhiều kế hoạch trong MỘT lệnh gọi CSDL.
function BulkReviewModal({action,plans,studentMap,onClose,onDone}){
  const approve=action==='Đã duyệt'
  const [note,setNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  // Bỏ qua kế hoạch đã ở đúng trạng thái — nói rõ để thầy cô không hiểu nhầm phạm vi.
  const eligible=plans.filter(p=>p.review_status!==action)
  const skipped=plans.length-eligible.length

  const run=async()=>{
    if(!approve&&!note.trim())return setMsg('Hãy ghi ngắn gọn em cần điều chỉnh gì.')
    setBusy(true);setMsg('')
    const {data,error}=await supabase.rpc('bulk_review_plans',{
      p_plan_ids:eligible.map(p=>p.id), p_status:action, p_note:approve?null:note.trim(),
    })
    setBusy(false)
    if(error)return setMsg('Không thể lưu. '+(error.message||''))
    const done=data?.da_xu_ly??0
    window.alert(`✓ Đã ${approve?'duyệt':'gửi yêu cầu điều chỉnh cho'} ${done} kế hoạch. Học sinh liên quan đã nhận thông báo.`)
    onDone()
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}>
    <div className="modal-head">
      <div><span className="eyebrow">{approve?'DUYỆT KẾ HOẠCH':'YÊU CẦU ĐIỀU CHỈNH'}</span>
        <h2>{eligible.length} kế hoạch</h2></div>
      <button className="icon-button" onClick={onClose}>✕</button>
    </div>

    <div className="notice compact"><Check size={17}/><span>
      {eligible.length} kế hoạch sẽ chuyển sang <strong>{action}</strong> và học sinh liên quan nhận được thông báo.
      {skipped>0&&<> {skipped} kế hoạch đã ở trạng thái này nên được bỏ qua.</>}
    </span></div>

    <ul className="target-list">{eligible.slice(0,12).map(p=><li key={p.id}>
      <strong>{studentMap[p.student_id]?.full_name||'—'}</strong>
      <small>{formatDate(p.study_date)} · Tiết {p.period} · {p.subject}</small>
    </li>)}
    {eligible.length>12&&<li className="muted-text">… và {eligible.length-12} kế hoạch nữa</li>}</ul>

    {!approve&&<>
      <label>Em cần điều chỉnh gì? *</label>
      <textarea rows="3" maxLength={500} value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Ví dụ: Nhiệm vụ còn chung chung, em ghi rõ làm bài nào, trang bao nhiêu."/>
      <p className="muted-text small">Nội dung này gửi thẳng tới học sinh. Khi em sửa lại kế hoạch, nó tự quay về hàng chờ duyệt.</p>
    </>}

    {msg&&<div className="form-error">{msg}</div>}
    <div className="form-actions">
      <button className="button ghost" onClick={onClose}>Hủy</button>
      <button className="button primary" onClick={run} disabled={busy||eligible.length===0}>
        {busy?'Đang lưu…':approve?`Duyệt ${eligible.length} kế hoạch`:`Gửi yêu cầu cho ${eligible.length} kế hoạch`}
      </button>
    </div>
  </div></div>
}

function downloadCsv(lines,filename){
  const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();URL.revokeObjectURL(a.href)
}

// Chấm sao cho cả nhóm tiết đã chọn.
//
// Mặc định KHÔNG đè lên sao thầy cô đã chấm trước đó — thầy cô chọn 25 dòng mà 3
// dòng đã có 5 sao rồi bấm "chấm 4 sao", hạ điểm 3 em đó xuống là chuyện không
// ai ngờ tới. Muốn đè thì phải tick riêng một ô, và ô đó nói rõ sẽ đè lên mấy tiết.
function BulkRateModal({plans,students,reflections,onClose,onDone}){
  // null chứ không phải 0: RatingStars hiện nhãn khi value khác null, nên khởi
  // tạo bằng 0 sẽ hiện "0/5 ·" trước cả khi thầy cô chọn gì.
  const [rating,setRating]=useState(null)
  const [comment,setComment]=useState('')
  const [overwrite,setOverwrite]=useState(false)
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState('')
  const [result,setResult]=useState(null)

  // Nhóm đang bị hệ thống tự chấm 1 sao — đây thường là lý do chính thầy cô vào đây.
  const tuDong=plans.filter(p=>reflections[p.id]?.auto_evaluated)
  const daCham=plans.filter(p=>{const r=reflections[p.id];return r&&r.rating!=null&&!r.auto_evaluated})

  const run=async()=>{
    if(!rating)return setMsg('Chọn số sao trước đã.')
    setBusy(true);setMsg('')
    const {data,error}=await supabase.rpc('bulk_rate_reflections',{
      p_plan_ids:plans.map(p=>p.id), p_rating:rating,
      p_comment:comment.trim()||null, p_overwrite:overwrite,
    })
    setBusy(false)
    if(error)return setMsg('Không chấm được: '+error.message)
    setResult(data)
  }

  if(result)return <div className="modal-backdrop" onMouseDown={onDone}>
    <div className="modal small" onMouseDown={e=>e.stopPropagation()}>
      <div className="modal-head"><div><span className="eyebrow">KẾT QUẢ</span>
        <h2>Đã chấm {result.da_cham} tiết</h2></div></div>
      <ul className="summary-tasks">
        <li>Đã chấm <strong>{result.da_cham}</strong> tiết {result.so_sao} sao.</li>
        {result.bo_qua_da_cham>0&&<li><em>Bỏ qua {result.bo_qua_da_cham} tiết đã có sao thầy cô chấm trước đó.</em></li>}
        {result.chua_co_ket_qua>0&&<li><em>Bỏ qua {result.chua_co_ket_qua} tiết học sinh chưa cập nhật kết quả.</em></li>}
      </ul>
      <div className="form-actions"><button className="button primary" onClick={onDone}>Xong</button></div>
    </div></div>

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="modal-head">
        <div><span className="eyebrow">CHẤM SAO HÀNG LOẠT</span>
          <h2>{plans.length} tiết được chọn</h2>
          <p className="muted-text">Cùng một số sao cho cả nhóm. Tiết nào cần nhận xét riêng
             thì thầy cô mở lẻ tiết đó sau.</p></div>
        <button className="icon-button" onClick={onClose}>✕</button>
      </div>

      {tuDong.length>0&&<div className="notice compact"><Star size={16}/><span>
        Trong đó có <strong>{tuDong.length} tiết bị hệ thống tự chấm 1 sao</strong> do quá hạn —
        chấm ở đây sẽ ghi đè lên điểm tự động đó.
      </span></div>}

      <label>Số sao cho cả nhóm</label>
      <RatingStars value={rating} onChange={setRating} size={30}/>

      <label>Nhận xét chung (không bắt buộc)</label>
      <textarea rows={3} value={comment} onChange={e=>setComment(e.target.value)}
        placeholder="Cả lớp làm việc nghiêm túc trong tiết này."/>
      <p className="muted-text small">Để trống thì nhận xét cũ của từng tiết được giữ nguyên,
         không bị xoá đi.</p>

      {daCham.length>0&&<div className="toggle-row compact">
        <label className="switch">
          <input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/><span/>
        </label>
        <div><strong>Chấm đè lên {daCham.length} tiết thầy cô đã chấm</strong>
          <small>{overwrite
            ? 'Đang BẬT — điểm cũ của những tiết đó sẽ bị thay bằng số sao ở trên.'
            : 'Đang TẮT — những tiết đã có sao sẽ được giữ nguyên.'}</small></div>
      </div>}

      <div className="detail-box">
        <strong>Sẽ chấm cho</strong>
        <p className="muted-text small">{plans.slice(0,12).map(p=>students[p.student_id]?.full_name??'?').join(' · ')}
          {plans.length>12?` … +${plans.length-12} tiết nữa`:''}</p>
      </div>

      {msg&&<div className="form-error">{msg}</div>}
      <div className="form-actions">
        <button className="button ghost" onClick={onClose}>Huỷ</button>
        <button className="button primary large" disabled={busy||!rating} onClick={run}>
          <Star size={17}/> {busy?'Đang chấm…':`Chấm ${rating||''} sao cho ${plans.length} tiết`}</button>
      </div>
    </div>
  </div>
}

function Stat({label,value,alert,onClick,active}){
  // Ô bằng 0 thì làm mờ đi: hộp 8 ô mà 6 ô rỗng phải đọc ra là "gần như không
  // còn việc gì", chứ không phải 8 con số ngang hàng nhau.
  const zero=value===0||value==='0'||value==='0%'
  const cls=`stat-card ${alert?'alert':''} ${zero?'zero':''} ${onClick?'clickable':''} ${active?'active':''}`
  if(!onClick)return <div className={cls}><span>{label}</span><strong>{value}</strong></div>
  return <button type="button" className={cls} onClick={onClick} aria-pressed={!!active}>
    <span>{label}</span><strong>{value}</strong></button>
}

// Chip xem nhanh: luôn đặt lại toàn bộ bộ lọc rồi mới bật điều kiện của mình.
// Bấm lần nữa vào chip đang bật thì tắt, quay về xem tất cả.
function QuickChip({on,set,f,label}){
  return <button type="button" className={`chip-btn ${on?'on':''}`}
    onClick={()=>set(on?{...CLEAR}:{...CLEAR,...f})} aria-pressed={on}>{label}</button>
}

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

  const review=async(status)=>{
    let note=null
    if(status==='Cần điều chỉnh'){
      note=window.prompt('Em cần điều chỉnh gì? (gửi thẳng tới học sinh)')
      if(!note||!note.trim())return
    }
    setBusy(true);setMsg('')
    const {data,error}=await supabase.rpc('bulk_review_plans',
      {p_plan_ids:[plan.id],p_status:status,p_note:note?note.trim():null})
    setBusy(false)
    if(error||!data?.da_xu_ly)return setMsg('Không thể cập nhật trạng thái duyệt.')
    onSaved()
  }

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

    <div className="review-actions">
      {plan.review_status!=='Đã duyệt'&&
        <button className="button primary" onClick={()=>review('Đã duyệt')} disabled={busy}><Check size={16}/> Duyệt kế hoạch</button>}
      {plan.review_status!=='Cần điều chỉnh'&&
        <button className="button ghost danger" onClick={()=>review('Cần điều chỉnh')} disabled={busy}>Yêu cầu điều chỉnh</button>}
      {plan.review_status==='Đã duyệt'&&<span className="muted-text small">Đã duyệt — có thể chấm sao và nhận xét bên dưới.</span>}
    </div>

    <div className="detail-box">
      <strong>Nhiệm vụ</strong><p>{plan.task}</p>
      <strong>Mục tiêu</strong><p>{plan.goal}</p>
      <div className="detail-inline">
        <span>Duyệt: <StatusBadge value={plan.review_status}/></span>
        <span>Ưu tiên: <StatusBadge value={plan.priority}/></span>
        <span>Đăng ký: <StatusBadge value={registrationStatus(plan.study_date,plan.created_at)}/></span>
        {plan.use_device&&<span>Thiết bị: <StatusBadge value={plan.device_status}/></span>}
      </div>
      {plan.review_note&&<><strong>Yêu cầu điều chỉnh đã gửi</strong><p>{plan.review_note}</p></>}
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
          {x.kind==='link'?'🔗':x.kind==='text'?'📝':'📎'} {x.kind==='text'?(x.body_text||'').slice(0,80):(x.display_name||'Minh chứng')} {x.kind!=='text'&&<ExternalLink size={14}/>}
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
  const [tab,setTab]=useState('history')
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

    <div className="segmented view-switch">
      <button type="button" className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử tiết tự học</button>
      <button type="button" className={tab==='analytics'?'active':''} onClick={()=>setTab('analytics')}>Phân tích số liệu</button>
    </div>

    {tab==='analytics'
      ? (row.hasAccount
          ? <StudentAnalytics studentId={row.id} name={row.name} embedded/>
          : <div className="empty-state">Em này chưa tạo tài khoản nên chưa có số liệu.</div>)
      : <>
    <div className="section-title"><div><h3>Lịch sử tiết tự học</h3><p>Bấm vào một tiết để xem chi tiết và chấm sao.</p></div>
      <button className="button ghost" onClick={onChat}><MessageSquare size={16}/> Nhắn tin</button></div>

    <div className="table-wrap detail-history"><table>
      <thead><tr><th>Ngày / Tiết</th><th>Môn</th><th>Nhiệm vụ</th><th>Kết quả</th><th>Sao</th></tr></thead>
      <tbody>{mine.map(p=>{
        const r=reflections[p.id]
        return <tr key={p.id} className={`clickable ${ratingTone(r?.rating)}`} onClick={()=>onOpenTask(p)}>
          <td>{formatDate(p.study_date)}<small>Tiết {p.period}{p.span===2?`–${p.period+1} (2 tiết)`:''}</small></td>
          <td>{p.subject}</td>
          <td><small title={p.task}>{p.task}</small></td>
          <td>{r?<StatusBadge value={r.completion_status}/>:<span className="muted-text">Chưa cập nhật</span>}</td>
          <td>{r?.rating!=null?<RatingStars value={r.rating} readOnly size={13}/>:'—'}</td>
        </tr>
      })}</tbody>
    </table>{mine.length===0&&<div className="empty-state">Em này chưa đăng ký tiết tự học nào.</div>}</div>
    </>}
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
  ['can_approve_plan','Duyệt kế hoạch','Kể cả duyệt hàng loạt — hệ thống ghi rõ ai duyệt'],
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
