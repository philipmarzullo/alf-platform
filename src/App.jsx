import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useUser } from './contexts/UserContext';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import PageWrapper from './components/layout/PageWrapper';
import AskAlfButton from './components/shared/AskAlfButton';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import {
  PlatformDashboardPage,
  PlatformTenantsPage,
  PlatformTenantDetailPage,
  PlatformNewTenantPage,
  PlatformAgentsPage,
  PlatformAgentDetailPage,
  PlatformUsagePage,
  PlatformSettingsPage,
  PlatformBackupsPage,
} from './pages/platform';
import { Loader2 } from 'lucide-react';
import AlfMark from './components/shared/AlfMark';

function usePageContext() {
  const { pathname } = useLocation();
  if (pathname === '/') return 'Dashboard — platform overview with tenant and usage summaries';
  if (pathname === '/platform/tenants') return 'Tenants list — managing all tenant organizations';
  if (pathname.startsWith('/platform/tenants/')) return 'Tenant detail — viewing a specific tenant\'s config, users, agents, API keys, and branding';
  if (pathname === '/platform/agents') return 'Agents — managing global agent definitions, models, and system prompts';
  if (pathname.startsWith('/platform/agents/')) return 'Agent detail — editing agent config, viewing tenant assignments';
  if (pathname === '/platform/usage') return 'Usage — viewing agent call logs and token consumption';
  if (pathname === '/platform/backups') return 'Backups — platform-wide and per-tenant backup management';
  if (pathname === '/platform/settings') return 'Settings — platform config, API keys, and platform user management';
  return 'Alf Platform';
}

function PlatformLayout({ children }) {
  const pageContext = usePageContext();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <PageWrapper>{children}</PageWrapper>
      </div>
      <AskAlfButton pageContext={pageContext} />
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isPlatformOwner, profileLoading } = useUser();

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={24} className="text-alf-orange animate-spin" />
      </div>
    );
  }

  if (!isPlatformOwner) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-light-bg text-center px-4">
        <AlfMark variant="light" size="md" className="mb-4" />
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
        <Loader2 size={32} className="text-alf-orange animate-spin" />
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
          <Route path="/platform/agents" element={<PlatformAgentsPage />} />
          <Route path="/platform/agents/:agentKey" element={<PlatformAgentDetailPage />} />
          <Route path="/platform/usage" element={<PlatformUsagePage />} />
          <Route path="/platform/backups" element={<PlatformBackupsPage />} />
          <Route path="/platform/settings" element={<PlatformSettingsPage />} />
          {/* Redirects from old routes */}
          <Route path="/platform/config" element={<Navigate to="/platform/settings" replace />} />
          {/* /platform/agents is now a real route, redirect removed */}
          <Route path="/platform/templates" element={<Navigate to="/platform/settings" replace />} />
          <Route path="/platform/brand" element={<Navigate to="/platform/settings" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PlatformLayout>
    </ProtectedRoute>
  );
}
