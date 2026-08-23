import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked before importing the app so the route picks up the mock.
vi.mock('../src/lib/prisma.js', () => ({
  isDatabaseReachable: vi.fn(),
  prisma: {},
  disconnectPrisma: vi.fn(),
}));

const { isDatabaseReachable } = await import('../src/lib/prisma.js');
const { createApp } = await import('../src/app.js');

const reachableMock = vi.mocked(isDatabaseReachable);

let app: Express;

beforeEach(() => {
  app = createApp();
  reachableMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/v1/health/ready', () => {
  it('returns a success envelope when the database is reachable', async () => {
    reachableMock.mockResolvedValue(true);

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { status: 'ready', database: 'up' },
    });
  });

  it('returns a 503 ERROR envelope when the database is unreachable', async () => {
    reachableMock.mockResolvedValue(false);

    const response = await request(app).get('/api/v1/health/ready');

    // A 503 carrying `success: true` would be unreachable by every client we
    // have: they branch on response.ok before reading the body, so the degraded
    // state would surface as a generic parse failure instead.
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('SERVICE_DEGRADED');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('keeps liveness independent of the database', async () => {
    reachableMock.mockResolvedValue(false);

    // A Neon cold start must never look like an unhealthy process, or an
    // orchestrator will restart a server that is working fine.
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(reachableMock).not.toHaveBeenCalled();
  });
});
