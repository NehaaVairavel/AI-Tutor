import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute, AdminRoute, PublicRoute } from './components/common/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';

// Public pages
import Landing from './pages/Landing';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import NotFound from './pages/NotFound';

// Student pages
import Dashboard from './pages/Dashboard';
import Practice from './pages/Practice';
import PracticeSession from './pages/PracticeSession';
import PracticeResult from './pages/PracticeResult';
import PracticeReview from './pages/PracticeReview';
import Mistakes from './pages/Mistakes';
import AiTutor from './pages/AiTutor';
import Analytics from './pages/Analytics';
import StudyPlan from './pages/StudyPlan';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminExams from './pages/admin/AdminExams';
import AdminQuestions from './pages/admin/AdminQuestions';
import AdminUsers from './pages/admin/AdminUsers';
import AdminUserDetail from './pages/admin/AdminUserDetail';


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ─── Public Routes ───────────────────────────────── */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

          {/* ─── Student Routes (authenticated) ─────────────── */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/practice/session/:sessionId" element={<PracticeSession />} />
            <Route path="/practice/result/:sessionId" element={<PracticeResult />} />
            <Route path="/practice/review/:sessionId" element={<PracticeReview />} />
            <Route path="/mistakes" element={<Mistakes />} />
            {/* Mock Tests hidden from users — redirect to Practice */}
            <Route path="/mock-tests" element={<Navigate to="/practice" replace />} />
            <Route path="/mock-tests/*" element={<Navigate to="/practice" replace />} />
            <Route path="/ai-tutor" element={<AiTutor />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/study-plan" element={<StudyPlan />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* ─── Admin Routes ─────────────────────────────────── */}
          <Route element={<AdminRoute><AppLayout /></AdminRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/exams" element={<AdminExams />} />
            <Route path="/admin/questions" element={<AdminQuestions />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/users/:id" element={<AdminUserDetail />} />
          </Route>

          {/* ─── 404 ──────────────────────────────────────────── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
