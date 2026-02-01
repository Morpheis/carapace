import { describe, it, expect } from 'vitest';
import { validateBody } from '../../src/middleware/validate-body.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';
import type { BodySchema } from '../../src/types/common.js';

describe('validateBody', () => {
  const ctx: HandlerContext = { agent: null };

  const echoHandler: Handler = async (req) => {
    const body = await req.json();
    return new Response(JSON.stringify(body), { status: 200 });
  };

  function makeReq(body: unknown): Request {
    return new Request('http://test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const schema: BodySchema = {
    name: { type: 'string', required: true, maxLength: 50 },
    age: { type: 'number', required: false, min: 0, max: 150 },
    active: { type: 'boolean', required: false },
    tags: { type: 'array', required: false },
  };

  it('should pass valid body through to handler', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(
      makeReq({ name: 'Test', age: 25, active: true, tags: ['a'] }),
      ctx
    );

    expect(res.status).toBe(200);
  });

  it('should pass with only required fields', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ name: 'Test' }), ctx);

    expect(res.status).toBe(200);
  });

  it('should reject missing required field', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ age: 25 }), ctx);
    const body = await res.json() as any;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST');
    expect(body.error.message).toContain('name');
  });

  it('should reject wrong type', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ name: 123 }), ctx);
    const body = await res.json() as any;

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('should reject string exceeding maxLength', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ name: 'a'.repeat(51) }), ctx);

    expect(res.status).toBe(400);
  });

  it('should reject number below min', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ name: 'Test', age: -1 }), ctx);

    expect(res.status).toBe(400);
  });

  it('should reject number above max', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const res = await wrapped(makeReq({ name: 'Test', age: 200 }), ctx);

    expect(res.status).toBe(400);
  });

  it('should reject non-JSON body', async () => {
    const wrapped = validateBody(schema)(echoHandler);
    const req = new Request('http://test', {
      method: 'POST',
      body: 'not json',
    });
    const res = await wrapped(req, ctx);

    expect(res.status).toBe(400);
  });

  it('should validate enum values', async () => {
    const enumSchema: BodySchema = {
      signal: { type: 'string', required: true, enum: ['confirmed', 'contradicted', 'refined'] },
    };

    const wrapped = validateBody(enumSchema)(echoHandler);

    const good = await wrapped(makeReq({ signal: 'confirmed' }), ctx);
    expect(good.status).toBe(200);

    const bad = await wrapped(makeReq({ signal: 'invalid' }), ctx);
    expect(bad.status).toBe(400);
  });
});
