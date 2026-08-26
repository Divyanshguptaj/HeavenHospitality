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
    // Prisma's default interactive-transaction timeout is 5s, which assumes a
    // database on the same machine. Neon is a network hop away — from India to
    // us-east that is ~400ms per round trip, and settling a payment legitimately
    // makes a dozen (allocate, update each invoice, recompute, lock the receipt
    // sequence, write the receipt). Those writes MUST stay in one transaction:
    // a payment without a receipt, or an invoice whose paid amount disagrees
    // with its payments, must not be able to exist even briefly.
    //
    // So the fix is headroom, not splitting the transaction.
    transactionOptions: { timeout: 20_000, maxWait: 10_000 },
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
