import { useAuth } from '../contexts/AuthContext';
import { useFirebaseAuth } from '../contexts/FirebaseAuthContext';

/**
 * Shared navigation-auth decision model for `Navbar`/`MobileNav` (and any
 * other shared chrome that needs to know "is someone signed in, and where
 * do the account/login links go"). Added because the header previously
 * only ever consulted the legacy JWT `AuthContext` — a user signed in
 * ONLY via Firebase Auth (Phase 2+) was rendered as signed-out, and the
 * profile icon sent them to `/login` (a page that can't authenticate a
 * Firebase session at all).
 *
 * `isFirebaseNavigationModeEnabled` mirrors the same "any Firestore
 * shopping flag is on" convention already used by individual pages
 * (`CartPage`, `CheckoutPage`, `OrdersPage`, `RewardsPage`, ...) — it only
 * decides where a SIGNED-OUT visitor's profile icon points. Which auth
 * system is actually treated as "signed in" is decided by priority, not
 * by the flags: if the visitor has a real Firebase session, that always
 * wins (matches the shopping pages' own Firebase-first behavior); else if
 * they have a real legacy JWT session, that's used unchanged (this is
 * what keeps existing ADMIN/STAFF users — who may never have touched
 * `/firebase-auth/login` — fully unaffected even while the Firestore
 * shopping flags are globally on); else neither is signed in, and the
 * flags alone decide which login page to offer.
 */
export const isFirebaseNavigationModeEnabled = [
  import.meta.env.VITE_USE_FIRESTORE_CART,
  import.meta.env.VITE_USE_FIRESTORE_WISHLIST,
  import.meta.env.VITE_USE_FIRESTORE_ADDRESSES,
  import.meta.env.VITE_USE_FIRESTORE_CHECKOUT,
  import.meta.env.VITE_USE_FIRESTORE_ORDERS,
  import.meta.env.VITE_USE_FIRESTORE_REWARDS,
].some((flag) => flag === 'true');

export interface NavigationAuth {
  /** True when the visitor has an active session in EITHER auth system. */
  isNavigationAuthenticated: boolean;
  /** Where the shared "profile"/"You" link goes when authenticated — always `/account` for both systems. */
  accountPath: string;
  /** Where the shared "profile"/"You" link goes when NOT authenticated. */
  loginPath: string;
  /** Firebase display name if set, else Firebase email, else the legacy account name — `null` when signed out. */
  displayName: string | null;
  /** The signed-in user's role (from whichever auth system is active) — `null` when signed out. */
  role: string | null;
  /** Signs out of whichever auth system is currently active. A no-op when already signed out. */
  logout: () => Promise<void>;
  /** Whether the shared nav should show the "Admin Dashboard" link. */
  showAdminDashboard: boolean;
}

export function useNavigationAuth(): NavigationAuth {
  const legacy = useAuth();
  const firebase = useFirebaseAuth();

  if (firebase.isAuthenticated && firebase.user) {
    const fbUser = firebase.user;
    return {
      isNavigationAuthenticated: true,
      accountPath: '/account',
      loginPath: '/firebase-auth/login',
      displayName: fbUser.displayName ?? fbUser.email ?? 'Account',
      role: fbUser.role,
      logout: firebase.logout,
      // "STAFF may see Admin Dashboard only according to the existing
      // custom-claims permission model" — unlike legacy (blanket STAFF
      // access), a Firebase STAFF claim must also carry at least one
      // permission from the custom-claims `permissions` array. ADMIN
      // implicitly holds every permission (mirrors the backend's/Rules'
      // own `hasPermission()` behavior), so no permissions check is
      // needed for ADMIN. Never derived from email or a Firestore doc.
      showAdminDashboard: fbUser.role === 'ADMIN' || (fbUser.role === 'STAFF' && fbUser.permissions.length > 0),
    };
  }

  if (legacy.isAuthenticated && legacy.user) {
    const legacyUser = legacy.user;
    return {
      isNavigationAuthenticated: true,
      accountPath: '/account',
      loginPath: '/login',
      displayName: legacyUser.name,
      role: legacyUser.role,
      logout: legacy.logout,
      // Existing legacy behavior, unchanged — see Navbar's previous check.
      showAdminDashboard: legacyUser.role === 'ADMIN' || legacyUser.role === 'STAFF',
    };
  }

  return {
    isNavigationAuthenticated: false,
    accountPath: '/account',
    loginPath: isFirebaseNavigationModeEnabled ? '/firebase-auth/login' : '/login',
    displayName: null,
    role: null,
    logout: async () => {},
    showAdminDashboard: false,
  };
}
