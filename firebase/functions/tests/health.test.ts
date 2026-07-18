import { describe, it, expect } from 'vitest';
import { handleHealthRequest, type HealthResponseBody } from '../src/health/health.function';

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

describe('handleHealthRequest', () => {
  it('returns a 200 with the expected success envelope for GET', () => {
    const res = mockRes();
    handleHealthRequest({ method: 'GET' }, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as HealthResponseBody;
    expect(body.success).toBe(true);
    expect(body.service).toBe('tsgecart-firebase');
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('rejects non-GET methods with 405', () => {
    const res = mockRes();
    handleHealthRequest({ method: 'POST' }, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED' },
    });
  });

  it('never includes any secret-shaped field in the response', () => {
    const res = mockRes();
    handleHealthRequest({ method: 'GET' }, res);
    const serialized = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['secret', 'key', 'password', 'token', 'credential']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('produces a fresh timestamp on each call', async () => {
    const res1 = mockRes();
    handleHealthRequest({ method: 'GET' }, res1);
    await new Promise((r) => setTimeout(r, 5));
    const res2 = mockRes();
    handleHealthRequest({ method: 'GET' }, res2);

    const t1 = (res1.body as HealthResponseBody).timestamp;
    const t2 = (res2.body as HealthResponseBody).timestamp;
    expect(t1).not.toBe(t2);
  });
});
