import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const EMPTY_CONTEXT = { className: '', yearName: '', classId: null, gradeLevel: null }
// Chỉ là tiện lợi: nhớ lớp đã xem lần trước. Quyền vẫn do my_classes() quyết định.
const CLASS_KEY = 'selfstudy.selectedClass'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [context, setContext] = useState(EMPTY_CONTEXT)
  // Quyền trợ giảng của chính người đang đăng nhập (null = không phải TA).
  const [assistant, setAssistant] = useState(null)
  // Các lớp giáo viên được phép làm việc trong năm hiện tại (từ my_classes()).
  const [classes, setClasses] = useState([])
  const [recovery, setRecovery] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (user) => {
    if (!user) { setProfile(null); setContext(EMPTY_CONTEXT); setAssistant(null); setClasses([]); return }

    const { data } = await supabase
      .from('profiles')
      .select('id,role,mshs,full_name,must_change_password,avatar_path,approval_status,rejected_reason,email')
      .eq('id', user.id)
      .maybeSingle()
    setProfile(data ?? null)
    if (!data) return

    // Quản trị viên ở trường này cũng chủ nhiệm một lớp, nên vẫn nạp bối cảnh lớp.
    if (data.role === 'teacher' || data.role === 'admin') {
      // Giáo viên chưa được duyệt thì RLS trả rỗng — đừng gọi cho tốn request.
      if (data.role === 'teacher' && data.approval_status !== 'approved') {
        setContext(EMPTY_CONTEXT); setAssistant(null); setClasses([]); return
      }
      // my_classes() là nguồn duy nhất quyết định "thầy/cô được vào lớp nào",
      // và nó đã lọc sẵn theo năm hiện tại + phân công còn hiệu lực.
      const { data: rows } = await supabase.rpc('my_classes')
      const list = rows ?? []
      setClasses(list)
      // Nhớ lớp đã chọn lần trước, nhưng chỉ chấp nhận nếu nó vẫn nằm trong
      // danh sách được phép — localStorage không phải nơi giữ quyền.
      const remembered = list.find((c) => c.class_id === localStorage.getItem(CLASS_KEY))
      const active = remembered ?? list[0]
      setContext({
        classId: active?.class_id ?? null,
        className: active?.class_name ?? '',
        yearName: active?.year_name ?? '',
        gradeLevel: active?.grade_level ?? null,
      })
      setAssistant(null)
    } else {
      const { data: rows } = await supabase
        .from('enrollments')
        .select('class_id, classes!inner(id,name,school_years!inner(name,is_active))')
        .eq('is_active', true)
      const active = (rows ?? []).find((r) => r.classes?.school_years?.is_active)
      setContext({
        classId: active?.class_id ?? null,
        className: active?.classes?.name ?? '',
        yearName: active?.classes?.school_years?.name ?? '',
      })

      // Em này có được cử làm trợ giảng không, và được bật những quyền nào.
      const { data: ta } = await supabase
        .from('class_assistants')
        .select('*')
        .eq('student_id', user.id)
        .maybeSingle()
      setAssistant(ta ?? null)
    }
  }

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadProfile(data.session?.user)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
      setSession(next)
      await loadProfile(next?.user)
      setLoading(false)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  // Đổi lớp đang xem. Chỉ chấp nhận lớp nằm trong danh sách được phép.
  const selectClass = (classId) => {
    const c = classes.find((x) => x.class_id === classId)
    if (!c) return
    localStorage.setItem(CLASS_KEY, classId)
    setContext({ classId: c.class_id, className: c.class_name, yearName: c.year_name, gradeLevel: c.grade_level })
  }

  const value = useMemo(() => ({
    session,
    profile,
    context,
    classes,
    selectClass,
    assistant,
    isAssistant: !!assistant,
    isAdmin: profile?.role === 'admin',
    isStaff: profile?.role === 'admin' || profile?.role === 'teacher',
    recovery,
    loading,
    clearRecovery: () => setRecovery(false),
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }), [session, profile, context, classes, assistant, recovery, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
