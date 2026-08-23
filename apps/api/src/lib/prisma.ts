import { PrismaClient } from '@prisma/client';

import { isDevelopment, isProduction } from '../config/env.js';
import { logger } from './logger.js';

/**
 * The single Prisma client for the process.
 *
 * Query logs are routed through pino so that everything the service emits shares
 * one format and one redaction policy. Query text is logged only in development —
 * in production it can contain personal data and payment identifiers.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
      ...(isDevelopment ? ([{ emit: 'event', level: 'query' }] as const) : []),
    ],
  });

  client.$on('warn', (event) => {
    logger.warn({ target: event.target }, event.message);
  });

  client.$on('error', (event) => {
    logger.error({ target: event.target }, event.message);
  });

  if (isDevelopment) {
    client.$on('query', (event) => {
      logger.debug({ durationMs: event.duration }, event.query);
    });
  }

  return client;
}

/**
 * `tsx watch` re-imports modules on every change, which would otherwise open a new
 * connection pool per reload until PostgreSQL refuses connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

/** Liveness probe for the readiness endpoint. */
export async function isDatabaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
    return false;
  }
}
