import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { corsOrigins, env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { seoRouter } from './modules/seo/seo.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/notFound.js';
import { globalRateLimiter } from './middlewares/rateLimit.js';

export function createApp(): Express {
  const app = express();

  // Trust the reverse proxy (Nginx) so rate-limiting and secure cookies work.
  app.set('trust proxy', 1);

  // Security headers
  app.use(helmet());

  // CORS — credentialed requests from the SPA origin(s)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  // Razorpay webhook needs the raw body for signature verification; capture it
  // before the JSON parser consumes the stream.
  app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.COOKIE_SECRET));
  app.use(compression());

  // Request logging
  app.use(pinoHttp({ logger }));

  // Rate limiting on the API surface
  app.use('/api', globalRateLimiter);

  // Public SEO endpoints (served at the root, e.g. /sitemap.xml)
  app.use('/', seoRouter);

  // API routes (versioned)
  app.use('/api/v1', apiRouter);

  // 404 + centralized error handling
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
