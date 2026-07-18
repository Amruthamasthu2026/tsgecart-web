import * as functionsLogger from 'firebase-functions/logger';

/**
 * Thin wrapper over `firebase-functions/logger` so call sites look the same
 * as the Express backend's pino-based `logger` (structured, leveled,
 * object-first). Using the official logger (not `console.*`) ensures output
 * is correctly parsed as structured logs in Cloud Logging, with severity
 * levels Cloud Monitoring can alert on.
 */
export const logger = {
  debug: (message: string, meta?: Record<string, unknown>): void => {
    functionsLogger.debug(message, meta);
  },
  info: (message: string, meta?: Record<string, unknown>): void => {
    functionsLogger.info(message, meta);
  },
  warn: (message: string, meta?: Record<string, unknown>): void => {
    functionsLogger.warn(message, meta);
  },
  error: (message: string, meta?: Record<string, unknown>): void => {
    functionsLogger.error(message, meta);
  },
};
