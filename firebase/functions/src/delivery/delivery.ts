/**
 * Pure delivery-charge arithmetic, mirroring
 * `backend/src/modules/delivery/delivery.service.ts`'s
 * `computeDeliveryCharge` exactly. Kept side-effect-free so it's
 * unit-testable without Firestore — the resolved `zone` document is read
 * (and re-validated as active/serviceable) by the order-creation
 * transaction in `orders/orders.function.ts`, never trusted from the
 * client.
 */
export interface DeliveryZoneChargeInput {
  deliveryChargePaise: number;
  freeDeliveryLimitPaise: number;
}

export function computeDeliveryChargePaise(zone: DeliveryZoneChargeInput, subtotalPaise: number): number {
  if (zone.freeDeliveryLimitPaise > 0 && subtotalPaise >= zone.freeDeliveryLimitPaise) {
    return 0;
  }
  return zone.deliveryChargePaise;
}
