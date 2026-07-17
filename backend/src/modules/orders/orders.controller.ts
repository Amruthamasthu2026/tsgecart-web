import type { Request, Response } from 'express';
import { ordersService } from './orders.service.js';
import { sendSuccess } from '../../shared/apiResponse.js';
import type { ListOrdersQuery } from './orders.validators.js';

export const ordersController = {
  async create(req: Request, res: Response) {
    const result = await ordersService.create(req.user!.id, req.body);
    sendSuccess(res, result, 201);
  },

  async list(req: Request, res: Response) {
    const { items, meta } = await ordersService.list(
      req.user!.id,
      req.query as unknown as ListOrdersQuery,
    );
    sendSuccess(res, { orders: items }, 200, meta);
  },

  async getOne(req: Request, res: Response) {
    const order = await ordersService.getById(req.user!.id, req.params.id);
    sendSuccess(res, { order });
  },

  async cancel(req: Request, res: Response) {
    const order = await ordersService.cancel(req.user!.id, req.params.id);
    sendSuccess(res, { order });
  },

  async invoice(req: Request, res: Response) {
    const order = await ordersService.getById(req.user!.id, req.params.id);
    // Build a per-line GST breakup from the tax-inclusive prices.
    const lines = order.items.map((item) => {
      const rate = Number(item.gstRate) / 100;
      const gross = Number(item.lineTotal);
      const taxable = rate > 0 ? gross / (1 + rate) : gross;
      const tax = gross - taxable;
      return {
        productName: item.productName,
        variantLabel: item.variantLabel,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        gstRate: Number(item.gstRate),
        taxable: Math.round(taxable * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        lineTotal: gross,
      };
    });
    sendSuccess(res, {
      invoice: {
        orderNumber: order.orderNumber,
        placedAt: order.placedAt,
        status: order.status,
        paymentStatus: order.paymentStatus,
        shipping: {
          name: order.shipContactName,
          phone: order.shipContactPhone,
          line1: order.shipLine1,
          line2: order.shipLine2,
          landmark: order.shipLandmark,
          pincode: order.shipPincode,
          city: order.shipCity,
          state: order.shipState,
        },
        lines,
        subtotal: Number(order.subtotal),
        discount: Number(order.discount),
        taxTotal: Number(order.taxTotal),
        deliveryCharge: Number(order.deliveryCharge),
        total: Number(order.total),
      },
    });
  },
};
