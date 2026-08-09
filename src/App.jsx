import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import GuidePage from './pages/GuidePage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import StudentPage from './pages/StudentPage'
import TeacherPage from './pages/TeacherPage'
import NotFoundPage from './pages/NotFoundPage'
export default function App(){return <Layout><Routes>
<Route path="/" element={<HomePage/>}/><Route path="/guide" element={<GuidePage/>}/><Route path="/register" element={<RegisterPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/student" element={<ProtectedRoute role="student"><StudentPage/></ProtectedRoute>}/><Route path="/teacher" element={<ProtectedRoute role="teacher"><TeacherPage/></ProtectedRoute>}/><Route path="*" element={<NotFoundPage/>}/>
</Routes></Layout>}
