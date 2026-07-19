import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { getRewardWheel, spinReward } from '../../src/rewards/rewards.function';

function fakeRequest(auth: { uid: string; token: Record<string, unknown> } | undefined, data?: unknown): CallableRequest {
  return { data, auth } as unknown as CallableRequest;
}

describe('reward Callable Functions — unauthenticated caller rejected ("login required")', () => {
  it('getRewardWheel rejects an unauthenticated caller', async () => {
    await expect(getRewardWheel.run(fakeRequest(undefined))).rejects.toBeInstanceOf(HttpsError);
  });

  it('spinReward rejects an unauthenticated caller', async () => {
    await expect(spinReward.run(fakeRequest(undefined))).rejects.toBeInstanceOf(HttpsError);
  });

  it('the rejection code is unauthenticated, not some other error', async () => {
    try {
      await spinReward.run(fakeRequest(undefined));
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpsError);
      expect((err as HttpsError).code).toBe('unauthenticated');
    }
  });
});
