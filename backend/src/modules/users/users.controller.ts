import type { Request, Response } from 'express';
import { usersService } from './users.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';

export const usersController = {
  async updateProfile(req: Request, res: Response) {
    const user = await usersService.updateProfile(req.user!.id, req.body);
    sendSuccess(res, { user });
  },

  async changePassword(req: Request, res: Response) {
    const result = await usersService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    sendSuccess(res, result);
  },

  async listAddresses(req: Request, res: Response) {
    const addresses = await usersService.listAddresses(req.user!.id);
    sendSuccess(res, { addresses });
  },

  async createAddress(req: Request, res: Response) {
    const address = await usersService.createAddress(req.user!.id, req.body);
    sendSuccess(res, { address }, 201);
  },

  async updateAddress(req: Request, res: Response) {
    const address = await usersService.updateAddress(req.user!.id, req.params.id, req.body);
    sendSuccess(res, { address });
  },

  async deleteAddress(req: Request, res: Response) {
    const result = await usersService.deleteAddress(req.user!.id, req.params.id);
    sendSuccess(res, result);
  },
};
