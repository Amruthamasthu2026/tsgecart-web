import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import {
  firebaseForgotPasswordSchema,
  extractFirebaseError,
  type FirebaseForgotPasswordFormValues,
} from '../../features/firebaseAuth/firebaseAuth.schemas';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function FirebaseForgotPasswordPage() {
  const { requestPasswordReset } = useFirebaseAuth();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FirebaseForgotPasswordFormValues>({ resolver: zodResolver(firebaseForgotPasswordSchema) });

  const onSubmit = async (values: FirebaseForgotPasswordFormValues) => {
    setServerError(null);
    try {
      await requestPasswordReset(values.email);
      setSent(true);
    } catch (err) {
      setServerError(extractFirebaseError(err));
    }
  };

  if (sent) {
    return (
      <div>
        <h2 className="text-2xl font-extrabold">Check your inbox</h2>
        <p className="mt-2 text-sm text-ink-muted">
          If an account exists for that email, Firebase has sent a link to reset your password.
        </p>
        <Link to="/firebase-auth/login" className="btn-primary mt-6 inline-flex">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h2 className="text-2xl font-extrabold">Forgot password?</h2>
      <p className="mt-1 text-sm text-ink-muted">Enter your email and we'll send you a reset link.</p>

      {serverError && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        Remembered it?{' '}
        <Link to="/firebase-auth/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
