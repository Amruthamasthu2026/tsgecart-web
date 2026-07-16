import type { Request, Response } from 'express';
import { categoriesService } from './categories.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';

export const categoriesController = {
  async list(req: Request, res: Response) {
    const tree = req.query.tree === 'true';
    const includeInactive = req.query.includeInactive === 'true';
    const categories = await categoriesService.list({ tree, includeInactive });
    sendSuccess(res, { categories });
  },

  async getBySlug(req: Request, res: Response) {
    const category = await categoriesService.getBySlug(req.params.slug);
    sendSuccess(res, { category });
  },

  async create(req: Request, res: Response) {
    const category = await categoriesService.create(req.body);
    sendSuccess(res, { category }, 201);
  },

  async update(req: Request, res: Response) {
    const category = await categoriesService.update(req.params.id, req.body);
    sendSuccess(res, { category });
  },

  async remove(req: Request, res: Response) {
    const result = await categoriesService.remove(req.params.id);
    sendSuccess(res, result);
  },
};
