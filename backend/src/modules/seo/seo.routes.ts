import { Router } from 'express';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { asyncHandler } from '../../shared/asyncHandler.js';

export const seoRouter = Router();

/** Dynamic XML sitemap built from active categories and products. */
seoRouter.get(
  '/sitemap.xml',
  asyncHandler(async (_req, res) => {
    const base = env.CLIENT_URL.replace(/\/$/, '');
    const [categories, products] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
      prisma.product.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true } }),
    ]);

    const staticUrls = ['', '/products', '/about', '/contact', '/faq', '/privacy', '/terms', '/refunds'];
    const urls: string[] = [
      ...staticUrls.map(
        (p) => `<url><loc>${base}${p}</loc><changefreq>daily</changefreq></url>`,
      ),
      ...categories.map(
        (c) =>
          `<url><loc>${base}/products?category=${c.slug}</loc><lastmod>${c.updatedAt.toISOString()}</lastmod></url>`,
      ),
      ...products.map(
        (p) =>
          `<url><loc>${base}/products/${p.slug}</loc><lastmod>${p.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq></url>`,
      ),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  }),
);
