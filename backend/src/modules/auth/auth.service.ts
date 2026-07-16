import type { User } from '@prisma/client';
import { authRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from '../../shared/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../shared/jwt.js';
import { generateOpaqueToken, hashToken, generateReferralCode } from '../../shared/tokens.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../../shared/errors.js';
import { sendMail } from '../../config/mailer.js';
import { verifyEmailTemplate, resetPasswordTemplate } from '../../shared/emailTemplates.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { RegisterInput, LoginInput } from './auth.validators.js';

const VERIFY_TYPE = 'EMAIL_VERIFY';
const RESET_TYPE = 'PASSWORD_RESET';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified,
    referralCode: user.referralCode,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

async function issueTokens(
  user: User,
  meta: { userAgent?: string; ip?: string },
): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, email: user.email });

  // Persist the refresh token hashed; the JWT only carries its row id.
  const raw = generateOpaqueToken();
  const record = await authRepository.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(raw),
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  const refreshToken = signRefreshToken({ sub: user.id, tokenId: record.id });
  // Store the raw secret inside the signed JWT so we can compare on refresh.
  return { accessToken, refreshToken: `${refreshToken}.${raw}` };
}

async function sendVerificationEmail(user: User): Promise<void> {
  const raw = generateOpaqueToken();
  await authRepository.createVerificationToken({
    userId: user.id,
    tokenHash: hashToken(raw),
    type: VERIFY_TYPE,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const url = `${env.CLIENT_URL}/verify-email?token=${raw}`;
  const tpl = verifyEmailTemplate(user.name, url);
  await sendMail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
}

export const authService = {
  async register(input: RegisterInput, meta: { userAgent?: string; ip?: string }) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) throw new ConflictError('An account with this email already exists');

    let referral: { referrerId: string; code: string } | null = null;
    if (input.referralCode) {
      const referrer = await authRepository.findUserByReferralCode(input.referralCode);
      if (!referrer) throw new BadRequestError('Invalid referral code');
      referral = { referrerId: referrer.id, code: input.referralCode };
    }

    const passwordHash = await hashPassword(input.password);

    // Ensure a unique referral code for the new user.
    let referralCode = generateReferralCode();
    while (await authRepository.findUserByReferralCode(referralCode)) {
      referralCode = generateReferralCode();
    }

    const user = await authRepository.createUserWithProfile(
      {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        referralCode,
      },
      referral,
    );

    await sendVerificationEmail(user).catch((err) =>
      logger.error({ err }, 'Failed to send verification email'),
    );

    const tokens = await issueTokens(user, meta);
    return { user: publicUser(user), tokens };
  },

  async login(input: LoginInput, meta: { userAgent?: string; ip?: string }) {
    const user = await authRepository.findUserByEmail(input.email);
    if (!user) throw new UnauthorizedError('Invalid email or password');
    if (!user.isActive) throw new UnauthorizedError('Your account has been deactivated');

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedError('Invalid email or password');

    const tokens = await issueTokens(user, meta);
    return { user: publicUser(user), tokens };
  },

  async refresh(refreshCookie: string | undefined, meta: { userAgent?: string; ip?: string }) {
    if (!refreshCookie) throw new UnauthorizedError('No refresh token provided');

    const dotIndex = refreshCookie.lastIndexOf('.');
    const jwtPart = refreshCookie.slice(0, dotIndex);
    const rawPart = refreshCookie.slice(dotIndex + 1);
    if (!jwtPart || !rawPart) throw new UnauthorizedError('Malformed refresh token');

    let payload;
    try {
      payload = verifyRefreshToken(jwtPart);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const record = await authRepository.findRefreshTokenById(payload.tokenId);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token is no longer valid');
    }
    if (record.tokenHash !== hashToken(rawPart)) {
      // Token reuse or tampering — revoke the whole family defensively.
      await authRepository.revokeAllUserRefreshTokens(record.userId);
      throw new UnauthorizedError('Refresh token mismatch');
    }

    const user = await authRepository.findUserById(record.userId);
    if (!user || !user.isActive) throw new UnauthorizedError('Account unavailable');

    // Rotate: revoke the used token and issue a fresh pair.
    await authRepository.revokeRefreshToken(record.id);
    const tokens = await issueTokens(user, meta);
    return { user: publicUser(user), tokens };
  },

  async logout(refreshCookie: string | undefined) {
    if (!refreshCookie) return;
    const dotIndex = refreshCookie.lastIndexOf('.');
    const jwtPart = refreshCookie.slice(0, dotIndex);
    try {
      const payload = verifyRefreshToken(jwtPart);
      await authRepository.revokeRefreshToken(payload.tokenId);
    } catch {
      // Nothing to revoke for an invalid token.
    }
  },

  async verifyEmail(rawToken: string) {
    const record = await authRepository.findVerificationToken(hashToken(rawToken), VERIFY_TYPE);
    if (!record) throw new BadRequestError('Invalid or expired verification link');
    await authRepository.markVerificationTokenUsed(record.id);
    await authRepository.updateUser(record.userId, { emailVerified: true });
    return { verified: true };
  },

  async resendVerification(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new BadRequestError('User not found');
    if (user.emailVerified) return { sent: false };
    await sendVerificationEmail(user);
    return { sent: true };
  },

  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email);
    // Always return success to avoid leaking which emails are registered.
    if (!user) return { sent: true };

    const raw = generateOpaqueToken();
    await authRepository.createVerificationToken({
      userId: user.id,
      tokenHash: hashToken(raw),
      type: RESET_TYPE,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const url = `${env.CLIENT_URL}/reset-password?token=${raw}`;
    const tpl = resetPasswordTemplate(user.name, url);
    await sendMail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch(
      (err) => logger.error({ err }, 'Failed to send reset email'),
    );
    return { sent: true };
  },

  async resetPassword(rawToken: string, newPassword: string) {
    const record = await authRepository.findVerificationToken(hashToken(rawToken), RESET_TYPE);
    if (!record) throw new BadRequestError('Invalid or expired reset link');

    const passwordHash = await hashPassword(newPassword);
    await authRepository.markVerificationTokenUsed(record.id);
    await authRepository.updateUser(record.userId, { passwordHash });
    // Invalidate all sessions after a password change.
    await authRepository.revokeAllUserRefreshTokens(record.userId);
    return { reset: true };
  },

  async getMe(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw new UnauthorizedError('Account not found');
    return publicUser(user);
  },
};
