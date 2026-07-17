import { PrismaClient, Role, CouponType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';
import { loadHyderabadPincodes } from '../src/shared/pincodeData.js';

const prisma = new PrismaClient();
const refCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);

const PERMISSIONS = [
  { key: 'dashboard.view', description: 'View admin dashboard & analytics' },
  { key: 'products.manage', description: 'Create, update, delete products & catalog' },
  { key: 'orders.manage', description: 'View and update orders' },
  { key: 'customers.manage', description: 'View and manage customers' },
  { key: 'coupons.manage', description: 'Manage coupons' },
  { key: 'inventory.manage', description: 'Manage inventory & stock' },
  { key: 'reviews.manage', description: 'Moderate reviews' },
  { key: 'delivery.manage', description: 'Manage zones, pincodes, charges' },
  { key: 'banners.manage', description: 'Manage banners' },
  { key: 'rewards.manage', description: 'Manage referral & spin-wheel rewards' },
  { key: 'settings.manage', description: 'Manage platform settings & roles' },
];

// Hyderabad serviceable area — loaded from the maintained CSV dataset
// (backend/prisma/data/hyderabad-pincodes.csv), shared with the admin
// "Import Hyderabad pincodes" action so there is a single source of truth.
const HYDERABAD_PINCODES = loadHyderabadPincodes();

