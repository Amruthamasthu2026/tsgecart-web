import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useFirebaseAuth, type FirebaseRole } from '../contexts/FirebaseAuthContext';

interface FirebaseProtectedRouteProps {
  roles?: FirebaseRole[];
}

/**
 * Firebase-Auth-based route guard, added ALONGSIDE the existing
 * `ProtectedRoute` (routes/ProtectedRoute.tsx, JWT-based). Only used by the
 * new `/firebase-auth/*` routes — no existing route is wrapped with this.
 */
export function FirebaseProtectedRoute({ roles }: FirebaseProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useFirebaseAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/firebase-auth/login" state={{ from: location }} replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/firebase-auth/account" replace />;
  }

  return <Outlet />;
}
