import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
export default function NotFoundPage(){return <div className="page auth-page"><div className="card auth-card elevated" style={{textAlign:'center'}}><span className="pill-label">404</span><h2 style={{marginTop:16}}>Không tìm thấy trang</h2><p className="muted-text">Đường dẫn này không tồn tại hoặc đã được thay đổi.</p><Link className="button primary full" to="/"><ArrowLeft size={17}/> Về trang chủ</Link></div></div>}
