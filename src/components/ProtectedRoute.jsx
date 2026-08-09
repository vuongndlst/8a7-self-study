import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
export default function ProtectedRoute({role,children}) {
  const {loading,profile}=useAuth()
  if (loading) return <div className="page"><div className="card">Đang kiểm tra phiên đăng nhập…</div></div>
  if (!profile) return <Navigate to="/login" replace/>
  if (role && profile.role!==role) return <Navigate to={profile.role==='teacher'?'/teacher':'/student'} replace/>
  return children
}
