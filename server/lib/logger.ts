/**
 * logger.ts
 * OBS-01: Structured JSON logging with pino.
 *
 * Usage:
 *   import { logger } from '../lib/logger.js';
 *   logger.info({ moduleId, tokens: 1234 }, 'Claude call completed');
 *   logger.warn({ path: folderPath }, 'Path traversal attempt blocked');
 *   logger.error({ err }, 'Unhandled exception');
 *
 * In development: pretty-printed output (when LOG_PRETTY=true or NODE_ENV=development).
 * In production:  structured JSON — one line per event, easy to pipe to log aggregators.
 *
 * Log levels controlled via LOG_LEVEL env var (default: 'info').
 * Available: trace | debug | info | warn | error | fatal
 */

import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production' || process.env.LOG_PRETTY === 'true';
const level = process.env.LOG_LEVEL || 'info';

export const logger = pino(
  {
    level,
    base: { pid: process.pid, service: 'openexpert' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.newPassword',
        'body.token',
        '*.apiKey',
        '*.api_key',
        '*.ANTHROPIC_API_KEY',
      ],
      censor: '[REDACTED]',
    },
  },
  isDev
    ? pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service',
        },
      })
    : undefined
);

/** Child logger scoped to a specific server module/component. */
export function childLogger(component: string) {
  return logger.child({ component });
}
