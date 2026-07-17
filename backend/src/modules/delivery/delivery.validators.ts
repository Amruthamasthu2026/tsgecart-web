import { z } from 'zod';

export const pincodeParam = z.object({
  pincode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
});

// Delivery zones (admin)
export const createZoneSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  deliveryCharge: z.number().min(0).default(0),
  freeDeliveryLimit: z.number().min(0).default(0),
  minEtaMinutes: z.number().int().min(1).max(240).default(20),
  maxEtaMinutes: z.number().int().min(1).max(240).default(45),
  isActive: z.boolean().default(true),
});
export const updateZoneSchema = createZoneSchema.partial();

// Pincodes (admin)
export const createPincodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
  city: z.string().trim().default('Hyderabad'),
  state: z.string().trim().default('Telangana'),
  zoneId: z.string().cuid().optional().nullable(),
  isServiceable: z.boolean().default(true),
});
export const updatePincodeSchema = createPincodeSchema.partial();

// Localities (admin)
export const createLocalitySchema = z.object({
  name: z.string().trim().min(2).max(120),
  pincodeId: z.string().cuid(),
  zoneId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().default(true),
});
export const updateLocalitySchema = createLocalitySchema.partial();

export const idParam = z.object({ id: z.string().cuid() });

export type CreateZoneInput = z.infer<typeof createZoneSchema>;
export type CreatePincodeInput = z.infer<typeof createPincodeSchema>;
