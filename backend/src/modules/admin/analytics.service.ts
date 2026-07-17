import { prisma } from '../../config/prisma.js';

export const analyticsService = {
  async dashboard() {
    const [
      revenueAgg,
      ordersCount,
      customersCount,
      productsCount,
      pendingOrders,
      lowStock,
      statusGroups,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID' },
        _sum: { total: true },
      }),
      prisma.order.count(),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PREPARING', 'PACKED'] } } }),
      prisma.inventory.count({ where: { stock: { lte: prisma.inventory.fields.lowStockThreshold } } }),
      prisma.order.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      totalRevenue: Number(revenueAgg._sum.total ?? 0),
      totalOrders: ordersCount,
      totalCustomers: customersCount,
      activeProducts: productsCount,
      pendingOrders,
      lowStockItems: lowStock,
      ordersByStatus: statusGroups.map((g) => ({ status: g.status, count: g._count })),
    };
  },

  /** Daily revenue and order counts for the last N days. */
  async salesTrend(days = 14) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: { placedAt: { gte: since } },
      select: { placedAt: true, total: true, paymentStatus: true },
    });

    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (let i = 0; i < days; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), { revenue: 0, orders: 0 });
    }
    for (const o of orders) {
      const key = o.placedAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.orders += 1;
        if (o.paymentStatus === 'PAID') bucket.revenue += Number(o.total);
      }
    }
    return [...buckets.entries()].map(([date, v]) => ({ date, ...v }));
  },

  /** Best-selling products by quantity sold. */
  async topProducts(limit = 8) {
    const grouped = await prisma.orderItem.groupBy({
      by: ['productName'],
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return grouped.map((g) => ({
      productName: g.productName,
      unitsSold: g._sum.quantity ?? 0,
      revenue: Number(g._sum.lineTotal ?? 0),
    }));
  },

  async lowStock(limit = 20) {
    const rows = await prisma.inventory.findMany({
      where: { stock: { lte: prisma.inventory.fields.lowStockThreshold } },
      take: limit,
      orderBy: { stock: 'asc' },
      include: {
        variant: {
          select: { sku: true, unitLabel: true, product: { select: { name: true, slug: true } } },
        },
      },
    });
    return rows.map((r) => ({
      sku: r.variant.sku,
      productName: r.variant.product.name,
      unitLabel: r.variant.unitLabel,
      stock: r.stock,
      threshold: r.lowStockThreshold,
    }));
  },
};
