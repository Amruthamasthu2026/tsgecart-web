import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../shared/jwt.js';
import { UnauthorizedError } from '../shared/errors.js';
import { prisma } from '../config/prisma.js';

/**
 * Authenticates the request from the Bearer access token. Loads the user's
 * current role and permissions so downstream RBAC guards have fresh data.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }
    const token = header.slice(7);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account not found or deactivated');
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions.map((p) => p.permission.key),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional authentication — attaches req.user when a valid token is present. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (user?.isActive) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions.map((p) => p.permission.key),
      };
    }
  } catch {
    // Ignore invalid tokens for optional auth.
  }
  next();
}
