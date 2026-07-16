import type { Response } from 'express';
import { env, isProd } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'tsg_refresh';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/api/v1/auth',
    maxAge: THIRTY_DAYS_MS,
    signed: true,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN,
    path: '/api/v1/auth',
    signed: true,
  });
}
