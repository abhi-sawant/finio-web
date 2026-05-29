import { Navigate, Outlet } from 'react-router';
import { useAuthStore } from '@/store/useAuthStore';

export function ProtectedRoute() {
  const token = useAuthStore((s) => s.token);
  const isLoaded = useAuthStore((s) => s.isLoaded);

  if (!isLoaded) return null;
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}
