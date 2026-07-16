import type { Request, Response } from 'express';
import { productsService } from './products.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import type { ProductListQuery } from './products.validators.js';

export const productsController = {
  async list(req: Request, res: Response) {
    const { items, meta } = await productsService.list(req.query as unknown as ProductListQuery);
    sendSuccess(res, { products: items }, 200, meta);
  },

  async getBySlug(req: Request, res: Response) {
    const product = await productsService.getBySlug(req.params.slug);
    sendSuccess(res, { product });
  },

  async create(req: Request, res: Response) {
    const product = await productsService.create(req.body);
    sendSuccess(res, { product }, 201);
  },

  async update(req: Request, res: Response) {
    const product = await productsService.update(req.params.id, req.body);
    sendSuccess(res, { product });
  },

  async remove(req: Request, res: Response) {
    const result = await productsService.remove(req.params.id);
    sendSuccess(res, result);
  },
};
