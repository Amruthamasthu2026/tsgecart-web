import { useNavigate } from 'react-router-dom';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { Button } from '../../components/ui/Button';

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Customer',
  STAFF: 'Staff',
  ADMIN: 'Admin',
  DELIVERY_PARTNER: 'Delivery Partner',
};

export function FirebaseAccountPage() {
  const { user, logout, refreshClaims } = useFirebaseAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/firebase-auth/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="container-app py-10">
      <p className="mb-2 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h1 className="text-2xl font-extrabold">Your Firebase account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        This data comes straight from your Firebase ID token's custom claims.
      </p>

      <dl className="mt-6 max-w-lg space-y-3 rounded-2xl border border-black/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-muted">UID</dt>
          <dd className="font-mono text-sm">{user.uid}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-muted">Email</dt>
          <dd className="text-sm font-medium">{user.email}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-muted">Email verified</dt>
          <dd className="text-sm font-medium">{user.emailVerified ? 'Yes' : 'No'}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-muted">Role</dt>
          <dd className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            {ROLE_LABELS[user.role] ?? user.role}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-sm text-ink-muted">Permissions</dt>
          <dd className="text-sm font-medium">
            {user.permissions.length > 0 ? user.permissions.join(', ') : '—'}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="ghost" onClick={() => refreshClaims()}>
          Refresh claims
        </Button>
        <Button variant="dark" onClick={handleLogout}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
