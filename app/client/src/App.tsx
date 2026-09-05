import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { Sidebar } from './components/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsListPage } from './pages/LeadsListPage';
import { LeadFormPage } from './pages/LeadFormPage';
import { LeadDetailPage } from './pages/LeadDetailPage';
import { CustomersListPage } from './pages/CustomersListPage';
import { CustomerFormPage } from './pages/CustomerFormPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';

function AppShell() {
  const { authenticated, checking } = useAuth();

  if (checking) return <div className="auth-checking">Loading...</div>;
  if (!authenticated) return <LoginPage />;

  return (
    <BrowserRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsListPage />} />
            <Route path="/leads/new" element={<LeadFormPage />} />
            <Route path="/leads/:id" element={<LeadDetailPage />} />
            <Route path="/leads/:id/edit" element={<LeadFormPage />} />
            <Route path="/customers" element={<CustomersListPage />} />
            <Route path="/customers/new" element={<CustomerFormPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/customers/:id/edit" element={<CustomerFormPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
