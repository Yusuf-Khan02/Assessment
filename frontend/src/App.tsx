import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { VendorOpeningsPage } from './pages/VendorOpeningsPage';
import { VendorOpeningDetailPage } from './pages/VendorOpeningDetailPage';

const RootRedirect: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === 'IT_VENDOR') {
    return <Navigate to="/vendor/openings" replace />;
  }
  return <Navigate to="/hiring-manager/openings" replace />;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RootRedirect />} />

            {/* IT Vendor Routes */}
            <Route element={<ProtectedRoute allowedRoles={['IT_VENDOR']} />}>
              <Route path="/vendor/openings" element={<VendorOpeningsPage />} />
              <Route path="/vendor/openings/:id" element={<VendorOpeningDetailPage />} />
            </Route>

            {/* Hiring Manager Routes (Phase 7) */}
            <Route element={<ProtectedRoute allowedRoles={['HIRING_MANAGER']} />}>
              <Route
                path="/hiring-manager/openings"
                element={<Navigate to="/" replace />}
              />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
