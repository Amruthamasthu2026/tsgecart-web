import { PrismaClient, Role, CouponType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { customAlphabet } from 'nanoid';

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

// Representative Hyderabad pincodes for the initial serviceable area.
const HYDERABAD_PINCODES = [
  '500001', '500002', '500003', '500004', '500008', '500016', '500018',
  '500028', '500032', '500033', '500034', '500035', '500038', '500044',
  '500072', '500081', '500084', '500089', '500090',
];

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
