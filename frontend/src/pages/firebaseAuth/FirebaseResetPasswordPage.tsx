import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { confirmPasswordReset } from 'firebase/auth';
import { firebaseAuth } from '../../lib/firebase';
import {
  firebaseResetPasswordSchema,
  extractFirebaseError,
  type FirebaseResetPasswordFormValues,
} from '../../features/firebaseAuth/firebaseAuth.schemas';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

/**
 * Reads Firebase's standard `oobCode` query param (the same param name
 * Firebase's own default password-reset action page reads). To land users
 * here instead of Firebase's hosted default page, configure a custom action
 * URL in the Firebase Console (Authentication > Templates) or pass
 * `actionCodeSettings` to `sendPasswordResetEmail` pointing at this route —
 * not required for local emulator testing, where the emulator UI/API
 * exposes the oobCode directly.
 */
export function FirebaseResetPasswordPage() {
  const [params] = useSearchParams();
  const oobCode = params.get('oobCode') ?? '';
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FirebaseResetPasswordFormValues>({ resolver: zodResolver(firebaseResetPasswordSchema) });

  const onSubmit = async (values: FirebaseResetPasswordFormValues) => {
    setServerError(null);
    try {
      await confirmPasswordReset(firebaseAuth, oobCode, values.password);
      navigate('/firebase-auth/login', { replace: true });
    } catch (err) {
      setServerError(extractFirebaseError(err));
    }
  };

  if (!oobCode) {
    return (
      <div>
        <h2 className="text-2xl font-extrabold">Invalid link</h2>
        <p className="mt-2 text-sm text-ink-muted">This reset link is missing or malformed.</p>
        <Link to="/firebase-auth/forgot-password" className="btn-primary mt-6 inline-flex">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h2 className="text-2xl font-extrabold">Set a new password</h2>
      {serverError && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Reset password
        </Button>
      </form>
    </div>
  );
}
