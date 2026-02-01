import { describe, it, expect } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.js';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  RateLimitError,
  ConflictError,
  AppError,
} from '../../src/errors.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';

describe('errorHandler', () => {
  const ctx: HandlerContext = { agent: null };
  const req = new Request('http://test');

  it('should pass through successful responses', async () => {
    const handler: Handler = async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 });

    const wrapped = errorHandler(handler);
    const res = await wrapped(req, ctx);

    expect(res.status).toBe(200);
  });

  it('should map NotFoundError to 404', async () => {
    const handler: Handler = async () => {
      throw new NotFoundError('Thing not found');
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Thing not found');
  });

  it('should map UnauthorizedError to 401', async () => {
    const handler: Handler = async () => {
      throw new UnauthorizedError();
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should map ValidationError to 400', async () => {
    const handler: Handler = async () => {
      throw new ValidationError('Bad input', { field: 'claim' });
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.details).toEqual({ field: 'claim' });
  });

  it('should map RateLimitError to 429 with retryAfter', async () => {
    const handler: Handler = async () => {
      throw new RateLimitError(30);
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.details?.retryAfter).toBe(30);
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('should map ConflictError to 409', async () => {
    const handler: Handler = async () => {
      throw new ConflictError('DUPLICATE_CONTRIBUTION', 'Already exists', {
        existingId: 'abc',
      });
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('DUPLICATE_CONTRIBUTION');
    expect(body.error.details?.existingId).toBe('abc');
  });

  it('should map unknown errors to 500 without exposing internals', async () => {
    const handler: Handler = async () => {
      throw new Error('secret database error with credentials');
    };

    const res = await errorHandler(handler)(req, ctx);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(body.error.message).not.toContain('secret');
  });

  it('should set Content-Type to application/json', async () => {
    const handler: Handler = async () => {
      throw new NotFoundError('gone');
    };

    const res = await errorHandler(handler)(req, ctx);

    expect(res.headers.get('Content-Type')).toBe('application/json');
  });
});
