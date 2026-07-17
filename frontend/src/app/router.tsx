import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { ProtectedRoute } from '../routes/ProtectedRoute';

// Code-split page bundles for faster initial load.
const HomePage = lazy(() =>
  import('../pages/customer/HomePage').then((m) => ({ default: m.HomePage })),
);
const ProductsPage = lazy(() =>
  import('../pages/customer/ProductsPage').then((m) => ({ default: m.ProductsPage })),
);
const ProductDetailPage = lazy(() =>
  import('../pages/customer/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() =>
  import('../pages/customer/CartPage').then((m) => ({ default: m.CartPage })),
);
const WishlistPage = lazy(() =>
  import('../pages/customer/WishlistPage').then((m) => ({ default: m.WishlistPage })),
);
const CheckoutPage = lazy(() =>
  import('../pages/customer/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
);
const OrdersPage = lazy(() =>
  import('../pages/customer/OrdersPage').then((m) => ({ default: m.OrdersPage })),
);
const OrderDetailPage = lazy(() =>
  import('../pages/customer/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
);
const AccountPage = lazy(() =>
  import('../pages/customer/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);
const LoginPage = lazy(() =>
  import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import('../pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('../pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const VerifyEmailPage = lazy(() =>
  import('../pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);

function PageFallback() {
  return (
    <div className="container-app py-16">
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

function wrap(node: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{node}</Suspense>;
}

export const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      { index: true, element: wrap(<HomePage />) },
      { path: 'products', element: wrap(<ProductsPage />) },
      { path: 'products/:slug', element: wrap(<ProductDetailPage />) },
      { path: 'cart', element: wrap(<CartPage />) },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'checkout', element: wrap(<CheckoutPage />) },
          { path: 'orders', element: wrap(<OrdersPage />) },
          { path: 'orders/:id', element: wrap(<OrderDetailPage />) },
          { path: 'wishlist', element: wrap(<WishlistPage />) },
          { path: 'account', element: wrap(<AccountPage />) },
        ],
      },
      { path: '*', element: wrap(<NotFoundPage />) },
    ],
  },
  {
    element: <AuthLayout />,
    children: [
      { path: 'login', element: wrap(<LoginPage />) },
      { path: 'register', element: wrap(<RegisterPage />) },
      { path: 'forgot-password', element: wrap(<ForgotPasswordPage />) },
      { path: 'reset-password', element: wrap(<ResetPasswordPage />) },
      { path: 'verify-email', element: wrap(<VerifyEmailPage />) },
    ],
  },
]);
