/**
 * Response shapes for the admin dashboard/analytics Callables, migration
 * Phase 6. Field names deliberately mirror
 * `backend/src/modules/admin/analytics.service.ts`'s response shapes
 * (adjusted to the paise-integer money convention used everywhere else in
 * this migration) so the frontend adapter can reshape into the exact
 * `AdminDashboard.tsx` props the existing page already renders.
 */
export interface DashboardStats {
  totalRevenuePaise: number;
  totalOrders: number;
  totalCustomers: number;
  activeProducts: number;
  pendingOrders: number;
  lowStockCount: number;
  ordersByStatus: Record<string, number>;
}

export interface SalesTrendPoint {
  date: string; // YYYY-MM-DD
  revenuePaise: number;
  orderCount: number;
}

export interface TopProductStat {
  productName: string;
  quantitySold: number;
  revenuePaise: number;
}

export interface AdminCustomerSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string | null;
}

export interface AdminStaffSummary {
  uid: string;
  email: string | null;
  role: string;
  permissions: string[];
}
