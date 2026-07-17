import { prisma } from '../../config/prisma.js';
import { redis } from '../../config/redis.js';

export interface ServiceabilityResult {
  serviceable: boolean;
  pincode: string;
  message: string;
  zone?: {
    id: string;
    name: string;
    deliveryCharge: number;
    freeDeliveryLimit: number;
    minEtaMinutes: number;
    maxEtaMinutes: number;
  };
}

const NOT_SERVICEABLE_MSG = 'Sorry, TSG eCart currently delivers only within Hyderabad.';
const CACHE_TTL = 300; // 5 minutes

export const deliveryService = {
  /** Resolves whether a pincode is serviceable and returns its zone terms. */
  async checkServiceability(pincode: string): Promise<ServiceabilityResult> {
    const cacheKey = `delivery:pincode:${pincode}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as ServiceabilityResult;

    const record = await prisma.pincode.findUnique({
      where: { code: pincode },
      include: { zone: true },
    });

    let result: ServiceabilityResult;
    if (!record || !record.isServiceable || !record.zone || !record.zone.isActive) {
      result = { serviceable: false, pincode, message: NOT_SERVICEABLE_MSG };
    } else {
      result = {
        serviceable: true,
        pincode,
        message: 'Delivery available',
        zone: {
          id: record.zone.id,
          name: record.zone.name,
          deliveryCharge: Number(record.zone.deliveryCharge),
          freeDeliveryLimit: Number(record.zone.freeDeliveryLimit),
          minEtaMinutes: record.zone.minEtaMinutes,
          maxEtaMinutes: record.zone.maxEtaMinutes,
        },
      };
    }

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result)).catch(() => undefined);
    return result;
  },

  /** Computes the delivery charge for a subtotal within a zone's free-delivery terms. */
  computeDeliveryCharge(
    zone: { deliveryCharge: number; freeDeliveryLimit: number },
    subtotal: number,
  ): number {
    if (zone.freeDeliveryLimit > 0 && subtotal >= zone.freeDeliveryLimit) return 0;
    return zone.deliveryCharge;
  },

  async invalidatePincodeCache(pincode: string): Promise<void> {
    await redis.del(`delivery:pincode:${pincode}`).catch(() => undefined);
  },
};
