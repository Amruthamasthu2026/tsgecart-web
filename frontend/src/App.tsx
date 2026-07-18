import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { AuthProvider } from './contexts/AuthContext';
import { CartProvider } from './contexts/CartContext';
import { FirebaseAuthProvider } from './contexts/FirebaseAuthContext';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          <FirebaseAuthProvider>
            <RouterProvider router={router} />
          </FirebaseAuthProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
