import { onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { requireAuthenticatedCaller } from '../shared/auth';
import { AppError, ConflictError } from '../shared/errors';
import {
  computeNextSpinAt,
  generateRewardCodeSecure,
  pickWeightedTier,
  validateProbabilities,
  type RewardTier,
} from './rewards.logic';
import type { FirestoreRewardConfigDoc, FirestoreRewardCouponDoc, RewardCouponResponse, RewardWheelResponse } from './rewards.types';

/**
 * Reward-spin Functions, migration Phase 5 ("System B" — see
 * rewards.types.ts header for why System A, the legacy wallet-credit
 * wheel, is not ported). `rewardConfigs` stays STAFF/ADMIN-read-only in
 * Security Rules (probability must never leak to a customer, and Rules
 * cannot redact individual fields on a read) — customers only ever see
 * the sanitized shape this file returns via `getRewardWheel`.
 * `rewardCoupons` IS direct-client-readable for the owner (Security
 * Rules), so there is no `listMyRewardCoupons` Callable here — the
 * frontend queries `rewardCoupons` where `userId == uid` directly.
 */

function rewardConfigsCollection() {
  return db.collection('rewardConfigs');
}
function rewardCouponsCollection() {
  return db.collection('rewardCoupons');
}

async function mostRecentSpinAt(uid: string): Promise<Date | null> {
  const snap = await rewardCouponsCollection().where('userId', '==', uid).orderBy('createdAt', 'desc').limit(1).get();
  if (snap.empty) return null;
  return (snap.docs[0].data() as FirestoreRewardCouponDoc).createdAt.toDate();
}

export async function getRewardWheelData(uid: string): Promise<RewardWheelResponse> {
  const configsSnap = await rewardConfigsCollection().where('isActive', '==', true).orderBy('sortOrder', 'asc').get();
  const tiers = configsSnap.docs.map((d) => {
    const c = d.data() as FirestoreRewardConfigDoc;
    return { id: d.id, cashbackAmountPaise: c.cashbackAmountPaise, minOrderPaise: c.minOrderPaise, expiryDays: c.expiryDays };
  });
  const lastSpinAt = await mostRecentSpinAt(uid);
  const nextSpinAt = computeNextSpinAt(lastSpinAt);
  return { tiers, canSpin: nextSpinAt === null, nextSpinAt: nextSpinAt ? nextSpinAt.toISOString() : null };
}

export const getRewardWheel = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    return await getRewardWheelData(caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});

export async function spinRewardTx(uid: string): Promise<{ coupon: RewardCouponResponse }> {
  return db.runTransaction(async (tx) => {
    // ── Reads ────────────────────────────────────────────────────────
    const lastSpinSnap = await tx.get(rewardCouponsCollection().where('userId', '==', uid).orderBy('createdAt', 'desc').limit(1));
    const lastSpinAt = lastSpinSnap.empty ? null : (lastSpinSnap.docs[0].data() as FirestoreRewardCouponDoc).createdAt.toDate();
    const nextSpinAt = computeNextSpinAt(lastSpinAt);
    if (nextSpinAt) {
      throw new ConflictError(`You can spin again after ${nextSpinAt.toISOString()}`, { nextSpinAt: nextSpinAt.toISOString() });
    }

    const configsSnap = await tx.get(rewardConfigsCollection().where('isActive', '==', true));
    const tiers: RewardTier[] = configsSnap.docs.map((d) => {
      const c = d.data() as FirestoreRewardConfigDoc;
      return { id: d.id, cashbackAmountPaise: c.cashbackAmountPaise, probability: c.probability, minOrderPaise: c.minOrderPaise, expiryDays: c.expiryDays, isActive: c.isActive };
    });
    validateProbabilities(tiers);
    const chosen = pickWeightedTier(tiers);

    let code = generateRewardCodeSecure();
    let codeRef = rewardCouponsCollection().doc(code);
    let codeSnap = await tx.get(codeRef);
    let attempts = 0;
    while (codeSnap.exists && attempts < 5) {
      code = generateRewardCodeSecure();
      codeRef = rewardCouponsCollection().doc(code);
      codeSnap = await tx.get(codeRef);
      attempts += 1;
    }
    if (codeSnap.exists) throw new ConflictError('Could not generate a reward code, please try again');

    // ── Writes ───────────────────────────────────────────────────────
    const now = FieldValue.serverTimestamp();
    const expiresAt = Timestamp.fromDate(new Date(Date.now() + chosen.expiryDays * 24 * 60 * 60 * 1000));
    const doc: FirestoreRewardCouponDoc = {
      code,
      userId: uid,
      cashbackAmountPaise: chosen.cashbackAmountPaise,
      minOrderPaise: chosen.minOrderPaise,
      status: 'ACTIVE',
      expiresAt,
      redeemedOrderId: null,
      redeemedAt: null,
      createdAt: now as unknown as Timestamp,
    };
    tx.set(codeRef, doc);

    return {
      coupon: {
        ...doc,
        id: code,
        expiresAt: expiresAt.toDate().toISOString(),
        redeemedAt: null,
        createdAt: new Date().toISOString(),
      },
    };
  });
}

export const spinReward = onCall(async (request: CallableRequest) => {
  try {
    const caller = requireAuthenticatedCaller(request);
    return await spinRewardTx(caller.uid);
  } catch (err) {
    if (err instanceof AppError) throw err.toHttpsError();
    throw err;
  }
});
