import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from '../../features/auth/auth.schemas';
import { authApi } from '../../features/auth/auth.api';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    await authApi.forgotPassword(values.email);
    setSent(true);
  };

  if (sent) {
    return (
      <div>
        <h2 className="text-2xl font-extrabold">Check your inbox</h2>
        <p className="mt-2 text-sm text-ink-muted">
          If an account exists for that email, we've sent a link to reset your password. The link
          expires in 1 hour.
        </p>
        <Link to="/login" className="btn-primary mt-6 inline-flex">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-extrabold">Forgot password?</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Enter your email and we'll send you a reset link.
      </p>
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
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
