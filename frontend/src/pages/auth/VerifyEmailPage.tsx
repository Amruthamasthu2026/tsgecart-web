import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../../features/auth/auth.api';
import { extractApiError } from '../../lib/apiClient';

type Status = 'verifying' | 'success' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setStatus('error');
      setMessage('Verification token is missing.');
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(extractApiError(err));
      });
  }, [token]);

  return (
    <div className="text-center">
      {status === 'verifying' && (
        <>
          <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <h2 className="mt-6 text-2xl font-extrabold">Verifying your email…</h2>
        </>
      )}
      {status === 'success' && (
        <>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand text-2xl">
            ✓
          </div>
          <h2 className="mt-6 text-2xl font-extrabold">Email verified!</h2>
          <p className="mt-2 text-sm text-ink-muted">Your account is now fully activated.</p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            Start shopping
          </Link>
        </>
      )}
      {status === 'error' && (
        <>
          <h2 className="text-2xl font-extrabold">Verification failed</h2>
          <p className="mt-2 text-sm text-ink-muted">{message}</p>
          <Link to="/" className="btn-primary mt-6 inline-flex">
            Back to home
          </Link>
        </>
      )}
    </div>
  );
}
