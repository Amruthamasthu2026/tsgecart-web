import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useFirebaseAuth } from '../../contexts/FirebaseAuthContext';
import { firebaseCartApi } from '../../services/firebaseCart';
import { extractFirebaseError } from '../firebaseAuth/firebaseAuth.schemas';

/**
 * Firestore-cart equivalent of `useAddToCart` (untouched) — adds a variant
 * to the Firestore cart, redirecting a caller who isn't signed in via
 * Firebase to `/firebase-auth/login` (the existing JWT session, if any,
 * cannot satisfy Firestore's Callable Functions, which require a real
 * Firebase ID token).
 */
export function useFirebaseAddToCart() {
  const { isAuthenticated } = useFirebaseAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (variantId: string, quantity = 1) => {
      if (!isAuthenticated) {
        navigate('/firebase-auth/login', { state: { from: { pathname: '/cart' } } });
        return;
      }
      setError(null);
      setPendingId(variantId);
      try {
        const cart = await firebaseCartApi.addItem(variantId, quantity);
        queryClient.setQueryData(['firebase-cart'], cart);
      } catch (err) {
        setError(extractFirebaseError(err));
      } finally {
        setPendingId(null);
      }
    },
    [isAuthenticated, navigate, queryClient],
  );

  return { add, pendingId, error };
}
