import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './layouts/AuthLayout.jsx';
import { LoginForm } from './features/auth/components/LoginForm.jsx';
import { RegisterForm } from './features/auth/components/RegisterForm.jsx';
import DashboardLayout from './layouts/DashboardLayout';
import Dashboard from './features/dashboard/Dashboard';
import Marketplace from './features/marketplace/Marketplace';
import WorkflowBuilder from './features/workflow/WorkflowBuilder';
import TrackingTimeline from './features/tracking/TrackingTimeline';
import AdminDashboard from './features/admin/AdminDashboard';


const ProtectedRoute = ({ children }) => {
  // In a real app, verify Firebase Auth here
  return children;
};

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/auth" element={<AuthLayout />}>
          <Route path="login" element={<LoginForm />} />
          <Route path="register" element={<RegisterForm />} />
        </Route>
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="marketplace" element={<Marketplace />} />
          <Route path="workflows" element={<WorkflowBuilder />} />
          <Route path="tracking" element={<TrackingTimeline />} />
          <Route path="admin" element={<AdminDashboard />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}
