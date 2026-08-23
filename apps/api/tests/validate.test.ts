import express, { type Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestId } from '../src/middleware/requestId.js';
import { getValidated, validate } from '../src/middleware/validate.js';

const schemas = {
  body: z.object({
    amountPaise: z.number().int().positive(),
    note: z.string().max(10).optional(),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
  }),
} as const;

let app: Express;

beforeAll(() => {
  app = express();
  app.use(requestId);
  app.use(express.json());
  app.post('/things', validate(schemas), (req, res) => {
    const { body, query } = getValidated<typeof schemas>(req);
    res.json({ success: true, data: { body, query } });
  });
  app.post('/unvalidated', (req, res, next) => {
    try {
      getValidated(req);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
  app.use(errorHandler);
});

describe('validate()', () => {
  it('passes parsed input through and applies defaults', async () => {
    const response = await request(app).post('/things').send({ amountPaise: 800_000 });

    expect(response.status).toBe(200);
    expect(response.body.data.body).toEqual({ amountPaise: 800_000 });
    expect(response.body.data.query).toEqual({ page: 1 });
  });

  it('coerces query-string values', async () => {
    const response = await request(app).post('/things?page=4').send({ amountPaise: 1 });
    expect(response.body.data.query).toEqual({ page: 4 });
  });

  it('reports every problem at once rather than one per request', async () => {
    const response = await request(app)
      .post('/things?page=0')
      .send({ amountPaise: -5, note: 'far too long to fit' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');

    const paths = response.body.error.details.map((detail: { path: string }) => detail.path);
    expect(paths).toContain('body.amountPaise');
    expect(paths).toContain('body.note');
    expect(paths).toContain('query.page');
  });

  it('strips fields the schema does not declare', async () => {
    const response = await request(app)
      .post('/things')
      .send({ amountPaise: 100, isAdmin: true, tenancyId: 'someone-elses' });

    // Mass assignment is not possible: only declared fields survive validation.
    expect(response.body.data.body).toEqual({ amountPaise: 100 });
  });

  it('rejects a non-integer money amount before it reaches a handler', async () => {
    const response = await request(app).post('/things').send({ amountPaise: 100.5 });

    expect(response.status).toBe(400);
    expect(response.body.error.details[0].path).toBe('body.amountPaise');
  });
});

describe('getValidated()', () => {
  it('fails loudly when a route forgot its validate() middleware', async () => {
    const response = await request(app).post('/unvalidated').send({});

    // A wiring bug must surface as a 500 in the logs, never as silent `undefined`
    // input reaching business logic.
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
