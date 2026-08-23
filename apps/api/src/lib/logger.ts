import { pino, type LoggerOptions } from 'pino';

import { env, isDevelopment, isTest } from '../config/env.js';

/**
 * Fields scrubbed from every log line, everywhere.
 *
 * Redaction is configured once, here — never at a call site — because a call site
 * that forgets is exactly how a token reaches a log file. See
 * docs/0008-data-protection.md.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.headers["x-razorpay-signature"]',
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'token',
  'accessToken',
  'refreshToken',
  'inviteToken',
  'resetToken',
  'otp',
  'signature',
  'secret',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.otp',
  '*.secret',
];

const options: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  base: { service: 'heaven-api' },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
        },
      }
    : {}),
};

export const logger = pino(options);

export type Logger = typeof logger;
