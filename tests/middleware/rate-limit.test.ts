import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createRateLimitMiddleware } from '../../src/middleware/rate-limit.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import { InMemoryRateLimitStore } from '../../src/stores/InMemoryRateLimitStore.js';
import type { Handler, HandlerContext } from '../../src/middleware/pipeline.js';

describe('rate limit middleware', () => {
  let store: InMemoryRateLimitStore;

  const okHandler: Handler = async () => {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  function makeReq(url = 'http://test/api/v1/query'): Request {
    return new Request(url, {
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
  }

  function makeCtx(agentId?: string): HandlerContext {
    if (agentId) {
      return {
        agent: {
          id: agentId,
          apiKeyHash: 'hash',
          displayName: 'Test',
          description: null,
          trustScore: 0.5,
          createdAt: new Date(),
          lastActiveAt: null,
        },
      };
    }
    return { agent: null };
  }

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('core behavior', () => {
    it('should allow request when under limit', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 10,
        windowSeconds: 3600,
      });

      const wrapped = middleware(okHandler);
      const res = await wrapped(makeReq(), makeCtx());

      expect(res.status).toBe(200);
    });

    it('should return 429 when limit is exceeded', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 2,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const ctx = makeCtx();

      await wrapped(makeReq(), ctx);
      await wrapped(makeReq(), ctx);
      // Third request exceeds limit of 2
      const res = await wrapped(makeReq(), ctx);

      expect(res.status).toBe(429);
    });

    it('should include Retry-After header in 429 response', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 1,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const ctx = makeCtx();

      await wrapped(makeReq(), ctx);
      const res = await wrapped(makeReq(), ctx);

      expect(res.status).toBe(429);
      const retryAfter = res.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);
      expect(Number(retryAfter)).toBeLessThanOrEqual(3600);
    });

    it('should include RATE_LIMITED code in 429 body', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 1,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const ctx = makeCtx();

      await wrapped(makeReq(), ctx);
      const res = await wrapped(makeReq(), ctx);
      const body = await res.json() as any;

      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.details.retryAfter).toBeGreaterThan(0);
    });

    it('should set X-RateLimit-* headers on successful responses', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 10,
        windowSeconds: 3600,
      });

      const wrapped = middleware(okHandler);
      const res = await wrapped(makeReq(), makeCtx());

      expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('9');
      expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('should decrement remaining count with each request', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 5,
        windowSeconds: 3600,
      });

      const wrapped = middleware(okHandler);
      const ctx = makeCtx();

      const res1 = await wrapped(makeReq(), ctx);
      expect(res1.headers.get('X-RateLimit-Remaining')).toBe('4');

      const res2 = await wrapped(makeReq(), ctx);
      expect(res2.headers.get('X-RateLimit-Remaining')).toBe('3');

      const res3 = await wrapped(makeReq(), ctx);
      expect(res3.headers.get('X-RateLimit-Remaining')).toBe('2');
    });

    it('should reset after window expires', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'test-key',
        limit: 2,
        windowSeconds: 3600,
      });

      const wrapped = middleware(okHandler);
      const ctx = makeCtx();

      await wrapped(makeReq(), ctx);
      await wrapped(makeReq(), ctx);

      // Advance past the window
      vi.advanceTimersByTime(3600 * 1000);

      const res = await wrapped(makeReq(), ctx);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-RateLimit-Remaining')).toBe('1');
    });
  });

  describe('exempt agents', () => {
    it('should bypass rate limiting for exempt agent IDs', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: (_req, ctx) => `agent:${ctx.agent!.id}:contribute`,
        limit: 1,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const exemptCtx = makeCtx('clawdactual-5f36cfce');

      // Exempt agent should never be limited, even past the limit
      const res1 = await wrapped(makeReq(), exemptCtx);
      expect(res1.status).toBe(200);
      const res2 = await wrapped(makeReq(), exemptCtx);
      expect(res2.status).toBe(200);
      const res3 = await wrapped(makeReq(), exemptCtx);
      expect(res3.status).toBe(200);
    });

    it('should still rate limit non-exempt agents normally', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: (_req, ctx) => `agent:${ctx.agent!.id}:contribute`,
        limit: 1,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const normalCtx = makeCtx('some-other-agent');

      await wrapped(makeReq(), normalCtx);
      const res = await wrapped(makeReq(), normalCtx);
      expect(res.status).toBe(429);
    });

    it('should not add rate limit headers for exempt agents', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: (_req, ctx) => `agent:${ctx.agent!.id}:contribute`,
        limit: 10,
        windowSeconds: 3600,
      });

      const wrapped = middleware(okHandler);
      const exemptCtx = makeCtx('clawdactual-5f36cfce');

      const res = await wrapped(makeReq(), exemptCtx);
      expect(res.status).toBe(200);
      // Exempt agents bypass entirely — no rate limit headers
      expect(res.headers.get('X-RateLimit-Limit')).toBeNull();
    });
  });

  describe('key strategies', () => {
    it('should use agent ID from context for per-agent limiting', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: (_req, ctx) => `agent:${ctx.agent!.id}:query`,
        limit: 2,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));

      // Agent A uses 2 requests
      const ctxA = makeCtx('agent-a');
      await wrapped(makeReq(), ctxA);
      await wrapped(makeReq(), ctxA);

      // Agent A is now rate limited
      const resA = await wrapped(makeReq(), ctxA);
      expect(resA.status).toBe(429);

      // Agent B is unaffected
      const ctxB = makeCtx('agent-b');
      const resB = await wrapped(makeReq(), ctxB);
      expect(resB.status).toBe(200);
    });

    it('should support IP-based key for unauthenticated routes', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: (req) => {
          const ip = req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';
          return `ip:${ip}:register`;
        },
        limit: 3,
        windowSeconds: 3600,
      });

      const wrapped = errorHandler(middleware(okHandler));
      const ctx = makeCtx(); // no agent (unauthenticated)

      const reqIp1 = new Request('http://test', {
        headers: { 'X-Forwarded-For': '10.0.0.1' },
      });
      const reqIp2 = new Request('http://test', {
        headers: { 'X-Forwarded-For': '10.0.0.2' },
      });

      // IP1 uses all 3
      await wrapped(reqIp1, ctx);
      await wrapped(reqIp1, ctx);
      await wrapped(reqIp1, ctx);
      const resIp1 = await wrapped(reqIp1, ctx);
      expect(resIp1.status).toBe(429);

      // IP2 is unaffected
      const resIp2 = await wrapped(reqIp2, ctx);
      expect(resIp2.status).toBe(200);
    });

    it('should support global key for embedding budget', async () => {
      const middleware = createRateLimitMiddleware(store, {
        key: () => 'global:embeddings',
        limit: 100,
        windowSeconds: 86400, // 24 hours
      });

      const wrapped = middleware(okHandler);

      // Different agents all share the same budget
      const resA = await wrapped(makeReq(), makeCtx('agent-a'));
      const resB = await wrapped(makeReq(), makeCtx('agent-b'));

      // Both count against the same limit
      expect(resA.headers.get('X-RateLimit-Remaining')).toBe('99');
      expect(resB.headers.get('X-RateLimit-Remaining')).toBe('98');
    });
  });
});
