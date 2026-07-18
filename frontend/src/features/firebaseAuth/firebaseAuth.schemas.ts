import { z } from 'zod';

export const firebaseLoginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const firebaseRegisterSchema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const firebaseForgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email'),
});

export const firebaseResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include a letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type FirebaseLoginFormValues = z.infer<typeof firebaseLoginSchema>;
export type FirebaseRegisterFormValues = z.infer<typeof firebaseRegisterSchema>;
export type FirebaseForgotPasswordFormValues = z.infer<typeof firebaseForgotPasswordSchema>;
export type FirebaseResetPasswordFormValues = z.infer<typeof firebaseResetPasswordSchema>;

/** Firebase Auth errors carry a stable `.code` (e.g. `auth/wrong-password`); prefer it over `.message`. */
export function extractFirebaseError(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    const known: Record<string, string> = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found for this email.',
      'auth/wrong-password': 'Incorrect email or password.',
      'auth/invalid-credential': 'Incorrect email or password.',
      'auth/weak-password': 'Choose a stronger password.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/invalid-action-code': 'This link is invalid or has already been used.',
      'auth/expired-action-code': 'This link has expired. Please request a new one.',
      'functions/permission-denied': 'You do not have permission to perform this action.',
    };
    if (known[code]) return known[code];
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}
