import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useUser } from './contexts/UserContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import PageWrapper from './components/layout/PageWrapper';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import {
  PlatformDashboardPage,
  PlatformTenantsPage,
  PlatformTenantDetailPage,
  PlatformNewTenantPage,
  PlatformUsagePage,
  PlatformSettingsPage,
} from './pages/platform';
import { Loader2 } from 'lucide-react';

function PlatformLayout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <PageWrapper>{children}</PageWrapper>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isPlatformOwner, profileLoading } = useUser();

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!isPlatformOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-light-bg text-center px-4">
        <img src="/alf-logo.jpg" alt="Alf" className="w-16 h-16 rounded-full mb-4" />
        <h2 className="text-xl font-semibold text-dark-text mb-2">Access Denied</h2>
        <p className="text-sm text-secondary-text max-w-md mb-6">
          This portal is restricted to platform owners. If you believe this is an error, contact the platform administrator.
        </p>
      </div>
    );
  }

  return children;
}

export default function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-light-bg">
        <Loader2 size={32} className="text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <Routes>
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <ProtectedRoute>
      <PlatformLayout>
        <Routes>
          <Route path="/" element={<PlatformDashboardPage />} />
          <Route path="/platform/tenants" element={<PlatformTenantsPage />} />
          <Route path="/platform/tenants/new" element={<PlatformNewTenantPage />} />
          <Route path="/platform/tenants/:id" element={<PlatformTenantDetailPage />} />
          <Route path="/platform/usage" element={<PlatformUsagePage />} />
          <Route path="/platform/settings" element={<PlatformSettingsPage />} />
          {/* Redirects from old routes */}
          <Route path="/platform/config" element={<Navigate to="/platform/settings" replace />} />
          <Route path="/platform/agents" element={<Navigate to="/platform/settings" replace />} />
          <Route path="/platform/templates" element={<Navigate to="/platform/settings" replace />} />
          <Route path="/platform/brand" element={<Navigate to="/platform/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PlatformLayout>
    </ProtectedRoute>
  );
}
