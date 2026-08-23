import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';

let app: Express;

beforeAll(() => {
  app = createApp();
});

describe('GET /api/v1/health', () => {
  it('reports liveness without touching the database', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', environment: 'test' },
    });
  });
});

describe('request correlation', () => {
  it('returns a request id on every response', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('honours a well-formed inbound request id so traces survive a proxy', async () => {
    const response = await request(app).get('/api/v1/health').set('X-Request-Id', 'trace-abc-123');

    expect(response.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('replaces an inbound id that could inject into a log line', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'bad id with spaces');

    expect(response.headers['x-request-id']).not.toBe('bad id with spaces');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error envelope', () => {
  it('returns a consistent shape for an unknown endpoint', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with a specific code rather than a 500', async () => {
    const response = await request(app)
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MALFORMED_JSON');
  });

  it('rejects an oversized body', async () => {
    const response = await request(app)
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('never leaks a stack trace to the client', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(JSON.stringify(response.body)).not.toContain('at ');
    expect(response.body.error).not.toHaveProperty('stack');
  });
});

describe('security headers and CORS', () => {
  it('does not advertise the server framework', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets helmet defaults', async () => {
    const response = await request(app).get('/api/v1/health');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows a configured origin', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('does not echo an unlisted origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
