import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, UserRole } from '../context/AuthContext';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md text-center">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Access Denied</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Your account ({user.role}) does not have permission to access this portal.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

