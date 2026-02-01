import { describe, it, expect } from 'vitest';
import { pipeline } from '../../src/middleware/pipeline.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';

describe('pipeline', () => {
  function makeContext(): HandlerContext {
    return { agent: null };
  }

  it('should call the handler directly when no middleware', async () => {
    const handler: Handler = async () =>
      new Response('ok', { status: 200 });

    const wrapped = pipeline()(handler);
    const res = await wrapped(new Request('http://test'), makeContext());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('should apply middleware in order (left to right)', async () => {
    const order: string[] = [];

    const mw1 = (next: Handler): Handler => async (req, ctx) => {
      order.push('mw1-before');
      const res = await next(req, ctx);
      order.push('mw1-after');
      return res;
    };

    const mw2 = (next: Handler): Handler => async (req, ctx) => {
      order.push('mw2-before');
      const res = await next(req, ctx);
      order.push('mw2-after');
      return res;
    };

    const handler: Handler = async () => {
      order.push('handler');
      return new Response('ok');
    };

    await pipeline(mw1, mw2)(handler)(new Request('http://test'), makeContext());

    expect(order).toEqual([
      'mw1-before',
      'mw2-before',
      'handler',
      'mw2-after',
      'mw1-after',
    ]);
  });

  it('should allow middleware to short-circuit', async () => {
    const blocker = (_next: Handler): Handler => async () => {
      return new Response('blocked', { status: 403 });
    };

    const handler: Handler = async () => {
      throw new Error('Should not reach handler');
    };

    const res = await pipeline(blocker)(handler)(
      new Request('http://test'),
      makeContext()
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('blocked');
  });

  it('should allow middleware to modify context', async () => {
    const addAgent = (next: Handler): Handler => async (req, ctx) => {
      ctx.agent = {
        id: 'test-agent',
        apiKeyHash: 'hash',
        displayName: 'Test',
        description: null,
        trustScore: 0.5,
        createdAt: new Date(),
      };
      return next(req, ctx);
    };

    const handler: Handler = async (_req, ctx) => {
      return new Response(ctx.agent?.id ?? 'none');
    };

    const res = await pipeline(addAgent)(handler)(
      new Request('http://test'),
      makeContext()
    );

    expect(await res.text()).toBe('test-agent');
  });
});
