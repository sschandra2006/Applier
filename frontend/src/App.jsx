import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './core/contexts/AuthContext.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import { AuthForm } from './features/auth/components/AuthForm.jsx';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './features/dashboard/Dashboard';
import NewApplication from './features/dashboard/NewApplication';
import DocumentVault from './features/dashboard/DocumentVault';
import Settings from './features/dashboard/Settings';
import AdminDashboard from './features/admin/AdminDashboard';
import { ErrorBoundary } from './core/components/ErrorBoundary.jsx';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }
  return children;
};

const AdminRoute = ({ children }) => {
  const { isAuthenticated, userProfile } = useAuth();
  if (!isAuthenticated || userProfile?.role !== 'ADMIN') {
    return <Navigate to="/auth" replace />;
  }
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/auth" element={<AuthLayout />}>
            <Route index element={<AuthForm />} />
            {/* Redirect old routes to the unified auth page */}
            <Route path="login" element={<Navigate to="/auth" replace />} />
            <Route path="register" element={<Navigate to="/auth" replace />} />
          </Route>
          
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="new" element={<NewApplication />} />
            <Route path="documents" element={<DocumentVault />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/admin" element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          } />
          
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

