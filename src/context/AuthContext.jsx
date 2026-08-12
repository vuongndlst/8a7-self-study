import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const EMPTY_CONTEXT = { className: '', yearName: '', classId: null }

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [context, setContext] = useState(EMPTY_CONTEXT)
  // Quyền trợ giảng của chính người đang đăng nhập (null = không phải TA).
  const [assistant, setAssistant] = useState(null)
  const [recovery, setRecovery] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (user) => {
    if (!user) { setProfile(null); setContext(EMPTY_CONTEXT); setAssistant(null); return }

    const { data } = await supabase
      .from('profiles')
      .select('id,role,mshs,full_name,must_change_password,avatar_path')
      .eq('id', user.id)
      .maybeSingle()
    setProfile(data ?? null)
    if (!data) return

    if (data.role === 'teacher') {
      const { data: rows } = await supabase
        .from('class_teachers')
        .select('class_id, classes!inner(id,name,school_years!inner(name,is_active))')
      const active = (rows ?? []).find((r) => r.classes?.school_years?.is_active) ?? rows?.[0]
      setContext({
        classId: active?.classes?.id ?? null,
        className: active?.classes?.name ?? '',
        yearName: active?.classes?.school_years?.name ?? '',
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

  const value = useMemo(() => ({
    session,
    profile,
    context,
    assistant,
    isAssistant: !!assistant,
    recovery,
    loading,
    clearRecovery: () => setRecovery(false),
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }), [session, profile, context, assistant, recovery, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
