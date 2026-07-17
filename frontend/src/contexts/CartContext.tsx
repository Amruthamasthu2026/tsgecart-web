import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cartApi, type CartSummary } from '../features/cart/cart.api';
import { useAuth } from './AuthContext';

interface CartContextValue {
  cart: CartSummary | undefined;
  itemCount: number;
  isLoading: boolean;
  addItem: (variantId: string, quantity?: number) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: cart, isLoading } = useQuery({
    queryKey: ['cart'],
    queryFn: cartApi.get,
    enabled: isAuthenticated,
  });

  const setCart = (data: CartSummary) => queryClient.setQueryData(['cart'], data);

  const addMutation = useMutation({
    mutationFn: ({ variantId, quantity }: { variantId: string; quantity: number }) =>
      cartApi.addItem(variantId, quantity),
    onSuccess: setCart,
  });
  const updateMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      cartApi.updateItem(itemId, quantity),
    onSuccess: setCart,
  });
  const removeMutation = useMutation({
    mutationFn: (itemId: string) => cartApi.removeItem(itemId),
    onSuccess: setCart,
  });
  const clearMutation = useMutation({ mutationFn: cartApi.clear, onSuccess: setCart });

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      itemCount: cart?.itemCount ?? 0,
      isLoading,
      addItem: async (variantId, quantity = 1) => {
        await addMutation.mutateAsync({ variantId, quantity });
      },
      updateItem: async (itemId, quantity) => {
        await updateMutation.mutateAsync({ itemId, quantity });
      },
      removeItem: async (itemId) => {
        await removeMutation.mutateAsync(itemId);
      },
      clear: async () => {
        await clearMutation.mutateAsync();
      },
    }),
    [cart, isLoading, addMutation, updateMutation, removeMutation, clearMutation],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
