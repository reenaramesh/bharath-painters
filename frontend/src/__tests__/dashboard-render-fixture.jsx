import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthContext from '../context/auth-context';
import { LanguageProvider } from '../i18n/LanguageContext';
import DashboardLayout from '../layouts/DashboardLayout';
import Dashboard from '../pages/Dashboard';
import CustomerDashboard from '../pages/CustomerDashboard';

export function DashboardFixture({ user }) {
  return <AuthContext.Provider value={{ user, logout() {}, refreshUser() {} }}>
    <LanguageProvider>
      <MemoryRouter initialEntries={[user.role === 'CUSTOMER' ? '/customer-dashboard' : '/dashboard']}>
        <Routes><Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customer-dashboard" element={<CustomerDashboard />} />
        </Route></Routes>
      </MemoryRouter>
    </LanguageProvider>
  </AuthContext.Provider>;
}
