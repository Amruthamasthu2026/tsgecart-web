import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  resetPasswordSchema,
  type ResetPasswordFormValues,
} from '../../features/auth/auth.schemas';
import { authApi } from '../../features/auth/auth.api';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { extractApiError } from '../../lib/apiClient';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setServerError(null);
    try {
      await authApi.resetPassword(token, values.password);
      navigate('/login', { replace: true });
    } catch (err) {
      setServerError(extractApiError(err));
    }
  };

  if (!token) {
    return (
      <div>
        <h2 className="text-2xl font-extrabold">Invalid link</h2>
        <p className="mt-2 text-sm text-ink-muted">This reset link is missing or malformed.</p>
        <Link to="/forgot-password" className="btn-primary mt-6 inline-flex">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
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
