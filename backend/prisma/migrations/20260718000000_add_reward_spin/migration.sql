-- Additive, non-destructive migration for the spin-wheel Rewards module.
-- Creates two NEW tables only. Does NOT drop, rename, alter, or delete any
-- existing table, column, or row. Safe to apply on a database that already
-- contains real product/store data.
--
-- Apply with either:
--   npx prisma migrate deploy        (if using a migrations history)
--   npx prisma db push               (additive; only creates the new tables)
--   or run this SQL directly against the database.

-- CreateTable: RewardConfig (reward tiers configured by admins)
CREATE TABLE `RewardConfig` (
    `id` VARCHAR(191) NOT NULL,
    `cashbackAmount` DECIMAL(10, 2) NOT NULL,
    `probability` INTEGER NOT NULL,
    `minOrder` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `expiryDays` INTEGER NOT NULL DEFAULT 3,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RewardConfig_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: RewardCoupon (unique, single-use, per-customer reward coupons)
CREATE TABLE `RewardCoupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cashbackAmount` DECIMAL(10, 2) NOT NULL,
    `minOrder` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'REDEEMED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `expiresAt` DATETIME(3) NOT NULL,
    `redeemedOrderId` VARCHAR(191) NULL,
    `redeemedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RewardCoupon_code_key`(`code`),
    INDEX `RewardCoupon_userId_status_idx`(`userId`, `status`),
    INDEX `RewardCoupon_code_idx`(`code`),
    INDEX `RewardCoupon_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RewardCoupon` ADD CONSTRAINT `RewardCoupon_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