async function main(): Promise<void> {
  console.log('🌱 Seeding TSG eCart database…');

  // ── Permissions ──────────────────────────────────────────────
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`  • ${PERMISSIONS.length} permissions`);

  // ── Admin user ───────────────────────────────────────────────
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@tsgecart.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      name: 'TSG Admin',
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      emailVerified: true,
      referralCode: refCode(),
    },
  });

  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.userPermission.upsert({
      where: { userId_permissionId: { userId: admin.id, permissionId: perm.id } },
      update: {},
      create: { userId: admin.id, permissionId: perm.id },
    });
  }
  console.log(`  • Admin user: ${adminEmail}`);

  // ── Delivery zone + Hyderabad pincodes ───────────────────────
  const zone = await prisma.deliveryZone.upsert({
    where: { id: 'seed-zone-hyderabad-central' },
    update: {},
    create: {
      id: 'seed-zone-hyderabad-central',
      name: 'Hyderabad Central',
      description: 'Core Hyderabad delivery zone',
      deliveryCharge: 25,
      freeDeliveryLimit: 499,
      minEtaMinutes: 10,
      maxEtaMinutes: 30,
    },
  });

  for (const code of HYDERABAD_PINCODES) {
    await prisma.pincode.upsert({
      where: { code },
      update: { zoneId: zone.id, isServiceable: true },
      create: { code, zoneId: zone.id, isServiceable: true },
    });
  }
  console.log(`  • Delivery zone + ${HYDERABAD_PINCODES.length} Hyderabad pincodes`);

  // ── Spin wheel ───────────────────────────────────────────────
  const wheel = await prisma.spinWheelConfig.upsert({
    where: { id: 'seed-spin-default' },
    update: {},
    create: {
      id: 'seed-spin-default',
      name: 'Welcome Wheel',
      isActive: true,
      cooldownHours: 24,
    },
  });
  const segments = [
    { label: '₹10 Cashback', rewardAmount: 10, weight: 30, color: '#FFE60D' },
    { label: 'Better luck next time', rewardAmount: 0, weight: 35, color: '#111827' },
    { label: '₹25 Cashback', rewardAmount: 25, weight: 15, color: '#FFE60D' },
    { label: '₹5 Cashback', rewardAmount: 5, weight: 15, color: '#111827' },
    { label: '₹50 Cashback', rewardAmount: 50, weight: 5, color: '#FFE60D' },
  ];
  const existingSegments = await prisma.spinSegment.count({ where: { configId: wheel.id } });
  if (existingSegments === 0) {
    await prisma.spinSegment.createMany({
      data: segments.map((s) => ({ ...s, configId: wheel.id })),
    });
  }
  console.log('  • Spin wheel configured');

  // ── Sample coupon ────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: 'WELCOME50' },
    update: {},
    create: {
      code: 'WELCOME50',
      description: '₹50 off your first order above ₹299',
      type: CouponType.FLAT,
      value: 50,
      minOrder: 299,
      perUserLimit: 1,
      isActive: true,
    },
  });
  console.log('  • Sample coupon WELCOME50');

  // ── Catalog: categories + sample products ────────────────────
  const categoryData = [
    { name: 'Fruits & Vegetables', slug: 'fruits-vegetables' },
    { name: 'Dairy & Eggs', slug: 'dairy-eggs' },
    { name: 'Snacks & Munchies', slug: 'snacks-munchies' },
    { name: 'Beverages', slug: 'beverages' },
    { name: 'Bakery', slug: 'bakery' },
    { name: 'Household Essentials', slug: 'household-essentials' },
  ];
  const categories: Record<string, string> = {};
  for (const [i, c] of categoryData.entries()) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { name: c.name, slug: c.slug, sortOrder: i, isActive: true },
    });
    categories[c.slug] = cat.id;
  }
  console.log(`  • ${categoryData.length} categories`);

  const products = [
    {
      name: 'Fresh Bananas',
      slug: 'fresh-bananas',
      category: 'fruits-vegetables',
      gstRate: 0,
      variants: [
        { sku: 'BAN-500', unitLabel: '500 g', mrp: 40, price: 32, stock: 120, isDefault: true },
        { sku: 'BAN-1KG', unitLabel: '1 kg', mrp: 75, price: 60, stock: 80, isDefault: false },
      ],
    },
    {
      name: 'Farm Fresh Tomatoes',
      slug: 'farm-fresh-tomatoes',
      category: 'fruits-vegetables',
      gstRate: 0,
      variants: [
        { sku: 'TOM-500', unitLabel: '500 g', mrp: 30, price: 24, stock: 100, isDefault: true },
      ],
    },
    {
      name: 'Full Cream Milk',
      slug: 'full-cream-milk',
      category: 'dairy-eggs',
      gstRate: 5,
      variants: [
        { sku: 'MILK-500', unitLabel: '500 ml', mrp: 34, price: 33, stock: 200, isDefault: true },
        { sku: 'MILK-1L', unitLabel: '1 L', mrp: 66, price: 64, stock: 150, isDefault: false },
      ],
    },
    {
      name: 'Brown Eggs (Pack of 6)',
      slug: 'brown-eggs-pack-of-6',
      category: 'dairy-eggs',
      gstRate: 0,
      variants: [
        { sku: 'EGG-6', unitLabel: '6 pcs', mrp: 72, price: 66, stock: 90, isDefault: true },
      ],
    },
    {
      name: 'Salted Potato Chips',
      slug: 'salted-potato-chips',
      category: 'snacks-munchies',
      gstRate: 12,
      variants: [
        { sku: 'CHIP-52', unitLabel: '52 g', mrp: 20, price: 20, stock: 300, isDefault: true },
      ],
    },
    {
      name: 'Sparkling Cola',
      slug: 'sparkling-cola',
      category: 'beverages',
      gstRate: 18,
      variants: [
        { sku: 'COLA-750', unitLabel: '750 ml', mrp: 40, price: 38, stock: 250, isDefault: true },
        { sku: 'COLA-2L', unitLabel: '2 L', mrp: 95, price: 90, stock: 120, isDefault: false },
      ],
    },
  ];

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) continue;
    await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: `${p.name} — fresh and delivered fast across Hyderabad.`,
        categoryId: categories[p.category],
        images: [],
        gstRate: p.gstRate,
        isActive: true,
        isFeatured: true,
        isBestSeller: p.variants[0].price < 40,
        variants: {
          create: p.variants.map((v) => ({
            sku: v.sku,
            unitLabel: v.unitLabel,
            mrp: v.mrp,
            price: v.price,
            isDefault: v.isDefault,
            inventory: { create: { stock: v.stock, lowStockThreshold: 10 } },
          })),
        },
      },
    });
  }
  console.log(`  • ${products.length} sample products with variants + inventory`);

  // ── Platform settings ────────────────────────────────────────
  const settings: Array<{ key: string; value: unknown }> = [
    { key: 'store.name', value: 'TSG eCart' },
    { key: 'store.tagline', value: 'Fresh Groceries Delivered Fast' },
    { key: 'store.serviceCity', value: 'Hyderabad' },
    { key: 'store.currency', value: 'INR' },
    { key: 'store.supportEmail', value: 'support@tsgecart.com' },
    { key: 'store.supportPhone', value: '+91-9000000000' },
    { key: 'delivery.defaultEta', value: { min: 10, max: 30 } },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as object },
      create: { key: s.key, value: s.value as object },
    });
  }
  console.log(`  • ${settings.length} platform settings`);

  console.log('✅ Seed complete');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
