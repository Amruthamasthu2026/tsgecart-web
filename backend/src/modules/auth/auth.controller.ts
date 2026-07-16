import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import { setRefreshCookie, clearRefreshCookie, REFRESH_COOKIE_NAME } from '../../shared/cookies.js';

function requestMeta(req: Request): { userAgent?: string; ip?: string } {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}

export const authController = {
  async register(req: Request, res: Response) {
    const { user, tokens } = await authService.register(req.body, requestMeta(req));
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { user, accessToken: tokens.accessToken }, 201);
  },

  async login(req: Request, res: Response) {
    const { user, tokens } = await authService.login(req.body, requestMeta(req));
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { user, accessToken: tokens.accessToken });
  },

  async refresh(req: Request, res: Response) {
    const cookie = req.signedCookies?.[REFRESH_COOKIE_NAME];
    const { user, tokens } = await authService.refresh(cookie, requestMeta(req));
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { user, accessToken: tokens.accessToken });
  },

  async logout(req: Request, res: Response) {
    await authService.logout(req.signedCookies?.[REFRESH_COOKIE_NAME]);
    clearRefreshCookie(res);
    sendSuccess(res, { loggedOut: true });
  },

  async verifyEmail(req: Request, res: Response) {
    const result = await authService.verifyEmail(req.body.token);
    sendSuccess(res, result);
  },

  async resendVerification(req: Request, res: Response) {
    const result = await authService.resendVerification(req.user!.id);
    sendSuccess(res, result);
  },

  async forgotPassword(req: Request, res: Response) {
    const result = await authService.forgotPassword(req.body.email);
    sendSuccess(res, result);
  },

  async resetPassword(req: Request, res: Response) {
    const result = await authService.resetPassword(req.body.token, req.body.password);
    sendSuccess(res, result);
  },

  async me(req: Request, res: Response) {
    const user = await authService.getMe(req.user!.id);
    sendSuccess(res, { user });
  },
};
