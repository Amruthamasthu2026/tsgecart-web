import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createUserWithEmailAndPassword,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseAuth } from '../lib/firebase';

/**
 * Firebase Authentication context — added ALONGSIDE the existing
 * `AuthContext` (JWT/cookie-based, in `contexts/AuthContext.tsx`). Nothing
 * here touches that context or any page that currently uses it. This
 * powers only the new `/firebase-auth/*` demo pages and
 * `FirebaseProtectedRoute`.
 */
export type FirebaseRole = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'DELIVERY_PARTNER';

export interface FirebaseAuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: FirebaseRole;
  permissions: string[];
}

interface FirebaseAuthContextValue {
  user: FirebaseAuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  register: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  requestEmailVerification: () => Promise<void>;
  refreshClaims: () => Promise<void>;
}

const FirebaseAuthContext = createContext<FirebaseAuthContextValue | undefined>(undefined);

function toAuthUser(firebaseUser: User, claims: Record<string, unknown>): FirebaseAuthUser {
  const role = (claims.role as FirebaseRole | undefined) ?? 'CUSTOMER';
  const permissions = Array.isArray(claims.permissions) ? (claims.permissions as string[]) : [];
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    emailVerified: firebaseUser.emailVerified,
    role,
    permissions,
  };
}

export function FirebaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseAuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // onIdTokenChanged (not onAuthStateChanged) so a claims-refresh after
    // role changes (see setUserRole.function.ts's revokeRefreshTokens) is
    // reflected as soon as the SDK mints a fresh token, not just on
    // sign-in/sign-out.
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (nextUser) => {
      if (!nextUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      const tokenResult = await nextUser.getIdTokenResult();
      setUser(toAuthUser(nextUser, tokenResult.claims));
      setIsLoading(false);
    });
    return unsubscribe;
  }, []);

  // login()/register() set `user` synchronously from the sign-in result
  // itself, rather than waiting for the async onIdTokenChanged listener
  // above to fire. Callers commonly navigate() immediately after these
  // resolve (see FirebaseLoginPage/FirebaseRegisterPage) — without this,
  // FirebaseProtectedRoute would still see `user: null` for one render and
  // bounce straight back to the login page before the listener catches up.
  const register = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    const tokenResult = await cred.user.getIdTokenResult();
    setUser(toAuthUser(cred.user, tokenResult.claims));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, password);
    const tokenResult = await cred.user.getIdTokenResult();
    setUser(toAuthUser(cred.user, tokenResult.claims));
  }, []);

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(firebaseAuth, email);
  }, []);

  const requestEmailVerification = useCallback(async () => {
    if (!firebaseAuth.currentUser) throw new Error('Not signed in');
    await sendEmailVerification(firebaseAuth.currentUser);
  }, []);

  const refreshClaims = useCallback(async () => {
    if (!firebaseAuth.currentUser) return;
    const tokenResult = await firebaseAuth.currentUser.getIdTokenResult(true);
    setUser(toAuthUser(firebaseAuth.currentUser, tokenResult.claims));
  }, []);

  const value = useMemo<FirebaseAuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      register,
      login,
      logout,
      requestPasswordReset,
      requestEmailVerification,
      refreshClaims,
    }),
    [user, isLoading, register, login, logout, requestPasswordReset, requestEmailVerification, refreshClaims],
  );

  return <FirebaseAuthContext.Provider value={value}>{children}</FirebaseAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFirebaseAuth(): FirebaseAuthContextValue {
  const ctx = useContext(FirebaseAuthContext);
  if (!ctx) throw new Error('useFirebaseAuth must be used within a FirebaseAuthProvider');
  return ctx;
}
