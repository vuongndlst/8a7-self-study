import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PasswordGate from './components/PasswordGate'
import GuidePage from './pages/GuidePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import StudentPage from './pages/StudentPage'
import TeacherPage from './pages/TeacherPage'
import TaPage from './pages/TaPage'
import AdminPage from './pages/AdminPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { recovery, profile } = useAuth()

  // Link khôi phục từ email đưa người dùng về gốc site, không theo route nào cả —
  // nên bắt ở đây thay vì trong router.
  if (recovery && profile) return <Layout><PasswordGate mode="recovery" /></Layout>

  return <Layout>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/guide" element={<GuidePage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/student" element={<ProtectedRoute role="student"><StudentPage /></ProtectedRoute>} />
      <Route path="/ta" element={<ProtectedRoute role="student"><TaPage /></ProtectedRoute>} />
      <Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherPage /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute role="admin"><AdminPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  </Layout>
}
