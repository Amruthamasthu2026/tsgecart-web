import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { extractApiError } from '../../lib/apiClient';

/** Adds a variant to the cart, redirecting unauthenticated users to sign in. */
export function useAddToCart() {
  const { isAuthenticated } = useAuth();
  const { addItem } = useCart();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (variantId: string, quantity = 1) => {
      if (!isAuthenticated) {
        navigate('/login', { state: { from: { pathname: '/cart' } } });
        return;
      }
      setError(null);
      setPendingId(variantId);
      try {
        await addItem(variantId, quantity);
      } catch (err) {
        setError(extractApiError(err));
      } finally {
        setPendingId(null);
      }
    },
    [isAuthenticated, addItem, navigate],
  );

  return { add, pendingId, error };
}
