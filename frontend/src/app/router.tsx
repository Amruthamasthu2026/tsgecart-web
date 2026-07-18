/* eslint-disable react-refresh/only-export-components -- this module intentionally exports the router config alongside small render helpers */
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { AdminLayout } from '../layouts/AdminLayout';
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
const RewardsPage = lazy(() =>
  import('../pages/customer/RewardsPage').then((m) => ({ default: m.RewardsPage })),
);
const NotificationsPage = lazy(() =>
  import('../pages/customer/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const CouponsPage = lazy(() =>
  import('../pages/customer/CouponsPage').then((m) => ({ default: m.CouponsPage })),
);
const AccountPage = lazy(() =>
  import('../pages/customer/AccountPage').then((m) => ({ default: m.AccountPage })),
);
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

// Static content pages
const AboutPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.AboutPage })),
);
const ContactPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.ContactPage })),
);
const FaqPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.FaqPage })),
);
const PrivacyPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.TermsPage })),
);
const RefundPage = lazy(() =>
  import('../pages/content/ContentPages').then((m) => ({ default: m.RefundPage })),
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

// Admin pages
const AdminDashboard = lazy(() =>
  import('../pages/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard })),
);
const AdminOrders = lazy(() =>
  import('../pages/admin/AdminOrders').then((m) => ({ default: m.AdminOrders })),
);
const AdminProducts = lazy(() =>
  import('../pages/admin/AdminProducts').then((m) => ({ default: m.AdminProducts })),
);
const AdminCategories = lazy(() =>
  import('../pages/admin/AdminCategories').then((m) => ({ default: m.AdminCategories })),
);
const AdminCoupons = lazy(() =>
  import('../pages/admin/AdminCoupons').then((m) => ({ default: m.AdminCoupons })),
);
const AdminRewards = lazy(() =>
  import('../pages/admin/AdminRewards').then((m) => ({ default: m.AdminRewards })),
);
const AdminCustomers = lazy(() =>
  import('../pages/admin/AdminCustomers').then((m) => ({ default: m.AdminCustomers })),
);
const AdminDelivery = lazy(() =>
  import('../pages/admin/AdminDelivery').then((m) => ({ default: m.AdminDelivery })),
);
const AdminReviews = lazy(() =>
  import('../pages/admin/AdminReviews').then((m) => ({ default: m.AdminReviews })),
);
const AdminBanners = lazy(() =>
  import('../pages/admin/AdminBanners').then((m) => ({ default: m.AdminBanners })),
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
      { path: 'about', element: wrap(<AboutPage />) },
      { path: 'contact', element: wrap(<ContactPage />) },
      { path: 'faq', element: wrap(<FaqPage />) },
      { path: 'privacy', element: wrap(<PrivacyPage />) },
      { path: 'terms', element: wrap(<TermsPage />) },
      { path: 'refunds', element: wrap(<RefundPage />) },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'checkout', element: wrap(<CheckoutPage />) },
          { path: 'orders', element: wrap(<OrdersPage />) },
          { path: 'orders/:id', element: wrap(<OrderDetailPage />) },
          { path: 'wishlist', element: wrap(<WishlistPage />) },
          { path: 'rewards', element: wrap(<RewardsPage />) },
          { path: 'coupons', element: wrap(<CouponsPage />) },
          { path: 'notifications', element: wrap(<NotificationsPage />) },
          { path: 'account', element: wrap(<AccountPage />) },
        ],
      },
      { path: '*', element: wrap(<NotFoundPage />) },
    ],
  },
  {
    element: <ProtectedRoute roles={['ADMIN', 'STAFF']} />,
    children: [
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: wrap(<AdminDashboard />) },
          { path: 'orders', element: wrap(<AdminOrders />) },
          { path: 'products', element: wrap(<AdminProducts />) },
          { path: 'categories', element: wrap(<AdminCategories />) },
          { path: 'coupons', element: wrap(<AdminCoupons />) },
          { path: 'rewards', element: wrap(<AdminRewards />) },
          { path: 'customers', element: wrap(<AdminCustomers />) },
          { path: 'delivery', element: wrap(<AdminDelivery />) },
          { path: 'reviews', element: wrap(<AdminReviews />) },
          { path: 'banners', element: wrap(<AdminBanners />) },
        ],
      },
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
