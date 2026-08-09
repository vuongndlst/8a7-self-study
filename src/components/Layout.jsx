import { BookOpen, Home, LogIn, LogOut, ShieldCheck } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Nhãn lớp hiển thị ở góc trái. Sang lớp/năm khác chỉ cần đổi biến môi trường.
const BRAND_MARK = import.meta.env.VITE_BRAND_MARK || '8A7'

export default function Layout({children}) {
  const {profile,signOut}=useAuth()
  const navigate=useNavigate()
  const location=useLocation()
  const logout=async()=>{await signOut();navigate('/')}
  const active=(path)=>location.pathname===path
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/"><span className="brand-mark">{BRAND_MARK}</span><span><strong>Self-Study</strong><small>Plan · Do · Reflect</small></span></Link>
      <nav>
        <Link className={active('/')?'active':''} to="/"><Home size={17}/> <span>Trang chủ</span></Link>
        <Link className={active('/guide')?'active':''} to="/guide"><BookOpen size={17}/> <span>Hướng dẫn</span></Link>
        {profile?.role==='student'&&<Link className={active('/student')?'active':''} to="/student"><span>Kế hoạch của em</span></Link>}
        {profile?.role==='teacher'&&<Link className={active('/teacher')?'active':''} to="/teacher"><ShieldCheck size={17}/> <span>Dashboard</span></Link>}
        {!profile&&<Link className="nav-login" to="/login"><LogIn size={17}/> <span>Đăng nhập</span></Link>}
        {profile&&<button className="nav-button" onClick={logout}><LogOut size={17}/> <span>Đăng xuất</span></button>}
      </nav>
    </header>
    <main>{children}</main>
    <footer><strong>{BRAND_MARK} Self-Study</strong><span>Hệ thống hỗ trợ lập kế hoạch và phản tư giờ tự học.</span></footer>
  </div>
}
