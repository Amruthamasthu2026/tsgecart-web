import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import {
  firebaseLoginSchema,
  extractFirebaseError,
  type FirebaseLoginFormValues,
} from '../../features/firebaseAuth/firebaseAuth.schemas';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function FirebaseLoginPage() {
  const { login } = useFirebaseAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FirebaseLoginFormValues>({ resolver: zodResolver(firebaseLoginSchema) });

  const onSubmit = async (values: FirebaseLoginFormValues) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      const to = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/firebase-auth/account';
      navigate(to, { replace: true });
    } catch (err) {
      setServerError(extractFirebaseError(err));
    }
  };

  return (
    <div>
      <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h2 className="text-2xl font-extrabold">Sign in with Firebase</h2>
      <p className="mt-1 text-sm text-ink-muted">
        This is the new Firebase Auth flow, running alongside the existing sign-in.
      </p>

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
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex justify-end">
          <Link to="/firebase-auth/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" fullWidth isLoading={isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        New here?{' '}
        <Link to="/firebase-auth/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
