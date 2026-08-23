import type { Server } from 'node:http';

import { createApp } from './app.js';
import { env, features } from './config/env.js';
import { logger } from './lib/logger.js';
import { disconnectPrisma } from './lib/prisma.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function registerShutdown(server: Server): void {
  let shuttingDown = false;

  /**
   * @param exitCode 0 for a requested shutdown, non-zero for a crash. An
   * orchestrator reads this to decide whether to restart, so exiting 0 after an
   * uncaught exception makes a crash look intentional and the process stays down.
   */
  const shutdown = (signal: string, exitCode: number): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, exitCode }, 'Shutting down');

    // In-flight requests are allowed to finish — a payment being written must not
    // be interrupted halfway through its transaction.
    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out; exiting forcefully');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((closeError) => {
      void (async () => {
        if (closeError) logger.error({ err: closeError }, 'Error closing HTTP server');
        try {
          await disconnectPrisma();
        } catch (error) {
          logger.error({ err: error }, 'Error disconnecting from the database');
        }
        clearTimeout(forceExit);
        process.exit(closeError ? 1 : exitCode);
      })();
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));

  // A crash must be loud and fatal. Continuing after an unhandled rejection means
  // running with unknown state, which for a financial system is worse than exiting.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });
}

function start(): void {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        environment: env.NODE_ENV,
        // Which integrations are live — never their credentials.
        features,
      },
      'Heaven Hospitality API started',
    );
  });

  registerShutdown(server);
}

start();
