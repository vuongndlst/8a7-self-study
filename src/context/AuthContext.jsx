import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [context, setContext] = useState({ className: '', yearName: '', classId: null })
  const [recovery, setRecovery] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (user) => {
    if (!user) { setProfile(null); setContext({ className: '', yearName: '', classId: null }); return }

    const { data } = await supabase
      .from('profiles')
      .select('id,role,mshs,full_name,must_change_password')
      .eq('id', user.id)
      .maybeSingle()
    setProfile(data ?? null)
    if (!data) return

    // Lớp / năm học hiện hành — dùng cho tiêu đề và bộ lọc, không phải để phân quyền.
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
    recovery,
    loading,
    clearRecovery: () => setRecovery(false),
    refreshProfile: () => loadProfile(session?.user),
    signOut: () => supabase.auth.signOut(),
  }), [session, profile, context, recovery, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
