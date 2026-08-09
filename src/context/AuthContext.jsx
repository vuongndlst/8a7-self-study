import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
const AuthContext = createContext(null)
export function AuthProvider({children}) {
  const [session,setSession] = useState(null)
  const [profile,setProfile] = useState(null)
  const [loading,setLoading] = useState(true)
  const loadProfile = async (user) => {
    if (!user) { setProfile(null); return }
    const {data} = await supabase.from('profiles').select('id,role,mshs,full_name').eq('id',user.id).maybeSingle()
    setProfile(data ?? null)
  }
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({data}) => {
      if (!active) return
      setSession(data.session); await loadProfile(data.session?.user); if (active) setLoading(false)
    })
    const {data: sub} = supabase.auth.onAuthStateChange(async (_event,next) => {
      setSession(next); await loadProfile(next?.user); setLoading(false)
    })
    return () => { active=false; sub.subscription.unsubscribe() }
  },[])
  const value = useMemo(() => ({session,profile,loading,refreshProfile:()=>loadProfile(session?.user),signOut:()=>supabase.auth.signOut()}),[session,profile,loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
