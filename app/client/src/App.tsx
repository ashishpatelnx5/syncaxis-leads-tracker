import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ThemeProvider } from './theme/ThemeContext';
import { LEADS_PERM } from './permissions';
import { LoginPage } from './pages/LoginPage';
import { SsoCallbackPage } from './pages/SsoCallbackPage';
import { Sidebar } from './components/Sidebar';
import { Logo } from './components/Logo';
import { DashboardPage } from './pages/DashboardPage';
import { TeamPerformancePage } from './pages/TeamPerformancePage';
import { LeadsListPage } from './pages/LeadsListPage';
import { LeadFormPage } from './pages/LeadFormPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { CustomersListPage } from './pages/CustomersListPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { AdminLeadsPage } from './pages/AdminLeadsPage';
import { AdminCustomersPage } from './pages/AdminCustomersPage';

function AppShell() {
  const { authenticated, checking, user, can } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Checked before anything else, including the session-loading state below -
  // a handoff code from the Portal makes its own sign-in decision regardless
  // of whatever session (or lack of one) already exists here.
  if (new URLSearchParams(window.location.search).has('ssoCode')) return <SsoCallbackPage />;

  if (checking) return <div className="auth-checking">Loading...</div>;
  if (!authenticated) return <LoginPage />;

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className="app-content">
          <header className="mobile-topbar">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
            <Logo />
          </header>
          <main className="app-main">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/team-performance" element={<TeamPerformancePage />} />
              <Route path="/leads" element={<LeadsListPage />} />
              <Route path="/leads/new" element={can(LEADS_PERM.LEADS_CREATE) ? <LeadFormPage /> : <Navigate to="/leads" replace />} />
              <Route path="/leads/:id" element={<LeadDetailPage />} />
              <Route path="/leads/:id/edit" element={can(LEADS_PERM.LEADS_UPDATE) ? <LeadFormPage /> : <Navigate to="/leads" replace />} />
              <Route path="/customers" element={<CustomersListPage />} />
              <Route path="/customers/new" element={can(LEADS_PERM.CUSTOMERS_CREATE) ? <CustomerFormPage /> : <Navigate to="/customers" replace />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/customers/:id/edit" element={can(LEADS_PERM.CUSTOMERS_UPDATE) ? <CustomerFormPage /> : <Navigate to="/customers" replace />} />
              <Route path="/admin" element={<Navigate to="/admin/leads" replace />} />
              <Route path="/admin/leads" element={user?.isAdmin ? <AdminLeadsPage /> : <Navigate to="/" replace />} />
              <Route path="/admin/customers" element={user?.isAdmin ? <AdminCustomersPage /> : <Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
