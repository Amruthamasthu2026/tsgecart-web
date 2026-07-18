import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import {
  firebaseRegisterSchema,
  extractFirebaseError,
  type FirebaseRegisterFormValues,
} from '../../features/firebaseAuth/firebaseAuth.schemas';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function FirebaseRegisterPage() {
  const { register: registerUser } = useFirebaseAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FirebaseRegisterFormValues>({ resolver: zodResolver(firebaseRegisterSchema) });

  const onSubmit = async (values: FirebaseRegisterFormValues) => {
    setServerError(null);
    try {
      await registerUser(values.email, values.password);
      navigate('/firebase-auth/verify-email', { replace: true });
    } catch (err) {
      setServerError(extractFirebaseError(err));
    }
  };

  return (
    <div>
      <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold text-brand-700">
        Firebase Authentication demo
      </p>
      <h2 className="text-2xl font-extrabold">Create your account</h2>
      <p className="mt-1 text-sm text-ink-muted">
        New accounts default to the CUSTOMER role — assigned by the onUserCreated Cloud Function.
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
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        Already have an account?{' '}
        <Link to="/firebase-auth/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
