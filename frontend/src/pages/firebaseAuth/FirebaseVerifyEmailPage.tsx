import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { firebaseAuth } from '../../lib/firebase';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { extractFirebaseError } from '../../features/firebaseAuth/firebaseAuth.schemas';
import { Button } from '../../components/ui/Button';

type Status = 'idle' | 'verifying' | 'success' | 'error';

export function FirebaseVerifyEmailPage() {
  const [params] = useSearchParams();
  const oobCode = params.get('oobCode') ?? '';
  const { user, isAuthenticated, requestEmailVerification, refreshClaims } = useFirebaseAuth();
  const [status, setStatus] = useState<Status>(oobCode ? 'verifying' : 'idle');
  const [message, setMessage] = useState('');
  const [resent, setResent] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!oobCode || ran.current) return;
    ran.current = true;
    applyActionCode(firebaseAuth, oobCode)
      .then(async () => {
        await refreshClaims();
        setStatus('success');
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(extractFirebaseError(err));
      });
  }, [oobCode, refreshClaims]);

  const handleResend = async () => {
    setMessage('');
    try {
      await requestEmailVerification();
      setResent(true);
    } catch (err) {
      setMessage(extractFirebaseError(err));
    }
  };

  if (status === 'verifying') {
    return (
      <div className="text-center">
        <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <h2 className="mt-6 text-2xl font-extrabold">Verifying your email…</h2>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand text-2xl">✓</div>
        <h2 className="mt-6 text-2xl font-extrabold">Email verified!</h2>
        <p className="mt-2 text-sm text-ink-muted">Your account is now fully activated.</p>
        <Link to="/firebase-auth/account" className="btn-primary mt-6 inline-flex">
          Go to account
        </Link>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-extrabold">Verification failed</h2>
        <p className="mt-2 text-sm text-ink-muted">{message}</p>
        <Link to="/firebase-auth/account" className="btn-primary mt-6 inline-flex">
          Back to account
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h2 className="text-2xl font-extrabold">Verify your email</h2>
      {isAuthenticated ? (
        user?.emailVerified ? (
          <p className="mt-2 text-sm text-ink-muted">Your email is already verified.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-muted">
              We'll send a verification link to <span className="font-semibold">{user?.email}</span>.
            </p>
            {resent && (
              <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700">
                Verification email sent — check your inbox.
              </p>
            )}
            {message && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
            <Button className="mt-6" onClick={handleResend}>
              Send verification email
            </Button>
          </>
        )
      ) : (
        <p className="mt-2 text-sm text-ink-muted">Sign in to verify your email.</p>
      )}
    </div>
  );
}
