import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useRole } from '../../context/RoleContext';

export const RequireAuth: React.FC = () => {
  const { ready, isAuthenticated } = useRole();
  const location = useLocation();
  if (!ready) return <div className="min-h-screen grid place-items-center text-slate-600">Checking your session…</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};

interface ProtectedViewGuardProps {
  children?: React.ReactNode;
  permission?: string;
  allowedRoles?: Array<'retailer' | 'wholesaler' | 'driver'>;
}

export const ProtectedViewGuard: React.FC<ProtectedViewGuardProps> = ({ children, permission, allowedRoles }) => {
  const { hasPermission, role } = useRole();
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/forbidden" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/forbidden" replace />;
  return children ? <>{children}</> : <Outlet />;
};
